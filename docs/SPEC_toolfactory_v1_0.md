# ツール量産パイプライン「tool-factory」仕様書 v1.0

作成日: 2026-08-11
想定実装者: Claude Code
想定オーナー: 個人1名（週15時間、構築フェーズ）

---

## 0. このドキュメントの読み方

### 0.1 目的

「Webツール」と「Chrome拡張」を**同一の企画データから自動生成・自動公開・自動計測する工場**を作る。
狙いは1本のヒットではなく、**低コストで多数の試行を回し、当たりだけにリソースを寄せる**こと。

### 0.2 設計の中核となる判断

- **完全自動化できる工程だけを自動化し、できない工程は「人間が触る時間を分単位まで削る」形に隔離する。**
- **Web版（審査なし・即日公開・完全自動）を需要測定器として使い、実測で当たった企画だけをChrome拡張（審査あり・単価高）に昇格させる。**
- 収益化は最初から入れない。**先にアクセスを実測**し、閾値を超えた企画だけ収益化する。

### 0.3 非目標（v1.0でやらないこと）

- SNS運用・広告出稿などの能動的集客（自動化不能なため対象外）
- iOS/Androidアプリ（初回リリースゲートが自動化不能）
- ユーザーサポート窓口（v1では問い合わせフォーム→メール転送のみ）

### 0.4 前提条件（オーナーが事前に用意するもの）

| 項目 | 費用 | 備考 |
|---|---|---|
| 独自ドメイン1つ | 約1,500円/年 | Web版の置き場。サブディレクトリで全ツールを収容 |
| Cloudflareアカウント | 0円 | Pages / Workers / Web Analytics すべて無料枠 |
| GitHubアカウント | 0円 | Actions無料枠内で運用 |
| Chrome Web Store デベロッパー登録 | $5（初回のみ） | ③昇格時に必要。Phase 1では不要 |
| Anthropic APIキー | 従量 | 企画生成・コード生成用。月3,000円想定 |

**初期費用の上限: 10,000円。月額ランニングの上限: 5,000円。この2つを超える設計は却下すること。**

---

## 1. 自動化範囲の厳密な定義

実装前に必ず読むこと。**「全部自動」と書いていない箇所は自動化してはいけない**（規約違反リスクがあるため）。

| 工程 | Web版 | Chrome拡張版 | 備考 |
|---|---|---|---|
| 企画発掘 | 全自動 | 全自動 | 同一の企画プールを共有 |
| 実装コード生成 | 全自動 | 全自動 | 共通コアロジックを両方から呼ぶ |
| アイコン・OGP画像生成 | 全自動 | 全自動 | SVG→PNG。外部AI画像生成は使わない |
| ストア説明文生成 | 全自動 | 全自動 | |
| デプロイ／公開 | **全自動** | **半自動** | 拡張は新規アイテム作成時のみ手動、更新はAPI経由で全自動 |
| 審査 | なし | Google側 | 数日〜数週間。これは待つしかない |
| 集客 | 全自動（SEO/構造化データ） | 半自動（ストア内SEO） | |
| 計測 | 全自動 | 全自動（ストアページ取得） | |
| 課金 | 全自動（後述の閾値到達後） | 全自動（Stripe） | |
| レビュー対応 | — | **手動** | 自動返信は禁止（品質と規約の両面で） |

**人間が触る時間の目標値: 1企画あたり合計15分以内（Web版は0分、拡張昇格時のみ15分）。**

---

## 2. システム構成

```
[GitHub Actions（cron: 毎日 03:00 JST）]
        |
        v
  01-research  ── Chrome Web Store / Google検索 の需要調査 → candidates.json
        |
        v
  02-select    ── スコアリング → 上位N件を tools.json に昇格
        |
        v
  03-generate  ── Anthropic API でコア実装＋UI生成 → packages/tools/<slug>/
        |
        v
  04-assets    ── アイコン(SVG→PNG) / OGP / 説明文 生成
        |
        v
  05-deploy    ── Cloudflare Pages へデプロイ（Web版は即公開）
        |
        v
  06-measure   ── Cloudflare Web Analytics API / CWSページ取得 → metrics.sqlite
        |
        v
  07-report    ── 判定（昇格 / 継続 / 撤退）→ Discord Webhook 通知
```

**重要**: 03-generate が生成したコードは、必ず 05-deploy の前に自動テスト（Vitest + Playwright smoke test）を通す。落ちたらデプロイせず、通知だけ出して次の企画に進む。**人間の確認待ちでパイプラインを止めない。**

