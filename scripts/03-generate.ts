/**
 * 03-generate — 実装生成（仕様 5.3）
 *
 * Anthropic API に packages/tools/<slug>/ 一式を書かせ、
 * 品質ゲート3種を通ったものだけを残す。落ちたら生成物を丸ごと捨てて次へ進む
 * （人間の確認待ちでパイプラインを止めない）。
 *
 * 使い方:
 *   pnpm generate --slug text-diff --title "テキスト差分ツール" \
 *     --problem "2つの文章の違いを行単位で見たい"
 *   pnpm generate --candidate cand_20260811_0001
 *   pnpm generate ... --dry-run   # 生成のみ。ゲートは走らせない
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { assertSlug } from "@tf/shared";
import type { Candidate } from "@tf/shared";
import {
  REPO_ROOT,
  TOOLS_SRC_DIR,
  listToolSlugs,
  loadCandidates,
  loadLedger,
  loadSiteConfig,
  saveCandidates,
  saveLedger,
} from "@tf/shared/node";
import { gatesPassed, runGates } from "./gates/run-gates.ts";
import { error, info, requireEnv, warn } from "./lib/log.ts";

const STEP = "03-generate";

/** 仕様 5.2: 1日あたり最大2件。スパム扱いを避けるための上限。 */
export const MAX_NEW_TOOLS_PER_DAY = 2;

export interface GenerationRequest {
  slug: string;
  title: string;
  problem: string;
  candidateId: string | null;
}

/** 生成物ファイル一式。キーは packages/tools/<slug>/ からの相対パス。 */
export interface GeneratedFiles {
  "meta.ts": string;
  "core.ts": string;
  "core.test.ts": string;
  "web/index.astro": string;
  "ext/manifest.json": string;
  "ext/popup.html": string;
  "ext/popup.ts": string;
}

const FILE_KEYS = [
  "meta.ts",
  "core.ts",
  "core.test.ts",
  "web/index.astro",
  "ext/manifest.json",
  "ext/popup.html",
  "ext/popup.ts",
] as const satisfies readonly (keyof GeneratedFiles)[];

const OUTPUT_SCHEMA = {
  type: "object",
  properties: Object.fromEntries(
    FILE_KEYS.map((k) => [k, { type: "string", description: `${k} の全文` }]),
  ),
  required: [...FILE_KEYS],
  additionalProperties: false,
} as const;

/**
 * 生成コードの静的検査。仕様の必須制約を機械的に確認する。
 * ここで落ちたものは API を呼び直すより捨てたほうが早い。
 */
