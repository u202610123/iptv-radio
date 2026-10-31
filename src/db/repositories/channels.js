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

/**
 * 批量写入/更新频道（优化：无变化不写）
 * 原逻辑每次同步都全量重写，哪怕数据没变也计入 D1 写入行数，是写爆免费
 * 额度的主要原因之一。这里先按 id 批量读回现有行，只写新增或字段有变化
 * 的行；读的额度（免费 500 万行/天）远比写（10 万行/天）宽松。
 */
export async function upsertMany(env, channels, chunkSize = 80) {
  const rows = channels.filter((c) => c && (c.stream_url || c.streamUrl) && c.id);
  if (!rows.length) return { count: 0 };
  const changed = [];
  for (let i = 0; i < rows.length; i += 100) {
    const slice = rows.slice(i, i + 100);
    const placeholders = slice.map(() => '?').join(',');
    let existing = [];
    try {
      existing = await all(
        env,
        `SELECT id, name, stream_url, logo_url, country, country_code, language, category, band, source, subscription_id, extra FROM channels WHERE id IN (${placeholders})`,
        slice.map((c) => c.id)
      );
    } catch {
      existing = [];
    }
    const byId = new Map(existing.map((r) => [r.id, r]));
    for (const c of slice) {
      const row = toRow(c);
      const old = byId.get(c.id);
      if (!old) {
        changed.push(c);
        continue;
      }
      // toRow 顺序：id, kind, name, stream_url, logo_url, country, country_code,
      // language, category, band, source, subscription_id, extra, is_active, updated_at
      const same =
        old.name === row[2] &&
        old.stream_url === row[3] &&
        (old.logo_url ?? null) === (row[4] ?? null) &&
        (old.country ?? null) === (row[5] ?? null) &&
        (old.country_code ?? null) === (row[6] ?? null) &&
        (old.language ?? null) === (row[7] ?? null) &&
        (old.category ?? null) === (row[8] ?? null) &&
        (old.band ?? null) === (row[9] ?? null) &&
        old.source === row[10] &&
        (old.subscription_id ?? null) === (row[11] ?? null) &&
        (old.extra ?? '{}') === row[12];
      if (!same) changed.push(c);
    }
  }
  if (!changed.length) return { count: 0, skippedUnchanged: rows.length };
  const statements = changed.map((c) => ({ sql: UPSERT_SQL, params: toRow(c) }));
  const res = await batchChunked(env, statements, chunkSize);
  return { ...res, skippedUnchanged: rows.length - changed.length };
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

/** 某订阅下的全部频道 id（订阅同步做差量删除时用，只读一列，不读全行） */
export async function idsBySubscription(env, subscriptionId) {
  const rows = await all(env, 'SELECT id FROM channels WHERE subscription_id = ?', [subscriptionId]);
  return rows.map((r) => r.id);
}

/** 按 id 批量删除（仅用于订阅同步中真正消失的台，不再全删全插） */
export async function removeByIds(env, ids) {
  if (!ids.length) return { count: 0 };
  let count = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const slice = ids.slice(i, i + 100);
    const placeholders = slice.map(() => '?').join(',');
    await run(env, `DELETE FROM channels WHERE id IN (${placeholders})`, slice);
    await run(env, `DELETE FROM favorites WHERE channel_id IN (${placeholders})`, slice);
    await run(env, `DELETE FROM epg_programs WHERE channel_id IN (${placeholders})`, slice);
    count += slice.length;
  }
  return { count };
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
    '净空', '华藏', '净宗', '弘化', '悟道', '讲经', '说法', '开示', '禅修',
    '藏传', '南传', '佛光山', '法鼓山', '慈济', '大爱',
    'buddha', 'buddhist', 'buddhism', 'dharma', 'sutra', 'dhammapada', 'lotus',
    'temple', 'monastery', 'zen', 'chant', 'chanting', 'dhamma', 'nikaya', 'vinaya',
    'mahayana', 'theravada', 'vajrayana', 'kannon', 'guanyin', 'amitabha', 'metta', 'mantra',
    'meditation', 'mindfulness', 'tibetan', 'pali', 'nirvana', 'sangha'
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

/**
 * 优化：专题二次筛选与去重（只在 topic 查询时走内存路径，佛教专题仅 74 条量级）
 * 问题根源：SQL LIKE 是子串匹配，'zen' 会命中 Citizen / Plzen / Concertzender，
 * 'chant' 会命中 Chante France；且同名不同源的频道 id 不同，列表里会重复出现。
 * 规则：
 *  - 强词（buddha / dharma / 佛 / 佛教 / 念佛 …）命中即保留，得 3 分；
 *  - 弱词（zen / chant / lotus / temple / mantra / 禅）必须按词边界命中才保留，
 *    得 2 分，子串命中（如 Citizen、Chante）直接排除；
 *  - 同 kind、同归一化名只保留第一条（优先强词高分、名字短的），实现页头
 *    承诺的“同名多源切换”在列表层面的去重，详情里仍可多源。
 */
const TOPIC_STRONG = [
  'buddha', 'buddhist', 'buddhism', 'dharma', 'dhamma', 'dhammapada',
  'mahayana', 'theravada', 'vajrayana', 'nikaya', 'vinaya',
  '佛', '佛教', '佛法', '念佛', '诵经', '法师', '寺庙', '寺院', '菩萨',
  '观音', '地藏', '药师', '弥陀', '心经', '金刚经', '大悲咒', '楞严',
  '华严', '法华', '无量寿', '菩提', '共修', '三时系念', '蒙山', '焰口', '法会', '道场',
  '净空', '华藏', '净宗', '弘化', '悟道', '讲经', '说法', '开示', '禅修',
  '藏传', '南传', '佛光山', '法鼓山', '慈济', '大爱'
];
const TOPIC_WEAK_ASCII = ['zen', 'chant', 'chanting', 'lotus', 'temple', 'monastery', 'mantra', 'metta', 'kannon', 'guanyin', 'amitabha', 'sutra', 'meditation', 'mindfulness', 'tibetan', 'pali', 'nirvana', 'sangha'];
// 地名黑名单：单字“佛”会把佛山/佛冈地方台放进来；只有当名字里除“佛”外
// 没有其他强词信号时，才按地名排除。
const TOPIC_PLACE_EXCLUSIONS = ['佛山', '佛冈'];

function topicExtraBlob(row) {
  let extra = row.extra;
  if (typeof extra === 'string') {
    try { extra = JSON.parse(extra); } catch { extra = {}; }
  }
  const tags = Array.isArray(extra?.tags) ? extra.tags.join(' ') : '';
  return `${tags} ${extra?.homepage || ''} ${row.stream_url || ''}`;
}

function hasStrongOtherThanFo(blob) {
  const lower = blob.toLowerCase();
  return TOPIC_STRONG.some((w) => w !== '佛' && lower.includes(w.toLowerCase()));
}

function topicScore(row) {
  const nameCat = `${row.name || ''} ${row.category || ''}`;
  // 打分看名字 + 分类 + 标签 + 主页 + 流地址：华藏系（hwadzan/amtb）
  // 很多条名字本身是中性的“多元文化台”，只有来源域名能证明它是佛教内容。
  const blob = `${nameCat} ${topicExtraBlob(row)}`;
  const lower = blob.toLowerCase();
  if (lower.includes('hwadzan') || lower.includes('amtb')) return 3;
  for (const w of TOPIC_STRONG) {
    if (lower.includes(w.toLowerCase())) return 3;
  }
  for (const w of TOPIC_WEAK_ASCII) {
    if (new RegExp(`\\b${w}\\b`, 'i').test(blob)) return 2;
  }
  if (blob.includes('禅')) return 2;
  return 0;
}

export function normalizeChannelName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\[(geo-blocked|not 24\/7|24\/7)\]/gi, '')
    .replace(/\(?\b\d{3,4}p\b\)?/gi, '')
    .replace(/\(?\b\d{3,4}i\b\)?/gi, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 对专题候选行打分、排除弱子串误伤、按 kind+归一化名去重、按分排序 */
export function filterTopicRows(rows) {
  const seen = new Set();
  const kept = [];
  for (const row of rows) {
    const nameCat = `${row.name || ''} ${row.category || ''}`;
    // 地名排除：佛山/佛冈地方台只有单字“佛”信号时排除
    if (TOPIC_PLACE_EXCLUSIONS.some((place) => nameCat.includes(place)) && !hasStrongOtherThanFo(nameCat)) continue;
    const score = topicScore(row);
    if (score <= 0) continue;
    // 种类纠正：华藏系视频流（hwadzan/amtb + .m3u8）本是电视直播，却因来自
    // radio-browser 被记成 radio/FM；专题里直接纠正为 iptv，这样播放器
    // 才会用 <video> + hls.js 播，而不是用 Audio 播视频流。去重键用纠正后
    // 的 kind，避免同名条目纠正后又在电视区重复出现。
    let out = { ...row, _topicScore: score };
    const stream = String(row.stream_url || '').toLowerCase();
    const extraBlob = topicExtraBlob(row).toLowerCase();
    if (row.kind === 'radio' && stream.includes('.m3u8') && (extraBlob.includes('hwadzan') || extraBlob.includes('amtb'))) {
      out = { ...out, kind: 'iptv', band: null };
    }
    const key = `${out.kind || ''}:${normalizeChannelName(out.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(out);
  }
  kept.sort((a, b) => b._topicScore - a._topicScore || String(a.name).localeCompare(String(b.name)));
  return kept.map(({ _topicScore, ...row }) => row);
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

  // 专题查询（无关键词时）：先用 SQL 宽匹配取候选，再在内存里打分/去重/分页，
  // 否则 LIKE 子串误伤和同名重复会直接出现在分页结果里。
  if (!q && filters.topic && TOPICS[filters.topic]) {
    const candidates = await all(env, `SELECT * FROM channels c WHERE ${whereSql}`, params);
    return filterTopicRows(candidates).slice(offset, offset + pageSize);
  }

  if (q) {
    // 中文搜索：FTS5 unicode61 分词对中文连续词不可靠（实测“净空/讲经/
    // 念佛”返回 0 条，而“华藏”能返回），中文查询直接走 LIKE；非中文
    // 查询仍先走 FTS，但 FTS 返回空结果时也回退 LIKE，避免“有数据却
    // 搜不到”的假阴性。
    const isCjk = /[\u4e00-\u9fff]/.test(q);
    if (!isCjk) {
      const match = buildFtsQuery(q);
      const ftsSql = `
      SELECT c.* FROM channels c
      JOIN (SELECT rowid FROM channels_fts WHERE channels_fts MATCH ?) f ON f.rowid = c.rowid
      WHERE ${whereSql}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`;
      try {
        const rows = await all(env, ftsSql, [match, ...params, pageSize, offset]);
        if (rows.length) return rows;
        /* FTS 空结果 → 继续回退 LIKE */
      } catch {
        /* FTS 不可用或语法异常 → 回退 LIKE */
      }
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
  // 与 list 的专题路径保持一致：总数 = 打分去重后的条数，不是 SQL 宽匹配数。
  if (!q && filters.topic && TOPICS[filters.topic]) {
    const candidates = await all(env, `SELECT * FROM channels c WHERE ${whereSql}`, params);
    return filterTopicRows(candidates).length;
  }
  if (q) {
    const isCjk = /[\u4e00-\u9fff]/.test(q);
    if (!isCjk) {
      const match = buildFtsQuery(q);
      try {
        const row = await get(
          env,
          `SELECT COUNT(*) AS c FROM channels c
           JOIN (SELECT rowid FROM channels_fts WHERE channels_fts MATCH ?) f ON f.rowid = c.rowid
           WHERE ${whereSql}`,
          [match, ...params]
        );
        if (row?.c) return row.c;
        /* FTS 空结果 → 继续回退 LIKE */
      } catch {
        /* 回退 */
      }
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