---

## 3. 技術スタック

| 層 | 採用 | 理由 |
|---|---|---|
| 言語 | TypeScript（全レイヤ統一） | Chrome拡張がJS必須なため、パイプラインも合わせて言語を1つに絞る |
| Web版フレームワーク | Astro（静的出力） | 1ツール=1ページの静的生成に最適。JSを必要な箇所だけ島状に読み込める |
| ホスティング | Cloudflare Pages | 無料枠が実質無制限。ビルド回数制限に注意（月500回） |
| 動的処理（必要時のみ） | Cloudflare Workers | 無料枠 10万リクエスト/日 |
| DB | SQLite（リポジトリ内にコミット） | 計測データ用。外部DB不要でランニング0円 |
| アクセス解析 | Cloudflare Web Analytics | 無料・Cookieless・同意バナー不要 |
| 拡張の公開 | Chrome Web Store API **V2** | V1は2026年10月15日でサポート終了のため使用禁止 |
| 課金 | Stripe Checkout + Workers でライセンス検証 | 固定費0円、売上比例のみ |
| 通知 | Discord Webhook | 無料 |
| CI | GitHub Actions | 無料枠内 |

**禁止事項**: 月額固定費が発生するサービス（Vercel Pro / Supabase有料 / 外部DBaaS など）は一切使わないこと。ランニング0円を維持することがこの設計の生命線。

---

## 4. データモデル

### 4.1 `data/candidates.json`（企画候補プール）

```jsonc
{
  "id": "cand_20260811_0001",
  "discovered_at": "2026-08-11T03:00:00Z",
  "source": "cws_search" | "google_suggest" | "manual",
  "query": "PDF 結合",              // 発掘元の検索語
  "problem": "複数PDFを1つにまとめたい",
  "demand_signal": {
    "search_volume_proxy": 1200,     // サジェスト出現数などの代理指標
    "existing_solutions": 8,         // 既存の競合数
    "avg_rating": 3.2,               // 競合の平均評価
    "max_users": 50000               // 競合最大ユーザー数
  },
  "score": 72,
  "status": "pending" | "promoted" | "rejected",
  "reject_reason": null
}
```

### 4.2 `data/tools.json`（生成済みツール台帳）

```jsonc
{
  "slug": "pdf-merge",
  "title": "PDF結合ツール",
  "candidate_id": "cand_20260811_0001",
  "created_at": "2026-08-11T03:20:00Z",
  "web": {
    "url": "https://example.com/t/pdf-merge/",
    "deployed_at": "2026-08-11T03:25:00Z",
    "monetized": false
  },
  "extension": {
    "status": "none" | "manual_setup_required" | "in_review" | "published",
    "item_id": null,
    "published_at": null
  },
  "lifecycle": "measuring" | "promoted" | "retired"
}
```

### 4.3 `data/metrics.sqlite`

```sql
CREATE TABLE daily_metrics (
  date            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  channel         TEXT NOT NULL,  -- 'web' | 'ext'
  pageviews       INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  ext_users       INTEGER DEFAULT 0,
  ext_rating      REAL,
  revenue_jpy     INTEGER DEFAULT 0,
  PRIMARY KEY (date, slug, channel)
);
```

---

## 5. モジュール仕様

### 5.1 `01-research` — 企画発掘

**入力**: 種キーワードリスト（`config/seeds.yml`、オーナーが初期30語だけ手で書く）
**出力**: `candidates.json` への追記

**処理**

1. 各種キーワードについて、Google検索サジェスト（`suggestqueries.google.com`）から派生語を取得する
2. Chrome Web Store の検索結果ページを Playwright で取得し、以下を抽出する
   - ヒット件数、上位10件の名称・ユーザー数・評価
3. 次の条件を満たすものを候補化する
   - 検索語が「動詞＋対象」の形（＝明確なタスク需要がある）
   - 既存解が5件以下、または上位の平均評価が3.5未満（＝満たされていない需要がある）
   - ブラウザ内で完結する処理である（サーバー不要 ＝ ランニング0円を維持できる）

**スコアリング式**

```
score = (需要代理値の対数 × 30)
      + (5 - 既存解数) × 5
      + (4.0 - 競合平均評価) × 10
      - (サーバー処理が必要なら 40)
      - (取得データに個人情報が含まれるなら 100)
```