export function auditGeneratedCode(
  slug: string,
  files: GeneratedFiles,
): string[] {
  const problems: string[] = [];
  const all = Object.entries(files) as [keyof GeneratedFiles, string][];

  for (const [name, content] of all) {
    if (content.trim() === "") problems.push(`${name} が空です`);
  }

  // 外部APIを呼ばないこと（ランニング0円の維持と権限最小化のため）
  const network = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon)\s*\(/;
  for (const [name, content] of all) {
    if (name.endsWith(".ts") || name.endsWith(".astro")) {
      if (network.test(content)) {
        problems.push(`${name} が外部通信APIを使っています（クライアント内完結が必須）`);
      }
    }
  }

  // core.ts は DOM に触らない（純粋関数であること）
  if (/\b(document|window|localStorage)\b/.test(files["core.ts"])) {
    problems.push("core.ts が DOM/グローバルに依存しています（副作用なし・DOM非依存が必須）");
  }

  // Web版と拡張版が同じ core.ts を使っていること
  if (!/from\s+["']\.\.\/core\.ts["']/.test(files["web/index.astro"])) {
    problems.push("web/index.astro が ../core.ts を import していません");
  }
  if (!/from\s+["']\.\.\/core\.ts["']/.test(files["ext/popup.ts"])) {
    problems.push("ext/popup.ts が ../core.ts を import していません");
  }

  // Manifest V3 / 権限最小化
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(files["ext/manifest.json"]) as Record<string, unknown>;
  } catch {
    problems.push("ext/manifest.json が JSON として壊れています");
    manifest = {};
  }
  if (manifest["manifest_version"] !== 3) {
    problems.push("ext/manifest.json は Manifest V3 でなければなりません");
  }
  const permissions = [
    ...((manifest["permissions"] as string[] | undefined) ?? []),
    ...((manifest["host_permissions"] as string[] | undefined) ?? []),
  ];
  if (permissions.includes("<all_urls>")) {
    problems.push("<all_urls> は使用禁止です");
  }
  if (permissions.length > 0) {
    problems.push(
      `権限 ${permissions.join(", ")} を要求しています。ポップアップ完結型では権限不要です`,
    );
  }

  // meta.ts の整合
  if (!files["meta.ts"].includes(`slug: "${slug}"`)) {
    problems.push(`meta.ts の slug が ${slug} になっていません`);
  }
  if (!files["meta.ts"].includes("clientOnly: true")) {
    problems.push("meta.ts に clientOnly: true がありません");
  }

  // 外部送信しない旨の明記（仕様 5.3 / 5.4）
  const notice = /外部|送信/;
  if (!notice.test(files["ext/popup.html"])) {
    problems.push("ext/popup.html にデータを外部送信しない旨の記載がありません");
  }

  return problems;
}

function buildPrompt(req: GenerationRequest, exampleCore: string): string {
  return [
    `次のWebツールを実装してください。`,
    ``,
    `slug: ${req.slug}`,
    `名前: ${req.title}`,
    `解きたい問題: ${req.problem}`,
    ``,
    `## 生成するファイル`,
    ``,
    `packages/tools/${req.slug}/ 配下の次の7ファイルを、それぞれ全文で出力してください。`,
    FILE_KEYS.map((k) => `- ${k}`).join("\n"),
    ``,
    `## 絶対に守る制約`,
    ``,
    `- core.ts は純粋関数のみ。副作用なし・DOM非依存。document / window / localStorage を参照しない。`,
    `- web/index.astro と ext/popup.ts は、どちらも "../core.ts" から import してロジックを共有する。同じ処理を二重に書かない。`,
    `- fetch / XMLHttpRequest / WebSocket などの外部通信を一切使わない。全処理をブラウザ内で完結させる。`,
    `- 追加の npm パッケージを import しない（標準APIのみ。既存の pdf-lib は例外的に使用可）。`,
    `- ext/manifest.json は Manifest V3。permissions と host_permissions は空（またはキー自体を書かない）。<all_urls> は禁止。`,
    `- ext/popup.html に「データは外部に送信されません」旨を明記する。`,
    `- core.test.ts は vitest。正常系・異常系・境界値を合わせて15件以上書く。import は "./core.ts" とする。`,
    `- meta.ts は次の形にする（steps はちょうど3つ）:`,
    ``,
    "```ts",
    `import type { ToolMeta } from "@tf/shared";`,
    ``,
    `export const meta: ToolMeta = {`,
    `  slug: "${req.slug}",`,
    `  title: "${req.title}",`,
    `  tagline: "何ができるかを1文で",`,
    `  steps: ["手順1", "手順2", "手順3"],`,
    `  keywords: ["検索されそうな語", "..."],`,
    `  createdAt: "${new Date().toISOString()}",`,
    `  clientOnly: true,`,
    `};`,
    "```",
    ``,
    `## UI の書き方（既存ツールと揃える）`,
    ``,
    `- web/index.astro は class="tool" のフォームを1つ持ち、要素に data-testid を付ける。`,
    `- 入出力の textarea、操作ボタン、role="status" の <p class="tool__status"> を持つ。`,
    `- 状態表示は status.dataset.state に "ok" / "error" を入れる。`,
    `- スタイルは BaseLayout の共通クラス（tool / tool__panes / tool__pane / tool__label /`,
    `  tool__controls / tool__check / tool__status / tool__list）を使い、新しいCSSは書かない。`,
    ``,
    `## 参考: 既存ツールの core.ts（書き方の基準）`,
    ``,
    "```ts",
    exampleCore,
    "```",
    ``,
    `日本語のUI・日本語のコメントで書いてください。`,
  ].join("\n");
}

const SYSTEM_PROMPT = [
  "あなたは TypeScript と Astro に習熟したエンジニアです。",
  "ブラウザ内だけで完結する小さなユーティリティを、テスト込みで実装します。",
  "指定されたファイル以外は作らず、指定された制約から外れる実装は行いません。",
  "コードは実際に動くものだけを書き、擬似コードやTODOコメントを残しません。",
].join("\n");

export async function generateFiles(
  req: GenerationRequest,
): Promise<GeneratedFiles> {
  const apiKey = requireEnv("ANTHROPIC_API_KEY", "実装コードの生成に必要");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  const { readFileSync } = await import("node:fs");
  const exampleCore = readFileSync(
    resolve(TOOLS_SRC_DIR, "csv-json", "core.ts"),
    "utf8",
  );

  info(STEP, `Anthropic API に実装を依頼します: ${req.slug}`);
  // 出力が長いので必ずストリーミングで受ける（HTTPタイムアウト回避）
  const stream = client.messages.stream({
    model: "claude-opus-5",
    max_tokens: 32000,
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: OUTPUT_SCHEMA },
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildPrompt(req, exampleCore) }],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new Error(
      `生成が拒否されました（${message.stop_details?.category ?? "不明"}）: ${req.slug}`,
    );
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error(`出力が max_tokens で打ち切られました: ${req.slug}`);
  }

  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  const files = JSON.parse(text) as GeneratedFiles;

  for (const key of FILE_KEYS) {
    if (typeof files[key] !== "string") {
      throw new Error(`生成結果に ${key} がありません`);
    }
  }
  return files;
}

