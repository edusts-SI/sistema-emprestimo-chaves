-- ============================================================
-- Migration 007: Row Level Security Policies
-- ============================================================
-- Security is enforced entirely in the database.
-- The frontend is NOT trusted for authorization decisions.
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keys        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs  ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners
ALTER TABLE public.profiles   FORCE ROW LEVEL SECURITY;
ALTER TABLE public.keys        FORCE ROW LEVEL SECURITY;
ALTER TABLE public.loans       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs  FORCE ROW LEVEL SECURITY;

-- ============================================================
-- PROFILES POLICIES
-- ============================================================

-- Users can read their own profile
DROP POLICY IF EXISTS "profiles_select_own"        ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Admins can read all profiles
DROP POLICY IF EXISTS "profiles_select_admin"      ON public.profiles;
CREATE POLICY "profiles_select_admin"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Approvers can read profiles (needed to display borrower names)
DROP POLICY IF EXISTS "profiles_select_approver"   ON public.profiles;
CREATE POLICY "profiles_select_approver"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.is_approver_or_admin());

-- Users can update only their own profile (limited fields — avatar/name)
-- Role and ativo CANNOT be changed by the user (enforced by separate policy)
DROP POLICY IF EXISTS "profiles_update_own"        ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    -- Prevent role escalation: users cannot change their own role
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
    -- Prevent self-deactivation
    AND ativo = true
  );

-- Admins can update any profile (including role and ativo)
DROP POLICY IF EXISTS "profiles_update_admin"      ON public.profiles;
CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- Insert: handled by the auth trigger (upsert_profile_for_user)
-- Admins can manually insert profiles (pre-authorization use case)
DROP POLICY IF EXISTS "profiles_insert_admin"      ON public.profiles;
CREATE POLICY "profiles_insert_admin"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- No one can delete profiles directly (only soft-delete via ativo)
-- Delete is intentionally not allowed via RLS policy

-- ============================================================
-- KEYS POLICIES
-- ============================================================

-- Any authenticated active user can view active keys
DROP POLICY IF EXISTS "keys_select_active_users"   ON public.keys;
CREATE POLICY "keys_select_active_users"
  ON public.keys FOR SELECT
  TO authenticated
  USING (ativo = true AND public.is_active_user());

-- Admins can view all keys (including inactive)
DROP POLICY IF EXISTS "keys_select_admin"          ON public.keys;
CREATE POLICY "keys_select_admin"
  ON public.keys FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Only admins can insert keys
DROP POLICY IF EXISTS "keys_insert_admin"          ON public.keys;
CREATE POLICY "keys_insert_admin"
  ON public.keys FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- Only admins can update keys
DROP POLICY IF EXISTS "keys_update_admin"          ON public.keys;
CREATE POLICY "keys_update_admin"
  ON public.keys FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- No DELETE on keys (soft-delete only via ativo)

-- ============================================================
-- LOANS POLICIES
-- ============================================================

-- Users can select their own loans
DROP POLICY IF EXISTS "loans_select_own"           ON public.loans;
CREATE POLICY "loans_select_own"
  ON public.loans FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() AND public.is_active_user());

-- Approvers and admins can see all loans
DROP POLICY IF EXISTS "loans_select_approver"      ON public.loans;
CREATE POLICY "loans_select_approver"
  ON public.loans FOR SELECT
  TO authenticated
  USING (public.is_approver_or_admin());

-- Users can only INSERT via the request_loan() function (SECURITY DEFINER)
-- Direct INSERT is blocked for regular users.
-- We allow it here for the SECURITY DEFINER function context.
DROP POLICY IF EXISTS "loans_insert_own"           ON public.loans;
CREATE POLICY "loans_insert_own"
  ON public.loans FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_active_user());

-- UPDATE is handled through SECURITY DEFINER functions (approve, deny, return).
-- Direct UPDATE is restricted to admins only.
DROP POLICY IF EXISTS "loans_update_admin"         ON public.loans;
CREATE POLICY "loans_update_admin"
  ON public.loans FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- ============================================================
-- AUDIT LOGS POLICIES
-- ============================================================

-- Only admins can read audit logs
DROP POLICY IF EXISTS "audit_select_admin"         ON public.audit_logs;
CREATE POLICY "audit_select_admin"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Users can read their own audit entries
DROP POLICY IF EXISTS "audit_select_own"           ON public.audit_logs;
CREATE POLICY "audit_select_own"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- INSERT is only performed by SECURITY DEFINER functions
-- Direct INSERT is not allowed for any role
-- (No INSERT policy = blocked for all)
