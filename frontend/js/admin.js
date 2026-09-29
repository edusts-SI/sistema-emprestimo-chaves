/**
 * admin.js
 * Admin panel: key/laboratory management and audit log viewer.
 */

import { supabase } from './supabase.js';
import { requireAuth, logout } from './auth.js';
import { initSession } from './session.js';
import {
  initTheme, toggleTheme, showToast, showLoading, showEmpty,
  openModal, closeModal, keyStatusBadge, friendlyError,
  formatDate, setButtonLoading, renderUserNav, applyRoleVisibility, escapeHtml,
} from './ui.js';

let _profile = null;
let _editingKeyId = null;

async function init() {
  initTheme();
  _profile = await requireAuth(['admin']);
  if (!_profile) return;
  await initSession();
  renderUserNav(_profile);
  applyRoleVisibility(_profile);

  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
  document.getElementById('logout-btn')?.addEventListener('click', logout);

  // Key modal
  document.getElementById('btn-new-key')?.addEventListener('click', () => { resetKeyForm(); openModal('modal-key'); });
  document.getElementById('modal-key-close')?.addEventListener('click', () => closeModal('modal-key'));
  document.getElementById('modal-key-cancel')?.addEventListener('click', () => closeModal('modal-key'));
  document.getElementById('modal-key-form')?.addEventListener('submit', handleKeySubmit);

  // Tab navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  await loadKeys();
  await loadAuditLogs();
  await loadStats();
}

// ---------------------------------------------------------------
// Stats
// ---------------------------------------------------------------
async function loadStats() {
  const [keysRes, usersRes, loansRes] = await Promise.all([
    supabase.from('keys').select('status', { count: 'exact' }),
    supabase.from('profiles').select('id', { count: 'exact' }),
    supabase.from('loans').select('status').in('status', ['pending', 'active', 'approved']),
  ]);

  const keys = keysRes.data ?? [];
  const available = keys.filter(k => k.status === 'available').length;
  const borrowed = keys.filter(k => k.status === 'borrowed').length;
  const maintenance = keys.filter(k => k.status === 'maintenance').length;

  document.getElementById('stat-total-keys').textContent = keys.length;
  document.getElementById('stat-available').textContent = available;
  document.getElementById('stat-borrowed').textContent = borrowed;
  document.getElementById('stat-maintenance').textContent = maintenance;
  document.getElementById('stat-total-users').textContent = usersRes.count ?? 0;
  document.getElementById('stat-pending').textContent = (loansRes.data ?? []).filter(l => l.status === 'pending').length;
}

