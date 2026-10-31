import { getConfig } from '../config.js';
import { validateUpstreamUrl } from '../lib/validate.js';
import { isHls } from '../lib/m3u.js';
import { createLogger, safeUrl } from '../lib/log.js';
import { fail } from '../lib/http.js';

const log = createLogger('service:proxy');

/**
 * 代理响应的缓存策略：播放列表是直播实时文件，必须每次都新鲜，
 * 所以 no-store；分片（.ts 等）一旦发布内容就不再变，允许浏览器
 * 缓存——转圈时 hls.js 重试同一分片、切画质回放时就不用重新下载。
 * 上游已给缓存头时沿用上游的，没给时默认公开缓存 1 小时。
 */
export function responseCacheControl({ isPlaylist, upstreamCache }) {
  if (isPlaylist) return 'no-store';
  if (upstreamCache) return upstreamCache;
  return 'public, max-age=3600';
}

const FORBIDDEN_RESPONSE_HEADERS = new Set([
  'content-encoding',
  'content-security-policy',
  'content-security-policy-report-only',
  'x-frame-options',
  'transfer-encoding',
  'connection',
  'set-cookie',
  'strict-transport-security',
  'cross-origin-resource-policy'
]);

const PASSTHROUGH_RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'etag',
  'last-modified',
  'cache-control',
  'expires'
];

/** 将播放列表中的相对地址改写为绝对地址（可选再包一层代理，解决跨域/防盗链） */
export function rewritePlaylist(text, baseUrl, proxyBase, { useProxy = true } = {}) {
  const toAbsolute = (uri) => {
    try {
      return new URL(uri, baseUrl).toString();
    } catch {
      return uri;
    }
  };
  const wrap = (absolute) =>
    useProxy ? `${proxyBase}?url=${encodeURIComponent(absolute)}&rewrite=1` : absolute;

  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        // 密钥 / 初始化分片等以 URI="..." 形式出现
        return trimmed.replace(/URI="([^"]+)"/gi, (match, uri) => `URI="${wrap(toAbsolute(uri))}"`);
      }
      return wrap(toAbsolute(trimmed));
    })
    .join('\n');
}

/**
 * 流代理：转发直播流，支持 Range、可选 Referer/UA 覆盖、HLS 播放列表改写
 * @returns {Promise<Response>}
 */
export async function proxyStream(env, rawUrl, request, options = {}) {
  const cfg = getConfig(env);
  const check = validateUpstreamUrl(rawUrl, { maxLength: cfg.PROXY_MAX_URL_LENGTH });
  if (!check.ok) {
    return fail(400, 'INVALID_URL', check.reason);
  }
  const upstream = check.url;
  const rewrite = options.rewrite !== '0';

  const headers = new Headers();
  headers.set('user-agent', options.userAgent || cfg.USER_AGENT);
  headers.set('accept', request.headers.get('accept') || '*/*');
  const referer = options.referer || `${upstream.protocol}//${upstream.host}/`;
  if (referer) headers.set('referer', referer);
  const range = request.headers.get('range');
  if (range) headers.set('range', range);
  const ifRange = request.headers.get('if-range');
  if (ifRange) headers.set('if-range', ifRange);

  let upstreamResponse;
  try {
    // 不能用 AbortSignal.timeout：它会在 30s 时把已建立的直播流连接一并掐断；
    // 这里只对「拿到响应头」限时，之后的流式转发不受影响
    upstreamResponse = await Promise.race([
      fetch(upstream.toString(), {
        method: request.method === 'HEAD' ? 'HEAD' : 'GET',
        headers,
        redirect: 'follow'
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('上游连接超时')), 30000)
      )
    ]);
  } catch (err) {
    log.warn('代理上游失败', { url: safeUrl(upstream.toString()), error: String(err?.message || err) });
    return fail(502, 'UPSTREAM_ERROR', '无法连接上游流媒体服务器');
  }

  if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
    return fail(502, 'UPSTREAM_ERROR', `上游返回 ${upstreamResponse.status}`);
  }

  const responseHeaders = new Headers();
  for (const key of PASSTHROUGH_RESPONSE_HEADERS) {
    const value = upstreamResponse.headers.get(key);
    if (value) responseHeaders.set(key, value);
  }
  upstreamResponse.headers.forEach((value, key) => {
    if (FORBIDDEN_RESPONSE_HEADERS.has(key)) return;
    if (responseHeaders.has(key)) return;
    if (key.toLowerCase().startsWith('x-') || key === 'vary') responseHeaders.set(key, value);
  });
  responseHeaders.set('Access-Control-Allow-Origin', '*');
  responseHeaders.set('Access-Control-Allow-Headers', 'Range,Content-Type');
  responseHeaders.set('Access-Control-Expose-Headers', 'Content-Length,Content-Range');
  // 注意：此时还不知道是不是播放列表（要读 content-type 判断），先按
  // 分片默认处理，下面在确认是播放列表后会再改回 no-store。
  responseHeaders.set('Cache-Control', responseCacheControl({
    isPlaylist: false,
    upstreamCache: upstreamResponse.headers.get('cache-control')
  }));

  if (request.method === 'HEAD') {
    return new Response(null, { status: upstreamResponse.status, headers: responseHeaders });
  }

  const contentType = upstreamResponse.headers.get('content-type') || '';
  // 第二道防线：分片扩展名（.ts/.m4s/.mp4/.aac/.mp3）一律按二进制透传，
  // 绝不进文本改写分支，哪怕上游 content-type 写得不规范。
  const urlPath = upstream.toString().split('?')[0].toLowerCase();
  const isSegment = /\.(ts|m4s|mp4|aac|mp3)$/.test(urlPath);
  const isPlaylist = !isSegment && (isHls(upstream.toString(), contentType) || /audio\/mpegurl|audio\/x-mpegurl/i.test(contentType));

  if (!isPlaylist || !rewrite) {
    return new Response(upstreamResponse.body, { status: upstreamResponse.status, headers: responseHeaders });
  }

  const text = await upstreamResponse.text();
  const proxyBase = new URL('/api/proxy', request.url).toString();
  const finalUrl = upstreamResponse.url || upstream.toString();
  const rewritten = rewritePlaylist(text, finalUrl, proxyBase, { useProxy: true });
  const finalHeaders = new Headers(responseHeaders);
  finalHeaders.set('Cache-Control', 'no-store');
  finalHeaders.set('content-type', contentType || 'application/vnd.apple.mpegurl');
  finalHeaders.delete('content-length');
  return new Response(rewritten, { status: upstreamResponse.status, headers: finalHeaders });
}
