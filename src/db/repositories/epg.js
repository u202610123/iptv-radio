import { all, run, batchChunked } from '../index.js';

/** 写入节目单（同频道先清后写） */
export async function replaceForChannel(env, channelId, programs, now = Date.now()) {
  await run(env, 'DELETE FROM epg_programs WHERE channel_id = ?', [channelId]);
  if (!programs.length) return { count: 0 };
  const statements = programs.map((p) => ({
    sql: `INSERT INTO epg_programs (id, channel_id, title, description, start_ts, stop_ts, updated_at)
          VALUES (?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title, description = excluded.description,
            stop_ts = excluded.stop_ts, updated_at = excluded.updated_at`,
    params: [
      `${channelId}:${p.start_ts}`,
      channelId,
      p.title || '未知节目',
      p.description || null,
      p.start_ts,
      p.stop_ts || null,
      now
    ]
  }));
  return batchChunked(env, statements, 100);
}

/** 当前及之后播出的节目 */
export async function upcoming(env, channelId, limit = 12, from = Date.now()) {
  return all(
    env,
    `SELECT * FROM epg_programs WHERE channel_id = ? AND (stop_ts IS NULL OR stop_ts >= ?)
     ORDER BY start_ts ASC LIMIT ?`,
    [channelId, from, limit]
  );
}

/** 当前正在播出的节目 */
export async function current(env, channelId, now = Date.now()) {
  const rows = await all(
    env,
    `SELECT * FROM epg_programs
     WHERE channel_id = ? AND start_ts <= ? AND (stop_ts IS NULL OR stop_ts >= ?)
     ORDER BY start_ts DESC LIMIT 1`,
    [channelId, now, now]
  );
  return rows[0] || null;
}

/** 缓存新鲜度（秒） */
export async function freshness(env, channelId) {
  const rows = await all(
    env,
    'SELECT MAX(updated_at) AS u FROM epg_programs WHERE channel_id = ?',
    [channelId]
  );
  const updated = rows[0]?.u || 0;
  return { updated_at: updated, ageSeconds: Math.floor((Date.now() - updated) / 1000) };
}

export async function clearChannel(env, channelId) {
  await run(env, 'DELETE FROM epg_programs WHERE channel_id = ?', [channelId]);
}

export async function clearAll(env) {
  await run(env, 'DELETE FROM epg_programs');
}
