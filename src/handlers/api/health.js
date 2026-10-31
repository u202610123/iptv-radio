import * as sync from '../../services/sync.js';
import * as statsService from '../../services/stats.js';

/** 健康检查 + 同步状态总览 */
export async function status({ env, config }) {
  const state = await sync.status(env);
  return {
    status: 'ok',
    service: 'iptv-radio-panel',
    time: new Date().toISOString(),
    counts: state.counts,
    lastSync: state.last
      ? {
          at: state.last.finishedAt,
          target: state.last.target,
          durationMs: state.last.durationMs
        }
      : null,
    iptv: state.iptv,
    radio: state.radio,
    config: {
      pageSize: config.DEFAULT_PAGE_SIZE,
      epgTtlSeconds: config.EPG_TTL_SECONDS
    }
  };
}

/** 各来源频道数量（设置页展示） */
export async function sources({ env }) {
  const [facets, counts] = await Promise.all([statsService.getFacets(env), sync.status(env).then((s) => s.counts)]);
  return { counts, facets };
}
