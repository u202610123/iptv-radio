import { all, get, run } from '../index.js';

/** 收藏列表 */
export async function list(env, kind) {
  if (kind) {
    return all(env, 'SELECT * FROM favorites WHERE kind = ? ORDER BY created_at DESC', [kind]);
  }
  return all(env, 'SELECT * FROM favorites ORDER BY created_at DESC');
}

export async function has(env, channelId) {
  const row = await get(env, 'SELECT channel_id FROM favorites WHERE channel_id = ?', [channelId]);
  return !!row;
}

export async function add(env, channel) {
  await run(
    env,
    `INSERT INTO favorites (channel_id, kind, name, stream_url, logo_url, country, category, band, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(channel_id) DO UPDATE SET
       name = excluded.name, stream_url = excluded.stream_url, logo_url = excluded.logo_url,
       country = excluded.country, category = excluded.category, band = excluded.band`,
    [
      channel.id,
      channel.kind || 'iptv',
      channel.name,
      channel.stream_url || channel.streamUrl,
      channel.logo_url || channel.logoUrl || null,
      channel.country || null,
      channel.category || null,
      channel.band || null,
      Date.now()
    ]
  );
  return true;
}

export async function remove(env, channelId) {
  await run(env, 'DELETE FROM favorites WHERE channel_id = ?', [channelId]);
  return true;
}

/** 收藏 ID 集合，便于批量标记 */
export async function idSet(env) {
  const rows = await all(env, 'SELECT channel_id FROM favorites');
  return new Set(rows.map((r) => r.channel_id));
}
