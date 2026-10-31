import { $, html } from '../lib/dom.js';

let last = { message: '', at: 0 };

/** 轻量提示条（同文案 2s 内去重，最多同时 4 条） */
export function toast(message, type = 'info', duration = 2600) {
  const container = $('#toast-container');
  if (!container) return;
  const now = Date.now();
  if (message === last.message && now - last.at < 2000) return;
  last = { message, at: now };
  while (container.children.length >= 4) container.firstElementChild.remove();
  const node = document.createElement('div');
  node.className = `toast toast--${type}`;
  node.innerHTML = html`<span>${message}</span>`;
  container.appendChild(node);
  setTimeout(() => {
    node.style.transition = 'opacity 200ms ease, transform 200ms ease';
    node.style.opacity = '0';
    node.style.transform = 'translateY(-8px)';
    setTimeout(() => node.remove(), 220);
  }, duration);
}

export const toastSuccess = (message) => toast(message, 'success');
export const toastError = (message) => toast(message, 'error');
