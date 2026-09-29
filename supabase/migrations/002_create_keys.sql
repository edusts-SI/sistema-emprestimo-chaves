-- ============================================================
-- Migration 002: Create keys table
-- ============================================================
-- Represents physical keys/laboratories managed by the system.

CREATE TABLE IF NOT EXISTS public.keys (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo       TEXT        NOT NULL,
  nome         TEXT        NOT NULL,
  descricao    TEXT,
  localizacao  TEXT,
  status       TEXT        NOT NULL DEFAULT 'available'
                           CHECK (status IN ('available', 'borrowed', 'maintenance', 'inactive')),
  ativo        BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique code per key/lab
ALTER TABLE public.keys
  ADD CONSTRAINT keys_codigo_unique UNIQUE (codigo);

-- Index for status-based filtering (most common query)
CREATE INDEX IF NOT EXISTS idx_keys_status
  ON public.keys(status);

-- Index for active keys
CREATE INDEX IF NOT EXISTS idx_keys_ativo
  ON public.keys(ativo);

COMMENT ON TABLE public.keys IS
  'Physical keys and laboratories available for loan.';
COMMENT ON COLUMN public.keys.codigo IS
  'Short identifier code, e.g. LAB01, LAB-B2.';
COMMENT ON COLUMN public.keys.status IS
  'Current status: available | borrowed | maintenance | inactive';
COMMENT ON COLUMN public.keys.ativo IS
  'Soft-delete flag. Inactive keys are hidden from users.';
