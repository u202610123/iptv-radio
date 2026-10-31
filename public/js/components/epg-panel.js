import { html, raw, formatTime, icon } from '../lib/dom.js';
import { api } from '../api.js';

/** 节目单面板骨架 */
export function epgPanelHtml(channel) {
  return html`
    <aside class="section glass epg-panel" id="epg-panel">
      <div class="section__head">
        <h3>节目单</h3>
        <button class="icon-btn" id="epg-refresh" title="刷新节目单">${raw(icon('refresh', 16))}</button>
      </div>
      <div id="epg-body">
        ${channel
          ? html`<div class="skeleton" style="height:74px"></div>
                 <div class="skeleton" style="height:44px;margin-top:12px"></div>`
          : html`<div class="empty-state">${raw(icon('clock', 24))}<p>播放频道后显示节目单</p></div>`}
      </div>
    </aside>
  `;
}

/** 加载并渲染节目单 */
export async function renderEpg(container, channel, { force = false } = {}) {
  const body = container.querySelector('#epg-body');
  if (!body) return;
  if (!channel) {
    body.innerHTML = html`<div class="empty-state">${raw(icon('clock', 24))}<p>播放频道后显示节目单</p></div>`;
    return;
  }
  if (force) {
    body.innerHTML = html`<div class="skeleton" style="height:74px"></div>`;
  }
  try {
    const data = await api.epg(channel.id, force);
    const now = data.current;
    const upcoming = (data.upcoming || []).filter((p) => !now || p.start_ts !== now.start_ts);
    body.innerHTML = html`
      ${now
        ? html`<div class="epg-now">
            <div class="epg-now__time">正在播出 · ${formatTime(now.start_ts)} - ${formatTime(now.stop_ts)}</div>
            <div class="epg-now__title">${now.title}</div>
            ${now.description ? html`<p class="muted" style="margin-top:6px;font-size:12px">${now.description}</p>` : ''}
          </div>`
        : html`<div class="epg-now"><div class="epg-now__title">暂无节目信息</div>
            <div class="epg-now__time">该频道可能未提供 EPG 数据源</div></div>`}
      ${upcoming.length
        ? html`<div class="epg-list">
            ${raw(
              upcoming
                .map(
                  (p) => html`<div class="epg-item">
                    <span class="epg-item__time">${formatTime(p.start_ts)}</span>
                    <span class="epg-item__title" title="${p.title}">${p.title}</span>
                  </div>`
                )
                .join('')
            )}
          </div>`
        : ''}
      <p class="muted" style="margin-top:10px;font-size:11px">来源：${data.source}</p>
    `;
  } catch (err) {
    body.innerHTML = html`<div class="empty-state"><p class="muted">节目单加载失败：${err.message}</p></div>`;
  }
}

/** 绑定刷新按钮 */
export function bindEpgRefresh(container, getChannel) {
  const btn = container.querySelector('#epg-refresh');
  btn?.addEventListener('click', () => {
    const channel = getChannel();
    if (channel) renderEpg(container, channel, { force: true });
  });
}