**遵守事項（重要）**

- Chrome Web Store および Google へのアクセスは **1リクエスト/3秒以上の間隔**を空け、User-Agentを明示すること
- robots.txt を尊重すること。ブロックされている経路は使わない
- 取得したデータは需要判定にのみ使用し、再配布しない

### 5.2 `02-select` — 選抜

- score上位から、**1日あたり最大2件**だけ `tools.json` に昇格させる
- 上限を設ける理由: Chrome Web Storeの「実質同一のアイテムを大量に投稿する行為」はスパムポリシー違反にあたる。Web版も同様に、内容の薄いページの大量生成はGoogleの「スケールされたコンテンツの不正使用」の対象になり得る。**量産の意味は「試行回数」であって「複製」ではない。**
- 既存ツールとの機能重複チェックを必ず行い、コア機能が80%以上重複する企画は自動でrejectする

### 5.3 `03-generate` — 実装生成

**生成物**

```
packages/tools/<slug>/
├── core.ts          # 純粋関数としてのロジック（副作用なし・DOM非依存）
├── core.test.ts     # Vitestユニットテスト（生成時に必ず同時生成）
├── web/
│   └── index.astro  # Web版UI
└── ext/
    ├── manifest.json   # Manifest V3
    ├── popup.html
    └── popup.ts
```

**必須制約**

- `core.ts` は Web版と拡張版の**両方から同一実装を import する**こと。ロジックを二重に書かない
- 外部APIを呼ばないこと（ランニング0円の維持と、拡張の権限最小化のため）
- Manifest V3 の `permissions` は**必要最小限**にすること。`<all_urls>` は禁止。過剰な権限要求は審査で却下される
- ユーザー入力データを外部送信しないこと。全処理をクライアント内で完結させ、その旨をプライバシーポリシーに明記する

**品質ゲート（自動）**

1. `tsc --noEmit` が通ること
2. `vitest run` が全パスすること
3. Playwrightで実際にページを開き、代表的な入力に対して期待出力が得られること

3つ全て通過しなければデプロイしない。

### 5.4 `04-assets` — 資材生成

- **アイコン**: 企画名から決定的にSVGを生成（配色はslugのハッシュから決定）→ sharp でPNG 16/48/128px に変換。外部の画像生成AIは使わない（コスト・再現性・権利の3点で不利なため）
- **OGP画像**: 同SVGテンプレート＋タイトル文字を合成、1200×630
- **説明文**: Anthropic APIで生成。以下を必ず含める
  - 何ができるか（1文）
  - 使い方（3ステップ）
  - データを外部送信しない旨の明記
- **構造化データ**: Web版に `SoftwareApplication` の JSON-LD を出力する

### 5.5 `05-deploy` — 公開

**Web版（全自動）**

- Astroでビルド → Cloudflare Pages に `wrangler pages deploy`
- `sitemap.xml` を自動再生成し、Search Console にsitemap pingを送る
- Pagesのビルド回数上限（月500回）に達しないよう、**1日1回まとめてデプロイ**する

**Chrome拡張版**

- 新規アイテム: **手動**。ダッシュボードでZIPをアップし、掲載情報を貼り付ける（04-assetsの出力をそのまま貼るだけで済むよう、`ext/STORE_LISTING.md` に貼り付け用テキストを出力しておくこと）
- 既存アイテムの更新: **全自動**。Chrome Web Store API **V2** をサービスアカウント認証で使用し、`upload` → `publish` を実行する
- 注意: 審査中のバージョンがある状態で新バージョンを上げると審査がキャンセルされ再度キューに入る。**同一アイテムへの連続publishを避けるため、更新は週1回のバッチにまとめること**
- 注意: 公式ドキュメントによれば、write スコープを持つアプリには「verified」ステータスが付与されない場合がある。ただしAPIの利用自体は妨げられない

### 5.6 `06-measure` — 計測

- Web: Cloudflare Web Analytics の GraphQL API から前日分の pageviews / visitors をツール別に取得
- 拡張: 公開ストアページを Playwright で取得し、ユーザー数と評価を抽出（**公式の統計APIは存在しないため**）。取得は1日1回まで
- 収益: Stripe API（課金開始後のみ）
- 全て `metrics.sqlite` に書き込み、リポジトリにコミットする

### 5.7 `07-report` — 判定と通知

毎日、各ツールについて次の判定を下し、Discordに通知する。

