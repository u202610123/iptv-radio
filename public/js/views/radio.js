import { html, raw, $, on, icon, initials } from '../lib/dom.js';
import { api } from '../api.js';
import { store } from '../state.js';
import { filterBarHtml, bindFilterBar } from '../components/filters.js';
import { stationListHtml, emptyState, skeletonRows } from '../components/channel-card.js';
import * as player from '../components/player.js';
import { toastSuccess, toastError } from '../components/toast.js';

const KIND = 'radio';
const PAGE_SIZE = 60;

const state = { page: 1, total: 0, items: [], facets: null, loading: false, container: null };

export default {
  id: KIND,
  title: '全球广播',

  async render(container) {
    state.container = container;
    state.page = 1;
    state.items = [];

    container.innerHTML = html`
      <div id="radio-filters"></div>
      <div class="content-grid">
        <div>
          <div id="radio-list">${raw(skeletonRows(8))}</div>
          <div class="load-more" id="radio-more" hidden>
            <button class="btn" data-action="more">${raw(icon('plus', 14))} 加载更多</button>
          </div>
        </div>
        <aside class="section glass" id="radio-side">
          <div class="section__head">
            <h3>正在收听</h3>
            <button class="icon-btn" id="side-toggle" title="收起 / 展开">${raw(icon('chevron-up', 16))}</button>
          </div>
          <div id="radio-now">${raw(nowPlayingHtml(null))}</div>
        </aside>
      </div>
    `;

    const host = $('#radio-filters', container);
    host.innerHTML = filterBarHtml({
      title: '全球广播',
      subtitle: 'FM · AM · SW',
      selected: store.getFilters(KIND),
      total: 0
    });
    bindFilterBar(host, (patch) => {
      store.setFilters(KIND, patch);
      applyFilterChange(patch);
    });

    bindList(container);
    bindSidePanel(container);
    await loadFacets(host);
    await load({ reset: true });

    document.addEventListener('global-search', onGlobalSearch);
    document.addEventListener('view:leave', () => {
      document.removeEventListener('global-search', onGlobalSearch);
      document.removeEventListener('player:change', onPlayerChange);
    }, { once: true });
    document.addEventListener('player:change', onPlayerChange);
  }
};

function onGlobalSearch(event) {
  const q = event.detail || '';
  const input = state.container?.querySelector('#inline-search-input');
  if (input) input.value = q;
  store.setFilters(KIND, { q });
  applyFilterChange({ q });
}

function onPlayerChange() {
  const side = state.container?.querySelector('#radio-now');
  if (side) side.innerHTML = nowPlayingHtml(player.currentChannel());
  const list = state.container?.querySelector('#radio-list');
  if (list) markPlaying(list, player.currentChannel()?.id);
}

function nowPlayingHtml(channel) {
  if (!channel) {
    return html`<div class="empty-state">${raw(icon('radio', 24))}<p>选择电台开始收听</p></div>`;
  }
  const extra = parseExtra(channel.extra);
  return html`
    <div style="display:flex;gap:12px;align-items:center">
      ${channel.logo_url
        ? html`<img src="${channel.logo_url}" alt="${channel.name}" style="width:56px;height:56px;object-fit:contain;border-radius:12px;background:rgba(148,163,184,.1);padding:4px" />`
        : html`<div style="width:56px;height:56px;border-radius:12px;display:grid;place-items:center;font-weight:700;background:var(--grad-soft)">${initials(channel.name)}</div>`}
      <div style="min-width:0">
        <div style="font-weight:600">${channel.name}</div>
        <div class="muted" style="font-size:12px">
          ${channel.band ? html`<span class="band-badge band-badge--${channel.band}">${channel.band}</span> ` : ''}
          ${channel.country || ''}
        </div>
      </div>
    </div>
    <div class="station-row__meta" style="margin-top:12px">
      ${extra.codec ? html`<span class="tag">${extra.codec}</span>` : ''}
      ${extra.bitrate ? html`<span class="tag">${extra.bitrate} kbps</span>` : ''}
      ${(extra.tags || []).slice(0, 6).map((t) => html`<span class="tag">${t}</span>`)}
    </div>
    <p class="muted url-clip" style="margin-top:10px;font-size:12px" title="${channel.stream_url}">${channel.stream_url}</p>
  `;
}

