import { badRequest, notFound, json } from '../../lib/http.js';
import { pageParams } from '../../config.js';
import { readJson } from '../../lib/http.js';
import * as channelsRepo from '../../db/repositories/channels.js';
import * as favRepo from '../../db/repositories/favorites.js';
import * as historyRepo from '../../db/repositories/history.js';
import { addChannel } from '../../services/importer.js';
import * as statsService from '../../services/stats.js';
import { ensureReady } from './_bootstrap.js';

const EDITABLE_FIELDS = ['name', 'category', 'band', 'country', 'country_code', 'language', 'logo_url', 'stream_url'];

function buildFilters(query) {
  const pick = (key) => {
    const value = query.get(key);
    return value ? String(value).trim() : undefined;
  };
  return {
    kind: pick('kind'),
    country: pick('country'),
    category: pick('category'),
    band: pick('band'),
    source: pick('source'),
    language: pick('language'),
    subscriptionId: pick('subscriptionId'),
    topic: pick('topic'),
    q: pick('q') || pick('search') || '',
    sort: pick('sort') || 'name'
  };
}

/** 仅按 kind 过滤（无搜索/维度筛选/专题）时，总数直接用缓存计数，避免全表扫描 */
function isCheapFilter(filters) {
  return !filters.q && !filters.country && !filters.category && !filters.band && !filters.source && !filters.language && !filters.subscriptionId && !filters.topic;
}

/** 频道列表 */
export async function list({ env, ctx, url, query, config }) {
  await ensureReady(env, ctx);
  const { page, pageSize } = pageParams(url, config);
  const filters = buildFilters(query);
  const cheap = isCheapFilter(filters);
  const [items, total, favIds] = await Promise.all([
    channelsRepo.list(env, { ...filters, page, pageSize }),
    cheap ? statsService.getCounts(env).then((c) => c[filters.kind || 'iptv'] ?? 0) : channelsRepo.count(env, filters),
    favRepo.idSet(env)
  ]);
  const rows = items.map((c) => ({ ...c, is_favorite: favIds.has(c.id) ? 1 : 0 }));
  return {
    items: rows,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total
  };
}

/** 筛选项聚合（国家 / 分类 / 波段） */
export async function facets({ env, ctx, query }) {
  await ensureReady(env, ctx);
  const kind = query.get('kind') || undefined;
  return statsService.getFacets(env, kind);
}

/** 频道详情 */
export async function detail({ env, params }) {
  const channel = await channelsRepo.getById(env, params.id);
  if (!channel) return notFound('频道不存在');
  const isFavorite = await favRepo.has(env, channel.id);
  return { ...channel, is_favorite: isFavorite ? 1 : 0 };
}

/** 手动添加频道 */
export async function create({ env, request }) {
  const body = await readJson(request);
  if (!body) return badRequest('请求体必须是 JSON');
  try {
    const channel = await addChannel(env, body);
    return json(channel, { status: 201 });
  } catch (err) {
    return badRequest(String(err?.message || err), 'INVALID_CHANNEL');
  }
}

/** 编辑频道（自定义字段） */
export async function update({ env, params, request }) {
  const body = await readJson(request);
  if (!body) return badRequest('请求体必须是 JSON');
  const patch = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) patch[field] = body[field];
  }
  if (!Object.keys(patch).length) return badRequest('没有可更新的字段');
  const updated = await channelsRepo.update(env, params.id, patch);
  if (!updated) return notFound('频道不存在');
  return updated;
}

/** 删除频道 */
export async function remove({ env, params }) {
  const channel = await channelsRepo.getById(env, params.id);
  if (!channel) return notFound('频道不存在');
  await channelsRepo.remove(env, params.id);
  return { deleted: true, id: params.id };
}

/** 记录一次播放（写入历史） */
export async function play({ env, params }) {
  const channel = await channelsRepo.getById(env, params.id);
  if (!channel) return notFound('频道不存在');
  await historyRepo.add(env, channel);
  return { ok: true, id: channel.id };
}
