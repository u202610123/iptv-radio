import { html, raw, $, $$, icon } from '../lib/dom.js';
import { api } from '../api.js';
import { store } from '../state.js';
import { stationListHtml, gridHtml, emptyState, skeletonRows, skeletonGrid } from '../components/channel-card.js';
import * as player from '../components/player.js';
import { toastSuccess, toastError } from '../components/toast.js';

const PAGE_SIZE = 60;

const state = {
  tab: 'all', // all | radio | iptv | jingkong
  q: '',
  page: 1,
  total: 0,
  loading: false,
  container: null,
  byId: new Map(),
  radioItems: [],
  iptvItems: []
};

function debounce(fn, ms = 350) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export default {
  id: 'buddhist',
  title: '佛经佛法',

  async render(container) {
    state.container = container;
    state.page = 1;
    state.q = '';
    state.total = 0;
    state.byId = new Map();
    state.radioItems = [];
    state.iptvItems = [];

    container.innerHTML = html`
      <div class="buddhist-head glass">
        <div class="buddhist-head__title">
          <h2>${raw(icon('lotus', 20))} 佛经 · 佛法</h2>
          <p class="muted">讲经说法、念佛诵经、禅修共修等佛学频道（IPTV 与广播），同名频道自动多源切换</p>
        </div>
        <div class="buddhist-tabs">
          <button class="chip is-active" data-tab="all">全部</button>
          <button class="chip" data-tab="radio">广播</button>
          <button class="chip" data-tab="iptv">电视</button>
          <button class="chip" data-tab="jingkong">净空讲法</button>
        </div>
        <div class="buddhist-search">
          <span class="search-box__icon">${raw(icon('search', 16))}</span>
          <input id="buddhist-search" type="search" placeholder="在佛学频道内搜索…" autocomplete="off" />
        </div>
      </div>
      <div id="buddhist-result">${raw(skeletonRows(8))}</div>
    `;

    bind(container);
    await load({ reset: true });
  }
};

function bind(container) {
  container.addEventListener('click', (event) => {
    const tabBtn = event.target.closest('[data-tab]');
    if (tabBtn) {
      if (tabBtn.dataset.tab === state.tab) return;
      $$('[data-tab]', container).forEach((b) => b.classList.toggle('is-active', b === tabBtn));
      state.tab = tabBtn.dataset.tab;
      load({ reset: true });
      return;
    }
    const fav = event.target.closest('[data-action="fav"]');
    if (fav) {
      event.stopPropagation();
      toggleFav(fav.dataset.id);
      return;
    }
    const card = event.target.closest('[data-id]');
    if (card) {
      const ch = state.byId.get(card.dataset.id);
      if (ch) player.play(ch);
      return;
    }
    if (event.target.closest('[data-action="more"]')) loadMore();
  });

  const search = $('#buddhist-search', container);
  search?.addEventListener(
    'input',
    debounce((event) => {
      state.q = event.target.value.trim();
      load({ reset: true });
    })
  );

  // 优化：顶栏全局搜索在佛教页原来是无效的（本页没监听 global-search），
  // 现在把它接到本页搜索上，两个搜索框不再各说各话。
  const onGlobalSearch = (event) => {
    state.q = event.detail || '';
    const input = $('#buddhist-search', container);
    if (input) input.value = state.q;
    load({ reset: true });
  };
  document.addEventListener('global-search', onGlobalSearch);
  document.addEventListener(
    'view:leave',
    () => document.removeEventListener('global-search', onGlobalSearch),
    { once: true }
  );
}

