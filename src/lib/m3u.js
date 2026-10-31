/**
 * M3U / M3U8 解析
 * - parseM3U(text)：一次性解析（用于自定义订阅文本、体积较小的源）
 * - parseM3UStream(body)：流式解析（用于 iptv-org 这类大文件，避免一次性占用内存）
 */

const ATTR_RE = /([a-zA-Z0-9_-]+)="([^"]*)"/g;

/** 解析 #EXTINF 行中的属性与频道名 */
export function parseExtinf(line) {
  const attrs = {};
  let match;
  ATTR_RE.lastIndex = 0;
  while ((match = ATTR_RE.exec(line)) !== null) {
    attrs[match[1].toLowerCase()] = match[2];
  }
  // 属性之后最后一个逗号右侧为显示名称
  const commaIndex = line.lastIndexOf(',');
  const rawName = commaIndex >= 0 ? line.slice(commaIndex + 1) : '';
  const name = rawName.trim();
  return {
    name: name || attrs['tvg-name'] || attrs['tvg-id'] || '未命名频道',
    tvgId: attrs['tvg-id'] || null,
    tvgName: attrs['tvg-name'] || null,
    logo: attrs['tvg-logo'] || null,
    group: attrs['group-title'] || null,
    country: attrs['tvg-country'] || null,
    language: attrs['tvg-language'] || null,
    shift: attrs['tvg-shift'] || null,
    raw: attrs
  };
}

/** 由 URL 推断一个可读名称 */
export function nameFromUrl(url) {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop() || u.hostname;
    return decodeURIComponent(last).replace(/\.(m3u8|ts|mp4|mp3|aac|flac)$/i, '');
  } catch {
    return '未命名频道';
  }
}

/** 一次性解析整段 M3U 文本 */
export function parseM3U(text) {
  const entries = [];
  let pending = null;
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      pending = parseExtinf(line);
      continue;
    }
    if (line.startsWith('#')) continue; // #EXTM3U / #EXTGRP / #KODIPROP 等
    if (!pending) {
      entries.push({ name: nameFromUrl(line), url: line, tvgId: null, logo: null, group: null });
      continue;
    }
    entries.push({ ...pending, url: line });
    pending = null;
  }
  return entries;
}

/**
 * 流式解析 M3U（Response.body）
 * @param {ReadableStream} body
 * @param {{maxEntries?: number}} options
 * @returns {AsyncGenerator<object>}
 */
export async function* parseM3UStream(body, options = {}) {
  const { maxEntries = Infinity } = options;
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let pending = null;
  let count = 0;

  const handleLine = (rawLine) => {
    const line = rawLine.trim();
    if (!line) return null;
    if (line.startsWith('#EXTINF')) {
      pending = parseExtinf(line);
      return null;
    }
    if (line.startsWith('#')) return null;
    const entry = pending
      ? { ...pending, url: line }
      : { name: nameFromUrl(line), url: line, tvgId: null, logo: null, group: null };
    pending = null;
    return entry;
  };

  try {
    while (count < maxEntries) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        const entry = handleLine(line);
        if (entry) {
          count += 1;
          yield entry;
          if (count >= maxEntries) break;
        }
      }
    }
    if (buffer.trim() && count < maxEntries) {
      const entry = handleLine(buffer);
      if (entry) yield entry;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* 已释放 */
    }
  }
}

/** 判断是否为 m3u8 播放列表（注意：不是“是不是 HLS 流”）。
 * video/mp2t 是 TS 分片（二进制），绝不能算播放列表：算错的话代理会
 * 把分片当文本读（UTF-8 替换字符）再改写，结果是损坏的垃圾文本，
 * hls.js 解不出码就会一直转圈。分片必须原样透传。 */
export function isHls(url, contentType = '') {
  if (contentType && /application\/vnd\.apple\.mpegurl|application\/x-mpegURL|audio\/mpegurl|audio\/x-mpegurl/i.test(contentType)) {
    return true;
  }
  return /\.m3u8(\?|$)/i.test(String(url || ''));
}
