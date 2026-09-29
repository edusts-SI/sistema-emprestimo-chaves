/**
 * aprovacao.js
 * Approval queue for approvers and admins.
 * Shows all pending loan requests with approve/deny actions.
 */

import { supabase } from './supabase.js';
import { requireAuth, logout } from './auth.js';
import { initSession } from './session.js';
import {
  initTheme, toggleTheme, showToast, showLoading, showEmpty, showError,
  openModal, closeModal, loanStatusBadge, friendlyError,
  formatDate, setButtonLoading, renderUserNav, applyRoleVisibility,
} from './ui.js';

let _profile = null;
let _denyLoanId = null;

async function init() {
  initTheme();
  _profile = await requireAuth(['approver', 'admin']);
  if (!_profile) return;
  await initSession();
  renderUserNav(_profile);
  applyRoleVisibility(_profile);

  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
  document.getElementById('logout-btn')?.addEventListener('click', logout);

  // Deny modal
  document.getElementById('modal-deny-close')?.addEventListener('click', () => closeModal('modal-deny'));
  document.getElementById('modal-deny-cancel')?.addEventListener('click', () => closeModal('modal-deny'));
  document.getElementById('modal-deny-form')?.addEventListener('submit', handleDenySubmit);

  // Return modal
  document.getElementById('modal-return-close')?.addEventListener('click', () => closeModal('modal-return'));
  document.getElementById('modal-return-cancel')?.addEventListener('click', () => closeModal('modal-return'));
  document.getElementById('modal-return-form')?.addEventListener('submit', handleReturnSubmit);

  await loadPending();
  await loadActive();
}

// ---------------------------------------------------------------
// Pending approvals
// ---------------------------------------------------------------
async function loadPending() {
  const tbody = document.getElementById('pending-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" class="table-loading">Carregando solicitações...</td></tr>`;

  const { data, error } = await supabase
    .from('loans')
    .select(`
      id, status, requested_at, notes,
      keys ( nome, codigo ),
      profiles!loans_user_id_fkey ( nome, email )
    `)
    .eq('status', 'pending')
    .order('requested_at', { ascending: true });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="5" class="state-error">Erro ao carregar solicitações.</td></tr>`;
    return;
  }

  const counter = document.getElementById('pending-count');
  if (counter) counter.textContent = data?.length ?? 0;

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Nenhuma solicitação pendente.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(loan => `
    <tr>
      <td><strong>${loan.keys?.nome ?? '—'}</strong><br><small class="text-muted">${loan.keys?.codigo ?? ''}</small></td>
      <td>${loan.profiles?.nome ?? '—'}<br><small class="text-muted">${loan.profiles?.email ?? ''}</small></td>
      <td>${formatDate(loan.requested_at)}</td>
      <td>${loanStatusBadge(loan.status)}</td>
      <td>
        <div class="action-group">
          <button class="btn btn--success btn--xs" onclick="approveLoan('${loan.id}')">✔ Aprovar</button>
          <button class="btn btn--danger btn--xs" onclick="openDenyModal('${loan.id}')">✖ Negar</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// ---------------------------------------------------------------
// Active loans (approved + active)
// ---------------------------------------------------------------
async function loadActive() {
  const tbody = document.getElementById('active-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" class="table-loading">Carregando...</td></tr>`;

  const { data, error } = await supabase
    .from('loans')
    .select(`
      id, status, approved_at, picked_up_at, due_at,
      keys ( nome, codigo ),
      profiles!loans_user_id_fkey ( nome, email )
    `)
    .in('status', ['approved', 'active'])
    .order('approved_at', { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="5" class="state-error">Erro ao carregar.</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Nenhum empréstimo ativo.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(loan => `
    <tr>
      <td><strong>${loan.keys?.nome ?? '—'}</strong><br><small class="text-muted">${loan.keys?.codigo ?? ''}</small></td>
      <td>${loan.profiles?.nome ?? '—'}</td>
      <td>${formatDate(loan.approved_at)}</td>
      <td>${loanStatusBadge(loan.status)}</td>
      <td>
        <div class="action-group">
          ${loan.status === 'approved' ? `<button class="btn btn--primary btn--xs" onclick="pickupLoan('${loan.id}')">Registrar Retirada</button>` : ''}
          ${loan.status === 'active' ? `<button class="btn btn--secondary btn--xs" onclick="openReturnModal('${loan.id}')">Registrar Devolução</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

// ---------------------------------------------------------------
// Actions
// ---------------------------------------------------------------
window.approveLoan = async function(loanId) {
  if (!confirm('Confirmar aprovação desta solicitação?')) return;
  const { error } = await supabase.rpc('approve_loan', { p_loan_id: loanId });
  if (error) { showToast(friendlyError(error), 'error'); return; }
  showToast('Solicitação aprovada com sucesso.', 'success');
  await loadPending();
  await loadActive();
};

window.pickupLoan = async function(loanId) {
  if (!confirm('Confirmar que a chave foi retirada fisicamente?')) return;
  const { error } = await supabase.rpc('pickup_loan', { p_loan_id: loanId });
  if (error) { showToast(friendlyError(error), 'error'); return; }
  showToast('Retirada registrada.', 'success');
  await loadActive();
};

window.openDenyModal = function(loanId) {
  _denyLoanId = loanId;
  document.getElementById('deny-reason').value = '';
  openModal('modal-deny');
};

async function handleDenySubmit(e) {
  e.preventDefault();
  const reason = document.getElementById('deny-reason').value.trim();
  if (!reason) { showToast('Informe o motivo da negativa.', 'warning'); return; }
  const btn = document.getElementById('deny-submit-btn');
  setButtonLoading(btn, true);
  const { error } = await supabase.rpc('deny_loan', { p_loan_id: _denyLoanId, p_reason: reason });
  setButtonLoading(btn, false, 'Negar');
  if (error) { showToast(friendlyError(error), 'error'); return; }
  closeModal('modal-deny');
  showToast('Solicitação negada.', 'info');
  await loadPending();
}

let _returnLoanId = null;

window.openReturnModal = function(loanId) {
  _returnLoanId = loanId;
  document.getElementById('return-notes').value = '';
  openModal('modal-return');
};

async function handleReturnSubmit(e) {
  e.preventDefault();
  const notes = document.getElementById('return-notes').value.trim();
  const btn = document.getElementById('return-submit-btn');
  setButtonLoading(btn, true);
  const { error } = await supabase.rpc('return_loan', { p_loan_id: _returnLoanId, p_notes: notes || null });
  setButtonLoading(btn, false, 'Confirmar Devolução');
  if (error) { showToast(friendlyError(error), 'error'); return; }
  closeModal('modal-return');
  showToast('Devolução registrada com sucesso.', 'success');
  await loadActive();
}

document.addEventListener('DOMContentLoaded', init);
