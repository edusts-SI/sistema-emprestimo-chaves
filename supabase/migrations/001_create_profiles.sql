-- ============================================================
-- Migration 001: Create profiles table
-- ============================================================
-- Stores complementary user information linked to Supabase Auth.
-- The id references auth.users, so no separate auth logic is needed.

CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome        TEXT        NOT NULL,
  email       TEXT        NOT NULL,
  avatar_url  TEXT,
  role        TEXT        NOT NULL DEFAULT 'user'
                          CHECK (role IN ('user', 'approver', 'admin')),
  ativo       BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique email constraint to prevent duplicate registrations
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_email_unique UNIQUE (email);

-- Index for email lookups (used in RLS and admin screens)
CREATE INDEX IF NOT EXISTS idx_profiles_email
  ON public.profiles(email);

-- Index for role-based filtering
CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON public.profiles(role);

-- Index for active status filtering
CREATE INDEX IF NOT EXISTS idx_profiles_ativo
  ON public.profiles(ativo);

COMMENT ON TABLE public.profiles IS
  'Complementary user profile data linked to Supabase Auth users.';
COMMENT ON COLUMN public.profiles.role IS
  'User role: user | approver | admin';
COMMENT ON COLUMN public.profiles.ativo IS
  'When false the user cannot access the system even if authenticated.';
