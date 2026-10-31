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
 * 判断一个 URL 是否为 HLS：直接地址看 .m3u8；代理地址看两点——
 * 代理 URL 本身以 &rewrite=1 结尾（播放器只在源是 HLS 时才传 rewrite=1），
 * 或解码后的 url 参数本身是 .m3u8。
 * 旧逻辑只用 /\.m3u8(\?|$)/ 测代理 URL：代理 URL 里 .m3u8 后面跟的是
 * &rewrite=1（或 %3F 编码后的查询串），正则永远匹配不上，于是 Chrome 下
 * 根本不加载 hls.js，直接把播放列表塞给原生 <video>，Chrome 原生播不了
 * HLS，就会报“没有找到支持的视频格式和 MIME 类型”——这就是视频普遍
 * 播不了的根因（Safari 原生支持 HLS，所以 Safari 下反而能播）。
 */
export function isHlsUrl(url) {
  const s = String(url || '');
  if (/\.m3u8(\?|$)/i.test(s)) return true;
  if (/[?&]rewrite=1(&|$)/.test(s)) return true;
  try {
    const param = new URL(s, 'https://example.invalid').searchParams.get('url');
    if (param && /\.m3u8(\?|$)/i.test(param)) return true;
  } catch {
    /* 不是合法 URL 就按非 HLS 处理 */
  }
  return false;
}

/**
 * 绑定播放源：优先 hls.js，其次原生 HLS，最后直接赋值
 * @returns {Promise<{mode: string, destroy: () => void}>}
 */
export async function attachStream(video, url, { onError, isHls: isHlsFlag } = {}) {
  const isHls = isHlsFlag !== undefined ? !!isHlsFlag : isHlsUrl(url);
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
