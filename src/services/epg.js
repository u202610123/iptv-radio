import { getConfig } from '../config.js';
import { parseXmltv } from '../lib/xmltv.js';
import { slugifyId } from '../lib/validate.js';
import { createLogger, safeUrl } from '../lib/log.js';
import * as epgRepo from '../db/repositories/epg.js';
import * as channelsRepo from '../db/repositories/channels.js';
import { getMeta, setMeta } from '../db/repositories/meta.js';

const log = createLogger('service:epg');

function parseExtra(channel) {
  try {
    return JSON.parse(channel.extra || '{}');
  } catch {
    return {};
  }
}

/** 生成候选 EPG 地址（iptv-org EPG 按 国家/频道 组织） */
export function candidateUrls(cfg, channel, extra) {
  const country = String(channel.country_code || '').toLowerCase() || 'int';
  const ids = [extra.tvgId, extra.tvgName, channel.name]
    .filter(Boolean)
    .map((v) => slugifyId(String(v).replace(/\s+/g, ''), ''))
    .filter(Boolean);
  const uniq = [...new Set(ids)].slice(0, 3);
  return uniq.flatMap((id) => [
    `${cfg.EPG_BASE_URL}/${country}/${id}.epg.xml`,
    `${cfg.EPG_BASE_URL}/int/${id}.epg.xml`
  ]);
}

/**
 * 获取频道节目单：优先读缓存，过期或强制时回源
 * @returns {{current: object|null, upcoming: object[], source: string, updatedAt: number}}
 */
export async function getPrograms(env, channelId, options = {}) {
  const cfg = getConfig(env);
  const limit = Number(options.limit) || 12;
  const force = !!options.force;
  const channel = await channelsRepo.getById(env, channelId);
  if (!channel) return null;

  const fresh = await epgRepo.freshness(env, channelId);
  const hasRows = fresh.updated_at > 0;
  const expired = fresh.ageSeconds > cfg.EPG_TTL_SECONDS;

  if (hasRows && !expired && !force) {
    const [current, upcoming] = await Promise.all([
      epgRepo.current(env, channelId),
      epgRepo.upcoming(env, channelId, limit)
    ]);
    return { channel, current, upcoming, source: 'cache', updatedAt: fresh.updated_at };
  }

  const extra = parseExtra(channel);
  let programs = [];
  let usedUrl = null;
  for (const url of candidateUrls(cfg, channel, extra)) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': cfg.USER_AGENT, accept: 'application/xml,text/xml,*/*' },
        signal: AbortSignal.timeout(15000)
      });
      if (!res.ok) continue;
      const text = await res.text();
      const parsed = parseXmltv(text);
      if (parsed.length) {
        programs = parsed;
        usedUrl = url;
        break;
      }
    } catch (err) {
      log.debug('EPG 源不可用', { url: safeUrl(url), error: String(err?.message || err) });
    }
  }

  if (programs.length) {
    await epgRepo.replaceForChannel(env, channelId, programs);
    await setMeta(env, `epg:url:${channelId}`, usedUrl);
  } else if (force || !hasRows) {
    // 回源失败：保留旧数据（若有），否则返回空
    await setMeta(env, `epg:miss:${channelId}`, Date.now());
  }

  const [current, upcoming] = await Promise.all([
    epgRepo.current(env, channelId),
    epgRepo.upcoming(env, channelId, limit)
  ]);
  const freshAfter = await epgRepo.freshness(env, channelId);
  return {
    channel,
    current,
    upcoming,
    source: programs.length ? 'remote' : hasRows ? 'stale-cache' : 'unavailable',
    updatedAt: freshAfter.updated_at
  };
}

/** 清空某频道节目单缓存 */
export async function clear(env, channelId) {
  await epgRepo.clearChannel(env, channelId);
  await setMeta(env, `epg:url:${channelId}`, null);
  return true;
}

export async function clearAll(env) {
  await epgRepo.clearAll(env);
  return true;
}

/** 最近一次 EPG 回源地址（调试用） */
export async function lastSourceUrl(env, channelId) {
  return (await getMeta(env, `epg:url:${channelId}`, null)) || null;
}
