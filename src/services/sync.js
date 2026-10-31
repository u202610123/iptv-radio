import * as iptvService from './iptv.js';
import * as radioService from './radio.js';
import * as statsService from './stats.js';
import { importFromUrl } from './importer.js';
import * as subsRepo from '../db/repositories/subscriptions.js';
import { getMeta, setMeta } from '../db/repositories/meta.js';
import { createLogger } from '../lib/log.js';
import { getConfig } from '../config.js';

const log = createLogger('service:sync');

const LAST_KEY = 'sync:last';

function shouldRun(target, name) {
  return target === 'all' || target === name;
}

/** 同步所有启用的自定义订阅 */
export async function syncSubscriptions(env) {
  const subs = await subsRepo.enabledList(env);
  const results = [];
  for (const sub of subs) {
    if (!sub.url) continue;
    try {
      const res = await importFromUrl(env, {
        url: sub.url,
        name: sub.name,
        kind: sub.kind,
        subscriptionId: sub.id
      });
      results.push({ id: sub.id, name: sub.name, imported: res.imported, ok: true });
    } catch (err) {
      const message = String(err?.message || err);
      await subsRepo.markSynced(env, sub.id, 0, message);
      results.push({ id: sub.id, name: sub.name, imported: 0, ok: false, error: message });
    }
  }
  return results;
}

/**
 * 同步编排入口（fetch 手动触发与 Cron 共用）
 * @param {{target?: string}} options target: all | iptv | radio | subscriptions
 */
export async function runSync(env, options = {}) {
  const cfg = getConfig(env);
  const target = options.target || 'all';
  const summary = { startedAt: Date.now(), target, tasks: {} };

  if (shouldRun(target, 'iptv')) {
    try {
      summary.tasks.iptv = await iptvService.syncFromIptvOrg(env, options);
    } catch (err) {
      summary.tasks.iptv = { ok: false, error: String(err?.message || err) };
      log.warn('IPTV 同步失败', { error: String(err?.message || err) });
    }
  }

  if (shouldRun(target, 'radio')) {
    try {
      summary.tasks.radio = await radioService.syncFromRadioBrowser(env, options);
    } catch (err) {
      summary.tasks.radio = { ok: false, error: String(err?.message || err) };
      log.warn('电台同步失败', { error: String(err?.message || err) });
    }
  }

  if (shouldRun(target, 'subscriptions')) {
    try {
      summary.tasks.subscriptions = await syncSubscriptions(env);
    } catch (err) {
      summary.tasks.subscriptions = { ok: false, error: String(err?.message || err) };
    }
  }

  summary.finishedAt = Date.now();
  summary.durationMs = summary.finishedAt - summary.startedAt;
  // 省资源：以前每次同步结束都强制全表扫三遍（计数 + 两个分面），
  // 一天 4 轮同步就是十几遍全表扫描。改成：计数只读 meta 单行，
  // 只有当计数缓存缺失或超过 24 小时才重算一次；分面完全交给
  // 24 小时 TTL（请求路径过期时自然刷新），同步结束不再主动扫。
  let counts = await statsService.getCounts(env);
  if (!counts || !counts.updatedAt || Date.now() - counts.updatedAt > 24 * 60 * 60 * 1000) {
    counts = await statsService.refreshCounts(env);
  }
  summary.totals = {
    iptv: counts.iptv,
    radio: counts.radio,
    pageSize: cfg.DEFAULT_PAGE_SIZE
  };
  await setMeta(env, LAST_KEY, summary);
  log.info('同步任务完成', { target, durationMs: summary.durationMs });
  return summary;
}

/** 冷启动兜底：库内为空时立即拉一批内置数据，保证首次访问可用 */
export async function bootstrapIfEmpty(env) {
  const [iptv, radio] = await Promise.all([
    iptvService.ensureSeeded(env),
    radioService.ensureSeeded(env)
  ]);
  return { iptv, radio };
}

/** 同步状态总览 */
export async function status(env) {
  const [last, iptvStatus, radioStatus, meta] = await Promise.all([
    getMeta(env, LAST_KEY, null),
    iptvService.status(env),
    radioService.status(env),
    getMeta(env, 'sync:meta', { bootstrapped: false })
  ]);
  return {
    last: last || null,
    iptv: iptvStatus,
    radio: radioStatus,
    counts: await statsService.getCounts(env),
    meta
  };
}

export async function markBootstrapped(env) {
  await setMeta(env, 'sync:meta', { bootstrapped: true, at: Date.now() });
}

export async function isBootstrapped(env) {
  const meta = await getMeta(env, 'sync:meta', { bootstrapped: false });
  return !!meta?.bootstrapped;
}
