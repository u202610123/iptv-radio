import router from './handlers/index.js';
import { runSync } from './services/sync.js';
import { createLogger } from './lib/log.js';

const log = createLogger('worker');

export default {
  /** HTTP 入口：/api/* 由 Worker 处理，其余走静态资源 */
  async fetch(request, env, ctx) {
    return router.handle(request, env, ctx);
  },

  /** 定时任务：增量同步内置源与自定义订阅 */
  async scheduled(event, env, ctx) {
    const target = 'all';
    log.info('定时任务开始', { cron: event?.cron || 'manual', target });
    ctx.waitUntil(
      runSync(env, { target })
        .then((summary) => log.info('定时任务完成', { durationMs: summary.durationMs }))
        .catch((err) => log.error('定时任务失败', { error: String(err?.message || err) }))
    );
  }
};
