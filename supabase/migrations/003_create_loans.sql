-- ============================================================
-- Migration 003: Create loans table
-- ============================================================
-- Records loan requests and their full lifecycle.

CREATE TABLE IF NOT EXISTS public.loans (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id         UUID        NOT NULL REFERENCES public.keys(id)     ON DELETE RESTRICT,
  user_id        UUID        NOT NULL REFERENCES public.profiles(id)  ON DELETE RESTRICT,
  approved_by    UUID             REFERENCES public.profiles(id)      ON DELETE SET NULL,

  -- Timestamps per stage
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at    TIMESTAMPTZ,
  picked_up_at   TIMESTAMPTZ,
  due_at         TIMESTAMPTZ,
  returned_at    TIMESTAMPTZ,

  -- Loan lifecycle status
  status         TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'approved', 'denied', 'active', 'returned', 'cancelled')),

  denial_reason  TEXT,
  notes          TEXT,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Business rule: denial_reason is required when status = 'denied'
  CONSTRAINT loans_denial_reason_required
    CHECK (status <> 'denied' OR (denial_reason IS NOT NULL AND denial_reason <> '')),

  -- approved_at must be set when approved
  CONSTRAINT loans_approved_at_required
    CHECK (status NOT IN ('approved', 'active', 'returned') OR approved_at IS NOT NULL),

  -- returned_at must be set when returned
  CONSTRAINT loans_returned_at_required
    CHECK (status <> 'returned' OR returned_at IS NOT NULL)
);

-- ---------------------------------------------------------------
-- Critical constraint: prevent duplicate active loans for same key
-- A key can only have ONE active/approved loan at a time.
-- This partial unique index is the primary mechanism preventing
-- concurrent loan requests from being approved simultaneously.
-- ---------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_loans_unique_active_key
  ON public.loans(key_id)
  WHERE status IN ('approved', 'active');

-- Index for user's own loan history
CREATE INDEX IF NOT EXISTS idx_loans_user_id
  ON public.loans(user_id);

-- Index for status-based filtering
CREATE INDEX IF NOT EXISTS idx_loans_status
  ON public.loans(status);

-- Index for key + status (availability check)
CREATE INDEX IF NOT EXISTS idx_loans_key_status
  ON public.loans(key_id, status);

-- Index for pending approvals queue
CREATE INDEX IF NOT EXISTS idx_loans_pending
  ON public.loans(status, requested_at)
  WHERE status = 'pending';

COMMENT ON TABLE public.loans IS
  'Full loan lifecycle: request → approve/deny → pickup → return.';
COMMENT ON COLUMN public.loans.status IS
  'pending | approved | denied | active | returned | cancelled';
COMMENT ON INDEX idx_loans_unique_active_key IS
  'Critical: prevents two concurrent approved/active loans for the same key.';
