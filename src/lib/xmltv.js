/**
 * 轻量 XMLTV 解析（EPG）
 * 仅提取 programme 的开始/结束时间与标题/描述，避免引入完整 XML 解析器。
 */

const PROGRAMME_RE = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
const ATTR_RE = /([a-zA-Z0-9_-]+)="([^"]*)"/g;

/** XMLTV 时间（20260101120000 +0000）→ 毫秒时间戳 */
export function parseXmltvTime(value) {
  if (!value) return null;
  const m = String(value).trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/);
  if (!m) {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) && asNumber > 0 ? asNumber * 1000 : null;
  }
  const [, y, mo, d, h, mi, s, offset] = m;
  let ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  if (offset) {
    const sign = offset[0] === '-' ? -1 : 1;
    const oh = Number(offset.slice(1, 3));
    const om = Number(offset.slice(3, 5));
    ms -= sign * (oh * 60 + om) * 60 * 1000;
  }
  return ms;
}

function pickText(block, tag) {
  const m = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!m) return null;
  return decodeEntities(m[1].replace(/<[^>]+>/g, '').trim());
}

function decodeEntities(input) {
  return String(input || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/**
 * 解析 XMLTV 文本
 * @returns {Array<{title: string, description: string|null, start_ts: number, stop_ts: number|null}>}
 */
export function parseXmltv(xml) {
  const text = String(xml || '');
  const programs = [];
  if (!text.includes('<programme')) return programs;
  PROGRAMME_RE.lastIndex = 0;
  let match;
  while ((match = PROGRAMME_RE.exec(text)) !== null) {
    const attrs = {};
    let attrMatch;
    ATTR_RE.lastIndex = 0;
    while ((attrMatch = ATTR_RE.exec(match[1])) !== null) {
      attrs[attrMatch[1].toLowerCase()] = attrMatch[2];
    }
    const start = parseXmltvTime(attrs.start);
    if (start == null) continue;
    const stop = parseXmltvTime(attrs.stop);
    const title = pickText(match[2], 'title') || '未知节目';
    const description = pickText(match[2], 'desc');
    programs.push({ title, description, start_ts: start, stop_ts: stop });
    if (programs.length > 400) break; // 单频道上限，避免超大节目单拖垮 D1
  }
  programs.sort((a, b) => a.start_ts - b.start_ts);
  return programs;
}
