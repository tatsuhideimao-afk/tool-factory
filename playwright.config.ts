import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright が管理する Chromium を使わず、既に用意されたバイナリを使いたい環境向け
 * （例: /opt/pw-browsers/chromium が置かれた CI コンテナ）。
 * 未設定なら通常どおり `playwright install` したブラウザを使う。
 */
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

/**
 * 品質ゲート3: 実際にページを開いて代表入力→期待出力を確認する。
 * `pnpm build` 済みの静的サイトを preview サーバで配信して叩く。
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:4321",
    trace: "on-first-retry",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm --filter @tf/web preview --host 127.0.0.1 --port 4321",
        url: "http://127.0.0.1:4321",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(chromiumPath
          ? { launchOptions: { executablePath: chromiumPath } }
          : {}),
      },
    },
  ],
});
