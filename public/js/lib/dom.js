/** DOM 与常用小工具（前端公共层） */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

// 图标在 icons.js 中维护，此处统一转出，使用方只需 import 本模块
export { icon, ICON_NAMES } from './icons.js';

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  if (value == null) return '';
  return String(value).replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

/**
 * 安全 HTML 包装：html`` 模板的返回值。
 * 嵌套模板（${cond ? html`...` : ''}）会被外层识别为已处理内容，不再重复转义。
 */
export class SafeHtml {
  constructor(value) {
    this.__raw = String(value ?? '');
  }
  toString() {
    return this.__raw;
  }
}

/** 标记为原始 HTML，模板中不转义 */
export function raw(value) {
  if (value instanceof SafeHtml) return value;
  return new SafeHtml(value);
}

function renderValue(value) {
  if (value instanceof SafeHtml) return value.__raw;
  if (value && typeof value === 'object' && '__raw' in value) return String(value.__raw);
  if (Array.isArray(value)) return value.map(renderValue).join('');
  return esc(value);
}

/** 带自动转义的模板标签 */
export function html(strings, ...values) {
  let out = '';
  strings.forEach((part, i) => {
    out += part;
    if (i < values.length) out += renderValue(values[i]);
  });
  return new SafeHtml(out);
}

/** 事件委托 */
export function on(root, event, selector, handler) {
  root.addEventListener(event, (e) => {
    const target = e.target instanceof Element ? e.target.closest(selector) : null;
    if (target && root.contains(target)) handler(e, target);
  });
  return root;
}

/** 防抖 */
export function debounce(fn, delay = 300) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/** 时间格式化 HH:MM */
export function formatTime(ts) {
  if (!ts) return '--:--';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 相对时间 */
export function fromNow(ts) {
  if (!ts) return '未知';
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

/** 频道名首字母（logo 兜底） */
export function initials(name) {
  const text = String(name || '').trim();
  if (!text) return '?';
  const letters = text.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/);
  if (letters.length >= 2) return (letters[0][0] + letters[1][0]).toUpperCase();
  return text.slice(0, 2).toUpperCase();
}

/** 图片加载失败兜底：按图片自身形态插入等价占位（卡片大图 / 电台行小 logo） */
export function imageFallback(event) {
  const img = event.currentTarget;
  if (!img || img.dataset.fallbackApplied === '1') return;
  img.dataset.fallbackApplied = '1';
  img.style.display = 'none';
  const holder = img.parentElement;
  if (!holder || holder.querySelector('.img-fallback')) return;
  const isRow = /station-row__logo/.test(img.className);
  const div = document.createElement('div');
  div.className = isRow
    ? 'station-row__logo img-fallback'
    : 'channel-card__logo channel-card__logo--fallback img-fallback';
  div.textContent = initials(img.alt || '');
  holder.insertBefore(div, img);
}

export function setHTML(node, markup) {
  if (node) node.innerHTML = markup;
  return node;
}
