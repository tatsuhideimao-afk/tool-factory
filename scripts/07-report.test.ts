import { describe, expect, it } from "vitest";
import type { ToolLedgerEntry } from "@tf/shared";
import {
  applyVerdicts,
  daysSince,
  formatReport,
  judgeSite,
  judgeTool,
} from "./07-report.ts";

const NOW = new Date("2026-10-01T00:00:00Z");

function entry(over: Partial<ToolLedgerEntry> = {}): ToolLedgerEntry {
  return {
    slug: "sample",
    title: "サンプル",
    candidate_id: null,
    created_at: "2026-08-01T00:00:00Z", // NOW から61日前
    web: { url: "https://example.com/t/sample/", deployed_at: null, monetized: false },
    extension: { status: "none", item_id: null, published_at: null },
    lifecycle: "measuring",
    ...over,
  };
}

describe("daysSince", () => {
  it("経過日数を数える", () => {
    expect(daysSince("2026-09-01T00:00:00Z", NOW)).toBe(30);
  });

  it("壊れた日付は0扱い", () => {
    expect(daysSince("not-a-date", NOW)).toBe(0);
  });
});

describe("judgeTool", () => {
  it("30日未満は判定を保留する", () => {
    const v = judgeTool(entry({ created_at: "2026-09-20T00:00:00Z" }), 0, NOW);
    expect(v.verdict).toBe("too_early");
  });

  it("UUが100未満なら撤退", () => {
    expect(judgeTool(entry(), 99, NOW).verdict).toBe("retire");
  });

  it("UUが100〜499なら継続", () => {
    expect(judgeTool(entry(), 100, NOW).verdict).toBe("keep");
    expect(judgeTool(entry(), 499, NOW).verdict).toBe("keep");
  });

  it("UUが500以上なら昇格", () => {
    expect(judgeTool(entry(), 500, NOW).verdict).toBe("promote");
  });

  it("撤退済みは再判定しない", () => {
    const v = judgeTool(entry({ lifecycle: "retired" }), 0, NOW);
    expect(v.verdict).toBe("keep");
    expect(v.reason).toContain("撤退済み");
  });
});

describe("applyVerdicts", () => {
  it("撤退判定を lifecycle に反映する", () => {
    const ledger = [entry()];
    const out = applyVerdicts(ledger, [judgeTool(ledger[0]!, 10, NOW)]);
    expect(out[0]!.lifecycle).toBe("retired");
  });

  it("昇格判定で拡張の手動セットアップを立てる", () => {
    const ledger = [entry()];
    const out = applyVerdicts(ledger, [judgeTool(ledger[0]!, 900, NOW)]);
    expect(out[0]!.lifecycle).toBe("promoted");
    expect(out[0]!.extension.status).toBe("manual_setup_required");
  });

  it("既に拡張が公開済みなら状態を巻き戻さない", () => {
    const ledger = [
      entry({ extension: { status: "published", item_id: "abc", published_at: "2026-09-01T00:00:00Z" } }),
    ];
    const out = applyVerdicts(ledger, [judgeTool(ledger[0]!, 900, NOW)]);
    expect(out[0]!.extension.status).toBe("published");
  });

  it("元の配列を書き換えない", () => {
    const ledger = [entry()];
    applyVerdicts(ledger, [judgeTool(ledger[0]!, 10, NOW)]);
    expect(ledger[0]!.lifecycle).toBe("measuring");
  });
});

describe("judgeSite", () => {
  it("60日経過かつ全体UU3000以上で AdSense 申請可", () => {
    expect(judgeSite([entry()], 3000, new Map(), NOW).adsenseReady).toBe(true);
  });

  it("UUが足りなければ申請しない", () => {
    expect(judgeSite([entry()], 2999, new Map(), NOW).adsenseReady).toBe(false);
  });

  it("60日未満なら申請しない", () => {
    const young = entry({ created_at: "2026-09-25T00:00:00Z" });
    expect(judgeSite([young], 99999, new Map(), NOW).adsenseReady).toBe(false);
  });

  it("公開済み拡張のユーザー数が500以上なら課金候補", () => {
    const old = entry({
      created_at: "2026-06-01T00:00:00Z",
      extension: { status: "published", item_id: "x", published_at: "2026-06-10T00:00:00Z" },
    });
    const site = judgeSite([old], 0, new Map([["sample", 500]]), NOW);
    expect(site.monetizeCandidates).toEqual(["sample"]);
  });

  it("未公開の拡張は課金候補にしない", () => {
    const old = entry({ created_at: "2026-06-01T00:00:00Z" });
    const site = judgeSite([old], 0, new Map([["sample", 9999]]), NOW);
    expect(site.monetizeCandidates).toEqual([]);
  });
});

describe("formatReport", () => {
  it("昇格ツールの手動タスクを載せる", () => {
    const v = judgeTool(entry(), 900, NOW);
    const text = formatReport([v], { adsenseReady: false, monetizeCandidates: [] }, 900);
    expect(text).toContain("Chrome拡張を新規登録");
    expect(text).toContain("build/ext/sample.zip");
  });

  it("やることが無い日はその旨を書く", () => {
    const v = judgeTool(entry(), 200, NOW);
    const text = formatReport([v], { adsenseReady: false, monetizeCandidates: [] }, 200);
    expect(text).toContain("今日やることはありません");
  });

  it("AdSense 申請タスクを載せる", () => {
    const v = judgeTool(entry(), 200, NOW);
    const text = formatReport([v], { adsenseReady: true, monetizeCandidates: [] }, 3200);
    expect(text).toContain("AdSense");
  });
});
