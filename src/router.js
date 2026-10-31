/**
 * 极简路由：支持 /api/resource/:id 形式参数，统一 404 / 405 / OPTIONS
 * 新增接口只需在 handlers/index.js 里注册一行。
 */
import { json, fail, notFound, methodNotAllowed, options, serverError } from './lib/http.js';
import { getConfig } from './config.js';

export function createRouter() {
  const routes = [];

  function add(method, pattern, handler, meta = {}) {
    routes.push({
      method: method.toUpperCase(),
      segments: pattern.split('/').filter(Boolean),
      pattern,
      handler,
      meta
    });
    return api;
  }

  function match(method, pathname) {
    const parts = pathname.split('/').filter(Boolean);
    for (const route of routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== parts.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < route.segments.length; i += 1) {
        const seg = route.segments[i];
        if (seg.startsWith(':')) {
          params[seg.slice(1)] = decodeURIComponent(parts[i]);
        } else if (seg !== parts[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return { route, params };
    }
    return null;
  }

  function allowedMethods(pathname) {
    const parts = pathname.split('/').filter(Boolean);
    return routes
      .filter((r) => {
        if (r.segments.length !== parts.length) return false;
        return r.segments.every((seg, i) => seg.startsWith(':') || seg === parts[i]);
      })
      .map((r) => r.method);
  }

  const api = {
    add,
    get: (pattern, handler, meta) => add('GET', pattern, handler, meta),
    post: (pattern, handler, meta) => add('POST', pattern, handler, meta),
    put: (pattern, handler, meta) => add('PUT', pattern, handler, meta),
    patch: (pattern, handler, meta) => add('PATCH', pattern, handler, meta),
    del: (pattern, handler, meta) => add('DELETE', pattern, handler, meta),

    async handle(request, env, ctx) {
      const url = new URL(request.url);
      if (request.method === 'OPTIONS') return options();

      const hit = match(request.method, url.pathname);
      if (!hit) {
        const allowed = allowedMethods(url.pathname);
        if (allowed.length) return methodNotAllowed(`仅支持 ${allowed.join(', ')}`);
        if (url.pathname.startsWith('/api/')) return notFound('接口不存在');
        return notFound('资源不存在');
      }

      const context = {
        request,
        env,
        ctx,
        url,
        params: hit.params,
        query: url.searchParams,
        config: getConfig(env),
        json
      };

      try {
        const response = await hit.route.handler(context);
        return response instanceof Response ? response : json(response);
      } catch (err) {
        console.error(JSON.stringify({
          level: 'error',
          scope: 'router',
          path: url.pathname,
          message: String(err?.message || err)
        }));
        if (err && err.status) return fail(err.status, err.code || 'BAD_REQUEST', err.message);
        // 诊断模式：把异常信息带回响应（仅内部错误），便于线上排障
        return serverError(`服务内部错误: ${String(err?.message || err).slice(0, 200)}`);
      }
    }
  };

  return api;
}

export { json, fail };
