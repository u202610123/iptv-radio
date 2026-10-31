import { badRequest, notFound, readJson } from '../../lib/http.js';
import * as historyRepo from '../../db/repositories/history.js';
import * as channelsRepo from '../../db/repositories/channels.js';

/** 播放历史（按时间倒序，自动裁剪） */
export async function list({ env, query }) {
  const limit = Math.min(Math.max(1, Number(query.get('limit')) || 100), 200);
  return { items: await historyRepo.list(env, limit) };
}

/** 写入一条播放记录 */
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
  await historyRepo.add(env, channel);
  return { ok: true, id: channel.id };
}

/** 清空历史 */
export async function clear({ env }) {
  await historyRepo.clear(env);
  return { ok: true };
}

/** 删除某频道的记录 */
export async function remove({ env, params }) {
  await historyRepo.remove(env, params.channelId);
  return { ok: true, id: params.channelId };
}