function parseExtra(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** 侧栏交互：收起/展开；按住标题拖成悬浮窗（双击标题复位） */
function bindSidePanel(container) {
  const side = $('#radio-side', container);
  if (!side) return;
  const head = $('.section__head', side);

  $('#side-toggle', side)?.addEventListener('click', () => {
    const collapsed = side.classList.toggle('is-collapsed');
    const btn = $('#side-toggle', side);
    if (btn) btn.innerHTML = icon(collapsed ? 'chevron-down' : 'chevron-up', 16);
  });

  let drag = null;
  head?.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button')) return;
    const rect = side.getBoundingClientRect();
    drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    side.classList.add('is-floating');
    side.style.left = `${Math.round(rect.left)}px`;
    side.style.top = `${Math.round(rect.top)}px`;
    head.setPointerCapture?.(event.pointerId);
  });
  head?.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const x = Math.min(Math.max(0, event.clientX - drag.dx), window.innerWidth - 90);
    const y = Math.min(Math.max(56, event.clientY - drag.dy), window.innerHeight - 80);
    side.style.left = `${Math.round(x)}px`;
    side.style.top = `${Math.round(y)}px`;
  });
  const endDrag = () => {
    drag = null;
  };
  head?.addEventListener('pointerup', endDrag);
  head?.addEventListener('pointercancel', endDrag);
  head?.addEventListener('dblclick', () => {
    side.classList.remove('is-floating');
    side.style.left = '';
    side.style.top = '';
  });
}

function applyFilterChange(patch) {
  const container = state.container;
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
    const facets = await api.radioFacets();
    state.facets = facets;
    host.innerHTML = filterBarHtml({
      title: '全球广播',
      subtitle: 'FM · AM · SW',
      countries: facets.countries || [],
      categories: facets.categories || [],
      bands: facets.bands || [],
      selected: store.getFilters(KIND),
      total: state.total
    });
    bindFilterBar(host, (patch) => {
      store.setFilters(KIND, patch);
      applyFilterChange(patch);
    });
  } catch {
    /* 忽略 */
  }
}

async function load({ reset = false, append = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  const container = state.container;
  const list = container?.querySelector('#radio-list');
  const moreBtn = container?.querySelector('#radio-more');
  const filters = store.getFilters(KIND);

  if (reset && list) {
    state.page = 1;
    state.items = [];
    list.innerHTML = skeletonRows(8);
  }

  try {
    const data = await api.stations({
      band: filters.band,
      country: filters.country,
      category: filters.category,
      q: filters.q,
      page: state.page,
      pageSize: PAGE_SIZE
    });
    state.items = append ? state.items.concat(data.items) : data.items;
    state.total = data.total;
    if (list) {
      if (!state.items.length) {
        list.innerHTML = emptyState('没有匹配的电台', '试试切换波段或清空筛选');
      } else {
        list.innerHTML = stationListHtml(state.items, player.currentChannel()?.id);
        markPlaying(list, player.currentChannel()?.id);
      }
    }
    if (moreBtn) moreBtn.hidden = !data.hasMore;
    store.setCounts({ radio: data.total });
    const summary = container?.querySelector('#filter-summary');
    if (summary) {
      summary.innerHTML = html`<span>共 ${data.total} 个电台</span>
        <span>· 第 ${data.page} / ${Math.max(1, Math.ceil(data.total / PAGE_SIZE))} 页</span>`;
    }
  } catch (err) {
    if (list) list.innerHTML = emptyState('加载失败', err.message || '请稍后重试');
  } finally {
    state.loading = false;
  }
}

function markPlaying(root, playingId) {
  root.querySelectorAll('.station-row').forEach((row) => {
    row.classList.toggle('is-playing', row.dataset.id === playingId);
  });
}

function bindList(container) {
  on(container, 'click', '.station-row', async (event, row) => {
    if (event.target.closest('[data-action="fav"]')) return;
    const channel = state.items.find((c) => c.id === row.dataset.id);
    if (!channel) return;
    await player.play(channel);
    markPlaying(container, channel.id);
    const side = container.querySelector('#radio-now');
    if (side) side.innerHTML = nowPlayingHtml(channel);
  });

  on(container, 'click', '[data-action="fav"]', async (event, button) => {
    event.stopPropagation();
    const channel = state.items.find((c) => c.id === button.dataset.id);
    if (!channel) return;
    try {
      if (store.isFavorite(channel.id)) {
        await api.removeFavorite(channel.id);
        store.toggleFavoriteLocal(channel.id);
        toastSuccess('已取消收藏');
      } else {
        await api.addFavorite(channel);
        store.toggleFavoriteLocal(channel.id);
        toastSuccess('已加入收藏');
      }
    } catch (err) {
      toastError(err.message || '操作失败');
    }
  });

  container.querySelector('[data-action="more"]')?.addEventListener('click', () => {
    state.page += 1;
    load({ append: true });
  });
}
