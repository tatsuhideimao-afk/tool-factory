export type {
  ToolMeta,
  ToolLedgerEntry,
  ExtensionStatus,
  Lifecycle,
  Candidate,
  CandidateSource,
  CandidateStatus,
  SiteConfig,
} from "./types.ts";

/** slug の妥当性。生成器が出したものも必ずこれで検証する。 */
export const SLUG_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function assertSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      `slug が不正です: ${JSON.stringify(slug)} (小文字英数とハイフンのみ)`,
    );
  }
  if (slug.length > 40) throw new Error(`slug が長すぎます: ${slug}`);
}

/** Web版の公開 URL。origin は末尾スラッシュなしを前提。 */
export function webUrlFor(origin: string, slug: string): string {
  return `${origin.replace(/\/+$/, "")}/t/${slug}/`;
}

/**
 * slug から決定的に色相を決める（アイコン・OGP の配色）。
 * 外部の画像生成AIを使わないという仕様 5.4 の要件を満たすための単純ハッシュ。
 */
export function hueFromSlug(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 360;
}
