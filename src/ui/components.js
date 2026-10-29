import { icon } from '../lib/icons.js';
import { esc } from '../lib/format.js';
import { api } from '../lib/api.js';

let modalStack = [];
let actionMenu = null;
let toastCounter = 0;

function updateBodyModalState() {
  document.body.classList.toggle('modal-open', modalStack.length > 0);
}

function focusableElements(container) {
  return [...container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => element.offsetParent !== null || element === document.activeElement);
}

function trapFocus(container, event) {
  const elements = focusableElements(container);
  if (!elements.length) return;
  const first = elements[0];
  const last = elements[elements.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

document.addEventListener('keydown', (event) => {
  const top = modalStack[modalStack.length - 1];
  if (!top) return;
  if (event.key === 'Escape' && top.dismissible) {
    event.preventDefault();
    event.stopPropagation();
    top.close();
    return;
  }
  if (event.key === 'Tab') trapFocus(top.layer, event);
});

export function openModal(options = {}) {
  const {
    title = '',
    subtitle = '',
    body = '',
    footer = '',
    className = '',
    bare = false,
    dismissible = true,
    onMount,
    onClose,
  } = options;

  const layer = document.createElement('div');
  layer.className = `modal-layer ${bare ? 'is-bare' : ''}`;
  layer.innerHTML = bare
    ? `<div class="modal ${className}" role="dialog" aria-modal="true">${body}</div>`
    : `<div class="modal ${className}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <header class="modal-head">
          <div class="modal-heading">
            <h2>${esc(title)}</h2>
            ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
          </div>
          ${
            dismissible
              ? `<button class="icon-btn modal-close" type="button" aria-label="关闭">${icon('x', 18)}</button>`
              : ''
          }
        </header>
        <div class="modal-content">${body}</div>
        ${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}
      </div>`;

  document.getElementById('overlay-root').appendChild(layer);
  const modal = layer.querySelector('.modal');
  const previousFocus = document.activeElement;
  const entry = {
    layer,
    dismissible,
    close: () => closeModal(entry),
  };
  modalStack.push(entry);
  updateBodyModalState();

  const close = (value) => {
    entry.close(value);
  };

  if (dismissible) {
    layer.addEventListener('mousedown', (event) => {
      if (event.target === layer) close();
    });
    layer.querySelector('.modal-close')?.addEventListener('click', () => close());
  }

  requestAnimationFrame(() => layer.classList.add('is-open'));
  if (typeof onMount === 'function') {
    onMount({ layer, modal, close });
  }
  setTimeout(() => {
    const target = modal.querySelector('[autofocus]') || focusableElements(modal)[0];
    target?.focus({ preventScroll: true });
  }, 40);

  entry.onClose = (value) => {
    if (typeof onClose === 'function') onClose(value);
    if (previousFocus && typeof previousFocus.focus === 'function') {
      previousFocus.focus({ preventScroll: true });
    }
  };
  return { layer, modal, close, stackIndex: modalStack.length };
}

function closeModal(entry, value) {
  if (!entry || entry.closed) return;
  entry.closed = true;
  modalStack = modalStack.filter((item) => item !== entry);
  entry.layer.classList.remove('is-open');
  entry.layer.classList.add('is-closing');
  const remove = () => {
    entry.layer.remove();
    updateBodyModalState();
    if (typeof entry.onClose === 'function') entry.onClose(value);
  };
  setTimeout(remove, 180);
}

export function closeTopModal() {
  const top = modalStack[modalStack.length - 1];
  if (top && top.dismissible) top.close();
}

export function confirmDialog(options = {}) {
  const {
    title = '确认操作',
    message = '',
    detail = '',
    confirmText = '确定',
    cancelText = '取消',
    danger = false,
    iconName = danger ? 'alert' : 'info',
  } = options;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      handle.close();
    };
    const handle = openModal({
      title,
      className: 'modal-confirm',
      body: `<div class="confirm-body">
        <span class="confirm-icon ${danger ? 'is-danger' : ''}">${icon(iconName, 24)}</span>
        <div>
          <p class="confirm-message">${esc(message)}</p>
          ${detail ? `<p class="confirm-detail">${esc(detail)}</p>` : ''}
        </div>
      </div>`,
      footer: `<button class="btn btn-ghost" type="button" data-confirm="cancel">${esc(cancelText)}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-confirm="ok">${esc(confirmText)}</button>`,
      onMount: ({ modal }) => {
        modal.querySelector('[data-confirm="cancel"]')?.addEventListener('click', () => finish(false));
        modal.querySelector('[data-confirm="ok"]')?.addEventListener('click', () => finish(true));
      },
      onClose: () => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      },
    });
  });
}

