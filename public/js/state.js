/** 轻量状态管理：内存状态 + localStorage 持久化偏好 + 订阅通知 */

const STORAGE_KEY = 'iptv-radio-panel:prefs';

const defaults = {
  theme: 'dark',
  useProxy: true,
  lastKind: 'iptv',
  filters: {
    iptv: { q: '', country: '', category: '' },
    radio: { q: '', country: '', band: '' }
  }
};

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaults);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(defaults),
      ...parsed,
      filters: { ...defaults.filters, ...(parsed.filters || {}) }
    };
  } catch {
    return structuredClone(defaults);
  }
}

const prefs = loadPrefs();
const listeners = new Set();

export const store = {
  prefs,
  counts: { iptv: 0, radio: 0 },
  favorites: new Set(),
  current: null, // 当前播放频道
  route: 'iptv',

  setTheme(theme) {
    prefs.theme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = prefs.theme;
    persist();
    emit('theme');
  },

  toggleTheme() {
    store.setTheme(prefs.theme === 'dark' ? 'light' : 'dark');
  },

  setUseProxy(value) {
    prefs.useProxy = !!value;
    persist();
    emit('proxy');
  },

  setFilters(kind, patch) {
    prefs.filters[kind] = { ...prefs.filters[kind], ...patch };
    persist();
    emit('filters');
  },

  getFilters(kind) {
    return prefs.filters[kind] || { q: '', country: '', category: '', band: '' };
  },

  setCounts(counts) {
    store.counts = { ...store.counts, ...counts };
    emit('counts');
  },

  setFavorites(ids) {
    store.favorites = new Set(ids);
    emit('favorites');
  },

  isFavorite(id) {
    return store.favorites.has(id);
  },

  toggleFavoriteLocal(id) {
    if (store.favorites.has(id)) store.favorites.delete(id);
    else store.favorites.add(id);
    emit('favorites');
  },

  setCurrent(channel) {
    store.current = channel;
    emit('current');
  },

  setRoute(route) {
    store.route = route;
    emit('route');
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
};

function emit(event) {
  listeners.forEach((fn) => {
    try {
      fn(event);
    } catch {
      /* 单个订阅者异常不影响其他订阅者 */
    }
  });
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* 隐私模式下忽略 */
  }
}

export function initStore() {
  document.documentElement.dataset.theme = prefs.theme;
  return store;
}
