import { describe, expect, it } from "vitest";
import type { GeneratedFiles } from "./03-generate.ts";
import { auditGeneratedCode, createdToday } from "./03-generate.ts";

function goodFiles(over: Partial<GeneratedFiles> = {}): GeneratedFiles {
  return {
    "meta.ts": `import type { ToolMeta } from "@tf/shared";
export const meta: ToolMeta = {
  slug: "text-diff",
  title: "テキスト差分ツール",
  tagline: "2つの文章の違いを行単位で表示します。",
  steps: ["a", "b", "c"],
  keywords: ["差分"],
  createdAt: "2026-08-11T00:00:00Z",
  clientOnly: true,
};`,
    "core.ts": `export function diff(a: string, b: string): string[] {
  return a === b ? [] : [a, b];
}`,
    "core.test.ts": `import { describe, it, expect } from "vitest";
import { diff } from "./core.ts";
describe("diff", () => { it("works", () => { expect(diff("a", "a")).toEqual([]); }); });`,
    "web/index.astro": `---
---
<form class="tool" data-testid="tool-text-diff"></form>
<script>
  import { diff } from "../core.ts";
  console.log(typeof diff);
</script>`,
    "ext/manifest.json": JSON.stringify({
      manifest_version: 3,
      name: "テキスト差分ツール",
      version: "1.0.0",
      description: "差分を表示します",
      action: { default_popup: "popup.html" },
    }),
    "ext/popup.html": `<!doctype html><html lang="ja"><body><p>データは外部に送信されません。</p></body></html>`,
    "ext/popup.ts": `import { diff } from "../core.ts";
console.log(typeof diff);`,
    ...over,
  };
}

describe("auditGeneratedCode", () => {
  it("制約を満たすコードは合格する", () => {
    expect(auditGeneratedCode("text-diff", goodFiles())).toEqual([]);
  });

  it("空ファイルを弾く", () => {
    const problems = auditGeneratedCode("text-diff", goodFiles({ "core.ts": "  " }));
    expect(problems.some((p) => p.includes("空です"))).toBe(true);
  });

  it("外部通信を弾く", () => {
    const problems = auditGeneratedCode(
      "text-diff",
      goodFiles({ "core.ts": `export async function f() { return fetch("/x"); }` }),
    );
    expect(problems.some((p) => p.includes("外部通信"))).toBe(true);
  });

  it("core.ts の DOM 依存を弾く", () => {
    const problems = auditGeneratedCode(
      "text-diff",
      goodFiles({ "core.ts": `export const el = document.body;` }),
    );
    expect(problems.some((p) => p.includes("DOM"))).toBe(true);
  });

  it("core.ts を共有していない拡張を弾く", () => {
    const problems = auditGeneratedCode(
      "text-diff",
      goodFiles({ "ext/popup.ts": `function diff() {} \nconsole.log(diff);` }),
    );
    expect(problems.some((p) => p.includes("ext/popup.ts"))).toBe(true);
  });

  it("core.ts を共有していないWeb版を弾く", () => {
    const problems = auditGeneratedCode(
      "text-diff",
      goodFiles({ "web/index.astro": `<form class="tool"></form>` }),
    );
    expect(problems.some((p) => p.includes("web/index.astro"))).toBe(true);
  });

  it("Manifest V2 を弾く", () => {
    const problems = auditGeneratedCode(
      "text-diff",
      goodFiles({
        "ext/manifest.json": JSON.stringify({ manifest_version: 2, name: "x", version: "1" }),
      }),
    );
    expect(problems.some((p) => p.includes("Manifest V3"))).toBe(true);
  });

  it("<all_urls> を弾く", () => {
    const problems = auditGeneratedCode(
      "text-diff",
      goodFiles({
        "ext/manifest.json": JSON.stringify({
          manifest_version: 3,
          name: "x",
          version: "1",
          host_permissions: ["<all_urls>"],
        }),
      }),
    );
    expect(problems.some((p) => p.includes("all_urls"))).toBe(true);
  });

  it("余分な権限要求を弾く", () => {
    const problems = auditGeneratedCode(
      "text-diff",
      goodFiles({
        "ext/manifest.json": JSON.stringify({
          manifest_version: 3,
          name: "x",
          version: "1",
          permissions: ["tabs"],
        }),
      }),
    );
    expect(problems.some((p) => p.includes("権限"))).toBe(true);
  });

  it("壊れた manifest を弾く", () => {
    const problems = auditGeneratedCode(
      "text-diff",
      goodFiles({ "ext/manifest.json": "{" }),
    );
    expect(problems.some((p) => p.includes("JSON"))).toBe(true);
  });

  it("slug 不一致を弾く", () => {
    const problems = auditGeneratedCode("other-slug", goodFiles());
    expect(problems.some((p) => p.includes("slug"))).toBe(true);
  });

  it("外部送信しない旨の記載が無いポップアップを弾く", () => {
    const problems = auditGeneratedCode(
      "text-diff",
      goodFiles({ "ext/popup.html": "<!doctype html><html><body></body></html>" }),
    );
    expect(problems.some((p) => p.includes("popup.html"))).toBe(true);
  });
});

describe("createdToday", () => {
  const now = new Date("2026-08-11T12:00:00Z");

  it("当日ぶんだけ数える", () => {
    expect(
      createdToday(
        [
          { created_at: "2026-08-11T01:00:00Z" },
          { created_at: "2026-08-11T09:00:00Z" },
          { created_at: "2026-08-10T23:00:00Z" },
        ],
        now,
      ),
    ).toBe(2);
  });

  it("空の台帳では0", () => {
    expect(createdToday([], now)).toBe(0);
  });
});
