/**
 * 04-assets — 資材生成（仕様 5.4）
 *
 *  - アイコン: 企画名から決定的にSVGを生成（配色は slug のハッシュ）→ sharp で PNG 16/48/128
 *  - OGP画像: 同テンプレート＋タイトル文字を合成、1200×630
 *  - ストア説明文: ext/STORE_LISTING.md（貼り付けるだけで済む形）
 *
 * 外部の画像生成AIは使わない（コスト・再現性・権利の3点で不利なため）。
 * 説明文は ANTHROPIC_API_KEY があれば Anthropic API で作り、無ければ meta.ts から決定的に組み立てる。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { hueFromSlug } from "@tf/shared";
import type { ToolMeta } from "@tf/shared";
import { BUILD_DIR, TOOLS_SRC_DIR, WEB_APP_DIR, listToolSlugs } from "@tf/shared/node";
import { info, optionalEnv, warn } from "./lib/log.ts";
import { loadToolMeta } from "./lib/meta-loader.ts";

const STEP = "04-assets";
const PUBLIC_DIR = resolve(WEB_APP_DIR, "public");
const OG_DIR = resolve(PUBLIC_DIR, "og");
const ICON_BUILD_DIR = resolve(BUILD_DIR, "assets");

function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** 全角を2、半角を1として数えた表示幅で折り返す */
function wrap(text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let current = "";
  let width = 0;
  for (const ch of text) {
    const w = /[\x20-\x7e｡-ﾟ]/.test(ch) ? 1 : 2;
    if (width + w > maxWidth) {
      lines.push(current);
      current = "";
      width = 0;
      if (lines.length === maxLines) return lines;
    }
    current += ch;
    width += w;
  }
  if (current !== "" && lines.length < maxLines) lines.push(current);
  return lines;
}

/** slug から決定的に決まる2色 */
function palette(slug: string): { from: string; to: string; ink: string } {
  const hue = hueFromSlug(slug);
  return {
    from: `hsl(${hue} 70% 46%)`,
    to: `hsl(${(hue + 38) % 360} 72% 34%)`,
    ink: "#ffffff",
  };
}

export function iconSvg(meta: ToolMeta): string {
  const { from, to, ink } = palette(meta.slug);
  const glyph = escapeXml([...meta.title][0] ?? "T");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="26" fill="url(#g)"/>
  <text x="64" y="64" fill="${ink}" font-family="sans-serif" font-size="66" font-weight="700"
        text-anchor="middle" dominant-baseline="central">${glyph}</text>
</svg>
`;
}

export function ogSvg(meta: ToolMeta, siteName: string): string {
  const { from, to, ink } = palette(meta.slug);
  const titleLines = wrap(meta.title, 26, 2);
  const taglineLines = wrap(meta.tagline, 44, 3);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <rect x="60" y="60" width="1080" height="510" rx="28" fill="#ffffff" opacity="0.08"/>
  <g font-family="sans-serif" fill="${ink}">
    ${titleLines
      .map(
        (line, i) =>
          `<text x="110" y="${230 + i * 82}" font-size="70" font-weight="700">${escapeXml(line)}</text>`,
      )
      .join("\n    ")}
    ${taglineLines
      .map(
        (line, i) =>
          `<text x="112" y="${400 + i * 46}" font-size="32" opacity="0.92">${escapeXml(line)}</text>`,
      )
      .join("\n    ")}
    <text x="112" y="560" font-size="28" opacity="0.8">${escapeXml(siteName)}</text>
  </g>
</svg>
`;
}

/** meta.ts だけから決定的にストア説明文を作る（APIキーが無いときのフォールバック） */
export function fallbackDescription(meta: ToolMeta): string {
  return [
    meta.tagline,
    "",
    "【使い方】",
    ...meta.steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    "【データの取り扱い】",
    "処理はすべてお使いのブラウザ（拡張機能）の中で完結します。入力したデータやファイルが外部のサーバへ送信・保存されることはありません。",
    "追加の権限は要求しません。アカウント登録も不要です。",
  ].join("\n");
}

