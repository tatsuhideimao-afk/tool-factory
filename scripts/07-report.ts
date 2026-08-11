/**
 * 07-report — 判定と通知（仕様 5.7）
 *
 * 毎日、各ツールについて次を判定して Discord に通知する。
 *
 *  | 経過日数 | 条件                       | アクション                       |
 *  |---------|---------------------------|---------------------------------|
 *  | 30日    | Web版 UU < 100/月          | retired にして sitemap から除外   |
 *  | 30日    | Web版 UU 100〜499/月       | measuring 継続（何もしない）      |
 *  | 30日    | Web版 UU ≧ 500/月          | 拡張版に昇格（手動セットアップ通知）|
 *  | 60日    | サイト全体 UU ≧ 3,000/月   | AdSense申請タスクを通知           |
 *  | 90日    | 拡張のユーザー数 ≧ 500      | Stripe課金導入タスクを通知        |
 *
 * 判定基準は事前に確定させ、後から動かさない（仕様 6.3）。
 */
import type { ToolLedgerEntry } from "@tf/shared";
import { loadLedger, saveLedger } from "@tf/shared/node";
import { openDb, recordRun, siteUniqueVisitors, uniqueVisitorsBySlug } from "./lib/db.ts";
import { info, optionalEnv, warn } from "./lib/log.ts";

const STEP = "07-report";

export const THRESHOLDS = {
  /** 撤退ライン（30日後の月間UU） */
  retireBelow: 100,
  /** 拡張版へ昇格するライン（30日後の月間UU） */
  promoteAtLeast: 500,
  /** AdSense を申請してよいサイト全体の月間UU */
  adsenseAtLeast: 3000,
  /** Stripe 課金導入を検討する拡張ユーザー数 */
  monetizeExtUsersAtLeast: 500,
} as const;

export type Verdict = "retire" | "keep" | "promote" | "too_early";

export interface ToolVerdict {
  slug: string;
  ageDays: number;
  uu30: number;
  verdict: Verdict;
  reason: string;
}

export function daysSince(iso: string, now: Date): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.floor((now.getTime() - then) / 86_400_000);
}

/** 1ツールぶんの判定。副作用なし。 */
export function judgeTool(
  entry: ToolLedgerEntry,
  uu30: number,
  now: Date,
): ToolVerdict {
  const ageDays = daysSince(entry.created_at, now);
  const base = { slug: entry.slug, ageDays, uu30 };

  if (entry.lifecycle === "retired") {
    return { ...base, verdict: "keep", reason: "撤退済み" };
  }
  if (ageDays < 30) {
    return {
      ...base,
      verdict: "too_early",
      reason: `公開${ageDays}日目。30日経つまで判定しない`,
    };
  }
  if (uu30 >= THRESHOLDS.promoteAtLeast) {
    return {
      ...base,
      verdict: "promote",
      reason: `30日UU ${uu30} ≧ ${THRESHOLDS.promoteAtLeast}。拡張版へ昇格`,
    };
  }
  if (uu30 < THRESHOLDS.retireBelow) {
    return {
      ...base,
      verdict: "retire",
      reason: `30日UU ${uu30} < ${THRESHOLDS.retireBelow}。撤退`,
    };
  }
  return {
    ...base,
    verdict: "keep",
    reason: `30日UU ${uu30}。継続して様子を見る`,
  };
}

/** 判定を台帳に反映した新しい配列を返す（元の配列は変更しない）。 */
export function applyVerdicts(
  ledger: readonly ToolLedgerEntry[],
  verdicts: readonly ToolVerdict[],
): ToolLedgerEntry[] {
  const byslug = new Map(verdicts.map((v) => [v.slug, v]));
  return ledger.map((entry) => {
    const v = byslug.get(entry.slug);
    if (!v) return entry;
    if (v.verdict === "retire") {
      return { ...entry, lifecycle: "retired" as const };
    }
    if (v.verdict === "promote" && entry.extension.status === "none") {
      return {
        ...entry,
        lifecycle: "promoted" as const,
        extension: { ...entry.extension, status: "manual_setup_required" as const },
      };
    }
    return entry;
  });
}

