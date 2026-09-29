-- ============================================================
-- Migration 005: Create PostgreSQL functions
-- ============================================================

-- ---------------------------------------------------------------
-- Helper: get_my_role()
-- Returns the role of the currently authenticated user.
-- Uses SECURITY DEFINER with a fixed search_path to prevent
-- search_path injection. Avoids RLS recursion by querying
-- profiles directly within the definer context.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- ---------------------------------------------------------------
-- Helper: is_active_user()
-- Returns true if the current user exists and is active.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND ativo = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated;

-- ---------------------------------------------------------------
-- Helper: is_admin()
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND ativo = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ---------------------------------------------------------------
-- Helper: is_approver_or_admin()
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_approver_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('approver', 'admin') AND ativo = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_approver_or_admin() TO authenticated;

-- ---------------------------------------------------------------
-- Function: request_loan(p_key_id UUID)
-- Transactionally creates a loan request, preventing race
-- conditions via FOR UPDATE SKIP LOCKED on the keys row.
-- Returns the new loan id or raises an exception with a
-- user-friendly message.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_loan(p_key_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_key          public.keys%ROWTYPE;
  v_existing     UUID;
  v_loan_id      UUID;
  v_user_id      UUID := auth.uid();
BEGIN
  -- Validate authenticated user
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Você precisa estar autenticado para solicitar uma chave.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Validate user is active
  IF NOT public.is_active_user() THEN
    RAISE EXCEPTION 'Sua conta está inativa. Contate o administrador.'
      USING ERRCODE = 'P0002';
  END IF;

  -- Lock the key row to prevent concurrent requests
  SELECT * INTO v_key
  FROM public.keys
  WHERE id = p_key_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chave não encontrada.'
      USING ERRCODE = 'P0003';
  END IF;

  IF NOT v_key.ativo THEN
    RAISE EXCEPTION 'Esta chave não está disponível para empréstimo.'
      USING ERRCODE = 'P0004';
  END IF;

  IF v_key.status <> 'available' THEN
    RAISE EXCEPTION 'Esta chave não está disponível no momento. Status atual: %', v_key.status
      USING ERRCODE = 'P0005';
  END IF;

  -- Check if user already has a pending/active loan for this key
  SELECT id INTO v_existing
  FROM public.loans
  WHERE key_id = p_key_id
    AND user_id = v_user_id
    AND status IN ('pending', 'approved', 'active')
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Você já possui uma solicitação ativa para esta chave.'
      USING ERRCODE = 'P0006';
  END IF;

  -- Check if any active/approved loan exists for this key
  SELECT id INTO v_existing
  FROM public.loans
  WHERE key_id = p_key_id
    AND status IN ('approved', 'active')
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Esta chave já está emprestada para outro usuário.'
      USING ERRCODE = 'P0007';
  END IF;

  -- Create the loan request
  INSERT INTO public.loans (key_id, user_id, status)
  VALUES (p_key_id, v_user_id, 'pending')
  RETURNING id INTO v_loan_id;

  -- Log the action
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details)
  VALUES (
    v_user_id,
    'loan_requested',
    'loans',
    v_loan_id,
    jsonb_build_object('key_id', p_key_id, 'key_nome', v_key.nome)
  );

  RETURN v_loan_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_loan(UUID) TO authenticated;

