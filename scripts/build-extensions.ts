/**
 * Chrome拡張パッケージのビルド。
 *
 * packages/tools/<slug>/ext/ を build/ext/<slug>/ に組み立て、可能なら ZIP まで作る。
 * popup.ts は ../core.ts を import しているので、esbuild でバンドルして
 * 「ロジックはWeb版と共有」という制約（仕様 5.3）を保ったまま単体で動く形にする。
 *
 * Phase 1 では公開しない。テンプレートが壊れていないことを CI で確認するために動かす。
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { BUILD_DIR, REPO_ROOT, TOOLS_SRC_DIR, listToolSlugs } from "@tf/shared/node";
import { info, warn } from "./lib/log.ts";

const STEP = "build-ext";
const OUT_ROOT = resolve(BUILD_DIR, "ext");
const SHARED_POPUP_CSS = resolve(REPO_ROOT, "scripts", "templates", "popup.css");

export async function buildExtension(slug: string): Promise<string> {
  const srcDir = resolve(TOOLS_SRC_DIR, slug, "ext");
  const outDir = resolve(OUT_ROOT, slug);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(resolve(outDir, "icons"), { recursive: true });

  await build({
    entryPoints: [resolve(srcDir, "popup.ts")],
    outfile: resolve(outDir, "popup.js"),
    bundle: true,
    format: "esm",
    target: "chrome120",
    minify: true,
    sourcemap: false,
    logLevel: "silent",
  });

  copyFileSync(resolve(srcDir, "manifest.json"), resolve(outDir, "manifest.json"));
  copyFileSync(resolve(srcDir, "popup.html"), resolve(outDir, "popup.html"));

  const ownCss = resolve(srcDir, "popup.css");
  copyFileSync(
    existsSync(ownCss) ? ownCss : SHARED_POPUP_CSS,
    resolve(outDir, "popup.css"),
  );

  const iconDir = resolve(BUILD_DIR, "assets", slug);
  for (const size of [16, 48, 128] as const) {
    const icon = resolve(iconDir, `icon-${size}.png`);
    if (!existsSync(icon)) {
      throw new Error(
        `アイコンがありません: ${icon}（先に \`pnpm exec tsx scripts/04-assets.ts\` を実行してください）`,
      );
    }
    copyFileSync(icon, resolve(outDir, "icons", `icon-${size}.png`));
  }

  return outDir;
}

function zip(slug: string, dir: string): void {
  const res = spawnSync("zip", ["-qr", resolve(OUT_ROOT, `${slug}.zip`), "."], {
    cwd: dir,
    encoding: "utf8",
  });
  if (res.error || res.status !== 0) {
    warn(STEP, `zip コマンドが使えないため ${slug}.zip は作りませんでした（${dir} を手動で圧縮してください）`);
    return;
  }
  info(STEP, `${slug}.zip を作成しました`);
}

async function main(): Promise<void> {
  mkdirSync(OUT_ROOT, { recursive: true });
  for (const slug of listToolSlugs()) {
    const extDir = resolve(TOOLS_SRC_DIR, slug, "ext");
    if (!existsSync(resolve(extDir, "manifest.json"))) {
      warn(STEP, `ext/ が無いのでスキップします: ${slug}`);
      continue;
    }
    const outDir = await buildExtension(slug);
    info(STEP, `拡張を組み立てました: ${outDir}`);
    zip(slug, outDir);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
