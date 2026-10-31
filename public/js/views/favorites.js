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
    state.items = data.items || [];
    store.setFavorites(state.items.map((c) => c.channel_id));
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

function bind(container) {
  on(container, 'click', '.channel-card, .station-row', async (event, node) => {
    if (event.target.closest('[data-action="unfav"]')) return;
    const item = state.items.find((c) => c.channel_id === node.dataset.id);
    if (!item) return;
    await player.play({
      id: item.channel_id,
      kind: item.kind,
      name: item.name,
      stream_url: item.stream_url,
      logo_url: item.logo_url
    });
  });

  on(container, 'click', '[data-action="unfav"]', async (event, button) => {
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
