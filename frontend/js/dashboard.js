/**
 * dashboard.js
 * Role-adaptive dashboard: different views for user/approver/admin.
 */

import { supabase } from './supabase.js';
import { requireAuth, logout } from './auth.js';
import { initSession } from './session.js';
import {
  initTheme, toggleTheme, loanStatusBadge, keyStatusBadge,
  friendlyError, formatDate, renderUserNav, applyRoleVisibility,
} from './ui.js';

let _profile = null;

async function init() {
  initTheme();
  _profile = await requireAuth();
  if (!_profile) return;
  await initSession();
  renderUserNav(_profile);
  applyRoleVisibility(_profile);

  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
  document.getElementById('logout-btn')?.addEventListener('click', logout);

  // Load role-appropriate dashboard content
  if (_profile.role === 'admin') {
    await loadAdminDashboard();
  } else if (_profile.role === 'approver') {
    await loadApproverDashboard();
  } else {
    await loadUserDashboard();
  }
}

// ---------------------------------------------------------------
// User dashboard
// ---------------------------------------------------------------
async function loadUserDashboard() {
  showSection('section-user');

  const [loansRes, keysRes] = await Promise.all([
    supabase.from('loans')
      .select(`id, status, requested_at, picked_up_at, keys(nome, codigo)`)
      .eq('user_id', _profile.id)
      .order('requested_at', { ascending: false })
      .limit(10),
    supabase.from('keys').select('status').eq('ativo', true),
  ]);

  const loans = loansRes.data ?? [];
  const keys = keysRes.data ?? [];

  // Stats
  setEl('stat-my-pending', loans.filter(l => l.status === 'pending').length);
  setEl('stat-my-active', loans.filter(l => l.status === 'active').length);
  setEl('stat-available-keys', keys.filter(k => k.status === 'available').length);

  // Recent loans
  const tbody = document.getElementById('my-loans-tbody');
  if (tbody) {
    tbody.innerHTML = loans.slice(0, 5).map(l => `
      <tr>
        <td>${l.keys?.nome ?? '—'}</td>
        <td>${formatDate(l.requested_at)}</td>
        <td>${formatDate(l.picked_up_at)}</td>
        <td>${loanStatusBadge(l.status)}</td>
      </tr>
    `).join('') || `<tr><td colspan="4" class="table-empty">Nenhuma solicitação ainda.</td></tr>`;
  }
}

// ---------------------------------------------------------------
// Approver dashboard
// ---------------------------------------------------------------
async function loadApproverDashboard() {
  showSection('section-approver');

  const [pendingRes, activeRes] = await Promise.all([
    supabase.from('loans').select('id', { count: 'exact' }).eq('status', 'pending'),
    supabase.from('loans')
      .select(`id, status, approved_at, keys(nome, codigo), profiles!loans_user_id_fkey(nome)`)
      .in('status', ['approved', 'active'])
      .order('approved_at', { ascending: false })
      .limit(10),
  ]);

  setEl('stat-approver-pending', pendingRes.count ?? 0);
  setEl('stat-approver-active', (activeRes.data ?? []).length);

  const tbody = document.getElementById('approver-active-tbody');
  if (tbody) {
    const loans = activeRes.data ?? [];
    tbody.innerHTML = loans.map(l => `
      <tr>
        <td>${l.keys?.nome ?? '—'}</td>
        <td>${l.profiles?.nome ?? '—'}</td>
        <td>${formatDate(l.approved_at)}</td>
        <td>${loanStatusBadge(l.status)}</td>
      </tr>
    `).join('') || `<tr><td colspan="4" class="table-empty">Nenhum empréstimo ativo.</td></tr>`;
  }
}

// ---------------------------------------------------------------
// Admin dashboard
// ---------------------------------------------------------------
async function loadAdminDashboard() {
  showSection('section-admin');

  const [keysRes, usersRes, pendingRes, activeRes] = await Promise.all([
    supabase.from('keys').select('status, ativo'),
    supabase.from('profiles').select('id, ativo', { count: 'exact' }),
    supabase.from('loans').select('id', { count: 'exact' }).eq('status', 'pending'),
    supabase.from('loans').select('id', { count: 'exact' }).in('status', ['approved', 'active']),
  ]);

  const keys = keysRes.data ?? [];
  setEl('stat-admin-total-keys', keys.length);
  setEl('stat-admin-available', keys.filter(k => k.status === 'available' && k.ativo).length);
  setEl('stat-admin-borrowed', keys.filter(k => k.status === 'borrowed').length);
  setEl('stat-admin-maintenance', keys.filter(k => k.status === 'maintenance').length);
  setEl('stat-admin-users', usersRes.count ?? 0);
  setEl('stat-admin-pending', pendingRes.count ?? 0);
  setEl('stat-admin-active', activeRes.count ?? 0);

  // Recent activity
  const { data: recentLoans } = await supabase
    .from('loans')
    .select(`status, requested_at, keys(nome), profiles!loans_user_id_fkey(nome)`)
    .order('requested_at', { ascending: false })
    .limit(8);

  const tbody = document.getElementById('admin-recent-tbody');
  if (tbody && recentLoans) {
    tbody.innerHTML = recentLoans.map(l => `
      <tr>
        <td>${l.keys?.nome ?? '—'}</td>
        <td>${l.profiles?.nome ?? '—'}</td>
        <td>${formatDate(l.requested_at)}</td>
        <td>${loanStatusBadge(l.status)}</td>
      </tr>
    `).join('');
  }
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
function showSection(id) {
  document.querySelectorAll('.dashboard-section').forEach(s => s.style.display = 'none');
  const section = document.getElementById(id);
  if (section) section.style.display = '';
}

function setEl(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

document.addEventListener('DOMContentLoaded', init);
