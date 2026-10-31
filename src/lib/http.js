/** HTTP 响应统一封装：JSON、错误、CORS、缓存头 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,Range',
  'Access-Control-Max-Age': '86400'
};

function mergeHeaders(init = {}, extra = {}) {
  return { ...CORS_HEADERS, ...init, ...extra };
}

/** 成功响应 */
export function json(data, { status = 200, headers = {}, cached = false } = {}) {
  const finalHeaders = mergeHeaders(
    { 'Content-Type': 'application/json; charset=utf-8' },
    headers
  );
  if (cached) finalHeaders['Cache-Control'] = 'public, max-age=60';
  else finalHeaders['Cache-Control'] = 'no-store';
  return new Response(JSON.stringify({ ok: true, data }), { status, headers: finalHeaders });
}

/** 错误响应：统一结构，不回显内部异常细节 */
export function fail(status, code, message) {
  return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    status,
    headers: mergeHeaders({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  });
}

export const badRequest = (message = '请求参数无效', code = 'BAD_REQUEST') => fail(400, code, message);
export const notFound = (message = '资源不存在') => fail(404, 'NOT_FOUND', message);
export const methodNotAllowed = (message = '方法不被允许') => fail(405, 'METHOD_NOT_ALLOWED', message);
export const tooManyRetries = (message = '上游请求失败') => fail(502, 'UPSTREAM_ERROR', message);
export const serverError = (message = '服务内部错误') => fail(500, 'INTERNAL_ERROR', message);

export function options() {
  return new Response(null, { status: 204, headers: mergeHeaders() });
}

/** 读取 JSON 请求体（失败返回 null） */
export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export { CORS_HEADERS };
