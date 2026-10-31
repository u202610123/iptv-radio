import { html, raw, $, on, icon, fromNow, initials } from '../lib/dom.js';
import { api } from '../api.js';
import { emptyState, skeletonRows } from '../components/channel-card.js';
import * as player from '../components/player.js';
import { toastSuccess, toastError } from '../components/toast.js';

const state = { items: [], container: null };

export default {
  id: 'history',
  title: '最近播放',

  async render(container) {
    state.container = container;
    container.innerHTML = html`
      <section class="section glass">
        <div class="page-head">
          <div class="page-head__title"><h1>最近播放</h1></div>
          <div class="page-head__meta">
            <span id="history-meta"></span>
            <button class="btn btn--sm btn--danger" data-action="clear">${raw(icon('trash', 14))} 清空</button>
          </div>
        </div>
      </section>
      <div id="history-body" style="margin-top:16px">${raw(skeletonRows(8))}</div>
    `;

    bind(container);
    await load();
  }
};

async function load() {
  const body = state.container?.querySelector('#history-body');
  const meta = state.container?.querySelector('#history-meta');
  try {
    const data = await api.history(100);
    state.items = data.items || [];
    if (meta) meta.innerHTML = html`<span>保留最近 ${state.items.length} 条记录</span>`;
    if (!body) return;
    if (!state.items.length) {
      body.innerHTML = emptyState('暂无播放记录', '播放任意频道后会自动记录');
      return;
    }
    body.innerHTML = html`<div class="station-list">${raw(
      state.items
        .map(
          (item) => html`<div class="station-row" data-id="${item.channel_id}">
          ${item.logo_url
            ? html`<img class="station-row__logo" src="${item.logo_url}" alt="${item.name}" loading="lazy"
                 onerror="window.__imgFallback?.(event)" />`
            : html`<div class="station-row__logo">${initials(item.name)}</div>`}
          <div class="station-row__main">
            <div class="station-row__name">${item.name}</div>
            <div class="station-row__meta">
              <span>${item.kind === 'radio' ? '广播' : '电视'}</span>
              <span>· ${fromNow(item.played_at)}</span>
            </div>
          </div>
          <button class="icon-btn" data-action="remove" data-id="${item.channel_id}" title="移除">
            ${raw(icon('close', 16))}
          </button>
        </div>`
        )
        .join('')
    )}</div>`;
  } catch (err) {
    if (body) body.innerHTML = emptyState('加载失败', err.message || '请稍后重试');
  }
}

function bind(container) {
  on(container, 'click', '.station-row', async (event, node) => {
    if (event.target.closest('[data-action="remove"]')) return;
    const item = state.items.find((i) => i.channel_id === node.dataset.id);
    if (!item) return;
    await player.play({
      id: item.channel_id,
      kind: item.kind,
      name: item.name,
      stream_url: item.stream_url,
      logo_url: item.logo_url
    });
  });

  on(container, 'click', '[data-action="remove"]', async (event, button) => {
    event.stopPropagation();
    try {
      await fetch(`/api/history/${encodeURIComponent(button.dataset.id)}`, { method: 'DELETE' });
      toastSuccess('已移除');
      await load();
    } catch (err) {
      toastError('移除失败');
    }
  });

  on(container, 'click', '[data-action="clear"]', async () => {
    try {
      await api.clearHistory();
      toastSuccess('播放历史已清空');
      await load();
    } catch (err) {
      toastError(err.message || '清空失败');
    }
  });
}
