/**
 * auth.js
 * Authentication module — Google OAuth via Supabase Auth.
 * Handles login, logout, session recovery, and profile loading.
 */

import { supabase } from './supabase.js';

// ---------------------------------------------------------------
// Google OAuth Login
// ---------------------------------------------------------------

/**
 * Initiates Google OAuth login flow.
 * The redirect URL must be configured in Supabase Auth settings.
 *
 * CONFIGURATION: Update redirectTo to match your environment.
 *   - Development: http://localhost:5500/frontend/pages/dashboard.html
 *   - Production:  https://yourdomain.com/frontend/pages/dashboard.html
 */
export async function loginWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: getRedirectUrl(),
    },
  });

  if (error) {
    console.error('[Auth] Google login error:', error);
    throw new Error('Não foi possível iniciar o login com Google. Tente novamente.');
  }
}

/**
 * Signs the current user out and redirects to login page.
 */
export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('[Auth] Logout error:', error);
  }
  redirectToLogin();
}

// ---------------------------------------------------------------
// Session & Profile
// ---------------------------------------------------------------

/**
 * Returns the current Supabase session or null if not authenticated.
 */
export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[Auth] getSession error:', error);
    return null;
  }
  return session;
}

/**
 * Returns the currently authenticated user or null.
 */
export async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
}

/**
 * Loads the profile row for the currently authenticated user.
 * Returns null if not found or not active.
 */
export async function getProfile() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('[Auth] Profile fetch error:', error);
    return null;
  }

  return data;
}

// ---------------------------------------------------------------
// Route protection
// ---------------------------------------------------------------

/**
 * Guards a page that requires authentication.
 * Call at the top of each protected page's script.
 * Returns the profile or redirects to login if unauthorized.
 *
 * @param {string[]} [allowedRoles] - If provided, restricts access by role.
 * @returns {Promise<object>} profile
 */
export async function requireAuth(allowedRoles = null) {
  const session = await getSession();

  if (!session) {
    redirectToLogin();
    return null;
  }

  const profile = await getProfile();

  if (!profile) {
    // Profile may not exist yet (edge case). Redirect to login.
    await logout();
    return null;
  }

  if (!profile.ativo) {
    // User exists but was deactivated by admin or is pending approval.
    await supabase.auth.signOut();
    redirectToLogin('pending');
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    redirectToDashboard();
    return null;
  }

  return profile;
}

/**
 * Guards a page to be accessible only when NOT authenticated.
 * Useful for the login page — redirects authenticated users away.
 */
export async function requireGuest() {
  const session = await getSession();
  if (session) {
    const profile = await getProfile();
    if (profile && profile.ativo) {
      redirectToDashboard();
    }
  }
}

// ---------------------------------------------------------------
// Auth state change listener
// ---------------------------------------------------------------

/**
 * Subscribes to auth state changes.
 * @param {function} callback - Receives (event, session)
 * @returns {object} subscription (call .unsubscribe() to clean up)
 */
export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(callback);
}

// ---------------------------------------------------------------
// Redirect helpers
// ---------------------------------------------------------------

function getRedirectUrl() {
  const base = window.location.origin;
  // Detects if running locally via file:// (not recommended) vs a server
  if (window.location.protocol === 'file:') {
    console.warn('[Auth] Running via file://. Use a local server for OAuth to work correctly.');
  }
  return `${base}/frontend/pages/dashboard.html`;
}

function redirectToLogin(reason = '') {
  const url = new URL('../pages/login.html', window.location.href);
  if (reason) url.searchParams.set('reason', reason);
  window.location.replace(url.toString());
}

function redirectToDashboard() {
  const url = new URL('../pages/dashboard.html', window.location.href);
  window.location.replace(url.toString());
}
