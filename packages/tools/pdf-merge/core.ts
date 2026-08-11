/**
 * PDF結合のコアロジック。
 * DOM非依存（Uint8Array を受けて Uint8Array を返す）。Web版と拡張版の両方が import する。
 * pdf-lib はブラウザ内で動くので、ファイルは一切外部送信しない。
 */
import { PDFDocument } from "pdf-lib";

export interface PdfSource {
  /** 表示・エラーメッセージ用の名前 */
  name: string;
  bytes: Uint8Array;
  /**
   * 取り出すページ範囲（1始まり、"1-3,5" 形式）。
   * 省略・空文字なら全ページ。
   */
  pageRange?: string;
}

export interface MergeOptions {
  /** 出力PDFの Title メタデータ */
  title?: string;
}

/**
 * "1-3,5,8-" のようなページ範囲式を 0 始まりのインデックス配列に展開する。
 * 重複は取り除かず、書かれた順序をそのまま採用する（並べ替え目的にも使えるようにする）。
 */
export function parsePageRange(
  expression: string,
  pageCount: number,
): number[] {
  const trimmed = expression.trim();
  if (trimmed === "") return Array.from({ length: pageCount }, (_, i) => i);

  const out: number[] = [];
  for (const rawPart of trimmed.split(",")) {
    const part = rawPart.trim();
    if (part === "") continue;
    const m = /^(\d+)?\s*(-)?\s*(\d+)?$/.exec(part);
    if (!m || (m[1] === undefined && m[3] === undefined)) {
      throw new Error(`ページ指定を解釈できません: ${rawPart}`);
    }
    const isRange = m[2] === "-";
    const start = m[1] !== undefined ? Number(m[1]) : 1;
    const end = isRange ? (m[3] !== undefined ? Number(m[3]) : pageCount) : start;

    if (start < 1 || end < 1) throw new Error("ページ番号は1以上で指定してください");
    if (start > pageCount || end > pageCount) {
      throw new Error(
        `ページ番号が範囲外です（このPDFは${pageCount}ページ）: ${rawPart}`,
      );
    }
    if (start <= end) {
      for (let p = start; p <= end; p++) out.push(p - 1);
    } else {
      for (let p = start; p >= end; p--) out.push(p - 1);
    }
  }
  if (out.length === 0) throw new Error("ページが1枚も選ばれていません");
  return out;
}

/** 複数のPDFを順番に結合して1つのPDFバイト列を返す。 */
export async function mergePdfs(
  sources: readonly PdfSource[],
  options: MergeOptions = {},
): Promise<Uint8Array> {
  if (sources.length === 0) throw new Error("PDFが選ばれていません");

  const merged = await PDFDocument.create();
  merged.setTitle(options.title ?? "merged.pdf");
  merged.setProducer("tool-factory / pdf-merge");
  merged.setCreator("tool-factory / pdf-merge");

  for (const source of sources) {
    let doc: PDFDocument;
    try {
      doc = await PDFDocument.load(source.bytes, { ignoreEncryption: false });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`${source.name} を読み込めません: ${reason}`);
    }
    const indices = parsePageRange(source.pageRange ?? "", doc.getPageCount());
    const pages = await merged.copyPages(doc, indices);
    for (const page of pages) merged.addPage(page);
  }

  if (merged.getPageCount() === 0) throw new Error("結合結果が0ページです");
  return merged.save();
}

/** 結合前にページ数を数える（UI のプレビュー表示用）。 */
export async function countPages(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
  return doc.getPageCount();
}
