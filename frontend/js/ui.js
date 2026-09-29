/**
 * ui.js
 * Shared UI utilities: toast notifications, modals, loaders,
 * theme management, and human-friendly error messages.
 */

// ---------------------------------------------------------------
// Theme (light / dark)
// ---------------------------------------------------------------

const THEME_KEY = 'chaves_theme';

export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved ?? (prefersDark ? 'dark' : 'light');
  applyTheme(theme);
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem(THEME_KEY, next);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.setAttribute('aria-label', theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro');
    btn.innerHTML = theme === 'dark'
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  }
}

// ---------------------------------------------------------------
// Toast Notifications
// ---------------------------------------------------------------

let _toastContainer = null;

function ensureToastContainer() {
  if (_toastContainer) return _toastContainer;
  _toastContainer = document.createElement('div');
  _toastContainer.className = 'toast-container';
  _toastContainer.setAttribute('aria-live', 'polite');
  document.body.appendChild(_toastContainer);
  return _toastContainer;
}

/**
 * Shows a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {number} duration - milliseconds (0 = persistent)
 */
export function showToast(message, type = 'info', duration = 4000) {
  const container = ensureToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'alert');

  const icons = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
    error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  };

  toast.innerHTML = `
    <span class="toast__icon">${icons[type] || icons.info}</span>
    <span class="toast__message">${escapeHtml(message)}</span>
    <button class="toast__close" aria-label="Fechar notificação">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;

  toast.querySelector('.toast__close').addEventListener('click', () => dismissToast(toast));
  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => toast.classList.add('toast--visible'));

  if (duration > 0) {
    setTimeout(() => dismissToast(toast), duration);
  }

  return toast;
}

function dismissToast(toast) {
  toast.classList.remove('toast--visible');
  toast.addEventListener('transitionend', () => toast.remove(), { once: true });
}

// ---------------------------------------------------------------
// Modal helpers
// ---------------------------------------------------------------

/**
 * Opens a modal element by id.
 */
export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.add('modal--open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('body--modal-open');

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modalId);
  }, { once: true });

  // Close on Escape
  const escHandler = (e) => {
    if (e.key === 'Escape') { closeModal(modalId); document.removeEventListener('keydown', escHandler); }
  };
  document.addEventListener('keydown', escHandler);
}

/**
 * Closes a modal element by id.
 */
export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove('modal--open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('body--modal-open');
}

// ---------------------------------------------------------------
// Loading states
// ---------------------------------------------------------------

/**
 * Renders a loading skeleton into a container element.
 */
export function showLoading(container, message = 'Carregando...') {
  if (typeof container === 'string') container = document.getElementById(container);
  if (!container) return;
  container.innerHTML = `
    <div class="state-loading">
      <div class="spinner"></div>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

/**
 * Renders an empty state into a container element.
 */
