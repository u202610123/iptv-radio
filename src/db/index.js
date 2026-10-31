/**
 * D1 访问封装层
 * 只在这里接触 env.DB，上层（repositories）统一调用本模块，便于后期替换存储实现。
 */

/** 执行查询并返回结果集 */
export async function all(env, sql, params = []) {
  const { results } = await env.DB.prepare(sql).bind(...params).all();
  return results || [];
}

/** 执行查询并返回首行 */
export async function get(env, sql, params = []) {
  const row = await env.DB.prepare(sql).bind(...params).first();
  return row || null;
}

/** 执行写操作 */
export async function run(env, sql, params = []) {
  return env.DB.prepare(sql).bind(...params).run();
}

/**
 * 批量执行（D1 无交互式事务，batch 提供原子提交）
 * @param {Array<{sql: string, params?: any[]}>} statements
 */
export async function batch(env, statements) {
  if (!statements.length) return { count: 0 };
  const prepared = statements.map((s) => env.DB.prepare(s.sql).bind(...(s.params || [])));
  return env.DB.batch(prepared);
}

/**
 * 分批批量提交，避免单次 batch 过大触发 D1 限制
 * @param {Array<{sql: string, params?: any[]}>} statements
 * @param {number} chunkSize
 */
export async function batchChunked(env, statements, chunkSize = 100) {
  let affected = 0;
  for (let i = 0; i < statements.length; i += chunkSize) {
    const slice = statements.slice(i, i + chunkSize);
    try {
      await batch(env, slice);
      affected += slice.length;
    } catch (err) {
      // 单批失败时逐条重试，跳过仍失败的行，保证同步任务可以续跑
      for (const s of slice) {
        try {
          await run(env, s.sql, s.params || []);
          affected += 1;
        } catch {
          /* ignore single row failure */
        }
      }
    }
  }
  return { count: affected };
}

/** 标量查询（COUNT 等） */
export async function scalar(env, sql, params = [], fallback = 0) {
  const row = await get(env, sql, params);
  if (!row) return fallback;
  const val = Object.values(row)[0];
  return typeof val === 'number' ? val : Number(val ?? fallback);
}
