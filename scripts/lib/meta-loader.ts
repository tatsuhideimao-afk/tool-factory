import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { TOOLS_SRC_DIR } from "@tf/shared/node";
import type { ToolMeta } from "@tf/shared";

/** packages/tools/<slug>/meta.ts を読み込んで検証する。 */
export async function loadToolMeta(slug: string): Promise<ToolMeta> {
  const file = resolve(TOOLS_SRC_DIR, slug, "meta.ts");
  const mod = (await import(pathToFileURL(file).href)) as { meta?: unknown };
  const meta = mod.meta as ToolMeta | undefined;
  if (!meta) throw new Error(`${file} が meta を export していません`);

  const problems: string[] = [];
  if (meta.slug !== slug) problems.push(`meta.slug (${meta.slug}) がディレクトリ名と一致しません`);
  if (!meta.title?.trim()) problems.push("title が空です");
  if (!meta.tagline?.trim()) problems.push("tagline が空です");
  if (!Array.isArray(meta.steps) || meta.steps.length !== 3)
    problems.push("steps はちょうど3ステップにしてください");
  if (meta.clientOnly !== true)
    problems.push("clientOnly は true でなければなりません（サーバ処理は禁止）");
  if (problems.length > 0) {
    throw new Error(`${slug} の meta.ts が不正です:\n - ${problems.join("\n - ")}`);
  }
  return meta;
}
