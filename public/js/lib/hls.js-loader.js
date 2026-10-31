/**
 * hls.js 懒加载：首次播放 HLS 时才加载 vendor 脚本
 * 原生支持 HLS（Safari）时直接走原生，减少体积开销
 */
let loaderPromise = null;
let cachedHls = null;

export function loadHls() {
  if (cachedHls) return Promise.resolve(cachedHls);
  if (!loaderPromise) {
    loaderPromise = import('/vendor/hls.min.js')
      .then((mod) => {
        cachedHls = mod.default || globalThis.Hls || null;
        return cachedHls;
      })
      .catch(() => null)
      .finally(() => {
        if (!cachedHls) loaderPromise = null; // 允许下次重试
      });
  }
  return loaderPromise;
}

export function nativeHlsSupport(video) {
  return !!video && video.canPlayType('application/vnd.apple.mpegurl') !== '';
}

/**
 * 绑定播放源：优先 hls.js，其次原生 HLS，最后直接赋值
 * @returns {Promise<{mode: string, destroy: () => void}>}
 */
export async function attachStream(video, url, { onError } = {}) {
  const isHls = /\.m3u8(\?|$)/i.test(url);
  destroyHls();
  if (isHls) {
    const Hls = await loadHls();
    if (Hls && Hls.isSupported()) {
      const instance = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 30 });
      instance.on(Hls.Events.ERROR, (_event, data) => {
        if (data?.fatal && typeof onError === 'function') onError(data);
      });
      instance.loadSource(url);
      instance.attachMedia(video);
      activeHls = instance;
      return { mode: 'hls.js', destroy: destroyHls };
    }
    if (nativeHlsSupport(video)) {
      video.src = url;
      return { mode: 'native', destroy: () => {} };
    }
  }
  video.src = url;
  return { mode: 'direct', destroy: () => {} };
}

let activeHls = null;

export function destroyHls() {
  if (activeHls) {
    try {
      activeHls.destroy();
    } catch {
      /* 忽略销毁异常 */
    }
    activeHls = null;
  }
}
