import { all, run } from '../index.js';

const KEEP = 100; // 仅保留最近 100 条播放记录

/** 播放历史（倒序） */
export async function list(env, limit = KEEP) {
  return all(env, 'SELECT * FROM history ORDER BY played_at DESC LIMIT ?', [limit]);
}

export async function add(env, channel) {
  await run(
    env,
    `INSERT INTO history (channel_id, kind, name, stream_url, logo_url, played_at)
     VALUES (?,?,?,?,?,?)`,
    [
      channel.id,
      channel.kind || 'iptv',
      channel.name,
      channel.stream_url || channel.streamUrl,
      channel.logo_url || channel.logoUrl || null,
      Date.now()
    ]
  );
  await prune(env);
  return true;
}

/** 裁剪超出上限的历史记录 */
export async function prune(env, keep = KEEP) {
  await run(
    env,
    `DELETE FROM history WHERE id NOT IN (
       SELECT id FROM history ORDER BY played_at DESC LIMIT ?
     )`,
    [keep]
  );
}

export async function clear(env) {
  await run(env, 'DELETE FROM history');
  return true;
}

export async function remove(env, channelId) {
  await run(env, 'DELETE FROM history WHERE channel_id = ?', [channelId]);
  return true;
}
