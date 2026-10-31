import { all, run, batchChunked } from '../index.js';

/**
 * 写入节目单（优化：无变化不写）
 * 原逻辑每次过期都先删后全量重插，哪怕节目单没变也烧掉一批 D1 写入。
 * 这里先读回现有节目，比对标题/描述/起止时间，完全一致时直接跳过。
 */
export async function replaceForChannel(env, channelId, programs, now = Date.now()) {
  if (!programs.length) {
    await run(env, 'DELETE FROM epg_programs WHERE channel_id = ?', [channelId]);
    return { count: 0 };
  }
  try {
    const existing = await all(
      env,
      'SELECT title, description, start_ts, stop_ts FROM epg_programs WHERE channel_id = ? ORDER BY start_ts ASC',
      [channelId]
    );
    const same =
      existing.length === programs.length &&
      existing.every(
        (r, i) =>
          r.title === (programs[i].title || '未知节目') &&
          (r.description ?? null) === (programs[i].description || null) &&
          r.start_ts === programs[i].start_ts &&
          (r.stop_ts ?? null) === (programs[i].stop_ts || null)
      );
    if (same) return { count: programs.length, skippedUnchanged: true };
  } catch {
    /* 读失败时回退到原先清后写，保证节目单不中断 */
  }
  await run(env, 'DELETE FROM epg_programs WHERE channel_id = ?', [channelId]);
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
