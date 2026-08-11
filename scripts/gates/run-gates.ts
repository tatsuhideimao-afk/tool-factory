/**
 * 品質ゲート（仕様 5.3）。3つ全部通らなければデプロイしない。
 *
 *   1. tsc --noEmit
 *   2. vitest run
 *   3. Playwright で実際にページを開いて代表入力→期待出力を確認
 *
 * 03-generate はコードを生成したあと必ずこれを呼ぶ。
 * 落ちても人間の確認待ちでパイプラインを止めない（呼び出し側が次の企画へ進む）。
 */
import { spawnSync } from "node:child_process";
import { REPO_ROOT } from "@tf/shared/node";
import { error, info } from "../lib/log.ts";

const STEP = "gates";

export interface GateResult {
  name: string;
  ok: boolean;
  durationMs: number;
  output: string;
}

function run(name: string, command: string, args: string[]): GateResult {
  const startedAt = Date.now();
  info(STEP, `${name}: ${command} ${args.join(" ")}`);
  const res = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: process.env,
    // pnpm 経由だとシェル依存の解決が要る環境があるため
    shell: process.platform === "win32",
  });
  const output = `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();
  const ok = res.status === 0;
  const durationMs = Date.now() - startedAt;
  if (!ok) {
    error(STEP, `${name} が失敗しました (exit=${res.status})`);
    console.error(output.slice(-4000));
  } else {
    info(STEP, `${name} OK (${(durationMs / 1000).toFixed(1)}s)`);
  }
  return { name, ok, durationMs, output };
}

/** 3つのゲートを順に実行する。落ちた時点で後続はスキップする（無駄な時間を使わない）。 */
export function runGates(): GateResult[] {
  const results: GateResult[] = [];

  results.push(run("typecheck", "pnpm", ["run", "typecheck"]));
  if (!results[0]!.ok) return results;

  results.push(run("unit-test", "pnpm", ["run", "test"]));
  if (!results[1]!.ok) return results;

  // e2e はビルド済みの静的サイトに対して実行する
  const build = run("build", "pnpm", ["run", "build"]);
  results.push(build);
  if (!build.ok) return results;

  results.push(run("e2e", "pnpm", ["exec", "playwright", "test"]));
  return results;
}

export function gatesPassed(results: readonly GateResult[]): boolean {
  return results.length > 0 && results.every((r) => r.ok);
}

function main(): void {
  const results = runGates();
  const passed = gatesPassed(results);
  const summary = results
    .map((r) => `${r.ok ? "PASS" : "FAIL"} ${r.name}`)
    .join(" / ");
  info(STEP, summary);
  if (!passed) {
    error(STEP, "品質ゲート未通過のためデプロイしてはいけません");
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
