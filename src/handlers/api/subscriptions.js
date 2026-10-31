import { badRequest, notFound, json, readJson } from '../../lib/http.js';
import * as subsRepo from '../../db/repositories/subscriptions.js';
import { importFromUrl, importFromText } from '../../services/importer.js';
import { requireString } from '../../lib/validate.js';

/** 订阅列表 */
export async function list({ env }) {
  return { items: await subsRepo.list(env) };
}

/** 新建订阅：支持 url（远程 M3U）或 text（粘贴内容） */
export async function create({ env, request }) {
  const body = await readJson(request);
  if (!body) return badRequest('请求体必须是 JSON');
  const nameCheck = requireString(body.name || body.url || body.text, 'name', 200);
  if (!nameCheck.ok) return badRequest(nameCheck.reason);

  try {
    if (body.text) {
      const result = await importFromText(env, {
        text: body.text,
        name: nameCheck.value.slice(0, 120),
        kind: body.kind === 'radio' ? 'radio' : 'iptv'
      });
      const sub = await subsRepo.getById(env, result.subscriptionId);
      return json(sub, { status: 201 });
    }
    if (!body.url) return badRequest('缺少 url 或 text');
    const result = await importFromUrl(env, {
      url: body.url,
      name: body.name,
      kind: body.kind === 'radio' ? 'radio' : 'iptv'
    });
    const sub = await subsRepo.getById(env, result.subscriptionId);
    return json(sub, { status: 201 });
  } catch (err) {
    return badRequest(String(err?.message || err), 'IMPORT_FAILED');
  }
}

/** 更新订阅（改名 / 启停 / 换地址） */
export async function update({ env, params, request }) {
  const body = await readJson(request);
  if (!body) return badRequest('请求体必须是 JSON');
  const patch = {};
  if (body.name !== undefined) patch.name = String(body.name).slice(0, 200);
  if (body.url !== undefined) patch.url = body.url ? String(body.url) : null;
  if (body.enabled !== undefined) patch.enabled = Number(body.enabled) ? 1 : 0;
  if (body.kind !== undefined) patch.kind = body.kind === 'radio' ? 'radio' : 'iptv';
  const updated = await subsRepo.update(env, params.id, patch);
  if (!updated) return notFound('订阅不存在');
  return updated;
}

/** 删除订阅及其频道 */
export async function remove({ env, params }) {
  const sub = await subsRepo.getById(env, params.id);
  if (!sub) return notFound('订阅不存在');
  await subsRepo.remove(env, params.id);
  return { deleted: true, id: params.id };
}

/** 立即同步某个订阅 */
export async function syncOne({ env, params }) {
  const sub = await subsRepo.getById(env, params.id);
  if (!sub) return notFound('订阅不存在');
  if (!sub.url) return badRequest('该订阅没有远程地址，无法同步');
  try {
    const result = await importFromUrl(env, {
      url: sub.url,
      name: sub.name,
      kind: sub.kind,
      subscriptionId: sub.id
    });
    const updated = await subsRepo.getById(env, sub.id);
    return { ok: true, imported: result.imported, subscription: updated };
  } catch (err) {
    await subsRepo.markSynced(env, sub.id, 0, String(err?.message || err));
    return badRequest(String(err?.message || err), 'SYNC_FAILED');
  }
}
