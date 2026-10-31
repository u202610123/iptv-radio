import { pageParams } from '../../config.js';
import * as channelsRepo from '../../db/repositories/channels.js';
import * as favRepo from '../../db/repositories/favorites.js';
import * as statsService from '../../services/stats.js';
import { BANDS } from '../../config.js';
import { ensureReady } from './_bootstrap.js';

/** 电台列表（kind 固定 radio，可按波段过滤） */
export async function stations({ env, ctx, url, query, config }) {
  await ensureReady(env, ctx);
  const { page, pageSize } = pageParams(url, config);
  const band = String(query.get('band') || '').toUpperCase();
  const filters = {
    kind: 'radio',
    country: query.get('country') || undefined,
    category: query.get('category') || undefined,
    q: query.get('q') || query.get('search') || '',
    sort: query.get('sort') || 'name',
    band: BANDS.includes(band) ? band : undefined,
    topic: query.get('topic') || undefined
  };
  const cheap = !filters.q && !filters.country && !filters.category && !filters.band && !filters.topic;
  const [items, total, favIds] = await Promise.all([
    channelsRepo.list(env, { ...filters, page, pageSize }),
    cheap ? statsService.getCounts(env).then((c) => c.radio ?? 0) : channelsRepo.count(env, filters),
    favRepo.idSet(env)
  ]);
  return {
    items: items.map((c) => ({ ...c, is_favorite: favIds.has(c.id) ? 1 : 0 })),
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total
  };
}

/** 电台筛选项（波段 / 国家 / 分类） */
export async function facets({ env, ctx }) {
  await ensureReady(env, ctx);
  const result = await statsService.getFacets(env, 'radio');
  return { ...result, bands: ensureBands(result.bands) };
}

function ensureBands(bands = []) {
  const map = new Map(bands.map((b) => [b.value, b.count]));
  return BANDS.map((b) => ({ value: b, label: b, count: map.get(b) || 0 }));
}
