/** metrics.sqlite への薄いラッパ。スキーマ適用と upsert だけを持つ。 */
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { METRICS_DB, METRICS_SCHEMA } from "@tf/shared/node";

export type Channel = "web" | "ext";

export interface DailyMetric {
  date: string;
  slug: string;
  channel: Channel;
  pageviews?: number;
  unique_visitors?: number;
  ext_users?: number;
  ext_rating?: number | null;
  revenue_jpy?: number;
}

export function openDb(path: string = METRICS_DB): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = DELETE"); // WAL だと -wal ファイルが commit 対象になるので使わない
  db.exec(readFileSync(METRICS_SCHEMA, "utf8"));
  return db;
}

export function upsertDaily(
  db: Database.Database,
  rows: readonly DailyMetric[],
): void {
  const stmt = db.prepare(`
    INSERT INTO daily_metrics
      (date, slug, channel, pageviews, unique_visitors, ext_users, ext_rating, revenue_jpy)
    VALUES
      (@date, @slug, @channel, @pageviews, @unique_visitors, @ext_users, @ext_rating, @revenue_jpy)
    ON CONFLICT (date, slug, channel) DO UPDATE SET
      pageviews       = excluded.pageviews,
      unique_visitors = excluded.unique_visitors,
      ext_users       = excluded.ext_users,
      ext_rating      = excluded.ext_rating,
      revenue_jpy     = excluded.revenue_jpy
  `);
  const run = db.transaction((items: readonly DailyMetric[]) => {
    for (const r of items) {
      stmt.run({
        date: r.date,
        slug: r.slug,
        channel: r.channel,
        pageviews: r.pageviews ?? 0,
        unique_visitors: r.unique_visitors ?? 0,
        ext_users: r.ext_users ?? 0,
        ext_rating: r.ext_rating ?? null,
        revenue_jpy: r.revenue_jpy ?? 0,
      });
    }
  });
  run(rows);
}

export function recordRun(
  db: Database.Database,
  step: string,
  status: "ok" | "failed" | "skipped",
  detail = "",
): void {
  db.prepare(
    `INSERT OR REPLACE INTO runs (started_at, step, status, detail) VALUES (?, ?, ?, ?)`,
  ).run(new Date().toISOString(), step, status, detail);
}

/** 直近 days 日の slug 別ユニークユーザー合計 */
export function uniqueVisitorsBySlug(
  db: Database.Database,
  sinceDate: string,
  channel: Channel = "web",
): Map<string, number> {
  const rows = db
    .prepare(
      `SELECT slug, SUM(unique_visitors) AS uu
         FROM daily_metrics
        WHERE date >= ? AND channel = ?
        GROUP BY slug`,
    )
    .all(sinceDate, channel) as { slug: string; uu: number | null }[];
  return new Map(rows.map((r) => [r.slug, r.uu ?? 0]));
}

/** 直近 days 日のサイト全体ユニークユーザー合計（日次UUの単純合計＝重複あり） */
export function siteUniqueVisitors(
  db: Database.Database,
  sinceDate: string,
): number {
  const row = db
    .prepare(
      `SELECT SUM(unique_visitors) AS uu FROM daily_metrics WHERE date >= ? AND channel = 'web'`,
    )
    .get(sinceDate) as { uu: number | null } | undefined;
  return row?.uu ?? 0;
}
