/**
 * 参数与 URL 安全校验
 * 重点：流代理必须防止 SSRF（内网 / 本机 / 云元数据地址一律拒绝）
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'metadata',
  'metadata.google.internal',
  'instance-data'
]);

const BLOCKED_IPV4 = [
  ['169.254.169.254', '169.254.169.254'], // 云元数据
  ['100.100.100.200', '100.100.100.200'], // 阿里云元数据
  ['10.0.0.0', '10.255.255.255'],
  ['127.0.0.0', '127.255.255.255'],
  ['172.16.0.0', '172.31.255.255'],
  ['192.168.0.0', '192.168.255.255'],
  ['169.254.0.0', '169.254.255.255'],
  ['0.0.0.0', '0.0.255.255'],
  ['100.64.0.0', '100.127.255.255']
];

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function inIpv4Range(ip) {
  const value = ipv4ToInt(ip);
  for (const [start, end] of BLOCKED_IPV4) {
    if (value >= ipv4ToInt(start) && value <= ipv4ToInt(end)) return true;
  }
  return false;
}

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

function isPrivateHost(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return true;
  if (IPV4_RE.test(host)) return inIpv4Range(host);
  if (host === '::1' || host === '::' || host.startsWith('fe80') || host.startsWith('fc') || host.startsWith('fd')) {
    return true;
  }
  // IPv4-mapped IPv6，例如 ::ffff:127.0.0.1
  const mapped = host.match(/::ffff:(\d+\.\d+\.\d+\.\d+)/);
  if (mapped) return inIpv4Range(mapped[1]);
  return false;
}

/**
 * 校验可作为上游的 URL
 * @returns {{ok: true, url: URL} | {ok: false, reason: string}}
 */
export function validateUpstreamUrl(raw, { maxLength = 2048, allowHttp = true } = {}) {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, reason: 'URL 不能为空' };
  if (raw.length > maxLength) return { ok: false, reason: 'URL 超长' };
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: 'URL 格式非法' };
  }
  const protocol = url.protocol.toLowerCase();
  if (protocol !== 'https:' && !(allowHttp && protocol === 'http:')) {
    return { ok: false, reason: '仅支持 http / https 协议' };
  }
  if (isPrivateHost(url.hostname)) return { ok: false, reason: '禁止访问内网或本机地址' };
  return { ok: true, url };
}

/** 非空字符串校验 */
export function requireString(value, field, maxLength = 512) {
  if (typeof value !== 'string' || !value.trim()) return { ok: false, reason: `${field} 不能为空` };
  if (value.length > maxLength) return { ok: false, reason: `${field} 超长` };
  return { ok: true, value: value.trim() };
}

/** 取首个非空值 */
export function pick(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

/** 生成稳定 ID（避免特殊字符破坏 URL 路径） */
export function slugifyId(input, fallback = 'item') {
  const slug = String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
  return slug || fallback;
}