export function promptDialog(options = {}) {
  const {
    title = '输入',
    label = '',
    value = '',
    placeholder = '',
    confirmText = '保存',
    cancelText = '取消',
    maxlength = 80,
    multiline = false,
  } = options;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
      handle.close();
    };
    const field = multiline
      ? `<textarea class="field-input field-textarea" name="value" maxlength="${maxlength}" placeholder="${esc(placeholder)}" autofocus>${esc(value)}</textarea>`
      : `<input class="field-input" name="value" maxlength="${maxlength}" value="${esc(value)}" placeholder="${esc(placeholder)}" autofocus />`;
    const handle = openModal({
      title,
      className: 'modal-prompt',
      body: `<form class="prompt-form" data-prompt-form>
        ${label ? `<label class="field-label">${esc(label)}</label>` : ''}
        ${field}
        <p class="field-error" data-error hidden></p>
      </form>`,
      footer: `<button class="btn btn-ghost" type="button" data-prompt="cancel">${esc(cancelText)}</button>
        <button class="btn btn-primary" type="button" data-prompt="ok">${esc(confirmText)}</button>`,
      onMount: ({ modal }) => {
        const input = modal.querySelector('[name="value"]');
        const error = modal.querySelector('[data-error]');
        const submit = () => {
          const text = input.value.trim();
          if (!text) {
            error.textContent = '内容不能为空';
            error.hidden = false;
            input.focus();
            return;
          }
          finish(text);
        };
        modal.querySelector('[data-prompt="ok"]')?.addEventListener('click', submit);
        modal.querySelector('[data-prompt="cancel"]')?.addEventListener('click', () => finish(null));
        input?.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' && !multiline) {
            event.preventDefault();
            submit();
          }
        });
      },
      onClose: () => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      },
    });
  });
}

export function showActionMenu(anchor, items = []) {
  closeActionMenu();
  if (!anchor) return;
  const menu = document.createElement('div');
  menu.className = 'action-menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = items
    .map((item, index) => {
      if (item === '-' || item.separator) return '<div class="action-sep" role="separator"></div>';
      return `<button class="action-item ${item.danger ? 'is-danger' : ''}" type="button" role="menuitem" data-menu-index="${index}" ${item.disabled ? 'disabled' : ''}>
        ${item.icon ? icon(item.icon, 16) : ''}<span>${esc(item.label)}</span>
        ${item.hint ? `<em>${esc(item.hint)}</em>` : ''}
      </button>`;
    })
    .join('');
  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  let left = rect.right - menuRect.width;
  let top = rect.bottom + 8;
  if (left < 12) left = 12;
  if (left + menuRect.width > window.innerWidth - 12) {
    left = window.innerWidth - menuRect.width - 12;
  }
  if (top + menuRect.height > window.innerHeight - 12) {
    top = Math.max(12, rect.top - menuRect.height - 8);
  }
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
  requestAnimationFrame(() => menu.classList.add('is-open'));

  menu.addEventListener('click', (event) => {
    const button = event.target.closest('[data-menu-index]');
    if (!button || button.disabled) return;
    const item = items[Number(button.dataset.menuIndex)];
    closeActionMenu();
    item?.onClick?.();
  });

  actionMenu = menu;
  const closeHandler = (event) => {
    if (!menu.contains(event.target)) closeActionMenu();
  };
  setTimeout(() => {
    document.addEventListener('mousedown', closeHandler, { once: true });
  }, 0);
  const escapeHandler = (event) => {
    if (event.key === 'Escape') closeActionMenu();
  };
  document.addEventListener('keydown', escapeHandler, { once: true });
  window.addEventListener('resize', closeActionMenu, { once: true });
  window.addEventListener('scroll', closeActionMenu, { once: true, capture: true });
}

export function closeActionMenu() {
  if (!actionMenu) return;
  actionMenu.remove();
  actionMenu = null;
}

const TOAST_ICONS = {
  success: 'checkCircle',
  error: 'xCircle',
  info: 'info',
  warning: 'alert',
};

export function toast(message, options = {}) {
  const { type = 'info', title = '', duration = 3600 } = options;
  const root = document.getElementById('toast-root');
  if (!root) return;
  toastCounter += 1;
  const node = document.createElement('div');
  node.className = `toast toast-${type}`;
  node.style.setProperty('--toast-index', String(Math.min(toastCounter, 4)));
  node.innerHTML = `
    <span class="toast-icon">${icon(TOAST_ICONS[type] || 'info', 19)}</span>
    <div class="toast-copy">
      ${title ? `<strong>${esc(title)}</strong>` : ''}
      <span>${esc(message)}</span>
    </div>
    <button class="toast-close" type="button" aria-label="关闭">${icon('x', 14)}</button>`;
  root.appendChild(node);
  requestAnimationFrame(() => node.classList.add('is-visible'));
  let timer = setTimeout(remove, duration);
  function remove() {
    clearTimeout(timer);
    node.classList.remove('is-visible');
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), 240);
  }
  node.querySelector('.toast-close')?.addEventListener('click', remove);
  while (root.children.length > 4) {
    root.firstElementChild?.remove();
  }
}

export function errorMessage(error) {
  if (!error) return '未知错误';
  if (error.code === 'duplicate-plan') return '这份计划已经导入过了';
  return error.message || '操作失败';
}

export function loadingBlock(label = '正在加载…') {
  return `<div class="loading-block">
    <span class="loading-orbit">${icon('loading', 24)}</span>
    <span>${esc(label)}</span>
  </div>`;
}

export function emptyState(options = {}) {
  const { iconName = 'plane', title = '还没有内容', message = '', action = '' } = options;
  return `<div class="empty-state">
    <span class="empty-icon">${icon(iconName, 30)}</span>
    <h3>${esc(title)}</h3>
    ${message ? `<p>${esc(message)}</p>` : ''}
    ${action ? `<div class="empty-actions">${action}</div>` : ''}
  </div>`;
}

export function debounce(fn, wait = 180) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export async function copyToClipboard(text) {
  try {
    await api.copyText(text);
    toast('已复制到剪贴板', { type: 'success', duration: 1800 });
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(text);
      toast('已复制到剪贴板', { type: 'success', duration: 1800 });
      return true;
    } catch {
      toast('复制失败，请手动选择文本', { type: 'error' });
      return false;
    }
  }
}