export function writeFiles(slug: string, files: GeneratedFiles): string {
  const dir = resolve(TOOLS_SRC_DIR, slug);
  mkdirSync(resolve(dir, "web"), { recursive: true });
  mkdirSync(resolve(dir, "ext"), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(resolve(dir, name), content.endsWith("\n") ? content : `${content}\n`, "utf8");
  }
  return dir;
}

function regenerateRegistry(): void {
  spawnSync("pnpm", ["run", "gen"], { cwd: REPO_ROOT, stdio: "inherit" });
}

function parseArgs(argv: readonly string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

/** 今日すでに何件作ったか（仕様 5.2 の1日2件上限の判定用） */
export function createdToday(
  ledger: readonly { created_at: string }[],
  now: Date = new Date(),
): number {
  const today = now.toISOString().slice(0, 10);
  return ledger.filter((e) => e.created_at.slice(0, 10) === today).length;
}

function resolveRequest(args: Record<string, string | true>): GenerationRequest {
  const candidateId = typeof args["candidate"] === "string" ? args["candidate"] : null;
  if (candidateId) {
    const candidate = loadCandidates().find((c: Candidate) => c.id === candidateId);
    if (!candidate) throw new Error(`候補が見つかりません: ${candidateId}`);
    const slug = typeof args["slug"] === "string" ? args["slug"] : null;
    if (!slug) throw new Error("--slug も併せて指定してください（候補から slug は決まりません）");
    return {
      slug,
      title: typeof args["title"] === "string" ? args["title"] : candidate.query,
      problem: candidate.problem,
      candidateId,
    };
  }

  const slug = args["slug"];
  const title = args["title"];
  const problem = args["problem"];
  if (typeof slug !== "string" || typeof title !== "string" || typeof problem !== "string") {
    throw new Error("--slug / --title / --problem を指定してください");
  }
  return { slug, title, problem, candidateId: null };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const req = resolveRequest(args);
  assertSlug(req.slug);

  if (listToolSlugs().includes(req.slug)) {
    throw new Error(`既に存在する slug です: ${req.slug}`);
  }

  const ledger = loadLedger();
  const todayCount = createdToday(ledger);
  if (todayCount >= MAX_NEW_TOOLS_PER_DAY) {
    warn(
      STEP,
      `今日は既に${todayCount}件作成済みです（上限${MAX_NEW_TOOLS_PER_DAY}件）。生成を中止します。`,
    );
    return;
  }

  const files = await generateFiles(req);

  const problems = auditGeneratedCode(req.slug, files);
  if (problems.length > 0) {
    error(STEP, `静的検査で不合格:\n - ${problems.join("\n - ")}`);
    process.exitCode = 1;
    return;
  }

  const dir = writeFiles(req.slug, files);
  info(STEP, `生成しました: ${dir}`);
  regenerateRegistry();

  if (args["dry-run"]) {
    info(STEP, "--dry-run のため品質ゲートは実行しません");
    return;
  }

  const results = runGates();
  if (!gatesPassed(results)) {
    error(STEP, `品質ゲート未通過のため生成物を破棄します: ${req.slug}`);
    rmSync(dir, { recursive: true, force: true });
    regenerateRegistry();
    process.exitCode = 1;
    return;
  }

  const site = loadSiteConfig();
  const now = new Date().toISOString();
  saveLedger([
    ...ledger,
    {
      slug: req.slug,
      title: req.title,
      candidate_id: req.candidateId,
      created_at: now,
      web: {
        url: `${site.origin}/t/${req.slug}/`,
        deployed_at: null,
        monetized: false,
      },
      extension: { status: "none", item_id: null, published_at: null },
      lifecycle: "measuring",
    },
  ]);

  if (req.candidateId) {
    saveCandidates(
      loadCandidates().map((c) =>
        c.id === req.candidateId ? { ...c, status: "promoted" as const } : c,
      ),
    );
  }

  info(STEP, `完了: ${req.slug} を台帳に登録しました`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!existsSync(TOOLS_SRC_DIR)) mkdirSync(TOOLS_SRC_DIR, { recursive: true });
  await main();
}
