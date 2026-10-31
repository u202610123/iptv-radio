import { badRequest, json } from '../../lib/http.js';
import * as syncService from '../../services/sync.js';

/** 同步状态 */
export async function status({ env }) {
  return syncService.status(env);
}

/** 手动触发同步（target: all | iptv | radio | subscriptions） */
export async function trigger({ env, ctx, query, request }) {
  let target = query.get('target') || 'all';
  let limit = Number(query.get('limit')) || 0;
  let pages = Number(query.get('pages')) || 0;
  if (request.method === 'POST') {
    try {
      const body = await request.clone().json().catch(() => null);
      if (body?.target) target = body.target;
      if (body?.limit) limit = Number(body.limit);
      if (body?.pages) pages = Number(body.pages);
    } catch {
      /* 忽略无效 body */
    }
  }
  const allowed = ['all', 'iptv', 'radio', 'subscriptions'];
  if (!allowed.includes(target)) return badRequest('target 仅支持 all/iptv/radio/subscriptions');

  // 单轮批量上限，避免一次请求把 Worker CPU 跑满
  const options = { target };
  if (limit > 0) options.limit = Math.min(limit, 60);
  if (pages > 0) options.pages = Math.min(pages, 40);

  const task = syncService.runSync(env, options);
  if (ctx && typeof ctx.waitUntil === 'function') {
    // 立即返回，后台继续跑（避免 HTTP 请求超时）
    ctx.waitUntil(task);
    return json({ started: true, target });
  }
  return task;
}