-- ---------------------------------------------------------------
-- Function: approve_loan(p_loan_id UUID, p_due_at TIMESTAMPTZ)
-- Approves a pending loan. Only approvers/admins can call this.
-- Validates state transition: pending → approved.
-- Updates key status to borrowed.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_loan(
  p_loan_id UUID,
  p_due_at  TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_loan       public.loans%ROWTYPE;
  v_approver   UUID := auth.uid();
BEGIN
  IF NOT public.is_approver_or_admin() THEN
    RAISE EXCEPTION 'Você não tem permissão para aprovar solicitações.'
      USING ERRCODE = 'P0010';
  END IF;

  -- Lock loan row
  SELECT * INTO v_loan
  FROM public.loans
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada.'
      USING ERRCODE = 'P0011';
  END IF;

  IF v_loan.status <> 'pending' THEN
    RAISE EXCEPTION 'Somente solicitações pendentes podem ser aprovadas. Status atual: %', v_loan.status
      USING ERRCODE = 'P0012';
  END IF;

  -- Check key still available (another approver may have approved a concurrent request)
  PERFORM 1 FROM public.loans
  WHERE key_id = v_loan.key_id
    AND status IN ('approved', 'active')
    AND id <> p_loan_id;

  IF FOUND THEN
    RAISE EXCEPTION 'Esta chave já foi aprovada para outro usuário. Approve foi cancelado.'
      USING ERRCODE = 'P0013';
  END IF;

  -- Approve
  UPDATE public.loans
  SET
    status      = 'approved',
    approved_at = NOW(),
    approved_by = v_approver,
    due_at      = p_due_at,
    updated_at  = NOW()
  WHERE id = p_loan_id;

  -- Update key status
  UPDATE public.keys
  SET status = 'borrowed', updated_at = NOW()
  WHERE id = v_loan.key_id;

  -- Audit
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details)
  VALUES (
    v_approver,
    'loan_approved',
    'loans',
    p_loan_id,
    jsonb_build_object('key_id', v_loan.key_id, 'borrower_id', v_loan.user_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_loan(UUID, TIMESTAMPTZ) TO authenticated;

-- ---------------------------------------------------------------
-- Function: deny_loan(p_loan_id UUID, p_reason TEXT)
-- Denies a pending loan with a mandatory reason.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deny_loan(p_loan_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_loan      public.loans%ROWTYPE;
  v_approver  UUID := auth.uid();
BEGIN
  IF NOT public.is_approver_or_admin() THEN
    RAISE EXCEPTION 'Você não tem permissão para negar solicitações.'
      USING ERRCODE = 'P0020';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'O motivo da negativa é obrigatório.'
      USING ERRCODE = 'P0021';
  END IF;

  SELECT * INTO v_loan
  FROM public.loans
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada.'
      USING ERRCODE = 'P0022';
  END IF;

  IF v_loan.status <> 'pending' THEN
    RAISE EXCEPTION 'Somente solicitações pendentes podem ser negadas. Status atual: %', v_loan.status
      USING ERRCODE = 'P0023';
  END IF;

  UPDATE public.loans
  SET
    status        = 'denied',
    denial_reason = trim(p_reason),
    approved_by   = v_approver,
    approved_at   = NOW(),
    updated_at    = NOW()
  WHERE id = p_loan_id;

  -- Audit
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details)
  VALUES (
    v_approver,
    'loan_denied',
    'loans',
    p_loan_id,
    jsonb_build_object(
      'key_id', v_loan.key_id,
      'borrower_id', v_loan.user_id,
      'reason', trim(p_reason)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.deny_loan(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------
-- Function: pickup_loan(p_loan_id UUID)
-- Marks the loan as active (key physically picked up).
-- Transitions: approved → active.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pickup_loan(p_loan_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_loan      public.loans%ROWTYPE;
  v_caller    UUID := auth.uid();
BEGIN
  IF NOT public.is_approver_or_admin() THEN
    RAISE EXCEPTION 'Você não tem permissão para registrar a retirada.'
      USING ERRCODE = 'P0030';
  END IF;

  SELECT * INTO v_loan
  FROM public.loans
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada.'
      USING ERRCODE = 'P0031';
  END IF;

  IF v_loan.status <> 'approved' THEN
    RAISE EXCEPTION 'Somente empréstimos aprovados podem ser marcados como ativos. Status atual: %', v_loan.status
      USING ERRCODE = 'P0032';
  END IF;

  UPDATE public.loans
  SET
    status       = 'active',
    picked_up_at = NOW(),
    updated_at   = NOW()
  WHERE id = p_loan_id;

  -- Audit
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details)
  VALUES (
    v_caller,
    'loan_pickedup',
    'loans',
    p_loan_id,
    jsonb_build_object('key_id', v_loan.key_id, 'borrower_id', v_loan.user_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pickup_loan(UUID) TO authenticated;

-- ---------------------------------------------------------------
-- Function: return_loan(p_loan_id UUID, p_notes TEXT)
-- Registers the return of a key. Transitions: active → returned.
-- Also resets the key status back to available.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.return_loan(
  p_loan_id UUID,
  p_notes   TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_loan    public.loans%ROWTYPE;
  v_caller  UUID := auth.uid();
BEGIN
  IF NOT public.is_approver_or_admin() THEN
    RAISE EXCEPTION 'Você não tem permissão para registrar devoluções.'
      USING ERRCODE = 'P0040';
  END IF;

  SELECT * INTO v_loan
  FROM public.loans
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empréstimo não encontrado.'
      USING ERRCODE = 'P0041';
  END IF;

  IF v_loan.status NOT IN ('active', 'approved') THEN
    RAISE EXCEPTION 'Somente empréstimos ativos ou aprovados podem ser devolvidos. Status atual: %', v_loan.status
      USING ERRCODE = 'P0042';
  END IF;

  UPDATE public.loans
  SET
    status      = 'returned',
    returned_at = NOW(),
    notes       = COALESCE(p_notes, notes),
    updated_at  = NOW()
  WHERE id = p_loan_id;

  -- Reset key status to available
  UPDATE public.keys
  SET status = 'available', updated_at = NOW()
  WHERE id = v_loan.key_id;

  -- Audit
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details)
  VALUES (
    v_caller,
    'loan_returned',
    'loans',
    p_loan_id,
    jsonb_build_object('key_id', v_loan.key_id, 'borrower_id', v_loan.user_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.return_loan(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------
-- Function: cancel_loan(p_loan_id UUID)
-- Allows a user to cancel their own pending loan.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_loan(p_loan_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_loan    public.loans%ROWTYPE;
  v_caller  UUID := auth.uid();
BEGIN
  SELECT * INTO v_loan
  FROM public.loans
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada.'
      USING ERRCODE = 'P0050';
  END IF;

  -- Only the requester or admin/approver can cancel
  IF v_loan.user_id <> v_caller AND NOT public.is_approver_or_admin() THEN
    RAISE EXCEPTION 'Você não tem permissão para cancelar esta solicitação.'
      USING ERRCODE = 'P0051';
  END IF;

  IF v_loan.status NOT IN ('pending') THEN
    RAISE EXCEPTION 'Somente solicitações pendentes podem ser canceladas. Status atual: %', v_loan.status
      USING ERRCODE = 'P0052';
  END IF;

  UPDATE public.loans
  SET status = 'cancelled', updated_at = NOW()
  WHERE id = p_loan_id;

  -- Audit
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details)
  VALUES (
    v_caller,
    'loan_cancelled',
    'loans',
    p_loan_id,
    jsonb_build_object('key_id', v_loan.key_id, 'borrower_id', v_loan.user_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_loan(UUID) TO authenticated;

-- ---------------------------------------------------------------
-- Function: upsert_profile_for_user(p_id, p_email, p_name, p_avatar)
-- Called by auth trigger. Creates or updates a profile entry
-- when a user authenticates for the first time.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_profile_for_user(
  p_id        UUID,
  p_email     TEXT,
  p_name      TEXT,
  p_avatar    TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nome, avatar_url, role, ativo)
  VALUES (p_id, p_email, COALESCE(p_name, split_part(p_email, '@', 1)), p_avatar, 'user', true)
  ON CONFLICT (id) DO UPDATE
    SET
      email      = EXCLUDED.email,
      nome       = COALESCE(EXCLUDED.nome, public.profiles.nome),
      avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
      updated_at = NOW();
END;
$$;

-- Only supabase_auth_admin should call this (via trigger)
REVOKE ALL ON FUNCTION public.upsert_profile_for_user(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_profile_for_user(UUID, TEXT, TEXT, TEXT) TO supabase_auth_admin;
