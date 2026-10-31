import { all, get, run, batchChunked } from '../index.js';

const COLUMNS = [
  'id',
  'kind',
  'name',
  'stream_url',
  'logo_url',
  'country',
  'country_code',
  'language',
  'category',
  'band',
  'source',
  'subscription_id',
  'extra',
  'is_active',
  'updated_at'
];

const UPSERT_SQL = `
INSERT INTO channels (${COLUMNS.join(',')})
VALUES (${COLUMNS.map(() => '?').join(',')})
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  stream_url = excluded.stream_url,
  logo_url = excluded.logo_url,
  country = excluded.country,
  country_code = excluded.country_code,
  language = excluded.language,
  category = excluded.category,
  band = excluded.band,
  source = excluded.source,
  subscription_id = excluded.subscription_id,
  extra = excluded.extra,
  is_active = 1,
  updated_at = excluded.updated_at
`;

/** 将业务对象转成入库行（缺字段自动补默认值） */
export function toRow(ch, now = Date.now()) {
  return [
    ch.id,
    ch.kind || 'iptv',
    ch.name || '未命名频道',
    ch.stream_url || ch.streamUrl || '',
    ch.logo_url || ch.logoUrl || null,
    ch.country || null,
    (ch.country_code || ch.countryCode || '').toUpperCase() || null,
    ch.language || null,
    ch.category || null,
    ch.band || null,
    ch.source || 'custom',
    ch.subscription_id || ch.subscriptionId || null,
    typeof ch.extra === 'string' ? ch.extra : JSON.stringify(ch.extra || {}),
    ch.is_active == null ? 1 : Number(ch.is_active),
    ch.updated_at || now
  ];
}

/** 批量写入/更新频道 */
export async function upsertMany(env, channels, chunkSize = 80) {
  const rows = channels.filter((c) => c && (c.stream_url || c.streamUrl) && c.id);
  if (!rows.length) return { count: 0 };
  const statements = rows.map((c) => ({ sql: UPSERT_SQL, params: toRow(c) }));
  return batchChunked(env, statements, chunkSize);
}

/** 单条写入/更新 */
export async function upsert(env, channel) {
  await run(env, UPSERT_SQL, toRow(channel));
  return channel;
}

export async function getById(env, id) {
  return get(env, 'SELECT * FROM channels WHERE id = ?', [id]);
}

/** 新增自定义频道（已存在则返回 null） */
export async function create(env, channel) {
  const exists = await getById(env, channel.id);
  if (exists) return null;
  await run(
    env,
    `INSERT INTO channels (${COLUMNS.join(',')}) VALUES (${COLUMNS.map(() => '?').join(',')})`,
    toRow(channel)
  );
  return channel;
}

export async function update(env, id, patch) {
  const current = await getById(env, id);
  if (!current) return null;
  const next = { ...current, ...patch, id, updated_at: Date.now() };
  await run(env, UPSERT_SQL, toRow(next));
  return next;
}

export async function remove(env, id) {
  const res = await run(env, 'DELETE FROM channels WHERE id = ?', [id]);
  await run(env, 'DELETE FROM favorites WHERE channel_id = ?', [id]);
  await run(env, 'DELETE FROM epg_programs WHERE channel_id = ?', [id]);
  return res;
}

export async function removeBySource(env, source) {
  return run(env, 'DELETE FROM channels WHERE source = ?', [source]);
}

export async function removeBySubscription(env, subscriptionId) {
  return run(env, 'DELETE FROM channels WHERE subscription_id = ?', [subscriptionId]);
}

export async function countAll(env, kind) {
  if (!kind) return (await get(env, 'SELECT COUNT(*) AS c FROM channels WHERE is_active = 1'))?.c ?? 0;
  return (
    (await get(env, 'SELECT COUNT(*) AS c FROM channels WHERE is_active = 1 AND kind = ?', [kind]))
      ?.c ?? 0
  );
}

/** 专题关键词：用于「佛经佛法」等聚合模块，匹配频道名 / 分类 / 国家 */
const TOPICS = {
  buddhist: [
    '佛', '佛法', '佛教', '念佛', '诵经', '禅', '净土', '法会', '道场', '法师',
    '寺庙', '寺院', '菩萨', '观音', '地藏', '药师', '弥陀', '心经', '金刚经',
    '大悲咒', '楞严', '华严', '法华', '无量寿', '莲', '梵音', '菩提', '共修',
    '三时系念', '蒙山', '焰口',
    'buddha', 'buddhist', 'buddhism', 'dharma', 'sutra', 'dhammapada', 'lotus',
    'temple', 'monastery', 'zen', 'chant', 'dhamma', 'nikaya', 'vinaya',
    'mahayana', 'theravada', 'vajrayana', 'kannon', 'guanyin', 'amitabha', 'metta', 'mantra'
  ]
};

