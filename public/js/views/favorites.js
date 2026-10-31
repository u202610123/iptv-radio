import { html, raw, $, on, icon, fromNow } from '../lib/dom.js';
import { api } from '../api.js';
import { store } from '../state.js';
import { gridHtml, stationListHtml, emptyState, skeletonGrid } from '../components/channel-card.js';
import * as player from '../components/player.js';
import { toastSuccess, toastError } from '../components/toast.js';

const state = { items: [], container: null };

export default {
  id: 'favorites',
  title: '我的收藏',

  async render(container) {
    state.container = container;
    container.innerHTML = html`
      <section class="section glass">
        <div class="page-head">
          <div class="page-head__title"><h1>我的收藏</h1></div>
          <div class="page-head__meta" id="fav-meta"></div>
        </div>
      </section>
      <div id="fav-body" style="margin-top:16px">${raw(skeletonGrid(8))}</div>
    `;

    bind(container);
    await load();
  }
};

async function load() {
  const container = state.container;
  const body = container?.querySelector('#fav-body');
  try {
    const data = await api.favorites();
    // 归一化为频道对象：id = channel_id，且本页条目必然已收藏，
    // 这样卡片 data-id、播放高亮、星标填充都与其它页一致。
    state.items = (data.items || []).map((c) => ({ ...c, id: c.channel_id, is_favorite: true }));
    store.setFavorites(state.items.map((c) => c.id));
    render(body);
  } catch (err) {
    if (body) body.innerHTML = emptyState('加载失败', err.message || '请稍后重试');
  }
}

function render(body) {
  if (!body) return;
  const iptv = state.items.filter((c) => c.kind === 'iptv');
  const radio = state.items.filter((c) => c.kind !== 'iptv');
  const meta = state.container?.querySelector('#fav-meta');
  if (meta) meta.innerHTML = html`<span>共 ${state.items.length} 个收藏</span>`;

  if (!state.items.length) {
    body.innerHTML = emptyState('还没有收藏', '在频道卡片右上角点击星标即可收藏');
    return;
  }

  body.innerHTML = html`
    ${iptv.length
      ? html`<section class="section glass">
          <div class="section__head"><h2>电视节目</h2><span class="muted">${iptv.length} 个</span></div>
          ${raw(gridHtml(iptv, player.currentChannel()?.id))}
        </section>`
      : ''}
    ${radio.length
      ? html`<section class="section glass" style="margin-top:16px">
          <div class="section__head"><h2>广播电台</h2><span class="muted">${radio.length} 个</span></div>
          ${raw(stationListHtml(radio, player.currentChannel()?.id))}
        </section>`
      : ''}
  `;
}

function markPlaying(root, playingId) {
  root.querySelectorAll('.channel-card, .station-row').forEach((node) => {
    node.classList.toggle('is-playing', !!playingId && node.dataset.id === playingId);
  });
}

function bind(container) {
  // 播放状态同步：其它页（广播/电视）都有 player:change 监听，收藏页
  // 原来没有，播完卡片不会亮，离开本页再回来才对——现在补上。
  const onPlayerChange = () => markPlaying(container, player.currentChannel()?.id);
  document.addEventListener('player:change', onPlayerChange);
  document.addEventListener(
    'view:leave',
    () => document.removeEventListener('player:change', onPlayerChange),
    { once: true }
  );

  on(container, 'click', '.channel-card, .station-row', async (event, node) => {
    // 卡片上的星标实际是 data-action="fav"，原来这里拦截的是不存在的
    // "unfav"，导致点星标也会走到播放分支（且因 id 为空直接 return）。
    if (event.target.closest('[data-action="fav"]')) return;
    const item = state.items.find((c) => c.id === node.dataset.id);
    if (!item) return;
    await player.play(item);
    markPlaying(container, item.id);
  });

  // 键盘可达：卡片本身有 tabindex/role="button"，但原来没有任何键盘
  // 处理，键盘用户同样“点不了”——回车/空格与点击等价。
  container.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const node = event.target.closest?.('.channel-card, .station-row');
    if (!node || !container.contains(node)) return;
    if (event.target.closest('[data-action="fav"]')) return;
    event.preventDefault();
    const item = state.items.find((c) => c.id === node.dataset.id);
    if (!item) return;
    await player.play(item);
    markPlaying(container, item.id);
  });

  // 收藏页的星标 = 取消收藏：按卡片实际的 data-action="fav" 拦截，
  // 而不是原来不存在的 "unfav"。
  on(container, 'click', '[data-action="fav"]', async (event, button) => {
    event.stopPropagation();
    try {
      await api.removeFavorite(button.dataset.id);
      store.toggleFavoriteLocal(button.dataset.id);
      toastSuccess('已取消收藏');
      await load();
    } catch (err) {
      toastError(err.message || '操作失败');
    }
  });
}
