import { badRequest, notFound, readJson } from '../../lib/http.js';
import * as favRepo from '../../db/repositories/favorites.js';
import * as channelsRepo from '../../db/repositories/channels.js';

/** 收藏列表 */
export async function list({ env, query }) {
  const kind = query.get('kind') || undefined;
  return { items: await favRepo.list(env, kind) };
}

/** 添加收藏：可直接传完整频道对象，也可只传 channel_id */
export async function add({ env, request }) {
  const body = await readJson(request);
  if (!body) return badRequest('请求体必须是 JSON');
  let channel = null;
  if (body.id && body.stream_url) {
    channel = body;
  } else if (body.id || body.channel_id) {
    channel = await channelsRepo.getById(env, body.id || body.channel_id);
    if (!channel) return notFound('频道不存在');
  }
  if (!channel) return badRequest('缺少频道信息');
  await favRepo.add(env, channel);
  return { ok: true, id: channel.id };
}

/** 取消收藏 */
export async function remove({ env, params }) {
  await favRepo.remove(env, params.channelId);
  return { ok: true, id: params.channelId };
}
