-- ============================================================
-- iptv-radio-panel · D1 数据库结构
-- 幂等：所有语句均可重复执行
-- ============================================================

-- ---------- 频道主表 ----------
CREATE TABLE IF NOT EXISTS channels (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL DEFAULT 'iptv',      -- iptv | radio
  name            TEXT NOT NULL,
  stream_url      TEXT NOT NULL,
  logo_url        TEXT,
  country         TEXT,
  country_code    TEXT,
  language        TEXT,
  category        TEXT,
  band            TEXT,                              -- FM | AM | SW | NULL
  source          TEXT NOT NULL DEFAULT 'custom',    -- iptv-org | radio-browser | custom
  subscription_id TEXT,
  extra           TEXT,                              -- JSON 扩展（tvg-id / 码率 / 标签 ...）
  is_active       INTEGER NOT NULL DEFAULT 1,
  updated_at      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_channels_kind      ON channels(kind, is_active);
CREATE INDEX IF NOT EXISTS idx_channels_kind_name ON channels(kind, is_active, name);
CREATE INDEX IF NOT EXISTS idx_channels_country   ON channels(country_code, kind, is_active);
CREATE INDEX IF NOT EXISTS idx_channels_category  ON channels(category, kind, is_active);
CREATE INDEX IF NOT EXISTS idx_channels_band      ON channels(band, kind, is_active);
CREATE INDEX IF NOT EXISTS idx_channels_source    ON channels(source);
CREATE INDEX IF NOT EXISTS idx_channels_updated   ON channels(updated_at);

-- ---------- 全文索引（FTS5；不可用时查询层自动回退 LIKE） ----------
CREATE VIRTUAL TABLE IF NOT EXISTS channels_fts USING fts5(
  name, category, content='channels', content_rowid='rowid'
);
CREATE TRIGGER IF NOT EXISTS channels_fts_ai AFTER INSERT ON channels BEGIN
  INSERT INTO channels_fts(rowid, name, category) VALUES (new.rowid, new.name, new.category);
END;
CREATE TRIGGER IF NOT EXISTS channels_fts_ad AFTER DELETE ON channels BEGIN
  INSERT INTO channels_fts(channels_fts, rowid, name, category)
  VALUES ('delete', old.rowid, old.name, old.category);
END;
CREATE TRIGGER IF NOT EXISTS channels_fts_au AFTER UPDATE ON channels BEGIN
  INSERT INTO channels_fts(channels_fts, rowid, name, category)
  VALUES ('delete', old.rowid, old.name, old.category);
  INSERT INTO channels_fts(rowid, name, category) VALUES (new.rowid, new.name, new.category);
END;

-- ---------- 订阅（M3U） ----------
CREATE TABLE IF NOT EXISTS subscriptions (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  url           TEXT,
  kind          TEXT NOT NULL DEFAULT 'iptv',
  enabled       INTEGER NOT NULL DEFAULT 1,
  channel_count INTEGER NOT NULL DEFAULT 0,
  last_sync_at  INTEGER,
  last_error    TEXT,
  created_at    INTEGER NOT NULL DEFAULT 0
);

-- ---------- 收藏 ----------
CREATE TABLE IF NOT EXISTS favorites (
  channel_id  TEXT PRIMARY KEY,
  kind        TEXT NOT NULL DEFAULT 'iptv',
  name        TEXT NOT NULL,
  stream_url  TEXT NOT NULL,
  logo_url    TEXT,
  country     TEXT,
  category    TEXT,
  band        TEXT,
  created_at  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_favorites_kind ON favorites(kind, created_at);

-- ---------- 播放历史 ----------
CREATE TABLE IF NOT EXISTS history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id  TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'iptv',
  name        TEXT NOT NULL,
  stream_url  TEXT NOT NULL,
  logo_url    TEXT,
  played_at   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_history_played ON history(played_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_channel ON history(channel_id);

-- ---------- EPG 节目单缓存 ----------
CREATE TABLE IF NOT EXISTS epg_programs (
  id          TEXT PRIMARY KEY,              -- channelId:startTs
  channel_id  TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  start_ts    INTEGER NOT NULL,
  stop_ts     INTEGER,
  updated_at  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_epg_channel ON epg_programs(channel_id, start_ts);

-- ---------- 键值元数据（同步游标 / ETag / 缓存） ----------
CREATE TABLE IF NOT EXISTS meta (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at INTEGER NOT NULL DEFAULT 0
);
