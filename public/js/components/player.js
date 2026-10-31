import { html, raw, $, $$, esc, icon, initials } from '../lib/dom.js';
import { attachStream, destroyHls } from '../lib/hls.js-loader.js';
import { api } from '../api.js';
import { store } from '../state.js';
import { toastError } from './toast.js';

let shell = null; // 外层底座（#player-dock，控制显示/隐藏）
let dock = null; // 内层 .player 面板
let video = null;
let audio = null;
let art = null;
let titleEl = null;
let metaEl = null;
let toggleBtn = null;
let miniEl = null;
let switching = false; // 多源切换中，屏蔽散点报错 toast
let current = null;
let currentUrl = '';

/** 挂载播放器（固定底部 Dock） */
export function initPlayer(container) {
  container.innerHTML = html`
    <div class="player" id="player">
      <div class="player__stage">
        <video id="player-video" playsinline controls preload="none"></video>
        <div class="player__audio-art hidden" id="player-art"></div>
      </div>
      <div class="player__info">
        <div class="player__title" id="player-title">未在播放</div>
        <div class="player__meta muted" id="player-meta">选择一个频道开始播放</div>
        <div class="player__controls">
          <button class="btn btn--sm btn--primary" id="player-toggle">${raw(icon('play', 14))} 播放</button>
          <button class="icon-btn" id="player-mute" title="静音 / 取消静音">${raw(icon('volume', 16))}</button>
          <input type="range" class="player__volume" id="player-volume" min="0" max="1" step="0.01" value="0.9"
                 aria-label="音量" title="音量" />
          <span class="live-dot" id="player-live">LIVE</span>
          <button class="icon-btn" id="player-expand" title="全屏">${raw(icon('expand', 16))}</button>
          <button class="icon-btn" id="player-collapse" title="收起到迷你按钮">${raw(icon('chevron-down', 16))}</button>
          <button class="icon-btn player__close" id="player-close" title="关闭">${raw(icon('close', 16))}</button>
        </div>
      </div>
    </div>
  `;

  // 迷你悬浮按钮：播放条收起后仍可控制播放
  const mini = document.createElement('div');
  mini.className = 'player-mini';
  mini.id = 'player-mini';
  mini.innerHTML = html`
    <button class="icon-btn" id="player-mini-toggle" title="播放 / 暂停">${raw(icon('play', 16))}</button>
    <button class="icon-btn" id="player-mini-restore" title="展开播放条">${raw(icon('chevron-up', 16))}</button>
  `;
  document.body.appendChild(mini);
  miniEl = mini;

  shell = container;
  dock = $('#player', container);
  video = $('#player-video', container);
  art = $('#player-art', container);
  titleEl = $('#player-title', container);
  metaEl = $('#player-meta', container);
  toggleBtn = $('#player-toggle', container);
  audio = new Audio();
  audio.preload = 'none';

  toggleBtn.addEventListener('click', () => {
    const target = current?.kind === 'radio' ? audio : video;
    if (!current) return;
    if (target.muted) target.muted = false; // 静音兜底后首次点击 → 直接恢复声音
    if (target.paused) target.play().catch(() => toastError('播放失败，可尝试在设置中切换流代理'));
    else target.pause();
  });

  $('#player-volume', container).addEventListener('input', (event) => {
    const value = Number(event.target.value);
    audio.volume = value;
    video.volume = value;
    if (value > 0) {
      audio.muted = false;
      video.muted = false;
    }
    syncMute();
  });

  $('#player-mute', container).addEventListener('click', () => {
    const target = currentMedia();
    if (!target) return;
    target.muted = !target.muted;
    if (!target.muted && target.volume === 0) target.volume = 0.6;
    syncMute();
  });

  $('#player-collapse', container).addEventListener('click', () => {
    shell.classList.add('is-collapsed');
    miniEl?.classList.add('is-visible');
  });
  $('#player-mini-restore', miniEl).addEventListener('click', restoreDock);
  $('#player-mini-toggle', miniEl).addEventListener('click', () => {
    const target = currentMedia();
    if (!current || !target) return;
    if (target.muted) target.muted = false;
    if (target.paused) target.play().catch(() => undefined);
    else target.pause();
  });

  $('#player-expand', container).addEventListener('click', () => {
    const stage = dock.querySelector('.player__stage');
    if (!stage) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else stage.requestFullscreen?.().catch(() => undefined);
  });

  $('#player-close', container).addEventListener('click', stop);

  video.addEventListener('play', () => syncToggle(true));
  video.addEventListener('pause', () => syncToggle(false));
  audio.addEventListener('play', () => syncToggle(true));
  audio.addEventListener('pause', () => syncToggle(false));
  video.addEventListener('error', () => {
    if (!switching) toastError('视频流加载失败，请尝试其他频道或开启流代理');
  });
  audio.addEventListener('error', () => {
    if (!switching) toastError('音频流加载失败，请尝试其他电台');
  });
}

function currentMedia() {
  return current?.kind === 'radio' ? audio : video;
}

function restoreDock() {
  shell?.classList.remove('is-collapsed');
  miniEl?.classList.remove('is-visible');
}

function syncToggle(playing) {
  if (!toggleBtn) return;
  toggleBtn.innerHTML = playing
    ? `${icon('pause', 14)} 暂停`
    : `${icon('play', 14)} 播放`;
  const miniToggle = $('#player-mini-toggle', miniEl);
  if (miniToggle) miniToggle.innerHTML = icon(playing ? 'pause' : 'play', 16);
}

function syncMute() {
  const target = currentMedia();
  const btn = $('#player-mute', shell);
  if (!target || !btn) return;
  btn.innerHTML = icon(target.muted || target.volume === 0 ? 'volume-x' : 'volume', 16);
}

