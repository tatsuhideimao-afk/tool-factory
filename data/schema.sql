-- data/metrics.sqlite のスキーマ（仕様 4.3）。
-- 06-measure が起動時に必ずこのDDLを流す（IF NOT EXISTS なので冪等）。

CREATE TABLE IF NOT EXISTS daily_metrics (
  date            TEXT NOT NULL,            -- YYYY-MM-DD（UTC基準の計測日）
  slug            TEXT NOT NULL,
  channel         TEXT NOT NULL,            -- 'web' | 'ext'
  pageviews       INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  ext_users       INTEGER DEFAULT 0,
  ext_rating      REAL,
  revenue_jpy     INTEGER DEFAULT 0,
  PRIMARY KEY (date, slug, channel)
);

-- 07-report がサイト全体UUを引くときに使う
CREATE INDEX IF NOT EXISTS idx_daily_metrics_date ON daily_metrics (date);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_slug ON daily_metrics (slug, date);

-- パイプラインの実行記録。落ちた日を後から特定できるようにする。
CREATE TABLE IF NOT EXISTS runs (
  started_at  TEXT NOT NULL,
  step        TEXT NOT NULL,
  status      TEXT NOT NULL,   -- 'ok' | 'failed' | 'skipped'
  detail      TEXT,
  PRIMARY KEY (started_at, step)
);
