-- ============================================================
-- Migration 004: Create audit_logs table
-- ============================================================
-- Immutable audit trail of important system actions.

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  action      TEXT        NOT NULL,
  table_name  TEXT,
  record_id   UUID,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for user audit history
CREATE INDEX IF NOT EXISTS idx_audit_user_id
  ON public.audit_logs(user_id);

-- Index for action-based filtering
CREATE INDEX IF NOT EXISTS idx_audit_action
  ON public.audit_logs(action);

-- Index for table-based filtering
CREATE INDEX IF NOT EXISTS idx_audit_table_name
  ON public.audit_logs(table_name);

-- Chronological index (admin most commonly queries recent logs)
CREATE INDEX IF NOT EXISTS idx_audit_created_at
  ON public.audit_logs(created_at DESC);

COMMENT ON TABLE public.audit_logs IS
  'Immutable audit trail. Rows are never updated or deleted.';
COMMENT ON COLUMN public.audit_logs.action IS
  'Action identifier: user_created, key_created, loan_requested, loan_approved, etc.';
COMMENT ON COLUMN public.audit_logs.details IS
  'JSON payload with action-specific context. Never store secrets or tokens.';
