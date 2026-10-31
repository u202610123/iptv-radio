import { getConfig } from '../config.js';
import { validateUpstreamUrl } from '../lib/validate.js';
import { isHls } from '../lib/m3u.js';
import { createLogger, safeUrl } from '../lib/log.js';
import { fail } from '../lib/http.js';

const log = createLogger('service:proxy');

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
  responseHeaders.set('Cache-Control', 'no-store');

  if (request.method === 'HEAD') {
    return new Response(null, { status: upstreamResponse.status, headers: responseHeaders });
  }

  const contentType = upstreamResponse.headers.get('content-type') || '';
  const isPlaylist = isHls(upstream.toString(), contentType) || /audio\/mpegurl|audio\/x-mpegurl/i.test(contentType);

  if (!isPlaylist || !rewrite) {
    return new Response(upstreamResponse.body, { status: upstreamResponse.status, headers: responseHeaders });
  }

  const text = await upstreamResponse.text();
  const proxyBase = new URL('/api/proxy', request.url).toString();
  const finalUrl = upstreamResponse.url || upstream.toString();
  const rewritten = rewritePlaylist(text, finalUrl, proxyBase, { useProxy: true });
  const finalHeaders = new Headers(responseHeaders);
  finalHeaders.set('content-type', contentType || 'application/vnd.apple.mpegurl');
  finalHeaders.delete('content-length');
  return new Response(rewritten, { status: upstreamResponse.status, headers: finalHeaders });
}
