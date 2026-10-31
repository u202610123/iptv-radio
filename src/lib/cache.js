import { getMeta, setMeta } from '../db/repositories/meta.js';

/**
 * 基于 meta 表的 TTL 缓存
 * 命中直接返回；未命中调用 producer 并把结果写回。
 */
export async function cached(env, key, ttlSeconds, producer) {
  const now = Date.now();
  const entry = await getMeta(env, key, null);
  if (entry && typeof entry === 'object' && entry.expires_at > now) {
    return { value: entry.value, hit: true, ageSeconds: Math.floor((now - entry.updated_at) / 1000) };
  }
  const value = await producer();
  await setMeta(env, key, { value, updated_at: now, expires_at: now + ttlSeconds * 1000 });
  return { value, hit: false, ageSeconds: 0 };
}

/** 使某个缓存失效 */
export async function invalidate(env, key) {
  await setMeta(env, key, { value: null, updated_at: 0, expires_at: 0 });
}
