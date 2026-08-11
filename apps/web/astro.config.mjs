// @ts-check
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

/** @type {import("@tf/shared").SiteConfig} */
const site = JSON.parse(
  readFileSync(resolve(repoRoot, "config", "site.json"), "utf8"),
);

export default defineConfig({
  site: site.origin,
  // 1ツール = 1ページの静的生成。/t/<slug>/ で配信する。
  output: "static",
  build: { format: "directory" },
  trailingSlash: "always",
  compressHTML: true,
  vite: {
    server: {
      // packages/tools/ 配下の .astro / core.ts を dev サーバから読めるようにする
      fs: { allow: [repoRoot] },
    },
  },
});