export interface SiteVerdicts {
  adsenseReady: boolean;
  monetizeCandidates: string[];
}

export function judgeSite(
  ledger: readonly ToolLedgerEntry[],
  siteUu30: number,
  extUsersBySlug: ReadonlyMap<string, number>,
  now: Date,
): SiteVerdicts {
  const oldest = ledger.reduce(
    (max, e) => Math.max(max, daysSince(e.created_at, now)),
    0,
  );
  return {
    adsenseReady: oldest >= 60 && siteUu30 >= THRESHOLDS.adsenseAtLeast,
    monetizeCandidates: ledger
      .filter(
        (e) =>
          daysSince(e.created_at, now) >= 90 &&
          e.extension.status === "published" &&
          (extUsersBySlug.get(e.slug) ?? 0) >= THRESHOLDS.monetizeExtUsersAtLeast,
      )
      .map((e) => e.slug),
  };
}

export function formatReport(
  verdicts: readonly ToolVerdict[],
  site: SiteVerdicts,
  siteUu30: number,
): string {
  const icon: Record<Verdict, string> = {
    promote: "🚀",
    keep: "・",
    retire: "🗑",
    too_early: "⏳",
  };
  const lines = [
    `**tool-factory 日次レポート** — サイト全体 直近30日UU: ${siteUu30}`,
    "",
    ...verdicts.map(
      (v) => `${icon[v.verdict]} \`${v.slug}\` (${v.ageDays}日) — ${v.reason}`,
    ),
  ];

  const tasks: string[] = [];
  for (const v of verdicts) {
    if (v.verdict === "promote") {
      tasks.push(
        `\`${v.slug}\` の Chrome拡張を新規登録する（ZIP: build/ext/${v.slug}.zip、掲載文: packages/tools/${v.slug}/ext/STORE_LISTING.md）— 所要15分`,
      );
    }
    if (v.verdict === "retire") {
      tasks.push(`\`${v.slug}\` を retired にした（sitemap から自動で外れる）`);
    }
  }
  if (site.adsenseReady) {
    tasks.push(
      `AdSense を申請する（サイト全体UU ${siteUu30} ≧ ${THRESHOLDS.adsenseAtLeast}）`,
    );
  }
  for (const slug of site.monetizeCandidates) {
    tasks.push(`\`${slug}\` に Stripe 課金の導入を検討する（拡張ユーザー数が閾値超え）`);
  }

  if (tasks.length > 0) {
    lines.push("", "**今日やること**", ...tasks.map((t) => `- ${t}`));
  } else {
    lines.push("", "今日やることはありません。");
  }
  return lines.join("\n");
}

async function notifyDiscord(content: string): Promise<void> {
  const url = optionalEnv("DISCORD_WEBHOOK_URL");
  if (!url) {
    warn(STEP, "DISCORD_WEBHOOK_URL が未設定のため通知は標準出力のみです");
    console.log(content);
    return;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Discord のメッセージ上限は2000文字
    body: JSON.stringify({ content: content.slice(0, 1990) }),
  });
  if (!res.ok) {
    throw new Error(`Discord への通知に失敗しました: HTTP ${res.status}`);
  }
  info(STEP, "Discord に通知しました");
}

async function main(): Promise<void> {
  const now = new Date();
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - 30);
  const sinceDate = since.toISOString().slice(0, 10);

  const db = openDb();
  try {
    const ledger = loadLedger();
    const uuBySlug = uniqueVisitorsBySlug(db, sinceDate, "web");
    const extUsers = uniqueVisitorsBySlug(db, sinceDate, "ext");
    const siteUu30 = siteUniqueVisitors(db, sinceDate);

    const verdicts = ledger.map((e) => judgeTool(e, uuBySlug.get(e.slug) ?? 0, now));
    const site = judgeSite(ledger, siteUu30, extUsers, now);

    const updated = applyVerdicts(ledger, verdicts);
    saveLedger(updated);

    const report = formatReport(verdicts, site, siteUu30);
    await notifyDiscord(report);
    recordRun(db, STEP, "ok", `${verdicts.length}件を判定`);
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
