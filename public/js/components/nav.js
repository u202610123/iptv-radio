import { html, raw, $, $$, icon } from '../lib/dom.js';
import { store } from '../state.js';
import { allRoutes, currentRoute, navigate } from '../router.js';
import { api } from '../api.js';
import { toastSuccess, toastError } from './toast.js';

const NAV_GROUPS = [
  {
    label: '浏览',
    items: [
      { id: 'iptv', label: '全球 IPTV', icon: 'tv' },
      { id: 'radio', label: '全球广播', icon: 'radio' },
      { id: 'buddhist', label: '佛经佛法', icon: 'lotus' }
    ]
  },
  {
    label: '我的',
    items: [
      { id: 'favorites', label: '收藏', icon: 'star' },
      { id: 'history', label: '最近播放', icon: 'clock' }
    ]
  },
  {
    label: '系统',
    items: [{ id: 'settings', label: '设置与订阅', icon: 'settings' }]
  }
];

/** 顶部栏 */
export function renderTopbar(root, { onSearch, onToggleSidebar } = {}) {
  root.innerHTML = html`
    <button class="icon-btn" id="btn-menu" title="菜单" aria-label="菜单">${raw(icon('menu', 18))}</button>
    <div class="topbar__brand">
      <div class="topbar__logo"></div>
      <div>
        <div class="topbar__title grad-text">Global IPTV &amp; Radio</div>
        <div class="topbar__sub">全球电视与 FM / AM / SW 广播聚合面板</div>
      </div>
    </div>
    <div class="topbar__spacer"></div>
    <div class="search-box">
      <span class="search-box__icon">${raw(icon('search', 16))}</span>
      <input id="global-search" type="search" placeholder="搜索频道…" autocomplete="off" />
    </div>
    <div class="topbar__actions">
      <button class="icon-btn" id="btn-sync" title="同步数据源">${raw(icon('refresh', 18))}</button>
      <button class="icon-btn" id="btn-theme" title="切换主题">${raw(icon('moon', 18))}</button>
    </div>
  `;

  $('#btn-menu', root).addEventListener('click', () => onToggleSidebar?.());
  $('#btn-theme', root).addEventListener('click', () => {
    store.toggleTheme();
    syncThemeIcon(root);
  });
  $('#btn-sync', root).addEventListener('click', async () => {
    const btn = $('#btn-sync', root);
    btn.disabled = true;
    try {
      await api.triggerSync('all');
      toastSuccess('已在后台启动数据同步');
    } catch (err) {
      toastError(err.message || '同步失败');
    } finally {
      btn.disabled = false;
    }
  });

  const input = $('#global-search', root);
  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => onSearch?.(input.value.trim()), 300);
  });

  syncThemeIcon(root);
  return root;
}

function syncThemeIcon(root) {
  const btn = $('#btn-theme', root);
  if (btn) btn.innerHTML = icon(store.prefs.theme === 'dark' ? 'moon' : 'sun', 18);
}

/** 侧边栏 */
export function renderSidebar(root) {
  root.innerHTML = html`
    ${raw(
      NAV_GROUPS.map(
        (group) => html`<div class="nav-group">
        <div class="nav-group__label">${group.label}</div>
        ${raw(
          group.items
            .map(
              (item) => html`<button class="nav-item" data-route="${item.id}">
              ${raw(icon(item.icon, 20, 'nav-item__icon'))}
              <span>${item.label}</span>
              <span class="nav-item__count" data-count="${item.id}"></span>
            </button>`
            )
            .join('')
        )}
      </div>`
      ).join('')
    )}
  `;

  root.addEventListener('click', (event) => {
    const target = event.target.closest('[data-route]');
    if (!target) return;
    navigate(target.dataset.route);
    root.classList.remove('is-open');
    document.getElementById('drawer-backdrop')?.setAttribute('hidden', '');
  });

  updateCounts(root);
  setActiveNav(root, currentRoute());
  return root;
}

/** 移动端底部导航 */
export function renderMobileNav(root) {
  const items = [
    { id: 'iptv', label: 'IPTV', icon: 'tv' },
    { id: 'radio', label: '广播', icon: 'radio' },
    { id: 'buddhist', label: '佛经', icon: 'lotus' },
    { id: 'favorites', label: '收藏', icon: 'star' },
    { id: 'history', label: '历史', icon: 'clock' },
    { id: 'settings', label: '设置', icon: 'settings' }
  ];
  root.innerHTML = html`
    ${raw(
      items
        .map(
          (item) => html`<button class="mobile-nav__item" data-route="${item.id}">
          ${raw(icon(item.icon, 20, 'mobile-nav__icon'))}
          <span>${item.label}</span>
        </button>`
        )
        .join('')
    )}
  `;
  root.addEventListener('click', (event) => {
    const target = event.target.closest('[data-route]');
    if (target) navigate(target.dataset.route);
  });
  setActiveNav(root, currentRoute());
  return root;
}

export function setActiveNav(root, route) {
  $$('[data-route]', root).forEach((node) => {
    node.classList.toggle('is-active', node.dataset.route === route);
  });
}

export function updateCounts(root = document.getElementById('sidebar')) {
  if (!root) return;
  $$('[data-count]', root).forEach((node) => {
    const key = node.dataset.count;
    const value = store.counts[key];
    node.textContent = value ? String(value) : '';
  });
}

export function syncTopbarSearch(value) {
  const input = document.getElementById('global-search');
  if (input && input.value !== value) input.value = value;
}