export function showEmpty(container, message = 'Nenhum registro encontrado.', icon = '') {
  if (typeof container === 'string') container = document.getElementById(container);
  if (!container) return;
  container.innerHTML = `
    <div class="state-empty">
      ${icon ? `<div class="state-empty__icon">${icon}</div>` : ''}
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

/**
 * Renders an error state into a container element.
 */
export function showError(container, message = 'Não foi possível carregar os dados.') {
  if (typeof container === 'string') container = document.getElementById(container);
  if (!container) return;
  container.innerHTML = `
    <div class="state-error">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

// ---------------------------------------------------------------
// Status badges
// ---------------------------------------------------------------

const LOAN_STATUS_MAP = {
  pending:   { label: 'Pendente',   css: 'badge--pending',   icon: '⏳' },
  approved:  { label: 'Aprovado',   css: 'badge--approved',  icon: '✔' },
  denied:    { label: 'Negado',     css: 'badge--denied',    icon: '✖' },
  active:    { label: 'Em uso',     css: 'badge--active',    icon: '🔑' },
  returned:  { label: 'Devolvido',  css: 'badge--returned',  icon: '↩' },
  cancelled: { label: 'Cancelado',  css: 'badge--cancelled', icon: '⊘' },
};

const KEY_STATUS_MAP = {
  available:   { label: 'Disponível',   css: 'badge--available',   icon: '●' },
  borrowed:    { label: 'Em uso',       css: 'badge--active',      icon: '●' },
  maintenance: { label: 'Manutenção',   css: 'badge--warning',     icon: '●' },
  inactive:    { label: 'Inativo',      css: 'badge--inactive',    icon: '●' },
};

export function loanStatusBadge(status) {
  const s = LOAN_STATUS_MAP[status] || { label: status, css: '', icon: '' };
  return `<span class="badge ${s.css}" title="${s.label}">${s.icon} ${s.label}</span>`;
}

export function keyStatusBadge(status) {
  const s = KEY_STATUS_MAP[status] || { label: status, css: '', icon: '' };
  return `<span class="badge ${s.css}" title="${s.label}">${s.icon} ${s.label}</span>`;
}

// ---------------------------------------------------------------
// Error message translation
// ---------------------------------------------------------------

/**
 * Converts technical Supabase/PostgreSQL errors into
 * human-friendly Portuguese messages.
 */
export function friendlyError(error) {
  if (!error) return 'Erro desconhecido.';

  const msg = error.message || error.toString();

  // Map PostgreSQL custom error codes
  const customMessages = {
    'P0001': 'Você precisa estar autenticado.',
    'P0002': 'Sua conta está inativa. Contate o administrador.',
    'P0003': 'Chave não encontrada.',
    'P0004': 'Esta chave não está disponível.',
    'P0005': 'Esta chave não está disponível no momento.',
    'P0006': 'Você já possui uma solicitação ativa para esta chave.',
    'P0007': 'Esta chave já está emprestada para outro usuário.',
    'P0010': 'Você não tem permissão para aprovar solicitações.',
    'P0011': 'Solicitação não encontrada.',
    'P0012': 'Somente solicitações pendentes podem ser aprovadas.',
    'P0013': 'Esta chave já foi aprovada para outro usuário.',
    'P0020': 'Você não tem permissão para negar solicitações.',
    'P0021': 'O motivo da negativa é obrigatório.',
    'P0022': 'Solicitação não encontrada.',
    'P0023': 'Somente solicitações pendentes podem ser negadas.',
    'P0030': 'Você não tem permissão para registrar a retirada.',
    'P0031': 'Solicitação não encontrada.',
    'P0032': 'Somente empréstimos aprovados podem ser marcados como ativos.',
    'P0040': 'Você não tem permissão para registrar devoluções.',
    'P0041': 'Empréstimo não encontrado.',
    'P0042': 'Somente empréstimos ativos podem ser devolvidos.',
    'P0050': 'Solicitação não encontrada.',
    'P0051': 'Você não tem permissão para cancelar esta solicitação.',
    'P0052': 'Somente solicitações pendentes podem ser canceladas.',
    'P0100': 'Transição de status inválida.',
  };

  // Check if the error message contains a known code
  for (const [code, friendly] of Object.entries(customMessages)) {
    if (msg.includes(code)) return friendly;
  }

  // Generic Supabase / PostgreSQL errors
  if (msg.includes('row-level security')) return 'Você não possui permissão para realizar esta ação.';
  if (msg.includes('unique constraint') || msg.includes('duplicate key')) return 'Este registro já existe.';
  if (msg.includes('foreign key')) return 'Referência inválida. Verifique os dados e tente novamente.';
  if (msg.includes('not null')) return 'Campos obrigatórios não foram preenchidos.';
  if (msg.includes('network') || msg.includes('fetch')) return 'Erro de conexão. Verifique sua internet e tente novamente.';
  if (msg.includes('JWT')) return 'Sua sessão expirou. Faça login novamente.';

  // Return the original message but log the full technical detail
  console.error('[UI] Technical error:', error);
  return msg;
}

// ---------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------

export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(dateStr));
}

export function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(dateStr));
}

export function setButtonLoading(btn, loading, originalText = null) {
  if (!btn) return;
  if (loading) {
    btn.dataset.originalText = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner spinner--sm"></span> Aguarde...`;
  } else {
    btn.disabled = false;
    btn.textContent = originalText || btn.dataset.originalText || 'Confirmar';
  }
}

/**
 * Populates a user display (avatar + name) in a nav element.
 */
export function renderUserNav(profile) {
  const nameEl = document.getElementById('user-name');
  const avatarEl = document.getElementById('user-avatar');
  const roleEl = document.getElementById('user-role');

  if (nameEl) nameEl.textContent = profile.nome;
  if (roleEl) {
    const roleLabels = { user: 'Usuário', approver: 'Aprovador', admin: 'Administrador' };
    roleEl.textContent = roleLabels[profile.role] || profile.role;
  }
  if (avatarEl && profile.avatar_url) {
    avatarEl.src = profile.avatar_url;
    avatarEl.alt = profile.nome;
  } else if (avatarEl) {
    avatarEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.nome)}&background=6b7280&color=fff&size=40`;
    avatarEl.alt = profile.nome;
  }
}

/**
 * Shows/hides elements based on user role.
 * Elements with data-requires-role="admin" are hidden unless user is admin, etc.
 */
export function applyRoleVisibility(profile) {
  document.querySelectorAll('[data-requires-role]').forEach(el => {
    const required = el.getAttribute('data-requires-role').split(',').map(r => r.trim());
    el.style.display = required.includes(profile?.role) ? '' : 'none';
  });

  document.querySelectorAll('[data-hides-for-role]').forEach(el => {
    const hidden = el.getAttribute('data-hides-for-role').split(',').map(r => r.trim());
    el.style.display = hidden.includes(profile?.role) ? 'none' : '';
  });
}
