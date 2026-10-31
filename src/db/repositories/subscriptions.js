import { all, get, run } from '../index.js';

export async function list(env) {
  return all(env, 'SELECT * FROM subscriptions ORDER BY created_at DESC');
}

export async function getById(env, id) {
  return get(env, 'SELECT * FROM subscriptions WHERE id = ?', [id]);
}

export async function create(env, sub) {
  const now = Date.now();
  await run(
    env,
    `INSERT INTO subscriptions (id, name, url, kind, enabled, channel_count, last_sync_at, last_error, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      sub.id,
      sub.name,
      sub.url || null,
      sub.kind || 'iptv',
      sub.enabled == null ? 1 : Number(sub.enabled),
      0,
      null,
      null,
      now
    ]
  );
  return getById(env, sub.id);
}

export async function update(env, id, patch) {
  const current = await getById(env, id);
  if (!current) return null;
  const next = { ...current, ...patch, id };
  await run(
    env,
    `UPDATE subscriptions SET name = ?, url = ?, kind = ?, enabled = ?, channel_count = ?,
            last_sync_at = ?, last_error = ?
     WHERE id = ?`,
    [
      next.name,
      next.url,
      next.kind,
      Number(next.enabled),
      Number(next.channel_count || 0),
      next.last_sync_at ?? null,
      next.last_error ?? null,
      id
    ]
  );
  return getById(env, id);
}

export async function remove(env, id) {
  await run(env, 'DELETE FROM subscriptions WHERE id = ?', [id]);
  await run(env, 'DELETE FROM channels WHERE subscription_id = ?', [id]);
  return true;
}

export async function markSynced(env, id, count, error = null) {
  await run(env, 'UPDATE subscriptions SET last_sync_at = ?, channel_count = ?, last_error = ? WHERE id = ?', [
    Date.now(),
    count,
    error,
    id
  ]);
}

export async function enabledList(env) {
  return all(env, 'SELECT * FROM subscriptions WHERE enabled = 1 ORDER BY created_at DESC');
}
