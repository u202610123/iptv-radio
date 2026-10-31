import { getConfig, SOURCES } from '../config.js';
import { parseM3UStream } from '../lib/m3u.js';
import { shortHash } from '../lib/hash.js';
import { createLogger, safeUrl } from '../lib/log.js';
import * as channelsRepo from '../db/repositories/channels.js';
import { getMeta, setMeta } from '../db/repositories/meta.js';

const log = createLogger('service:iptv');
const COUNTRIES_CACHE_KEY = 'iptv:countries';
const CURSOR_KEY = 'sync:iptv:cursor';
const STATUS_KEY = 'sync:iptv:status';
const DEFAULT_MAX_PER_COUNTRY = 1500;

async function fetchJson(env, url, timeoutMs = 15000) {
  const cfg = getConfig(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': cfg.USER_AGENT, accept: 'application/json' },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`上游返回 ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 上游不可用时使用的兜底国家清单（保证同步任务仍能推进） */
const FALLBACK_COUNTRIES = [
  ['us', 'United States'], ['gb', 'United Kingdom'], ['de', 'Germany'], ['fr', 'France'],
  ['it', 'Italy'], ['es', 'Spain'], ['nl', 'Netherlands'], ['se', 'Sweden'], ['no', 'Norway'],
  ['fi', 'Finland'], ['pl', 'Poland'], ['tr', 'Turkey'], ['ru', 'Russia'], ['ua', 'Ukraine'],
  ['cn', 'China'], ['hk', 'Hong Kong'], ['tw', 'Taiwan'], ['jp', 'Japan'], ['kr', 'South Korea'],
  ['in', 'India'], ['id', 'Indonesia'], ['th', 'Thailand'], ['vn', 'Vietnam'], ['my', 'Malaysia'],
  ['sg', 'Singapore'], ['ph', 'Philippines'], ['au', 'Australia'], ['nz', 'New Zealand'],
  ['ca', 'Canada'], ['mx', 'Mexico'], ['br', 'Brazil'], ['ar', 'Argentina'], ['cl', 'Chile'],
  ['za', 'South Africa'], ['eg', 'Egypt'], ['ng', 'Nigeria'], ['sa', 'Saudi Arabia'],
  ['ae', 'United Arab Emirates'], ['il', 'Israel'], ['pk', 'Pakistan'], ['bd', 'Bangladesh'],
  ['int', 'International']
].map(([code, name]) => ({ code, name }));

/** iptv-org 国家清单（带缓存，失败时回退内置清单） */
export async function listCountries(env, { force = false } = {}) {
  const cfg = getConfig(env);
  if (!force) {
    const cached = await getMeta(env, COUNTRIES_CACHE_KEY, null);
    if (Array.isArray(cached) && cached.length) return cached;
  }
  try {
    const data = await fetchJson(env, cfg.IPTV_COUNTRIES_URL);
    const list = (Array.isArray(data) ? data : Object.values(data || {}))
      .map((item) => ({
        code: String(item?.code || '').toLowerCase(),
        name: item?.name || item?.country || item?.code || ''
      }))
      .filter((c) => c.code);
    if (list.length) {
      await setMeta(env, COUNTRIES_CACHE_KEY, list);
      return list;
    }
  } catch (err) {
    log.warn('国家清单获取失败，使用兜底清单', { error: String(err?.message || err) });
  }
  return FALLBACK_COUNTRIES;
}

/** 单个国家的 M3U 地址 */
export function countryM3uUrl(base, code) {
  return `${base.replace(/\/index\.m3u$/, '')}/countries/${String(code).toLowerCase()}.m3u`;
}

function mapEntry(entry, countryInfo) {
  const url = String(entry.url || '').trim();
  if (!url) return null;
  const name = String(entry.name || '').trim() || '未命名频道';
  const countryCode = String(entry.country || countryInfo?.code || '').toUpperCase() || null;
  const group = (entry.group || '').split(';')[0].trim() || null;
  return {
    id: `iptv:${countryCode || 'xx'}:${shortHash(url)}`,
    kind: 'iptv',
    name,
    stream_url: url,
    logo_url: entry.logo || null,
    country: countryInfo?.name || entry.country || null,
    country_code: countryCode,
    language: entry.language || null,
    category: group,
    band: null,
    source: SOURCES.IPTV_ORG,
    extra: {
      tvgId: entry.tvgId || null,
      tvgName: entry.tvgName || null,
      group: entry.group || null
    }
  };
}

/**
 * 增量同步 iptv-org：每轮处理若干国家，游标写入 meta 便于续跑
 * @returns {{countries: string[], imported: number, cursor: number, done: boolean}}
 */
export async function syncFromIptvOrg(env, options = {}) {
  const cfg = getConfig(env);
  const limit = Number(options.limit) || cfg.IPTV_SYNC_COUNTRIES_PER_RUN;
  const maxPerCountry = Number(options.maxPerCountry) || DEFAULT_MAX_PER_COUNTRY;
  const countries = await listCountries(env, { force: !!options.refreshCountries });
  if (!countries.length) throw new Error('未能获取 iptv-org 国家列表');

  const cursor = Number((await getMeta(env, CURSOR_KEY, 0)) || 0) % countries.length;
  const batch = [];
  for (let i = 0; i < limit; i += 1) {
    batch.push(countries[(cursor + i) % countries.length]);
  }

  let imported = 0;
  const processed = [];
  for (const country of batch) {
    const start = Date.now();
    try {
      const url = countryM3uUrl(cfg.IPTV_INDEX_URL, country.code);
      const res = await fetch(url, {
        headers: { 'user-agent': cfg.USER_AGENT, accept: '*/*' },
        signal: AbortSignal.timeout(25000)
      });
      if (!res.ok || !res.body) {
        log.warn('国家源获取失败', { country: country.code, status: res.status });
        processed.push({ code: country.code, imported: 0, ok: false });
        continue;
      }
      const rows = [];
      for await (const entry of parseM3UStream(res.body, { maxEntries: maxPerCountry })) {
        const row = mapEntry(entry, country);
        if (row) rows.push(row);
        if (rows.length >= maxPerCountry) break;
      }
      if (rows.length) {
        await channelsRepo.upsertMany(env, rows);
        imported += rows.length;
      }
      processed.push({ code: country.code, imported: rows.length, ok: true, ms: Date.now() - start });
      log.info('同步国家完成', { country: country.code, count: rows.length, ms: Date.now() - start, url: safeUrl(url) });
    } catch (err) {
      processed.push({ code: country.code, imported: 0, ok: false, error: String(err?.message || err) });
      log.warn('同步国家异常', { country: country.code, error: String(err?.message || err) });
    }
  }

  const nextCursor = (cursor + batch.length) % countries.length;
  await setMeta(env, CURSOR_KEY, nextCursor);
  const status = {
    lastRunAt: Date.now(),
    imported,
    processed,
    cursor: nextCursor,
    totalCountries: countries.length,
    roundCompleted: nextCursor === 0
  };
  await setMeta(env, STATUS_KEY, status);
  return status;
}

/** 首次访问兜底：库内无 IPTV 数据时立即同步一批 */
export async function ensureSeeded(env, minCount = 50) {
  const total = await channelsRepo.countAll(env, 'iptv');
  if (total >= minCount) return { seeded: false, total };
  const status = await syncFromIptvOrg(env, { limit: 2 });
  return { seeded: true, total: await channelsRepo.countAll(env, 'iptv'), status };
}

export async function status(env) {
  return (await getMeta(env, STATUS_KEY, null)) || { lastRunAt: 0, imported: 0 };
}
