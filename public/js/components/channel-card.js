import { html, raw, initials, icon } from '../lib/dom.js';

/** 频道卡片（IPTV 网格） */
export function channelCard(channel, playingId) {
  const playing = channel.id === playingId ? ' is-playing' : '';
  const favOn = channel.is_favorite ? ' is-on' : '';
  // 优化：上游常把缺失分类写成字面量 'Undefined'，直接隐藏，不再占一个标签位。
  const category = channel.category && channel.category !== 'Undefined' ? channel.category : '';
  const logo = channel.logo_url
    ? html`<img class="channel-card__logo" src="${channel.logo_url}" alt="${channel.name}"
        loading="lazy" referrerpolicy="no-referrer" onerror="window.__imgFallback?.(event)" />`
    : html`<div class="channel-card__logo channel-card__logo--fallback">${initials(channel.name)}</div>`;

  return html`
    <article class="channel-card${raw(playing)}" data-id="${channel.id}" data-kind="${channel.kind}"
             tabindex="0" role="button" aria-label="${channel.name}">
      <button class="channel-card__fav${raw(favOn)}" data-action="fav" data-id="${channel.id}"
              title="收藏 / 取消收藏">${raw(icon('star', 16))}</button>
      ${raw(logo)}
      <div class="channel-card__name">${channel.name}</div>
      <div class="channel-card__meta">
        ${channel.country ? html`<span class="tag">${channel.country}</span>` : ''}
        ${category ? html`<span class="tag">${category}</span>` : ''}
        ${channel._sourceCount > 1 ? html`<span class="tag">多源 ×${channel._sourceCount}</span>` : ''}
      </div>
    </article>
  `;
}

/** 电台行（列表形态，音频流更适合列表） */
export function stationRow(channel, playingId) {
  const playing = channel.id === playingId ? ' is-playing' : '';
  const favOn = channel.is_favorite ? ' is-on' : '';
  const category = channel.category && channel.category !== 'Undefined' ? channel.category : '';
  const logo = channel.logo_url
    ? html`<img class="station-row__logo" src="${channel.logo_url}" alt="${channel.name}"
        loading="lazy" referrerpolicy="no-referrer" onerror="window.__imgFallback?.(event)" />`
    : html`<div class="station-row__logo">${initials(channel.name)}</div>`;

  return html`
    <div class="station-row${raw(playing)}" data-id="${channel.id}" data-kind="${channel.kind}"
         tabindex="0" role="button" aria-label="${channel.name}">
      ${raw(logo)}
      <div class="station-row__main">
        <div class="station-row__name">${channel.name}</div>
        <div class="station-row__meta">
          ${channel.band ? html`<span class="band-badge band-badge--${channel.band}">${channel.band}</span>` : ''}
          ${channel.country ? html`<span>${channel.country}</span>` : ''}
          ${category ? html`<span>· ${category}</span>` : ''}
          ${channel._sourceCount > 1 ? html`<span>· 多源 ×${channel._sourceCount}</span>` : ''}
        </div>
      </div>
      <button class="icon-btn" data-action="fav" data-id="${channel.id}" title="收藏">${raw(icon('star', 16, channel.is_favorite ? 'is-on' : ''))}</button>
    </div>
  `;
}

export function gridHtml(channels, playingId) {
  if (!channels.length) return '';
  return html`<div class="channel-grid">${raw(channels.map((c) => channelCard(c, playingId)).join(''))}</div>`;
}

export function stationListHtml(channels, playingId) {
  if (!channels.length) return '';
  return html`<div class="station-list">${raw(channels.map((c) => stationRow(c, playingId)).join(''))}</div>`;
}

export function emptyState(title, description = '') {
  return html`
    <div class="empty-state">
      <div class="empty-state__icon">${raw(icon('globe', 26))}</div>
      <h3>${title}</h3>
      ${description ? html`<p class="muted">${description}</p>` : ''}
    </div>
  `;
}

export function skeletonGrid(count = 12) {
  return html`<div class="channel-grid">${raw(
    Array.from({ length: count }, () => '<div class="skeleton skeleton--card"></div>').join('')
  )}</div>`;
}

export function skeletonRows(count = 8) {
  return html`<div class="station-list">${raw(
    Array.from({ length: count }, () => '<div class="skeleton" style="height:66px"></div>').join('')
  )}</div>`;
}
