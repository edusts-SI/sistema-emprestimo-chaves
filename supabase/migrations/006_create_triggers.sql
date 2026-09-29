-- ============================================================
-- Migration 006: Create triggers
-- ============================================================

-- ---------------------------------------------------------------
-- Trigger function: handle_updated_at()
-- Generic trigger to auto-update the updated_at column.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Apply updated_at trigger to profiles
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Apply updated_at trigger to keys
DROP TRIGGER IF EXISTS trg_keys_updated_at ON public.keys;
CREATE TRIGGER trg_keys_updated_at
  BEFORE UPDATE ON public.keys
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Apply updated_at trigger to loans
DROP TRIGGER IF EXISTS trg_loans_updated_at ON public.loans;
CREATE TRIGGER trg_loans_updated_at
  BEFORE UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------
-- Trigger function: validate_loan_status_transition()
-- Enforces valid state machine transitions for loans.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_loan_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  valid_transitions JSONB := '{
    "pending":   ["approved", "denied", "cancelled"],
    "approved":  ["active", "returned", "cancelled"],
    "active":    ["returned"],
    "denied":    [],
    "returned":  [],
    "cancelled": []
  }';
  allowed_next TEXT[];
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  allowed_next := ARRAY(
    SELECT jsonb_array_elements_text(valid_transitions->OLD.status)
  );

  IF NOT (NEW.status = ANY(allowed_next)) THEN
    RAISE EXCEPTION
      'Transição de status inválida: % → %. Permitidas: %',
      OLD.status, NEW.status, array_to_string(allowed_next, ', ')
      USING ERRCODE = 'P0100';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_loans_status_transition ON public.loans;
CREATE TRIGGER trg_loans_status_transition
  BEFORE UPDATE OF status ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.validate_loan_status_transition();

-- ---------------------------------------------------------------
-- Trigger function: handle_new_auth_user()
-- Automatically creates a profile when a new Auth user is created.
-- Runs in the auth schema so it can access auth.users.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  PERFORM public.upsert_profile_for_user(
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

-- This trigger runs on auth.users (managed by Supabase Auth)
DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ---------------------------------------------------------------
-- Trigger function: sync_key_status_on_loan_change()
-- Keeps keys.status in sync when loans change status.
-- Specifically: when all active/approved loans for a key are gone,
-- the key reverts to 'available'.
-- This is a safety net; the primary sync happens in the functions.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_key_status_on_loan_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_has_active BOOLEAN;
BEGIN
  -- Only act when status transitions to a terminal state
  IF NEW.status IN ('returned', 'cancelled', 'denied') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.loans
      WHERE key_id = NEW.key_id
        AND status IN ('approved', 'active')
        AND id <> NEW.id
    ) INTO v_has_active;

    IF NOT v_has_active THEN
      UPDATE public.keys
      SET status = 'available', updated_at = NOW()
      WHERE id = NEW.key_id
        AND status = 'borrowed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_key_status ON public.loans;
CREATE TRIGGER trg_sync_key_status
  AFTER UPDATE OF status ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.sync_key_status_on_loan_change();

-- ---------------------------------------------------------------
-- Trigger: audit profile role changes
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_profile_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role
    OR OLD.ativo IS DISTINCT FROM NEW.ativo THEN

    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details)
    VALUES (
      auth.uid(),
      CASE
        WHEN OLD.role IS DISTINCT FROM NEW.role THEN 'profile_role_changed'
        ELSE 'profile_status_changed'
      END,
      'profiles',
      NEW.id,
      jsonb_build_object(
        'old_role', OLD.role,   'new_role', NEW.role,
        'old_ativo', OLD.ativo, 'new_ativo', NEW.ativo
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_profile_changes ON public.profiles;
CREATE TRIGGER trg_audit_profile_changes
  AFTER UPDATE OF role, ativo ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_profile_role_change();
