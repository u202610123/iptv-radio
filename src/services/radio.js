import { getConfig, SOURCES } from '../config.js';
import { shortHash } from '../lib/hash.js';
import { createLogger } from '../lib/log.js';
import * as channelsRepo from '../db/repositories/channels.js';
import { getMeta, setMeta } from '../db/repositories/meta.js';

const log = createLogger('service:radio');
const OFFSET_KEY = 'sync:radio:offset';
const STATUS_KEY = 'sync:radio:status';

/** 波段判定：优先看标签，其次看名称关键词 */
export function detectBand(station = {}) {
  const tags = String(station.tags || '').toLowerCase();
  const name = String(station.name || '').toLowerCase();
  const blob = `${tags} ${name}`;
  if (/shortwave|\bsw\b|短波|short wave/.test(blob)) return 'SW';
  if (/\bam\b|medium ?wave|中波|am radio/.test(blob)) return 'AM';
  if (/\bfm\b|调频/.test(blob)) return 'FM';
  return 'FM'; // radio-browser 绝大多数为网络流，默认归入 FM
}

function mapStation(station) {
  const url = String(station.url_resolved || station.url || '').trim();
  if (!url) return null;
  const name = String(station.name || '').trim() || '未命名电台';
  const countryCode = String(station.countrycode || '').toUpperCase() || null;
  const tags = String(station.tags || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    id: `radio:${station.stationuuid || shortHash(url)}`,
    kind: 'radio',
    name,
    stream_url: url,
    logo_url: station.favicon || null,
    country: station.country || null,
    country_code: countryCode,
    language: station.language || null,
    category: tags[0] || null,
    band: detectBand(station),
    source: SOURCES.RADIO_BROWSER,
    extra: {
      codec: station.codec || null,
      bitrate: station.bitrate || null,
      tags,
      homepage: station.homepage || null,
      votes: station.votes || 0
    }
  };
}

/**
 * 增量同步 radio-browser：按 offset 翻页，每轮若干页
 * @returns {{imported: number, offset: number, pages: number}}
 */
export async function syncFromRadioBrowser(env, options = {}) {
  const cfg = getConfig(env);
  const pages = Number(options.pages) || cfg.RADIO_SYNC_PAGES_PER_RUN;
  const size = Number(options.pageSize) || cfg.RADIO_SYNC_PAGE_SIZE;
  let offset = Number((await getMeta(env, OFFSET_KEY, 0)) || 0);
  let imported = 0;
  const pageStats = [];
  const startedAt = Date.now();
  // 单次调用时长有硬上限（约 30s），超时会被强杀导致 offset 不落盘；
  // 这里主动留出预算，把每轮控制在安全范围内，靠游标分多轮跑完全量
  const TIME_BUDGET_MS = 15000;
  let budgetExhausted = false;

  for (let p = 0; p < pages; p += 1) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      budgetExhausted = true;
      break;
    }
    const url = `${cfg.RADIO_BROWSER_API}/json/stations/search?limit=${size}&offset=${offset}&hidebroken=true&order=votes&reverse=true`;
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': cfg.USER_AGENT, accept: 'application/json' },
        signal: AbortSignal.timeout(25000)
      });
      if (!res.ok) throw new Error(`上游返回 ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) {
        // 到底了，下一轮从头开始
        offset = 0;
        break;
      }
      const rows = data.map(mapStation).filter(Boolean);
      await channelsRepo.upsertMany(env, rows);
      imported += rows.length;
      offset += data.length;
      pageStats.push({ offset, imported: rows.length, ok: true });
      // radio-browser 限速约 1 请求/秒，连续翻页会被 429，这里主动节流
      if (p < pages - 1) await new Promise((r) => setTimeout(r, 1100));
    } catch (err) {
      pageStats.push({ offset, imported: 0, ok: false, error: String(err?.message || err) });
      log.warn('同步电台分页失败', { offset, error: String(err?.message || err) });
      break;
    }
  }

  await setMeta(env, OFFSET_KEY, offset);
  const status = { lastRunAt: Date.now(), imported, offset, budgetExhausted, pages: pageStats };
  await setMeta(env, STATUS_KEY, status);
  return status;
}

/** 首次访问兜底：库内无电台数据时立即同步一批 */
export async function ensureSeeded(env, minCount = 50) {
  const total = await channelsRepo.countAll(env, 'radio');
  if (total >= minCount) return { seeded: false, total };
  const status = await syncFromRadioBrowser(env, { pages: 1 });
  return { seeded: true, total: await channelsRepo.countAll(env, 'radio'), status };
}

export async function status(env) {
  return (await getMeta(env, STATUS_KEY, null)) || { lastRunAt: 0, imported: 0, offset: 0 };
}
