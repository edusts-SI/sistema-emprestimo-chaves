/**
 * laboratorios.js
 * Keys/Laboratories listing, availability check, and loan request modal.
 */

import { supabase } from './supabase.js';
import { requireAuth } from './auth.js';
import { initSession, getStoredProfile } from './session.js';
import {
  initTheme, toggleTheme, showToast, showLoading, showEmpty, showError,
  openModal, closeModal, keyStatusBadge, loanStatusBadge,
  friendlyError, formatDate, setButtonLoading, renderUserNav, applyRoleVisibility,
} from './ui.js';
import { logout } from './auth.js';

let _profile = null;

// ---------------------------------------------------------------
// Init
// ---------------------------------------------------------------
async function init() {
  initTheme();

  _profile = await requireAuth();
  if (!_profile) return;

  await initSession();
  renderUserNav(_profile);
  applyRoleVisibility(_profile);

  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
  document.getElementById('logout-btn')?.addEventListener('click', logout);

  setupModalHandlers();
  await loadKeys();
  await loadActiveLoans();
}

// ---------------------------------------------------------------
// Load all active keys
// ---------------------------------------------------------------
async function loadKeys() {
  const container = document.getElementById('keys-grid');
  if (!container) return;
  showLoading(container, 'Carregando laboratórios...');

  const { data: keys, error } = await supabase
    .from('keys')
    .select('*')
    .eq('ativo', true)
    .order('codigo');

  if (error) {
    showError(container, 'Não foi possível carregar os laboratórios.');
    console.error('[Lab] Load keys error:', error);
    return;
  }

  if (!keys || keys.length === 0) {
    showEmpty(container, 'Nenhum laboratório cadastrado.');
    return;
  }

  container.innerHTML = keys.map(key => renderKeyCard(key)).join('');
}

function renderKeyCard(key) {
  const canRequest = key.status === 'available';
  return `
    <div class="key-card key-card--${key.status}" data-key-id="${key.id}">
      <div class="key-card__header">
        <span class="key-card__code">${key.codigo}</span>
        ${keyStatusBadge(key.status)}
      </div>
      <h3 class="key-card__name">${key.nome}</h3>
      ${key.descricao ? `<p class="key-card__desc">${key.descricao}</p>` : ''}
      ${key.localizacao ? `<p class="key-card__location">📍 ${key.localizacao}</p>` : ''}
      <div class="key-card__actions">
        <button
          class="btn btn--primary btn--sm"
          ${canRequest ? '' : 'disabled'}
          onclick="openRequestModal('${key.id}', '${key.nome}')"
          title="${canRequest ? 'Solicitar empréstimo desta chave' : 'Chave indisponível'}">
          ${canRequest ? 'Solicitar Chave' : 'Indisponível'}
        </button>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------
// Load current active loans (for the loans table)
// ---------------------------------------------------------------
async function loadActiveLoans() {
  const tbody = document.getElementById('loans-tbody');
  const emptyState = document.getElementById('loans-empty');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" class="table-loading">Carregando empréstimos...</td></tr>`;

  let query = supabase
    .from('loans')
    .select(`
      id, status, requested_at, picked_up_at, returned_at, denial_reason,
      keys ( nome, codigo ),
      profiles!loans_user_id_fkey ( nome, email )
    `)
    .order('requested_at', { ascending: false });

  // Non-admin/approver users only see their own loans
  if (_profile.role === 'user') {
    query = query.eq('user_id', _profile.id);
  }

  // On this page show only active/pending (full history is on emprestimos.html)
  query = query.in('status', ['pending', 'approved', 'active']);

  const { data: loans, error } = await query;

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="state-error">Erro ao carregar empréstimos.</td></tr>`;
    console.error('[Lab] Load loans error:', error);
    return;
  }

  if (!loans || loans.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Nenhum empréstimo ativo no momento.</td></tr>`;
    return;
  }

  tbody.innerHTML = loans.map(loan => `
    <tr>
      <td><strong>${loan.keys?.nome ?? '—'}</strong><br><small class="text-muted">${loan.keys?.codigo ?? ''}</small></td>
      <td>${loan.profiles?.nome ?? '—'}</td>
      <td>${formatDate(loan.requested_at)}</td>
      <td>${formatDate(loan.picked_up_at)}</td>
      <td>${loanStatusBadge(loan.status)}</td>
      <td>${renderLoanActions(loan)}</td>
    </tr>
  `).join('');
}

