import type { ToolMeta } from "@tf/shared";

export const meta: ToolMeta = {
  slug: "csv-json",
  title: "CSV⇄JSON変換ツール",
  tagline:
    "CSVをJSON配列に、JSON配列をCSVに相互変換します。引用符や改行を含むセルもそのまま扱えます。",
  steps: [
    "変換したいCSVまたはJSONを入力欄に貼り付ける",
    "変換方向（CSV→JSON / JSON→CSV）と区切り文字を選ぶ",
    "「変換する」を押して結果をコピーする",
  ],
  keywords: [
    "CSV JSON 変換",
    "CSV から JSON",
    "JSON から CSV",
    "TSV 変換",
  ],
  createdAt: "2026-08-11T00:00:00Z",
  clientOnly: true,
};