/** 自动播放被浏览器拦截时的兜底：先静音起播，用户点「播放」/拖音量即恢复声音 */
async function startMedia(el) {
  try {
    await el.play();
    return;
  } catch (err) {
    if (err?.name !== 'NotAllowedError') throw err;
  }
  el.muted = true;
  try {
    await el.play();
    toastError('浏览器限制了自动播放：已先静音播放，点「播放」或拖动音量即可恢复声音');
  } catch {
    toastError('浏览器阻止了自动播放，请点击播放按钮');
  }
}

/** 播放源地址：默认全部经 Cloudflare 代理（边缘加速、隐藏本机 IP、绕过地区限制与混合内容拦截） */
export function playbackUrl(channel) {
  const direct = channel.stream_url || channel.streamUrl || '';
  if (!store.prefs.useProxy) return direct;
  const isHls = /\.m3u8(\?|$)/i.test(direct);
  return api.proxyUrl(direct, isHls);
}

/** 诊断用：暴露内部媒体元素状态，便于排查播放问题 */
export function mediaElements() {
  return { audio, video, dock, shell, current, currentUrl };
}

/** 同名多源：库里同名频道的其他 URL（不同来源 / 镜像），播不动时自动切换 */
async function siblingSources(channel) {
  try {
    const params = { kind: channel.kind, q: channel.name, pageSize: 10, page: 1 };
    const data = channel.kind === 'radio' ? await api.stations(params) : await api.channels(params);
    const norm = normalizeName(channel.name);
    return (data.items || [])
      .filter((c) => c.id !== channel.id && c.stream_url && normalizeName(c.name) === norm)
      .slice(0, 3);
  } catch {
    return [];
  }
}

function normalizeName(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, '').replace(/[（(].*?[)）]/g, '');
}

/** 等待媒体真正出声/出画；出错或超时抛错，用于自动换源 */
function waitPlaying(el, ms = 10000) {
  return new Promise((resolve, reject) => {
    if (el.readyState >= 3) return resolve();
    const cleanup = () => {
      clearTimeout(timer);
      el.removeEventListener('playing', onOk);
      el.removeEventListener('error', onFail);
    };
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onFail = () => {
      cleanup();
      reject(new Error('媒体加载失败'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('加载超时'));
    }, ms);
    el.addEventListener('playing', onOk);
    el.addEventListener('error', onFail);
  });
}

/** 播放指定频道：主源立即起播（保留用户手势），失败时自动切换同名备用源 */
export async function play(channel) {
  if (!channel || !channel.stream_url) return null;
  shell.classList.add('is-open');
  shell.classList.remove('is-collapsed');
  miniEl?.classList.remove('is-visible');
  dock.classList.remove('hidden');

  // 备用源并行查询，仅在主源失败时使用
  const siblingsPromise = siblingSources(channel);
  switching = true;
  let lastError = null;
  try {
    try {
      await startSource(channel, { isFallback: false });
      return channel;
    } catch (err) {
      lastError = err;
    }
    const extra = await siblingsPromise;
    for (const src of extra) {
      try {
        await startSource(src, { isFallback: true });
        return src;
      } catch (err) {
        lastError = err;
      }
    }
  } finally {
    switching = false;
  }

  toastError(
    lastError?.message === '加载超时'
      ? '该频道无法播放（加载超时），请换个频道试试'
      : '该频道无法播放，请换个频道试试'
  );
  document.dispatchEvent(new CustomEvent('player:change', { detail: channel }));
  return null;
}

async function startSource(channel, { isFallback = false } = {}) {
  current = channel;
  currentUrl = playbackUrl(channel);
  store.setCurrent(channel);

  shell.classList.add('is-open');
  dock.classList.remove('hidden');
  titleEl.textContent = channel.name || '未命名频道';
  metaEl.innerHTML = html`
    ${channel.country ? html`<span>${channel.country}</span>` : ''}
    ${channel.category ? html`<span>· ${channel.category}</span>` : ''}
    ${channel.band ? html`<span>· ${channel.band}</span>` : ''}
    <span>· ${channel.kind === 'radio' ? '广播' : '电视'}</span>
    ${isFallback ? html`<span>· 备用源</span>` : ''}
  `;
  if (isFallback) toastError('主源不可用，正在切换备用源…');

  destroyHls();
  video.pause();
  audio.pause();

  if (channel.kind === 'radio') {
    video.classList.add('hidden');
    art.classList.remove('hidden');
    art.textContent = initials(channel.name);
    audio.src = currentUrl;
    audio.volume = Number($('#player-volume')?.value || 0.9);
    await startMedia(audio);
    await waitPlaying(audio);
  } else {
    art.classList.add('hidden');
    video.classList.remove('hidden');
    video.volume = Number($('#player-volume')?.value || 0.9);
    await attachStream(video, currentUrl, {
      onError: () => {
        try {
          video.dispatchEvent(new Event('error'));
        } catch {
          /* 忽略 */
        }
      }
    });
    await startMedia(video);
    await waitPlaying(video);
  }

  // 记录播放历史（失败不影响播放）
  api.playChannel(channel.id).catch(() => undefined);
  document.dispatchEvent(new CustomEvent('player:change', { detail: channel }));
}

/** 停止播放 */
export function stop() {
  destroyHls();
  video.pause();
  video.removeAttribute('src');
  video.load();
  audio.pause();
  audio.removeAttribute('src');
  current = null;
  store.setCurrent(null);
  shell?.classList.remove('is-open');
  restoreDock();
  document.dispatchEvent(new CustomEvent('player:change', { detail: null }));
}

export function currentChannel() {
  return current;
}

export function currentPlaybackUrl() {
  return currentUrl;
}

/** 切换代理后重播当前频道 */
export function replay() {
  if (current) play(current);
}
