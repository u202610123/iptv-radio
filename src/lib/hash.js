/** 轻量哈希：用于生成稳定且短小的频道 ID 后缀 */
export function fnv1a32(input) {
  let hash = 0x811c9dc5;
  const text = String(input || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function shortHash(input) {
  return fnv1a32(input).toString(36);
}

export function randomId(prefix = 'id') {
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${rand}`;
}
