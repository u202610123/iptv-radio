import { html, raw, $, on, icon } from '../lib/dom.js';
import { api } from '../api.js';
import { store } from '../state.js';
import { filterBarHtml, bindFilterBar } from '../components/filters.js';
import { gridHtml, emptyState, skeletonGrid } from '../components/channel-card.js';
import { epgPanelHtml, renderEpg, bindEpgRefresh } from '../components/epg-panel.js';
import * as player from '../components/player.js';
import { toastSuccess, toastError } from '../components/toast.js';

const KIND = 'iptv';
const PAGE_SIZE = 60;

const state = {
  page: 1,
  total: 0,
  items: [],
  facets: null,
  loading: false,
  container: null
};

export default {
  id: KIND,
  title: '全球 IPTV',

  async render(container) {
    state.container = container;
    state.page = 1;
    state.items = [];

    container.innerHTML = html`
      <div id="iptv-filters"></div>
      <div class="content-grid">
        <div>
          <div id="iptv-list">${raw(skeletonGrid(12))}</div>
          <div class="load-more" id="iptv-more" hidden>
            <button class="btn" data-action="more">${raw(icon('plus', 14))} 加载更多</button>
          </div>
        </div>
        <div id="iptv-epg">${raw(epgPanelHtml(null))}</div>
      </div>
    `;

    const filtersHost = $('#iptv-filters', container);
    const filters = store.getFilters(KIND);
    filtersHost.innerHTML = filterBarHtml({
      title: '全球 IPTV',
      subtitle: 'iptv-org · 实时同步',
      selected: filters,
      total: 0
    });
    bindFilterBar(filtersHost, (patch) => {
      store.setFilters(KIND, patch);
      applyFilterChange(patch);
    });

    bindList(container);
    bindEpgRefresh($('#iptv-epg', container), () => player.currentChannel());

    await loadFacets(filtersHost);
    await load({ reset: true });
    listenGlobalSearch(container);
  }
};

function listenGlobalSearch(container) {
  const handler = (event) => {
    const q = event.detail || '';
    const input = container.querySelector('#inline-search-input');
    if (input) input.value = q;
    store.setFilters(KIND, { q });
    applyFilterChange({ q }, container);
  };
  document.addEventListener('global-search', handler);
  const cleanup = () => document.removeEventListener('global-search', handler);
  document.addEventListener('view:leave', cleanup, { once: true });
}

function applyFilterChange(patch, container = state.container) {
  if (!container) return;
  const filters = store.getFilters(KIND);
  Object.entries(patch || {}).forEach(([key, value]) => {
    container.querySelectorAll(`[data-filter="${key}"]`).forEach((chip) => {
      const isAll = chip.dataset.value === '';
      chip.classList.toggle('is-active', isAll ? !filters[key] : chip.dataset.value === filters[key]);
    });
  });
  load({ reset: true });
}

async function loadFacets(host) {
  try {
    const facets = await api.channelFacets(KIND);
    state.facets = facets;
    host.innerHTML = filterBarHtml({
      title: '全球 IPTV',
      subtitle: 'iptv-org · 实时同步',
      countries: facets.countries || [],
      categories: facets.categories || [],
      selected: store.getFilters(KIND),
      total: state.total
    });
    bindFilterBar(host, (patch) => {
      store.setFilters(KIND, patch);
      applyFilterChange(patch);
    });
  } catch {
    /* 筛选聚合失败不阻塞列表 */
  }
}

async function load({ reset = false, append = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  const container = state.container;
  if (!container) return;
  const list = $('#iptv-list', container);
  const moreBtn = $('#iptv-more', container);
  const filters = store.getFilters(KIND);

  if (reset) {
    state.page = 1;
    state.items = [];
    if (list) list.innerHTML = skeletonGrid(12);
  }

  try {
    const data = await api.channels({
      kind: KIND,
      q: filters.q,
      country: filters.country,
      category: filters.category,
      page: state.page,
      pageSize: PAGE_SIZE
    });
    state.items = append ? state.items.concat(data.items) : data.items;
    state.total = data.total;
    renderList(list);
    if (moreBtn) moreBtn.hidden = !data.hasMore;
    const summary = container.querySelector('#filter-summary');
    if (summary) {
      summary.innerHTML = html`<span>共 ${data.total} 个频道</span>
        <span>· 第 ${data.page} / ${Math.max(1, Math.ceil(data.total / PAGE_SIZE))} 页</span>`;
    }
    store.setCounts({ iptv: data.total });
  } catch (err) {
    if (list) list.innerHTML = emptyState('加载失败', err.message || '请稍后重试');
  } finally {
    state.loading = false;
  }
}

function renderList(list) {
  if (!list) return;
  const playingId = player.currentChannel()?.id;
  if (!state.items.length) {
    list.innerHTML = emptyState('没有匹配的频道', '试试更换国家或清空筛选条件');
    return;
  }
  list.innerHTML = gridHtml(state.items, playingId);
  markPlaying(list, playingId);
}

function markPlaying(root, playingId) {
  root.querySelectorAll('.channel-card').forEach((card) => {
    card.classList.toggle('is-playing', card.dataset.id === playingId);
  });
}

function bindList(container) {
  on(container, 'click', '.channel-card', async (event, card) => {
    if (event.target.closest('[data-action="fav"]')) return;
    const channel = state.items.find((c) => c.id === card.dataset.id);
    if (!channel) return;
    await player.play(channel);
    markPlaying(container, channel.id);
    await renderEpg($('#iptv-epg', container), channel);
  });

  on(container, 'click', '[data-action="fav"]', async (event, button) => {
    event.stopPropagation();
    const channel = state.items.find((c) => c.id === button.dataset.id);
    if (!channel) return;
    try {
      if (store.isFavorite(channel.id)) {
        await api.removeFavorite(channel.id);
        store.toggleFavoriteLocal(channel.id);
        button.classList.remove('is-on');
        toastSuccess('已取消收藏');
      } else {
        await api.addFavorite(channel);
        store.toggleFavoriteLocal(channel.id);
        button.classList.add('is-on');
        toastSuccess('已加入收藏');
      }
    } catch (err) {
      toastError(err.message || '操作失败');
    }
  });

  const moreBtn = container.querySelector('[data-action="more"]');
  moreBtn?.addEventListener('click', () => {
    state.page += 1;
    load({ append: true });
  });

  const onPlayerChange = () => {
    const list = $('#iptv-list', container);
    if (list) markPlaying(list, player.currentChannel()?.id);
  };
  document.addEventListener('player:change', onPlayerChange);
  document.addEventListener(
    'view:leave',
    () => document.removeEventListener('player:change', onPlayerChange),
    { once: true }
  );
}
