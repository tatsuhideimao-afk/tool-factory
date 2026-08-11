# tool-factory

Webツールと Chrome拡張を、同一の企画データから生成・公開・計測するパイプライン。
仕様は [`docs/SPEC_toolfactory_v1_0.md`](docs/SPEC_toolfactory_v1_0.md)。

**いまは Phase 1（30日実測）。** 収益化も企画自動発掘も拡張公開もまだ作りません。
やることは「Webツールを3本公開し、宣伝せず30日放置して自然流入を実測する」だけです。
判定基準は [`docs/PHASE1.md`](docs/PHASE1.md) に固定してあります。

---

## いま動くもの

| 工程 | 状態 | 実体 |
|---|---|---|
| 01-research（企画発掘） | Phase 2 | 未実装（種キーワードは `config/seeds.yml` に用意済み） |
| 02-select（選抜） | Phase 2 | 未実装（1日2件の上限だけ 03-generate 側で実装済み） |
| 03-generate（実装生成） | ✅ | `scripts/03-generate.ts` |
| 04-assets（資材生成） | ✅ | `scripts/04-assets.ts` |
| 05-deploy（公開・Web版） | ✅ | `scripts/05-deploy.ts` |
| 06-measure（計測・Web版） | ✅ | `scripts/06-measure.ts` |
| 07-report（判定と通知） | ✅ | `scripts/07-report.ts` |
| 拡張の公開 | Phase 2 | パッケージのビルドまでは `scripts/build-extensions.ts` で可能 |

公開中のツール（手書き3本）:

- `json-format` — JSON整形・検証
- `csv-json` — CSV⇄JSON変換
- `pdf-merge` — PDF結合

---

## セットアップ

```bash
pnpm install
pnpm exec playwright install chromium   # e2e 用
cp .env.example .env                    # 必要な鍵を埋める（Phase 1 は空でも動く）
```

`config/site.json` の `origin` を自分のドメインに変えてください。ここを変えないと
canonical・OGP・sitemap がすべて `https://example.com` を指したままになります。

---

## よく使うコマンド

```bash
pnpm dev          # ローカルで見る（http://localhost:4321）
pnpm gates        # 品質ゲート3種（typecheck → unit → build → e2e）
pnpm test         # ユニットテストだけ
pnpm build        # 静的サイトをビルド
pnpm assets       # アイコン / OGP / ストア掲載文を生成
pnpm ext:build    # Chrome拡張のZIPを組み立て（Phase 2 用）
pnpm deploy:web   # 品質ゲート後に Cloudflare Pages へデプロイ
pnpm measure      # 前日分のアクセスを metrics.sqlite に記録
pnpm report       # 判定して Discord に通知
```

新しいツールを生成する（Phase 2、または手動で企画を指定して試すとき）:

```bash
pnpm generate --slug text-diff --title "テキスト差分ツール" \
  --problem "2つの文章の違いを行単位で見たい"
```

生成物は品質ゲートを通ったときだけ残ります。落ちたらディレクトリごと破棄して終了します
（人間の確認待ちでパイプラインを止めない、という仕様どおりの挙動です）。

---

## ディレクトリ

```
packages/tools/<slug>/     ツール1本ぶんの全部
├── meta.ts                タイトル・使い方3ステップ・キーワード
├── core.ts                ロジック（純粋関数・DOM非依存）
├── core.test.ts           Vitest
├── web/index.astro        Web版UI      ─┬─ どちらも ../core.ts を import する
└── ext/                   拡張版        ─┘   （ロジックを二重に書かない）

apps/web/                  Astro（静的出力）。/t/<slug>/ で1ツール1ページ
packages/shared/           型・パス・台帳の読み書き
scripts/                   パイプライン各工程
data/                      candidates.json / tools.json / metrics.sqlite
config/                    site.json / seeds.yml
docs/                      仕様・運用手順・Phase 1 プロトコル
```

`apps/web/src/generated/tools.ts` は `pnpm gen` が作る生成物です（gitignore 済み）。
`packages/tools/` にディレクトリを1つ足せばページが生えます。

---

## 設計上の約束（破ると仕様の前提が崩れます）

- **ランニング0円を維持する。** 月額固定費が出るサービスは使わない。
- **全処理をクライアント内で完結させる。** `core.ts` から外部通信しない。
  03-generate は生成コードを静的検査してこれを機械的に弾きます。
- **拡張の権限は最小限。** `<all_urls>` は禁止。ポップアップ完結型なら権限ゼロ。
- **1日2本まで。** 実質同一のものを大量投稿しない（CWSのスパムポリシー、
  およびGoogleの「スケールされたコンテンツの不正使用」への対応）。
- **品質ゲート3種を通らないものは公開しない。**

---

## 詳しくは

- [`docs/SETUP_MOBILE.md`](docs/SETUP_MOBILE.md) — スマホだけで公開まで到達する手順（PC不要）
- [`docs/PHASE1.md`](docs/PHASE1.md) — 30日実測プロトコルと、事前に固定した判定基準
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — 鍵の用意、Cloudflare の設定、拡張の手動登録手順
