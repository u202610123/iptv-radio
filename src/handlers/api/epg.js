import { notFound, json } from '../../lib/http.js';
import * as epgService from '../../services/epg.js';

/** 查询频道节目单 */
export async function programs({ env, params, query }) {
  const result = await epgService.getPrograms(env, params.channelId, {
    force: query.get('force') === '1',
    limit: Number(query.get('limit')) || 12
  });
  if (!result) return notFound('频道不存在');
  return {
    channelId: params.channelId,
    channelName: result.channel?.name || null,
    current: result.current,
    upcoming: result.upcoming,
    source: result.source,
    updatedAt: result.updatedAt
  };
}

/** 清除节目单缓存 */
export async function clear({ env, params }) {
  await epgService.clear(env, params.channelId);
  return json({ cleared: true, channelId: params.channelId });
}
