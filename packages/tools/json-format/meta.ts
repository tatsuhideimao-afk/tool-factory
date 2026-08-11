import type { ToolMeta } from "@tf/shared";

export const meta: ToolMeta = {
  slug: "json-format",
  title: "JSON整形・検証ツール",
  tagline:
    "貼り付けたJSONをその場で整形・圧縮し、壊れている場合は何行目が原因かを表示します。",
  steps: [
    "整形したいJSONを左の入力欄に貼り付ける",
    "インデント幅とキーのソート有無を選ぶ",
    "「整形する」を押して結果をコピーする",
  ],
  keywords: ["JSON 整形", "JSON 検証", "JSON フォーマッター", "JSON 圧縮"],
  createdAt: "2026-08-11T00:00:00Z",
  clientOnly: true,
};
