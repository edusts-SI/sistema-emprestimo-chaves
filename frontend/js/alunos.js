/**
 * alunos.js
 * User/student management for admins.
 * Lists all profiles, allows role change, activation/deactivation,
 * and pre-authorization (creating a profile record that will be
 * matched when the user authenticates via Google for the first time).
 */

import { supabase } from './supabase.js';
import { requireAuth, logout } from './auth.js';
import { initSession } from './session.js';
import {
  initTheme, toggleTheme, showToast, showLoading, showEmpty,
  openModal, closeModal, friendlyError, formatDate,
  setButtonLoading, renderUserNav, applyRoleVisibility, escapeHtml,
} from './ui.js';

let _profile = null;

async function init() {
  initTheme();
  _profile = await requireAuth(['admin']);
  if (!_profile) return;
  await initSession();
  renderUserNav(_profile);
  applyRoleVisibility(_profile);

  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
  document.getElementById('logout-btn')?.addEventListener('click', logout);

  document.getElementById('btn-new-user')?.addEventListener('click', () => {
    resetUserForm();
    openModal('modal-user');
  });

  document.getElementById('modal-user-close')?.addEventListener('click', () => closeModal('modal-user'));
  document.getElementById('modal-user-cancel')?.addEventListener('click', () => closeModal('modal-user'));
  document.getElementById('modal-user-form')?.addEventListener('submit', handleUserSubmit);
  document.getElementById('search-input')?.addEventListener('input', filterTable);

  await loadUsers();
}

// ---------------------------------------------------------------
// Load users
// ---------------------------------------------------------------
async function loadUsers() {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" class="table-loading">Carregando usuários...</td></tr>`;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('nome');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="5" class="state-error">Erro ao carregar usuários.</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Nenhum usuário cadastrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(u => renderUserRow(u)).join('');
  document.getElementById('users-count').textContent = data.length;
}

function renderUserRow(u) {
  const roleLabels = { user: 'Usuário', approver: 'Aprovador', admin: 'Administrador' };
  const roleCss = { user: 'badge--available', approver: 'badge--approved', admin: 'badge--active' };
  return `
    <tr data-search="${u.nome.toLowerCase()} ${u.email.toLowerCase()}">
      <td>
        <div class="user-cell">
          <img class="user-avatar" src="https://ui-avatars.com/api/?name=${encodeURIComponent(u.nome)}&size=32&background=6b7280&color=fff" alt="${escapeHtml(u.nome)}">
          <div>
            <div class="user-name">${escapeHtml(u.nome)}</div>
            <div class="text-muted text-sm">${escapeHtml(u.email)}</div>
          </div>
        </div>
      </td>
      <td><span class="badge ${roleCss[u.role] ?? ''}">${roleLabels[u.role] ?? u.role}</span></td>
      <td><span class="badge ${u.ativo ? 'badge--available' : 'badge--inactive'}">${u.ativo ? 'Ativo' : 'Inativo'}</span></td>
      <td>${formatDate(u.created_at)}</td>
      <td>
        <div class="action-group">
          <button class="btn btn--ghost btn--xs" onclick="editUser('${u.id}', '${escapeHtml(u.nome)}', '${escapeHtml(u.email)}', '${u.role}', ${u.ativo})">Editar</button>
          <button class="btn btn--${u.ativo ? 'danger' : 'success'} btn--xs" onclick="toggleUserActive('${u.id}', ${u.ativo})">
            ${u.ativo ? 'Desativar' : 'Ativar'}
          </button>
        </div>
      </td>
    </tr>
  `;
}

function filterTable() {
  const q = document.getElementById('search-input').value.toLowerCase();
  document.querySelectorAll('#users-tbody tr[data-search]').forEach(row => {
    row.style.display = row.dataset.search.includes(q) ? '' : 'none';
  });
}

// ---------------------------------------------------------------
// Modal: create/edit user
// ---------------------------------------------------------------
let _editingUserId = null;

function resetUserForm() {
  _editingUserId = null;
  document.getElementById('modal-user-title').textContent = 'Cadastrar Usuário';
  document.getElementById('user-nome').value = '';
  document.getElementById('user-email').value = '';
  document.getElementById('user-email').disabled = false;
  document.getElementById('user-role').value = 'user';
  document.getElementById('user-ativo').checked = true;
}

window.editUser = function(id, nome, email, role, ativo) {
  _editingUserId = id;
  document.getElementById('modal-user-title').textContent = 'Editar Usuário';
  document.getElementById('user-nome').value = nome;
  document.getElementById('user-email').value = email;
  document.getElementById('user-email').disabled = true; // email cannot be changed
  document.getElementById('user-role').value = role;
  document.getElementById('user-ativo').checked = ativo;
  openModal('modal-user');
};

async function handleUserSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('user-submit-btn');
  const nome = document.getElementById('user-nome').value.trim();
  const email = document.getElementById('user-email').value.trim().toLowerCase();
  const role = document.getElementById('user-role').value;
  const ativo = document.getElementById('user-ativo').checked;

  if (!nome || !email) { showToast('Preencha todos os campos obrigatórios.', 'warning'); return; }

  setButtonLoading(btn, true);
  let error;

  if (_editingUserId) {
    // Update existing profile
    ({ error } = await supabase
      .from('profiles')
      .update({ nome, role, ativo, updated_at: new Date().toISOString() })
      .eq('id', _editingUserId));
  } else {
    // Pre-authorize: insert a profile with a placeholder id.
    // When this user logs in via Google, the trigger will upsert
    // their real auth id. For pre-auth, we insert by email so the
    // admin can set the role/name ahead of time.
    // NOTE: The profile id must match the auth.users id.
    // This approach inserts by email; the trigger handles the real link.
    // The admin should inform the user to log in via Google normally.
    ({ error } = await supabase
      .from('profiles')
      .upsert({ email, nome, role, ativo }, { onConflict: 'email' }));
  }

  setButtonLoading(btn, false, 'Salvar');

  if (error) { showToast(friendlyError(error), 'error'); return; }

  closeModal('modal-user');
  showToast(_editingUserId ? 'Usuário atualizado.' : 'Usuário cadastrado. Ele poderá acessar ao fazer login com o Google.', 'success');
  await loadUsers();
}

// ---------------------------------------------------------------
// Toggle active status
// ---------------------------------------------------------------
window.toggleUserActive = async function(id, currentActive) {
  const action = currentActive ? 'desativar' : 'ativar';
  if (!confirm(`Confirmar ${action} este usuário?`)) return;

  const { error } = await supabase
    .from('profiles')
    .update({ ativo: !currentActive, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) { showToast(friendlyError(error), 'error'); return; }
  showToast(`Usuário ${currentActive ? 'desativado' : 'ativado'} com sucesso.`, 'success');
  await loadUsers();
};

document.addEventListener('DOMContentLoaded', init);
