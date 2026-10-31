import { badRequest } from '../../lib/http.js';
import { proxyStream } from '../../services/proxy.js';

/** GET /api/proxy?url=...&ref=...&ua=...&rewrite=0 */
export async function stream({ env, request, query }) {
  const target = query.get('url');
  if (!target) return badRequest('缺少 url 参数');
  return proxyStream(env, target, request, {
    referer: query.get('ref') || undefined,
    userAgent: query.get('ua') || undefined,
    rewrite: query.get('rewrite')
  });
}
