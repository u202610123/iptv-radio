/** 后端接口客户端：统一解包 { ok, data } 结构并抛出可读错误 */

async function request(path, options = {}) {
  const { params, method = 'GET', body } = options;
  const url = new URL(path, location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    });
  }
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url.toString(), init);
  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`接口返回异常（${res.status}）`);
  }
  if (!res.ok || payload?.ok === false) {
    const message = payload?.error?.message || `请求失败（${res.status}）`;
    const error = new Error(message);
    error.code = payload?.error?.code || res.status;
    throw error;
  }
  return payload?.data ?? payload;
}

const enc = encodeURIComponent;

export const api = {
  health: () => request('/api/health'),

  channels: (params) => request('/api/channels', { params }),
  channel: (id) => request(`/api/channels/${enc(id)}`),
  channelFacets: (kind) => request('/api/channels/facets', { params: { kind } }),
  addChannel: (payload) => request('/api/channels', { method: 'POST', body: payload }),
  updateChannel: (id, patch) => request(`/api/channels/${enc(id)}`, { method: 'PUT', body: patch }),
  removeChannel: (id) => request(`/api/channels/${enc(id)}`, { method: 'DELETE' }),
  playChannel: (id) => request(`/api/channels/${enc(id)}/play`, { method: 'POST' }),

  stations: (params) => request('/api/radio/stations', { params }),
  radioFacets: () => request('/api/radio/facets'),

  epg: (channelId, force = false) =>
    request(`/api/epg/${enc(channelId)}`, { params: { force: force ? '1' : undefined, limit: 16 } }),
  clearEpg: (channelId) => request(`/api/epg/${enc(channelId)}`, { method: 'DELETE' }),

  favorites: (kind) => request('/api/favorites', { params: { kind } }),
  addFavorite: (channel) => request('/api/favorites', { method: 'POST', body: channel }),
  removeFavorite: (channelId) => request(`/api/favorites/${enc(channelId)}`, { method: 'DELETE' }),

  history: (limit = 100) => request('/api/history', { params: { limit } }),
  addHistory: (channel) => request('/api/history', { method: 'POST', body: channel }),
  clearHistory: () => request('/api/history', { method: 'DELETE' }),

  subscriptions: () => request('/api/subscriptions'),
  addSubscription: (payload) => request('/api/subscriptions', { method: 'POST', body: payload }),
  updateSubscription: (id, patch) => request(`/api/subscriptions/${enc(id)}`, { method: 'PUT', body: patch }),
  removeSubscription: (id) => request(`/api/subscriptions/${enc(id)}`, { method: 'DELETE' }),
  syncSubscription: (id) => request(`/api/subscriptions/${enc(id)}/sync`, { method: 'POST' }),

  syncStatus: () => request('/api/sync'),
  triggerSync: (target = 'all') => request('/api/sync', { method: 'POST', body: { target } }),

  /** 生成代理播放地址 */
  proxyUrl: (streamUrl, rewrite = true) =>
    `/api/proxy?url=${enc(streamUrl)}${rewrite ? '&rewrite=1' : '&rewrite=0'}`
};
