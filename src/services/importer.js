import { parseM3U } from '../lib/m3u.js';
import { shortHash, randomId } from '../lib/hash.js';
import { validateUpstreamUrl, slugifyId } from '../lib/validate.js';
import { createLogger, safeUrl } from '../lib/log.js';
import * as channelsRepo from '../db/repositories/channels.js';
import * as subsRepo from '../db/repositories/subscriptions.js';
import { getConfig } from '../config.js';

const log = createLogger('service:importer');

function mapEntry(entry, options = {}) {
  const url = String(entry.url || '').trim();
  if (!url) return null;
  const { kind = 'iptv', source = 'custom', subscriptionId = null, prefix = 'sub' } = options;
  const name = String(entry.name || '').trim() || '未命名频道';
  const countryCode = String(entry.country || options.countryCode || '').toUpperCase() || null;
  const group = (entry.group || '').split(';')[0].trim() || options.category || null;
  return {
    id: `${prefix}:${subscriptionId ? slugifyId(subscriptionId) : 'adhoc'}:${shortHash(url)}`,
    kind,
    name,
    stream_url: url,
    logo_url: entry.logo || null,
    country: options.country || null,
    country_code: countryCode,
    language: entry.language || null,
    category: group,
    band: options.band || null,
    source,
    subscription_id: subscriptionId,
    extra: { tvgId: entry.tvgId || null, group: entry.group || null }
  };
}

/** 解析并入库一批 M3U 条目 */
export async function importEntries(env, entries, options = {}) {
  const rows = entries.map((e) => mapEntry(e, options)).filter(Boolean);
  if (!rows.length) return { imported: 0 };
  await channelsRepo.upsertMany(env, rows);
  return { imported: rows.length, rows };
}

/** 从文本导入（粘贴 M3U 内容） */
export async function importFromText(env, { text, name = '自定义文本导入', kind = 'iptv' } = {}) {
  const entries = parseM3U(text || '');
  if (!entries.length) throw new Error('未解析到任何频道，请检查 M3U 内容');
  const subscriptionId = randomId('sub');
  await subsRepo.create(env, { id: subscriptionId, name, url: null, kind });
  const result = await importEntries(env, entries, { kind, source: 'custom', subscriptionId });
  await subsRepo.markSynced(env, subscriptionId, result.imported);
  log.info('文本导入完成', { subscription: subscriptionId, count: result.imported });
  return { subscriptionId, ...result };
}

/** 从 URL 导入（M3U 订阅地址） */
export async function importFromUrl(env, { url, name, kind = 'iptv', subscriptionId } = {}) {
  const cfg = getConfig(env);
  const check = validateUpstreamUrl(url, { maxLength: cfg.PROXY_MAX_URL_LENGTH });
  if (!check.ok) throw new Error(check.reason);
  const res = await fetch(check.url.toString(), {
    headers: { 'user-agent': cfg.USER_AGENT, accept: '*/*' },
    signal: AbortSignal.timeout(25000)
  });
  if (!res.ok || !res.body) throw new Error(`订阅地址返回 ${res.status}`);
  const text = await res.text();
  const entries = parseM3U(text);
  if (!entries.length) throw new Error('订阅内容为空或格式不受支持');

  const id = subscriptionId || randomId('sub');
  if (!subscriptionId) {
    await subsRepo.create(env, { id, name: name || check.url.hostname, url: check.url.toString(), kind });
  }
  // 省资源：不再先全删后全插（那样每行都要付一次删除 + 一次插入 +
  // 全文搜索触发器的写入，哪怕内容完全没变）。先用 upsertMany 的
  // “没变就不写”入库，再只删新列表里确实消失的台。
  const oldIds = await channelsRepo.idsBySubscription(env, id);
  const result = await importEntries(env, entries, { kind, source: 'custom', subscriptionId: id });
  const newIds = new Set((result.rows || []).map((r) => r.id));
  const gone = oldIds.filter((oldId) => !newIds.has(oldId));
  if (gone.length) await channelsRepo.removeByIds(env, gone);
  await subsRepo.markSynced(env, id, result.imported);
  log.info('订阅导入完成', { subscription: id, count: result.imported, url: safeUrl(url) });
  return { subscriptionId: id, ...result };
}

/** 手动添加单个频道 */
export async function addChannel(env, payload = {}) {
  const url = String(payload.stream_url || payload.streamUrl || '').trim();
  if (!url) throw new Error('缺少 stream_url');
  const check = validateUpstreamUrl(url, { maxLength: getConfig(env).PROXY_MAX_URL_LENGTH });
  if (!check.ok) throw new Error(check.reason);
  const name = String(payload.name || '').trim() || check.url.hostname;
  const id = `custom:${shortHash(url)}`;
  const row = {
    id,
    kind: payload.kind === 'radio' ? 'radio' : 'iptv',
    name,
    stream_url: url,
    logo_url: payload.logo_url || payload.logoUrl || null,
    country: payload.country || null,
    country_code: (payload.country_code || payload.countryCode || '').toUpperCase() || null,
    language: payload.language || null,
    category: payload.category || null,
    band: payload.band || null,
    source: 'custom',
    extra: { manual: true }
  };
  const created = await channelsRepo.create(env, row);
  if (!created) {
    await channelsRepo.upsert(env, row);
  }
  return row;
}