/** 专题过滤：关键词为内部固定白名单（非用户输入），直接拼入 SQL 字面量，避免超过 D1 每查询 100 参限制 */
function topicClause(topic) {
  const words = TOPICS[topic];
  if (!words || !words.length) return '';
  const parts = words.map((w) => {
    const esc = String(w).replace(/'/g, "''");
    return `(c.name LIKE '%${esc}%' OR c.category LIKE '%${esc}%')`;
  });
  return `(${parts.join(' OR ')})`;
}

function buildWhere(filters) {
  const clauses = ['c.is_active = 1'];
  const params = [];
  const { kind, country, category, band, source, language, subscriptionId, topic } = filters;
  if (kind) {
    clauses.push('c.kind = ?');
    params.push(kind);
  }
  if (country) {
    clauses.push('c.country_code = ?');
    params.push(String(country).toUpperCase());
  }
  if (category) {
    clauses.push('c.category = ?');
    params.push(category);
  }
  if (band) {
    clauses.push('c.band = ?');
    params.push(String(band).toUpperCase());
  }
  if (source) {
    clauses.push('c.source = ?');
    params.push(source);
  }
  if (language) {
    clauses.push('c.language = ?');
    params.push(language);
  }
  if (subscriptionId) {
    clauses.push('c.subscription_id = ?');
    params.push(subscriptionId);
  }
  if (topic && TOPICS[topic]) {
    const tc = topicClause(topic);
    if (tc) clauses.push(tc);
  }
  return { whereSql: clauses.join(' AND '), params };
}

const SORTS = {
  name: 'c.name COLLATE NOCASE ASC',
  country: 'c.country COLLATE NOCASE ASC, c.name COLLATE NOCASE ASC',
  updated: 'c.updated_at DESC',
  random: 'RANDOM()'
};

/**
 * 频道列表（支持关键词 + 多维筛选 + 分页）
 * 关键词优先走 FTS5，异常自动回退 LIKE，保证 FTS 不可用时功能不中断。
 */
export async function list(env, filters = {}) {
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(Math.max(1, Number(filters.pageSize) || 60), 200);
  const offset = (page - 1) * pageSize;
  const { whereSql, params } = buildWhere(filters);
  const orderBy = SORTS[filters.sort] || SORTS.name;
  const q = (filters.q || '').trim();

  if (q) {
    const match = buildFtsQuery(q);
    const ftsSql = `
      SELECT c.* FROM channels c
      JOIN (SELECT rowid FROM channels_fts WHERE channels_fts MATCH ?) f ON f.rowid = c.rowid
      WHERE ${whereSql}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`;
    try {
      return await all(env, ftsSql, [match, ...params, pageSize, offset]);
    } catch {
      /* FTS 不可用或语法异常 → 回退 LIKE */
    }
    const like = `%${q}%`;
    return all(
      env,
      `SELECT * FROM channels c
       WHERE ${whereSql} AND (c.name LIKE ? OR c.category LIKE ? OR c.country LIKE ?)
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, like, like, like, pageSize, offset]
    );
  }

  return all(
    env,
    `SELECT * FROM channels c WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
}

/** 列表总数（与 list 条件保持一致） */
export async function count(env, filters = {}) {
  const { whereSql, params } = buildWhere(filters);
  const q = (filters.q || '').trim();
  if (q) {
    const match = buildFtsQuery(q);
    try {
      const row = await get(
        env,
        `SELECT COUNT(*) AS c FROM channels c
         JOIN (SELECT rowid FROM channels_fts WHERE channels_fts MATCH ?) f ON f.rowid = c.rowid
         WHERE ${whereSql}`,
        [match, ...params]
      );
      return row?.c ?? 0;
    } catch {
      /* 回退 */
    }
    const like = `%${q}%`;
    const row = await get(
      env,
      `SELECT COUNT(*) AS c FROM channels c
       WHERE ${whereSql} AND (c.name LIKE ? OR c.category LIKE ? OR c.country LIKE ?)`,
      [...params, like, like, like]
    );
    return row?.c ?? 0;
  }
  const row = await get(env, `SELECT COUNT(*) AS c FROM channels c WHERE ${whereSql}`, params);
  return row?.c ?? 0;
}

function buildFtsQuery(q) {
  const tokens = q
    .replace(/["'*]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  if (!tokens.length) return '""';
  return tokens.map((t) => `"${t}"*`).join(' OR ');
}

/** 筛选项聚合（国家 / 分类 / 波段） */
export async function facets(env, kind) {
  const params = [];
  let where = 'WHERE is_active = 1';
  if (kind) {
    where += ' AND kind = ?';
    params.push(kind);
  }
  const [countries, categories, bands] = await Promise.all([
    all(
      env,
      `SELECT country_code AS value, COALESCE(country, country_code) AS label, COUNT(*) AS count
       FROM channels ${where} AND country_code IS NOT NULL AND country_code <> ''
       GROUP BY country_code, country ORDER BY count DESC LIMIT 300`,
      params
    ),
    all(
      env,
      `SELECT category AS value, category AS label, COUNT(*) AS count
       FROM channels ${where} AND category IS NOT NULL AND category <> ''
       GROUP BY category ORDER BY count DESC LIMIT 200`,
      params
    ),
    all(
      env,
      `SELECT band AS value, band AS label, COUNT(*) AS count
       FROM channels ${where} AND band IS NOT NULL AND band <> ''
       GROUP BY band ORDER BY count DESC LIMIT 20`,
      params
    )
  ]);
  return { countries, categories, bands };
}

/** 按国家聚合同步游标用：已入库的国家代码 */
export async function distinctCountries(env, kind = 'iptv') {
  const rows = await all(
    env,
    `SELECT country_code FROM channels WHERE kind = ? AND country_code IS NOT NULL AND country_code <> '' GROUP BY country_code`,
    [kind]
  );
  return rows.map((r) => r.country_code);
}
