import { all, get, run } from '../index.js';

/** 读取键值（自动 JSON 反序列化） */
export async function getMeta(env, key, fallback = null) {
  const row = await get(env, 'SELECT value FROM meta WHERE key = ?', [key]);
  if (!row || row.value == null) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

/** 写入键值 */
export async function setMeta(env, key, value) {
  const payload = typeof value === 'string' ? value : JSON.stringify(value);
  await run(
    env,
    `INSERT INTO meta (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, payload, Date.now()]
  );
  return value;
}

/** 删除键值 */
export async function delMeta(env, key) {
  await run(env, 'DELETE FROM meta WHERE key = ?', [key]);
}

/** 批量读取（前缀匹配） */
export async function listMeta(env, prefix = '') {
  const rows = await all(env, 'SELECT key, value, updated_at FROM meta WHERE key LIKE ?', [
    `${prefix}%`
  ]);
  return rows.map((r) => {
    let value = r.value;
    try {
      value = JSON.parse(r.value);
    } catch {
      /* 保留原始字符串 */
    }
    return { key: r.key, value, updated_at: r.updated_at };
  });
}