async function generateDescription(meta: ToolMeta): Promise<string> {
  const apiKey = optionalEnv("ANTHROPIC_API_KEY");
  if (!apiKey) {
    warn(STEP, `ANTHROPIC_API_KEY が無いので説明文はテンプレートで生成します: ${meta.slug}`);
    return fallbackDescription(meta);
  }

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 2000,
    output_config: { effort: "low" },
    system:
      "あなたはChrome Web Storeの掲載文を書く担当者です。日本語で、誇張のない事実だけを書きます。絵文字と感嘆符は使いません。",
    messages: [
      {
        role: "user",
        content: [
          "次のツールのストア説明文を書いてください。",
          "",
          `名前: ${meta.title}`,
          `概要: ${meta.tagline}`,
          `使い方: ${meta.steps.join(" / ")}`,
          "",
          "必ず次の3点を含めること:",
          "1. 何ができるかを1文で",
          "2. 使い方を3ステップで",
          "3. データを外部送信しない旨の明記",
          "",
          "出力は説明文の本文のみ。前置き・見出しの装飾・マークダウンの強調記法は不要です。",
        ].join("\n"),
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    warn(STEP, `説明文の生成が拒否されました。テンプレートに切り替えます: ${meta.slug}`);
    return fallbackDescription(meta);
  }
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return text === "" ? fallbackDescription(meta) : text;
}

function storeListing(meta: ToolMeta, description: string, webUrl: string): string {
  return `<!-- AUTO-GENERATED by scripts/04-assets.ts -->
# ${meta.title} — Chrome Web Store 掲載情報

ダッシュボードの各欄にそのまま貼り付けてください。

## 拡張機能名（最大45文字）

${meta.title}

## 概要（最大132文字）

${meta.tagline.slice(0, 132)}

## 詳細な説明

${description}

## カテゴリ

ユーザー補助 / 仕事効率化

## 言語

日本語

## 単一用途の説明（審査で聞かれる項目）

${meta.tagline}

## 権限の正当性

権限は要求していません。拡張機能はポップアップ内でのみ動作し、閲覧中のページにもユーザーのデータにもアクセスしません。

## リモートコードの使用

使用していません。すべてのコードは拡張機能パッケージに同梱されています。

## データ利用の開示

- 収集する情報: なし
- 送信先: なし（外部通信を一切行いません）
- 販売・第三者提供: なし

## プライバシーポリシーURL

${webUrl.replace(/\/t\/.*$/, "/privacy/")}

## Web版URL（掲載欄「ウェブサイト」）

${webUrl}
`;
}

async function main(): Promise<void> {
  const { loadSiteConfig } = await import("@tf/shared/node");
  const site = loadSiteConfig();
  const slugs = listToolSlugs();

  mkdirSync(OG_DIR, { recursive: true });

  // サイト共通のファビコン
  writeFileSync(
    resolve(PUBLIC_DIR, "favicon.svg"),
    iconSvg({
      slug: site.pagesProject,
      title: site.siteName,
      tagline: "",
      steps: ["", "", ""],
      keywords: [],
      createdAt: "",
      clientOnly: true,
    }),
    "utf8",
  );

  for (const slug of slugs) {
    const meta = await loadToolMeta(slug);

    // アイコン（拡張パッケージ用）
    const iconDir = resolve(ICON_BUILD_DIR, slug);
    mkdirSync(iconDir, { recursive: true });
    const icon = Buffer.from(iconSvg(meta));
    for (const size of [16, 48, 128] as const) {
      await sharp(icon)
        .resize(size, size)
        .png({ compressionLevel: 9 })
        .toFile(resolve(iconDir, `icon-${size}.png`));
    }

    // OGP
    await sharp(Buffer.from(ogSvg(meta, site.siteName)))
      .png({ compressionLevel: 9 })
      .toFile(resolve(OG_DIR, `${slug}.png`));

    // ストア掲載文
    const description = await generateDescription(meta);
    writeFileSync(
      resolve(TOOLS_SRC_DIR, slug, "ext", "STORE_LISTING.md"),
      storeListing(meta, description, `${site.origin}/t/${slug}/`),
      "utf8",
    );

    info(STEP, `資材を生成しました: ${slug}`);
  }

  // サイト共通OGP
  await sharp(
    Buffer.from(
      ogSvg(
        {
          slug: site.pagesProject,
          title: site.siteName,
          tagline: "ブラウザだけで完結する無料ツール集",
          steps: ["", "", ""],
          keywords: [],
          createdAt: "",
          clientOnly: true,
        },
        site.siteName,
      ),
    ),
  )
    .png({ compressionLevel: 9 })
    .toFile(resolve(OG_DIR, "site.png"));

  info(STEP, `完了: ${slugs.length}件`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
