import { $, imageFallback } from './lib/dom.js';
import { initStore, store } from './state.js';
import { registerRoute, setFallback, onRouteChange, startRouter, getRoute } from './router.js';
import {
  renderTopbar,
  renderSidebar,
  renderMobileNav,
  setActiveNav,
  updateCounts,
  syncTopbarSearch
} from './components/nav.js';
import * as player from './components/player.js';
const { initPlayer, currentChannel } = player;
import { toastError } from './components/toast.js';
import { api } from './api.js';

import iptvView from './views/iptv.js';
import radioView from './views/radio.js';
import buddhistView from './views/buddhist.js';
import favoritesView from './views/favorites.js';
import historyView from './views/history.js';
import settingsView from './views/settings.js';

window.__imgFallback = imageFallback;

const ROUTE_KIND = { iptv: 'iptv', radio: 'radio' };

function toggleSidebar(force) {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('drawer-backdrop');
  if (!sidebar) return;
  const open = force !== undefined ? force : !sidebar.classList.contains('is-open');
  sidebar.classList.toggle('is-open', open);
  if (backdrop) {
    if (open) backdrop.removeAttribute('hidden');
    else backdrop.setAttribute('hidden', '');
  }
}

async function bootstrap() {
  initStore();

  const sidebar = $('#sidebar');
  const mobileNav = $('#mobile-nav');
  const viewRoot = $('#view');

  renderTopbar($('#topbar'), {
    onSearch: (value) => document.dispatchEvent(new CustomEvent('global-search', { detail: value })),
    onToggleSidebar: () => toggleSidebar()
  });
  renderSidebar(sidebar);
  renderMobileNav(mobileNav);
  initPlayer($('#player-dock'));

  document.getElementById('drawer-backdrop')?.addEventListener('click', () => toggleSidebar(false));

  // 侧边栏计数跟随数据变化（同步完成 / 列表加载后自动刷新）
  store.subscribe((event) => {
    if (event === 'counts') updateCounts();
  });

  [iptvView, radioView, buddhistView, favoritesView, historyView, settingsView].forEach((view) =>
    registerRoute(view)
  );
  setFallback('iptv');

  onRouteChange(async (route) => {
    document.dispatchEvent(new CustomEvent('view:leave'));
    setActiveNav(sidebar, route);
    setActiveNav(mobileNav, route);
    store.setRoute(route);
    toggleSidebar(false);
    const kind = ROUTE_KIND[route];
    syncTopbarSearch(kind ? store.getFilters(kind).q || '' : '');
    const view = getRoute(route);
    if (!view) return;
    viewRoot.innerHTML = '';
    viewRoot.scrollTop = 0;
    try {
      await view.render(viewRoot);
    } catch (err) {
      viewRoot.innerHTML = `<div class="empty-state"><h3>页面加载失败</h3><p class="muted">${
        err?.message || '未知错误'
      }</p></div>`;
    }
  });

  startRouter();
  loadMetadata();
}

async function loadMetadata() {
  try {
    const health = await api.health();
    store.setCounts(health.counts || {});
    updateCounts();
  } catch {
    /* 忽略 */
  }
  try {
    const favs = await api.favorites();
    store.setFavorites((favs.items || []).map((f) => f.channel_id));
  } catch {
    /* 忽略 */
  }
  window.addEventListener('error', (event) => {
    if (event.message && /Hls|video|audio/i.test(event.message)) return;
  });
}

// 暴露少量调试入口（排查播放问题时可在控制台调用）
window.__panel = { store, api, player, currentChannel };

bootstrap().catch((err) => {
  console.error(err);
  toastError('面板初始化失败，请刷新重试');
});