| 経過日数 | 判定条件 | アクション |
|---|---|---|
| 30日 | Web版 UU < 100/月 | `retired` にして sitemap から除外 |
| 30日 | Web版 UU 100〜499/月 | `measuring` 継続（何もしない） |
| 30日 | Web版 UU ≧ 500/月 | **拡張版に昇格**（手動セットアップのタスクを通知） |
| 60日 | サイト全体 UU ≧ 3,000/月 | AdSense申請タスクを通知 |
| 90日 | 拡張のユーザー数 ≧ 500 | Stripe課金導入タスクを通知 |

---

## 6. Phase 1: 30日実測プロトコル（最優先で実装する部分）

前回の議論で確認した通り、**収益シミュレーションの前提値には裏付けがない**。したがって Phase 1 の目的は収益ではなく、**「1本あたりの自然流入」という全ての試算の土台になる数値を実測すること**である。

### 6.1 Phase 1 のスコープ

`01-research` 〜 `07-report` のうち、以下だけを先に作る。

- 03-generate（ただし初回3本は企画を手で指定してよい）
- 05-deploy のWeb版のみ
- 06-measure のWeb版のみ
- 07-report の通知のみ

**Chrome拡張・課金・企画自動発掘は Phase 1 では作らない。**

### 6.2 実験条件

- Webツールを3本公開する
- **宣伝を一切しない**（SNS投稿・被リンク獲得・拡散依頼をすべて禁止）
- 30日間、コードを触らない
- 計測するのは「自然検索流入だけで何UU積むか」の1点

### 6.3 判定基準（事前に確定させ、後から動かさないこと）

| 30日後のサイト全体UU | 意味 | 次のアクション |
|---|---|---|
| **< 50** | 自然流入がほぼゼロ。量産モデル全体が成立しない | Phase 2 に進まない。⑤マイクロSaaS方向へ設計をやり直す |
| **50〜299** | 弱いが流入はある | 企画発掘の質が課題。01-research を作り込んでから再測定 |
| **≧ 300** | 量産の前提が成立 | Phase 2（全モジュール実装＋拡張昇格）へ進む |

この基準を満たさないまま Phase 2 に進むことを禁止する。

---

## 7. リスクと遵守事項

| リスク | 内容 | 対策 |
|---|---|---|
| Google検索のスパム判定 | 「スケールされたコンテンツの不正使用」は自動化・人手を問わず、順位操作目的の低価値ページ大量生成を対象とする | 1日2本の上限、機能重複80%での自動reject、実際に動作するツールのみ公開 |
| Chrome Web Storeのスパムポリシー | 実質同一の拡張の複数投稿は違反 | 昇格は実測で需要が確認できたものだけ。1日2本上限 |
| CWS API V1の終了 | 2026年10月15日でサポート終了 | 最初からV2で実装する |
| AdSense審査 | ツールのみのサイトは審査に通りにくい傾向がある | UU 3,000/月を超えてから申請。それまで収益化しない |
| 生成コードの品質崩壊 | 自動生成物を無検証で公開すると低評価が蓄積する | 3段階の自動品質ゲート。落ちたら公開しない |
| 個人情報 | 入力データをサーバーに送ると保護義務が発生する | 全処理をクライアント内で完結。外部送信を設計レベルで禁止 |

---

## 8. Claude Code への実装指示順

以下の順に実装すること。各ステップ完了時に動作確認を挟み、次に進む。

1. モノレポの初期化（pnpm workspace / TypeScript / Vitest / Playwright）
2. `packages/tools/` のテンプレート構造と、Web版・拡張版が `core.ts` を共有する仕組み
3. サンプルツール1本を**手書きで**実装し、テンプレートが正しく機能することを確認
4. `05-deploy`（Web版）: Cloudflare Pages への自動デプロイと sitemap 生成
5. `03-generate`: Anthropic API による生成。**品質ゲート3種を先に実装してから**生成器を書くこと
6. `06-measure` + `07-report`: Cloudflare Web Analytics 取得と Discord 通知
7. ここで **Phase 1 の30日実測を開始する**（以降の実装は結果が出るまで着手しない）
8. （Phase 2）`01-research` / `02-select`
9. （Phase 2）`04-assets` の拡張版資材と CWS API V2 連携
10. （Phase 2）Stripe 課金

---

## 9. 変更履歴

| 版 | 日付 | 内容 |
|---|---|---|
| 1.0 | 2026-08-11 | 初版 |
