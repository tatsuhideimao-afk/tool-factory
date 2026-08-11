/**
 * 05-deploy — Web版の公開（仕様 5.5）
 *
 *  1. Astro でビルド（sitemap.xml もこのとき再生成される）
 *  2. Cloudflare Pages へ `wrangler pages deploy`
 *  3. data/tools.json の deployed_at / web.url を更新
 *
 * Pages のビルド回数上限（月500回）に当てないため、1日1回まとめて実行する前提。
 * CLOUDFLARE_API_TOKEN が無い場合はビルドまでで止まり、成果物の確認だけ行う（--dry-run 相当）。
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { REPO_ROOT, WEB_DIST_DIR, loadLedger, loadSiteConfig, saveLedger } from "@tf/shared/node";
import { webUrlFor } from "@tf/shared";
import { info, optionalEnv, warn } from "./lib/log.ts";

const STEP = "05-deploy";

function run(command: string, args: string[]): number {
  info(STEP, `$ ${command} ${args.join(" ")}`);
  const res = spawnSync(command, args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: process.env,
  });
  return res.status ?? 1;
}

/**
 * Google の sitemap ping エンドポイント（/ping?sitemap=）は 2023年6月に廃止済み。
 * 叩いても何も起きないので送らない。robots.txt の Sitemap 行と
 * Search Console での初回登録（手動・1回だけ）で十分クロールされる。
 */
function sitemapNotice(origin: string): void {
  info(
    STEP,
    `sitemap: ${origin}/sitemap.xml を robots.txt で通知済み。` +
      `Search Console への登録は初回1回だけ手動で行うこと（ping API は廃止済みのため送信しない）。`,
  );
}

function main(): void {
  const site = loadSiteConfig();

  if (run("pnpm", ["run", "build"]) !== 0) {
    throw new Error("ビルドに失敗しました。デプロイを中止します。");
  }
  if (!existsSync(WEB_DIST_DIR)) {
    throw new Error(`ビルド成果物が見つかりません: ${WEB_DIST_DIR}`);
  }

  const token = optionalEnv("CLOUDFLARE_API_TOKEN");
  const accountId = optionalEnv("CLOUDFLARE_ACCOUNT_ID");
  const project = optionalEnv("CF_PAGES_PROJECT") ?? site.pagesProject;

  if (!token || !accountId) {
    warn(
      STEP,
      "CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID が未設定のため、デプロイはスキップしました（ビルドのみ実施）。",
    );
    sitemapNotice(site.origin);
    return;
  }

  const status = run("pnpm", [
    "dlx",
    "wrangler@4",
    "pages",
    "deploy",
    WEB_DIST_DIR,
    `--project-name=${project}`,
    "--branch=main",
    "--commit-dirty=true",
  ]);
  if (status !== 0) throw new Error("wrangler pages deploy に失敗しました");

  const deployedAt = new Date().toISOString();
  const ledger = loadLedger().map((entry) =>
    entry.lifecycle === "retired"
      ? entry
      : {
          ...entry,
          web: {
            ...entry.web,
            url: webUrlFor(site.origin, entry.slug),
            deployed_at: deployedAt,
          },
        },
  );
  saveLedger(ledger);
  info(STEP, `台帳を更新しました（deployed_at=${deployedAt}）`);
  sitemapNotice(site.origin);
}

main();
