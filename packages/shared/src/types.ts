/** ツール1本のメタデータ。packages/tools/<slug>/meta.ts が満たす契約。 */
export interface ToolMeta {
  /** URL の一部になる識別子。/t/<slug>/ */
  slug: string;
  /** ページ H1・ストア掲載名 */
  title: string;
  /** 「何ができるか」を1文で。OGP と meta description に使う */
  tagline: string;
  /** 使い方3ステップ。仕様 5.4 の必須項目 */
  steps: [string, string, string];
  /** SEO キーワード（構造化データと meta keywords ではなく本文の materialize に使う） */
  keywords: string[];
  /** ISO8601。sitemap の lastmod と台帳の初期値に使う */
  createdAt: string;
  /**
   * 全処理がブラウザ内で完結するか。
   * 仕様上 false は許されない（サーバ処理はランニング0円を壊す）。
   */
  clientOnly: true;
}

export type ExtensionStatus =
  | "none"
  | "manual_setup_required"
  | "in_review"
  | "published";

export type Lifecycle = "measuring" | "promoted" | "retired";

/** data/tools.json の1レコード（仕様 4.2） */
export interface ToolLedgerEntry {
  slug: string;
  title: string;
  candidate_id: string | null;
  created_at: string;
  web: {
    url: string;
    deployed_at: string | null;
    monetized: boolean;
  };
  extension: {
    status: ExtensionStatus;
    item_id: string | null;
    published_at: string | null;
  };
  lifecycle: Lifecycle;
}

export type CandidateSource = "cws_search" | "google_suggest" | "manual";
export type CandidateStatus = "pending" | "promoted" | "rejected";

/** data/candidates.json の1レコード（仕様 4.1） */
export interface Candidate {
  id: string;
  discovered_at: string;
  source: CandidateSource;
  query: string;
  problem: string;
  demand_signal: {
    search_volume_proxy: number;
    existing_solutions: number;
    avg_rating: number;
    max_users: number;
  };
  score: number;
  status: CandidateStatus;
  reject_reason: string | null;
}

/** config/site.json */
export interface SiteConfig {
  /** 例: https://example.com （末尾スラッシュなし） */
  origin: string;
  siteName: string;
  /** 問い合わせ先。プライバシーポリシーに載せる */
  contactEmail: string;
  /** Cloudflare Pages のプロジェクト名 */
  pagesProject: string;
  /** Cloudflare Web Analytics のトークン（公開値。JS スニペットに埋まる） */
  webAnalyticsToken: string | null;
}