// ---------------------------------------------------------------
// Keys management
// ---------------------------------------------------------------
async function loadKeys() {
  const tbody = document.getElementById('admin-keys-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" class="table-loading">Carregando chaves...</td></tr>`;

  const { data, error } = await supabase
    .from('keys')
    .select('*')
    .order('codigo');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="state-error">Erro ao carregar.</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Nenhuma chave cadastrada.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(key => `
    <tr>
      <td><strong>${escapeHtml(key.codigo)}</strong></td>
      <td>${escapeHtml(key.nome)}</td>
      <td>${escapeHtml(key.localizacao ?? '—')}</td>
      <td>${keyStatusBadge(key.status)}</td>
      <td><span class="badge ${key.ativo ? 'badge--available' : 'badge--inactive'}">${key.ativo ? 'Ativo' : 'Inativo'}</span></td>
      <td>
        <div class="action-group">
          <button class="btn btn--ghost btn--xs" onclick="editKey('${key.id}')">Editar</button>
          <button class="btn btn--${key.ativo ? 'danger' : 'success'} btn--xs" onclick="toggleKeyActive('${key.id}', ${key.ativo})">
            ${key.ativo ? 'Desativar' : 'Ativar'}
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function resetKeyForm() {
  _editingKeyId = null;
  document.getElementById('modal-key-title').textContent = 'Cadastrar Chave';
  document.getElementById('key-codigo').value = '';
  document.getElementById('key-nome').value = '';
  document.getElementById('key-descricao').value = '';
  document.getElementById('key-localizacao').value = '';
  document.getElementById('key-status').value = 'available';
  document.getElementById('key-ativo').checked = true;
}

window.editKey = async function(keyId) {
  const { data, error } = await supabase.from('keys').select('*').eq('id', keyId).single();
  if (error || !data) { showToast('Erro ao carregar chave.', 'error'); return; }

  _editingKeyId = keyId;
  document.getElementById('modal-key-title').textContent = 'Editar Chave';
  document.getElementById('key-codigo').value = data.codigo;
  document.getElementById('key-nome').value = data.nome;
  document.getElementById('key-descricao').value = data.descricao ?? '';
  document.getElementById('key-localizacao').value = data.localizacao ?? '';
  document.getElementById('key-status').value = data.status;
  document.getElementById('key-ativo').checked = data.ativo;
  openModal('modal-key');
};

async function handleKeySubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('key-submit-btn');
  setButtonLoading(btn, true);

  const payload = {
    codigo:      document.getElementById('key-codigo').value.trim().toUpperCase(),
    nome:        document.getElementById('key-nome').value.trim(),
    descricao:   document.getElementById('key-descricao').value.trim() || null,
    localizacao: document.getElementById('key-localizacao').value.trim() || null,
    status:      document.getElementById('key-status').value,
    ativo:       document.getElementById('key-ativo').checked,
    updated_at:  new Date().toISOString(),
  };

  let error;
  if (_editingKeyId) {
    ({ error } = await supabase.from('keys').update(payload).eq('id', _editingKeyId));
  } else {
    ({ error } = await supabase.from('keys').insert(payload));
    // Audit
    if (!error) {
      await supabase.from('audit_logs').insert({
        user_id: _profile.id, action: 'key_created', table_name: 'keys',
        details: { codigo: payload.codigo, nome: payload.nome },
      });
    }
  }

  setButtonLoading(btn, false, 'Salvar');
  if (error) { showToast(friendlyError(error), 'error'); return; }
  closeModal('modal-key');
  showToast(_editingKeyId ? 'Chave atualizada.' : 'Chave cadastrada.', 'success');
  await loadKeys();
  await loadStats();
}

window.toggleKeyActive = async function(keyId, current) {
  if (!confirm(`Confirmar ${current ? 'desativar' : 'ativar'} esta chave?`)) return;
  const { error } = await supabase.from('keys').update({ ativo: !current, updated_at: new Date().toISOString() }).eq('id', keyId);
  if (error) { showToast(friendlyError(error), 'error'); return; }
  showToast(`Chave ${current ? 'desativada' : 'ativada'}.`, 'success');
  await loadKeys();
};

// ---------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------
async function loadAuditLogs() {
  const tbody = document.getElementById('audit-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="4" class="table-loading">Carregando auditoria...</td></tr>`;

  const { data, error } = await supabase
    .from('audit_logs')
    .select(`
      id, action, table_name, record_id, details, created_at,
      profiles ( nome, email )
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    tbody.innerHTML = `<tr><td colspan="4" class="state-error">Erro ao carregar auditoria.</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="table-empty">Nenhum registro de auditoria.</td></tr>`;
    return;
  }

  const actionLabels = {
    loan_requested: 'Solicitação criada',
    loan_approved:  'Empréstimo aprovado',
    loan_denied:    'Empréstimo negado',
    loan_pickedup:  'Chave retirada',
    loan_returned:  'Chave devolvida',
    loan_cancelled: 'Solicitação cancelada',
    profile_role_changed:   'Perfil alterado',
    profile_status_changed: 'Status do perfil alterado',
    key_created:    'Chave cadastrada',
  };

  tbody.innerHTML = data.map(log => `
    <tr>
      <td>${formatDate(log.created_at)}</td>
      <td>${log.profiles?.nome ?? 'Sistema'}<br><small class="text-muted">${log.profiles?.email ?? ''}</small></td>
      <td>${actionLabels[log.action] ?? log.action}</td>
      <td><code class="code-sm">${escapeHtml(JSON.stringify(log.details ?? {}))}</code></td>
    </tr>
  `).join('');
}

// ---------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('tab-btn--active', btn.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.toggle('tab-panel--active', panel.id === `tab-${tab}`));
}

document.addEventListener('DOMContentLoaded', init);