async function load({ reset = false, append = false } = {}) {
  const c = state.container;
  if (!c) return;
  if (reset) state.page = 1;
  if (reset) {
    state.radioItems = [];
    state.iptvItems = [];
  }
  state.loading = true;
  const host = $('#buddhist-result', c);
  host.innerHTML =
    state.tab === 'iptv' ? raw(skeletonGrid(12)) : raw(skeletonRows(8));

  try {
    let radio = { items: [], total: 0 };
    let iptv = { items: [], total: 0 };
    const q = state.q || undefined;

    if (state.tab === 'all' || state.tab === 'jingkong') {
      [radio, iptv] = await Promise.all([
        api.stations({ topic: 'buddhist', q: state.tab === 'jingkong' ? undefined : q, pageSize: PAGE_SIZE, page: 1 }).catch(() => ({ items: [], total: 0 })),
        api.channels({ topic: 'buddhist', kind: 'iptv', q: state.tab === 'jingkong' ? undefined : q, pageSize: PAGE_SIZE, page: 1 }).catch(() => ({ items: [], total: 0 }))
      ]);
      // 纠正后的 kind 为准重新分流：华藏视频流在后端专题里已由 radio 纠正
      // 为 iptv，若仍按接口来源分栏，它们会错误地留在广播区；这里按纠正后
      // 的 kind 分到电视区，播放器也因此会用 <video> 而不是 Audio。
      const uniq = [];
      const seenIds = new Set();
      for (const c of [...(radio.items || []), ...(iptv.items || [])]) {
        if (seenIds.has(c.id)) continue;
        seenIds.add(c.id);
        uniq.push(c);
      }
      let allItems = uniq;
      if (state.tab === 'jingkong') {
        // 精选：名字含净空/华藏/悟道/净宗，或流地址含华藏域名
        const isJingkong = (c) => /净空|华藏|悟道|净宗/.test(c.name || '') || /hwadzan|amtb/i.test(c.stream_url || '');
        allItems = uniq.filter(isJingkong);
        if (state.q) {
          const qq = state.q.toLowerCase();
          allItems = allItems.filter((c) => String(c.name || '').toLowerCase().includes(qq));
        }
      }
      radio = { items: allItems.filter((c) => c.kind !== 'iptv'), total: radio.total || 0 };
      iptv = { items: allItems.filter((c) => c.kind === 'iptv'), total: iptv.total || 0 };
      if (state.tab === 'jingkong') state.total = allItems.length;
    } else if (state.tab === 'radio') {
      radio = await api.stations({ topic: 'buddhist', q, pageSize: PAGE_SIZE, page: state.page });
    } else {
      iptv = await api.channels({ topic: 'buddhist', kind: 'iptv', q, pageSize: PAGE_SIZE, page: state.page });
    }

    if (state.tab !== 'jingkong') state.total = (radio.total || 0) + (iptv.total || 0);
    // 优化：原来“加载更多”会把上一页替换掉（loadMore 后只剩新一页），
    // 现在追加累积，翻页不再丢已看过的条目。
    state.radioItems = append ? state.radioItems.concat(radio.items || []) : radio.items || [];
    state.iptvItems = append ? state.iptvItems.concat(iptv.items || []) : iptv.items || [];
    renderResults(host, state.radioItems, state.iptvItems);
  } catch (err) {
    host.innerHTML = emptyState('暂时无法加载佛学频道', err?.message || '请稍后重试').toString();
  } finally {
    state.loading = false;
  }
}

function renderResults(host, radioItems, iptvItems) {
  if (!radioItems.length && !iptvItems.length) {
    host.innerHTML = emptyState(
      '暂无佛学频道',
      '可在「设置与订阅」里添加一个包含佛学频道的播放列表，或稍后再来看看'
    ).toString();
    return;
  }
  [radioItems, iptvItems].flat().forEach((c) => state.byId.set(c.id, c));

  const playingId = player.currentChannel()?.id;
  let htmlStr = '';
  if (radioItems.length) {
    htmlStr += `<h3 class="buddhist-section">广播 · ${radioItems.length}</h3>`;
    htmlStr += stationListHtml(radioItems, playingId);
  }
  if (iptvItems.length) {
    htmlStr += `<h3 class="buddhist-section">电视 · ${iptvItems.length}</h3>`;
    htmlStr += gridHtml(iptvItems, playingId);
  }
  const hasMore = state.tab !== 'all' && state.tab !== 'jingkong' && state.page * PAGE_SIZE < state.total;
  host.innerHTML = html`${raw(htmlStr)}${
    hasMore
      ? html`<div class="load-more"><button class="btn" data-action="more">${raw(icon('plus', 14))} 加载更多</button></div>`
      : ''
  }`;
}

function loadMore() {
  state.page += 1;
  load({ append: true });
}

async function toggleFav(id) {
  const ch = state.byId.get(id);
  if (!ch) return;
  const isFav = store.favorites.has(id);
  try {
    if (isFav) {
      await api.removeFavorite(id);
      store.favorites.delete(id);
    } else {
      await api.addFavorite(ch);
      store.favorites.add(id);
    }
    const btn = state.container.querySelector(`[data-action="fav"][data-id="${id}"]`);
    btn?.classList.toggle('is-on', !isFav);
    toastSuccess(isFav ? '已取消收藏' : '已加入收藏');
  } catch (err) {
    toastError(err.message || '收藏操作失败');
  }
}
