/**
 * 全局配置：统一读取环境变量 / vars，避免各模块硬编码。
 * 所有值都有默认值，新增开关只需改这里。
 */
const DEFAULTS = {
  APP_TITLE: 'Global IPTV & Radio',
  DEFAULT_PAGE_SIZE: 60,
  MAX_PAGE_SIZE: 200,
  IPTV_INDEX_URL: 'https://iptv-org.github.io/iptv/index.m3u',
  IPTV_COUNTRIES_URL: 'https://iptv-org.github.io/api/countries.json',
  IPTV_SYNC_COUNTRIES_PER_RUN: 24,
  RADIO_BROWSER_API: 'https://de1.api.radio-browser.info',
  RADIO_SYNC_PAGES_PER_RUN: 10,
  RADIO_SYNC_PAGE_SIZE: 500,
  EPG_BASE_URL: 'https://iptv-org.github.io/epg/guides',
  EPG_TTL_SECONDS: 21600,
  PROXY_MAX_URL_LENGTH: 2048,
  USER_AGENT: 'iptv-radio-panel/1.0',
  HISTORY_KEEP: 100
};

const NUMBER_KEYS = new Set([
  'DEFAULT_PAGE_SIZE',
  'MAX_PAGE_SIZE',
  'IPTV_SYNC_COUNTRIES_PER_RUN',
  'RADIO_SYNC_PAGES_PER_RUN',
  'RADIO_SYNC_PAGE_SIZE',
  'EPG_TTL_SECONDS',
  'PROXY_MAX_URL_LENGTH',
  'HISTORY_KEEP'
]);

export function getConfig(env = {}) {
  const out = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    const raw = env[key];
    if (raw === undefined || raw === null || raw === '') continue;
    out[key] = NUMBER_KEYS.has(key) ? Number(raw) || DEFAULTS[key] : String(raw);
  }
  return out;
}

/** 分页参数规范化 */
export function pageParams(url, cfg) {
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const requested = Number(url.searchParams.get('pageSize')) || cfg.DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(Math.max(1, requested), cfg.MAX_PAGE_SIZE);
  return { page, pageSize };
}

export const KINDS = { IPTV: 'iptv', RADIO: 'radio' };
export const BANDS = ['FM', 'AM', 'SW'];
export const SOURCES = {
  IPTV_ORG: 'iptv-org',
  RADIO_BROWSER: 'radio-browser',
  CUSTOM: 'custom'
};