function renderLoanActions(loan) {
  const actions = [];

  if (['approver', 'admin'].includes(_profile.role)) {
    if (loan.status === 'pending') {
      actions.push(`<button class="btn btn--success btn--xs" onclick="approveLoan('${loan.id}')">Aprovar</button>`);
      actions.push(`<button class="btn btn--danger btn--xs" onclick="openDenyModal('${loan.id}')">Negar</button>`);
    }
    if (loan.status === 'approved') {
      actions.push(`<button class="btn btn--primary btn--xs" onclick="pickupLoan('${loan.id}')">Retirada</button>`);
    }
    if (loan.status === 'active') {
      actions.push(`<button class="btn btn--secondary btn--xs" onclick="returnLoan('${loan.id}')">Devolver</button>`);
    }
  }

  if (loan.status === 'pending') {
    actions.push(`<button class="btn btn--ghost btn--xs" onclick="cancelLoan('${loan.id}')">Cancelar</button>`);
  }

  return actions.length ? `<div class="action-group">${actions.join('')}</div>` : '<span class="text-muted">—</span>';
}

// ---------------------------------------------------------------
// Request modal
// ---------------------------------------------------------------
function setupModalHandlers() {
  document.getElementById('modal-request-close')?.addEventListener('click', () => closeModal('modal-request'));
  document.getElementById('modal-request-cancel')?.addEventListener('click', () => closeModal('modal-request'));
  document.getElementById('modal-request-form')?.addEventListener('submit', handleRequestSubmit);

  document.getElementById('modal-deny-close')?.addEventListener('click', () => closeModal('modal-deny'));
  document.getElementById('modal-deny-cancel')?.addEventListener('click', () => closeModal('modal-deny'));
  document.getElementById('modal-deny-form')?.addEventListener('submit', handleDenySubmit);
}

// Exposed globally for inline onclick handlers
window.openRequestModal = function(keyId, keyName) {
  document.getElementById('request-key-id').value = keyId;
  document.getElementById('request-key-name').textContent = keyName;
  openModal('modal-request');
};

async function handleRequestSubmit(e) {
  e.preventDefault();
  const keyId = document.getElementById('request-key-id').value;
  const btn = document.getElementById('request-submit-btn');
  setButtonLoading(btn, true);

  const { data, error } = await supabase.rpc('request_loan', { p_key_id: keyId });

  setButtonLoading(btn, false, 'Solicitar');

  if (error) {
    showToast(friendlyError(error), 'error');
    return;
  }

  closeModal('modal-request');
  showToast('Solicitação enviada com sucesso! Aguarde a aprovação.', 'success');
  await loadKeys();
  await loadActiveLoans();
};

// ---------------------------------------------------------------
// Approve
// ---------------------------------------------------------------
window.approveLoan = async function(loanId) {
  if (!confirm('Confirmar aprovação desta solicitação?')) return;
  const { error } = await supabase.rpc('approve_loan', { p_loan_id: loanId });
  if (error) { showToast(friendlyError(error), 'error'); return; }
  showToast('Solicitação aprovada.', 'success');
  await loadKeys();
  await loadActiveLoans();
};

// ---------------------------------------------------------------
// Deny modal
// ---------------------------------------------------------------
let _denyLoanId = null;

window.openDenyModal = function(loanId) {
  _denyLoanId = loanId;
  document.getElementById('deny-reason').value = '';
  openModal('modal-deny');
};

async function handleDenySubmit(e) {
  e.preventDefault();
  const reason = document.getElementById('deny-reason').value.trim();
  if (!reason) { showToast('O motivo da negativa é obrigatório.', 'warning'); return; }
  const btn = document.getElementById('deny-submit-btn');
  setButtonLoading(btn, true);

  const { error } = await supabase.rpc('deny_loan', { p_loan_id: _denyLoanId, p_reason: reason });
  setButtonLoading(btn, false, 'Negar');

  if (error) { showToast(friendlyError(error), 'error'); return; }
  closeModal('modal-deny');
  showToast('Solicitação negada.', 'info');
  await loadActiveLoans();
}

// ---------------------------------------------------------------
// Pickup
// ---------------------------------------------------------------
window.pickupLoan = async function(loanId) {
  if (!confirm('Confirmar que a chave foi retirada?')) return;
  const { error } = await supabase.rpc('pickup_loan', { p_loan_id: loanId });
  if (error) { showToast(friendlyError(error), 'error'); return; }
  showToast('Retirada registrada.', 'success');
  await loadActiveLoans();
};

// ---------------------------------------------------------------
// Return
// ---------------------------------------------------------------
window.returnLoan = async function(loanId) {
  if (!confirm('Confirmar devolução desta chave?')) return;
  const { error } = await supabase.rpc('return_loan', { p_loan_id: loanId });
  if (error) { showToast(friendlyError(error), 'error'); return; }
  showToast('Devolução registrada com sucesso.', 'success');
  await loadKeys();
  await loadActiveLoans();
};

// ---------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------
window.cancelLoan = async function(loanId) {
  if (!confirm('Cancelar esta solicitação?')) return;
  const { error } = await supabase.rpc('cancel_loan', { p_loan_id: loanId });
  if (error) { showToast(friendlyError(error), 'error'); return; }
  showToast('Solicitação cancelada.', 'info');
  await loadKeys();
  await loadActiveLoans();
};

// ---------------------------------------------------------------
// Boot
// ---------------------------------------------------------------
document.addEventListener('DOMContentLoaded', init);
