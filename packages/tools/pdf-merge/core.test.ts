import { PDFDocument, StandardFonts } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { countPages, mergePdfs, parsePageRange } from "./core.ts";

/** テスト用に「1」「2」…と書かれたNページのPDFを作る */
async function makePdf(pageCount: number, label = "P"): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pageCount; i++) {
    const page = doc.addPage([200, 200]);
    page.drawText(`${label}${i}`, { x: 20, y: 100, size: 24, font });
  }
  return doc.save();
}

describe("parsePageRange", () => {
  it("空文字は全ページ", () => {
    expect(parsePageRange("", 3)).toEqual([0, 1, 2]);
  });

  it("単一ページを解釈する", () => {
    expect(parsePageRange("2", 5)).toEqual([1]);
  });

  it("範囲を展開する", () => {
    expect(parsePageRange("1-3", 5)).toEqual([0, 1, 2]);
  });

  it("複数の指定をカンマで結合する", () => {
    expect(parsePageRange("1,3-4", 5)).toEqual([0, 2, 3]);
  });

  it("終端省略は最終ページまで", () => {
    expect(parsePageRange("4-", 5)).toEqual([3, 4]);
  });

  it("始端省略は1ページ目から", () => {
    expect(parsePageRange("-2", 5)).toEqual([0, 1]);
  });

  it("逆順の範囲でページを反転できる", () => {
    expect(parsePageRange("3-1", 5)).toEqual([2, 1, 0]);
  });

  it("範囲外を拒否する", () => {
    expect(() => parsePageRange("9", 5)).toThrow(/範囲外/);
  });

  it("0ページ目を拒否する", () => {
    expect(() => parsePageRange("0", 5)).toThrow(/1以上/);
  });

  it("解釈できない式を拒否する", () => {
    expect(() => parsePageRange("abc", 5)).toThrow(/解釈/);
  });
});

describe("mergePdfs", () => {
  let a: Uint8Array;
  let b: Uint8Array;

  beforeAll(async () => {
    a = await makePdf(3, "A");
    b = await makePdf(2, "B");
  });

  it("ページ数が合算される", async () => {
    const out = await mergePdfs([
      { name: "a.pdf", bytes: a },
      { name: "b.pdf", bytes: b },
    ]);
    expect(await countPages(out)).toBe(5);
  });

  it("ページ範囲を尊重する", async () => {
    const out = await mergePdfs([
      { name: "a.pdf", bytes: a, pageRange: "2-3" },
      { name: "b.pdf", bytes: b, pageRange: "1" },
    ]);
    expect(await countPages(out)).toBe(3);
  });

  it("1ファイルだけでも通る", async () => {
    const out = await mergePdfs([{ name: "a.pdf", bytes: a }]);
    expect(await countPages(out)).toBe(3);
  });

  it("有効なPDFヘッダを出力する", async () => {
    const out = await mergePdfs([{ name: "a.pdf", bytes: a }]);
    expect(new TextDecoder().decode(out.slice(0, 5))).toBe("%PDF-");
  });

  it("タイトルを設定できる", async () => {
    const out = await mergePdfs([{ name: "a.pdf", bytes: a }], {
      title: "統合資料",
    });
    const doc = await PDFDocument.load(out);
    expect(doc.getTitle()).toBe("統合資料");
  });

  it("ファイル未選択を拒否する", async () => {
    await expect(mergePdfs([])).rejects.toThrow(/選ばれて/);
  });

  it("壊れたPDFはファイル名付きで失敗する", async () => {
    const junk = new TextEncoder().encode("not a pdf");
    await expect(
      mergePdfs([{ name: "broken.pdf", bytes: junk }]),
    ).rejects.toThrow(/broken\.pdf/);
  });
});
