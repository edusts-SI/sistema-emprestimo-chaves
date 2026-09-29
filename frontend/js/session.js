/**
 * session.js
 * Session state management shared across all pages.
 * Stores the current user/profile in memory and provides
 * a reactive update mechanism.
 */

import { getProfile, onAuthStateChange } from './auth.js';

let _profile = null;
const _listeners = [];

/**
 * Initializes the session module. Must be called on each page load.
 * Fetches the profile and notifies listeners on auth state changes.
 */
export async function initSession() {
  _profile = await getProfile();

  // Listen for token refresh, logout, etc.
  onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
      _profile = null;
    } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      _profile = await getProfile();
    }
    _listeners.forEach(fn => fn(_profile, event));
  });

  return _profile;
}

/**
 * Returns the cached profile. Call initSession() first.
 */
export function getStoredProfile() {
  return _profile;
}

/**
 * Registers a listener called when auth state or profile changes.
 * @param {function} fn - Receives (profile, event)
 */
export function onProfileChange(fn) {
  _listeners.push(fn);
}

/**
 * Returns true if the current user has the given role(s).
 */
export function hasRole(...roles) {
  return _profile ? roles.includes(_profile.role) : false;
}

/**
 * Returns true if the current user is active.
 */
export function isActiveUser() {
  return _profile?.ativo === true;
}
