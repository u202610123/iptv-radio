/** 同名多源分组（纯函数，无 DOM 依赖，可在 node 下单测）
 * 问题：库里同名不同流地址的频道 id 不同，列表会把 CNR-1 中国之声这类
 * 同名台铺成多行；点其中一条失败时，播放器又要靠模糊搜索去找备用源。
 * 做法：按 kind + 归一化名分组，一行代表一组源；代表取热度（extra.votes）
 * 最高的源，其余源挂在 _sources 上，播放器直接按组内顺序试，不再模糊搜。
 * 已知限制：分组只在当前已加载的页内做（跨页同名仍可能在下一页再出现
 * 一行），因为全量分组会破坏后端分页与 total；下一批如需彻底解决，
 * 应由后端在过滤后先分组再分页。
 */

export function normalizeGroupName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\[(geo-blocked|not 24\/7|24\/7)\]/gi, '')
    .replace(/\(?\b\d{3,4}[pi]\b\)?/gi, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function votesOf(channel) {
  let extra = channel?.extra;
  if (typeof extra === 'string') {
    try { extra = JSON.parse(extra); } catch { return 0; }
  }
  const v = Number(extra?.votes);
  return Number.isFinite(v) ? v : 0;
}

export function groupChannels(items) {
  const groups = new Map();
  for (const item of items || []) {
    if (!item) continue;
    const key = `${item.kind || ''}:${normalizeGroupName(item.name)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const out = [];
  for (const sources of groups.values()) {
    const sorted = [...sources].sort((a, b) => votesOf(b) - votesOf(a));
    const representative = { ...sorted[0] };
    representative._sources = sorted;
    representative._sourceCount = sorted.length;
    out.push(representative);
  }
  return out;
}
