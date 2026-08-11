import type { ToolMeta } from "@tf/shared";

export const meta: ToolMeta = {
  slug: "pdf-merge",
  title: "PDF結合ツール",
  tagline:
    "複数のPDFを指定した順番で1つのファイルにまとめます。ページ範囲の指定にも対応しています。",
  steps: [
    "結合したいPDFファイルをまとめて選ぶ",
    "並び順を確認し、必要ならページ範囲を指定する",
    "「結合する」を押してダウンロードする",
  ],
  keywords: ["PDF 結合", "PDF 統合", "PDF まとめる", "PDF 分割 ページ抽出"],
  createdAt: "2026-08-11T00:00:00Z",
  clientOnly: true,
};
