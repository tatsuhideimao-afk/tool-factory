/**
 * 06-measure — 計測（仕様 5.6）
 *
 * Web: Cloudflare Web Analytics の GraphQL API から前日分の pageviews / visits を
 *      ツール別（requestPath 別）に取得し、data/metrics.sqlite に書き込む。
 *
 * 拡張のユーザー数取得（ストアページのスクレイピング）は Phase 2 で追加する。
 * Phase 1 のスコープは Web版のみ。
 */
import { uniqueVisitorsBySlug, openDb, recordRun, upsertDaily } from "./lib/db.ts";
import type { DailyMetric } from "./lib/db.ts";
import { listToolSlugs } from "@tf/shared/node";
import { info, requireEnv, warn } from "./lib/log.ts";

const STEP = "06-measure";
const GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

/** 前日（UTC）の YYYY-MM-DD */
export function previousDate(now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** "/t/json-format/" -> "json-format"。ツールページ以外は null。 */
export function slugFromPath(path: string): string | null {
  const m = /^\/t\/([a-z0-9-]+)\/?$/.exec(path);
  return m?.[1] ?? null;
}

interface RumGroup {
  count: number;
  sum: { visits: number };
  dimensions: { requestPath: string };
}

interface GraphQLResponse {
  data: {
    viewer: {
      accounts: { rumPageloadEventsAdaptiveGroups: RumGroup[] }[];
    } | null;
  } | null;
  errors?: { message: string }[];
}

const QUERY = `
query ToolFactoryDaily($accountTag: String!, $siteTag: String!, $date: Date!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      rumPageloadEventsAdaptiveGroups(
        filter: { siteTag: $siteTag, date_geq: $date, date_leq: $date }
        limit: 1000
        orderBy: [count_DESC]
      ) {
        count
        sum { visits }
        dimensions { requestPath }
      }
    }
  }
}`;

export async function fetchDailyRum(
  accountTag: string,
  siteTag: string,
  date: string,
  apiToken: string,
): Promise<RumGroup[]> {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: QUERY,
      variables: { accountTag, siteTag, date },
    }),
  });
  if (!res.ok) {
    throw new Error(`Analytics API がHTTP ${res.status} を返しました: ${await res.text()}`);
  }
  const json = (await res.json()) as GraphQLResponse;
  if (json.errors?.length) {
    throw new Error(`Analytics API エラー: ${json.errors.map((e) => e.message).join(", ")}`);
  }
  return json.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups ?? [];
}

async function main(): Promise<void> {
  const date = process.argv[2] ?? previousDate();
  const db = openDb();

  const accountTag = requireEnv("CLOUDFLARE_ACCOUNT_ID", "Analytics のアカウント指定に必要");
  const siteTag = requireEnv("CF_WEB_ANALYTICS_SITE_TAG", "計測対象サイトの指定に必要");
  const apiToken = requireEnv("CF_ANALYTICS_API_TOKEN", "Analytics GraphQL API の認証に必要");

  try {
    const groups = await fetchDailyRum(accountTag, siteTag, date, apiToken);
    const known = new Set(listToolSlugs());

    // 同一 slug に複数パス（末尾スラッシュ有無など）が来るので集約する
    const byslug = new Map<string, { pageviews: number; visits: number }>();
    for (const g of groups) {
      const slug = slugFromPath(g.dimensions.requestPath);
      if (!slug) continue;
      if (!known.has(slug)) {
        warn(STEP, `台帳に無い slug のアクセスを検出: ${slug}`);
      }
      const acc = byslug.get(slug) ?? { pageviews: 0, visits: 0 };
      acc.pageviews += g.count;
      acc.visits += g.sum.visits;
      byslug.set(slug, acc);
    }

    const rows: DailyMetric[] = [...byslug].map(([slug, v]) => ({
      date,
      slug,
      channel: "web" as const,
      pageviews: v.pageviews,
      // Cloudflare Web Analytics の visits は「セッション数」。
      // Cookieless なので厳密なユニークユーザーではない点に注意（判定は同一指標で通す）。
      unique_visitors: v.visits,
    }));

    // アクセスが0のツールも0行として残す（欠測と0を区別できるようにする）
    for (const slug of known) {
      if (!byslug.has(slug)) {
        rows.push({ date, slug, channel: "web", pageviews: 0, unique_visitors: 0 });
      }
    }

    upsertDaily(db, rows);
    recordRun(db, STEP, "ok", `${date}: ${rows.length}行`);

    const total = rows.reduce((s, r) => s + (r.unique_visitors ?? 0), 0);
    info(STEP, `${date} を記録しました（${rows.length}ツール / 合計${total}訪問）`);

    const last30 = new Date(`${date}T00:00:00Z`);
    last30.setUTCDate(last30.getUTCDate() - 29);
    const summary = uniqueVisitorsBySlug(db, last30.toISOString().slice(0, 10));
    for (const [slug, uu] of [...summary].sort((a, b) => b[1] - a[1])) {
      info(STEP, `直近30日 ${slug}: ${uu}`);
    }
  } catch (err) {
    recordRun(db, STEP, "failed", err instanceof Error ? err.message : String(err));
    throw err;
  } finally {
    db.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
