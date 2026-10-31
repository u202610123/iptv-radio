import { runSync, bootstrapIfEmpty, isBootstrapped, markBootstrapped } from '../../services/sync.js';
import * as channelsRepo from '../../db/repositories/channels.js';

const MIN_ROWS = 50;

/**
 * 冷启动兜底：库内数据不足时后台拉取一批内置源，
 * 不阻塞当前请求（首屏即使为空也能在数秒后刷新得到数据）
 */
export async function ensureReady(env, ctx) {
  try {
    if (await isBootstrapped(env)) return;
    const [iptv, radio] = await Promise.all([
      channelsRepo.countAll(env, 'iptv'),
      channelsRepo.countAll(env, 'radio')
    ]);
    if (iptv >= MIN_ROWS && radio >= MIN_ROWS) {
      await markBootstrapped(env);
      return;
    }
    const task = bootstrapIfEmpty(env)
      .then(() => runSync(env, { target: 'all' }))
      .then(() => markBootstrapped(env))
      .catch(() => undefined);
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(task);
    else await task;
  } catch {
    /* 兜底失败不影响主流程 */
  }
}

export { MIN_ROWS };
