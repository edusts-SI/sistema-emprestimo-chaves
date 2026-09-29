/**
 * emprestimos.js
 * Full loan history for the current user (or all, for approver/admin).
 * Includes filtering by status and date range.
 */

import { supabase } from './supabase.js';
import { requireAuth, logout } from './auth.js';
import { initSession } from './session.js';
import {
  initTheme, toggleTheme, showToast, showLoading, showEmpty, showError,
  loanStatusBadge, friendlyError, formatDate, renderUserNav, applyRoleVisibility,
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
  document.getElementById('filter-form')?.addEventListener('submit', (e) => { e.preventDefault(); loadHistory(); });
  document.getElementById('filter-clear')?.addEventListener('click', clearFilters);

  await loadHistory();
}

async function loadHistory() {
  const tbody = document.getElementById('history-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="8" class="table-loading">Carregando histórico...</td></tr>`;

  const statusFilter = document.getElementById('filter-status')?.value || '';
  const dateFrom = document.getElementById('filter-date-from')?.value || '';
  const dateTo = document.getElementById('filter-date-to')?.value || '';

  let query = supabase
    .from('loans')
    .select(`
      id, status, requested_at, approved_at, picked_up_at, returned_at, denial_reason, notes,
      keys ( nome, codigo ),
      profiles!loans_user_id_fkey ( nome, email ),
      approver:profiles!loans_approved_by_fkey ( nome )
    `)
    .order('requested_at', { ascending: false })
    .limit(200);

  if (_profile.role === 'user') {
    query = query.eq('user_id', _profile.id);
  }
  if (statusFilter) query = query.eq('status', statusFilter);
  if (dateFrom) query = query.gte('requested_at', dateFrom);
  if (dateTo) query = query.lte('requested_at', dateTo + 'T23:59:59');

  const { data: loans, error } = await query;

  if (error) {
    tbody.innerHTML = `<tr><td colspan="8" class="state-error">Não foi possível carregar o histórico.</td></tr>`;
    console.error('[Emprestimos] error:', error);
    return;
  }

  if (!loans || loans.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-empty">Nenhum registro encontrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = loans.map(loan => `
    <tr>
      <td><strong>${loan.keys?.nome ?? '—'}</strong><br><small class="text-muted">${loan.keys?.codigo ?? ''}</small></td>
      <td>${loan.profiles?.nome ?? '—'}</td>
      <td>${formatDate(loan.requested_at)}</td>
      <td>${formatDate(loan.approved_at)}</td>
      <td>${formatDate(loan.picked_up_at)}</td>
      <td>${formatDate(loan.returned_at)}</td>
      <td>${loanStatusBadge(loan.status)}${loan.denial_reason ? `<br><small class="text-muted" title="${loan.denial_reason}">Motivo: ${loan.denial_reason.substring(0, 40)}${loan.denial_reason.length > 40 ? '...' : ''}</small>` : ''}</td>
      <td>${loan.approver?.nome ?? '—'}</td>
    </tr>
  `).join('');
}

function clearFilters() {
  document.getElementById('filter-status').value = '';
  document.getElementById('filter-date-from').value = '';
  document.getElementById('filter-date-to').value = '';
  loadHistory();
}

document.addEventListener('DOMContentLoaded', init);
