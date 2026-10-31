import * as channelsRepo from '../db/repositories/channels.js';
import { getMeta, setMeta } from '../db/repositories/meta.js';
import { createLogger } from '../lib/log.js';

const log = createLogger('service:stats');

/**
 * 统计缓存：计数与分面是全表扫描型查询（7 万+ 行/次），
 * 直接挂到请求路径上会迅速烧穿 D1 免费套餐的每日行读取配额。
 * 这里把结果落 meta 表（单行读取），并在 Worker 实例内存里再垫一层。
 */
const COUNTS_KEY = 'stats:counts';
const FACETS_PREFIX = 'stats:facets:';
const COUNTS_MEMO_TTL = 5 * 60 * 1000; // 内存 5 分钟
const FACETS_TTL = 24 * 60 * 60 * 1000; // 落库 24 小时：国家/分类列表变化很慢，没必要每 6 小时全表扫一次

let memoCounts = { data: null, at: 0 };
const memoFacets = new Map();

/** 频道计数（iptv / radio），读缓存；缓存不存在时现算一次 */
export async function getCounts(env) {
  if (memoCounts.data && Date.now() - memoCounts.at < COUNTS_MEMO_TTL) return memoCounts.data;
  const stored = await getMeta(env, COUNTS_KEY, null);
  if (stored && stored.iptv != null && stored.radio != null) {
    memoCounts = { data: stored, at: Date.now() };
    return stored;
  }
  return refreshCounts(env);
}

/** 重算计数（同步完成后调用，一次全表 GROUP BY） */
export async function refreshCounts(env) {
  try {
    const [iptv, radio] = await Promise.all([
      channelsRepo.countAll(env, 'iptv'),
      channelsRepo.countAll(env, 'radio')
    ]);
    const data = { iptv, radio, updatedAt: Date.now() };
    memoCounts = { data, at: Date.now() };
    await setMeta(env, COUNTS_KEY, data);
    return data;
  } catch (err) {
    log.warn('计数刷新失败', { error: String(err?.message || err) });
    return memoCounts.data || { iptv: 0, radio: 0, updatedAt: 0 };
  }
}

/** 分面数据（国家 / 分类 / 波段聚合），带 TTL 缓存 */
export async function getFacets(env, kind) {
  const key = FACETS_PREFIX + (kind || 'all');
  const memo = memoFacets.get(key);
  if (memo && Date.now() - memo.at < FACETS_TTL) return memo.data;
  const stored = await getMeta(env, key, null);
  if (stored?.data && Date.now() - (stored.at || 0) < FACETS_TTL) {
    memoFacets.set(key, { data: stored.data, at: Date.now() });
    return stored.data;
  }
  return refreshFacets(env, kind);
}

/** 重算分面（同步完成后或缓存过期时调用） */
export async function refreshFacets(env, kind) {
  const key = FACETS_PREFIX + (kind || 'all');
  try {
    const data = await channelsRepo.facets(env, kind);
    memoFacets.set(key, { data, at: Date.now() });
    await setMeta(env, key, { at: Date.now(), data });
    return data;
  } catch (err) {
    log.warn('分面刷新失败', { kind, error: String(err?.message || err) });
    return memoFacets.get(key)?.data || { countries: [], categories: [], bands: [] };
  }
}
