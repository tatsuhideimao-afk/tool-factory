# 運用手順

初期費用の上限10,000円・月額ランニングの上限5,000円を超える構成は採らない（仕様 0.4）。
以下の手順で発生する費用は、ドメイン代（約1,500円/年）と Anthropic API の従量課金だけ。

---

> **スマホだけで進める場合は [`SETUP_MOBILE.md`](SETUP_MOBILE.md) を見てください。**
> 画面ごとの操作順に並べ替えた同じ内容です。

## 1. 初期セットアップ（1回だけ）

### 1-1. 公開URLを決める

`config/site.json` の `origin` に、公開先のオリジンを書く（末尾スラッシュなし）。

- **独自ドメイン** — 任意のレジストラで取得（約1,500円/年）。SEO上はこちらが本命
- **`https://<pagesProject>.pages.dev`** — Cloudflare Pages の無料サブドメイン。0円で始められる

**どちらにするかは Day 0 より前に決めきること。** 途中で `origin` を変えると canonical と
sitemap のURLが全部変わり、30日実測のベースラインが取り直しになる。

### 1-2. Cloudflare Pages

**ダッシュボードでの事前作成は不要。** `05-deploy` が `wrangler pages project create` を
先に実行するので、`config/site.json` の `pagesProject` に使いたい名前を書いて
Deploy ワークフローを回せば、プロジェクトごと作られる（既にある場合その失敗は無視される）。

独自ドメインを使う場合だけ、作成後に Pages プロジェクトの Custom domains から紐づける。

### 1-3. Cloudflare Web Analytics

1. Cloudflare → Analytics & Logs → Web Analytics → Add a site
2. 対象ドメイン（`<project>.pages.dev` でも可）を登録すると JS スニペットが出る。
   その中の `token` の値を `config/site.json` の `webAnalyticsToken` に入れる
   （ページに埋め込まれる公開値なので、リポジトリに置いて問題ない）
3. `06-measure` はこの値を GraphQL の `siteTag` としても使う。
   もし別の値だった場合だけ、Secrets に `CF_WEB_ANALYTICS_SITE_TAG` を入れればそちらが優先される。

Cookieless なので同意バナーは不要。

### 1-4. API トークン

Cloudflare → My Profile → API Tokens で2つ作る。権限は必要最小限にする。

| 用途 | 権限 | Secret 名 |
|---|---|---|
| Pages へのデプロイ | Account / Cloudflare Pages : Edit | `CLOUDFLARE_API_TOKEN` |
| Analytics の読み取り | Account / Account Analytics : Read | `CF_ANALYTICS_API_TOKEN` |

アカウントIDは Cloudflare のダッシュボード右側に出る → `CLOUDFLARE_ACCOUNT_ID`。

### 1-5. Discord Webhook

通知先チャンネル → 連携サービス → ウェブフックを作成 → URL をコピー → `DISCORD_WEBHOOK_URL`。

### 1-6. GitHub Secrets

リポジトリの Settings → Secrets and variables → Actions に登録する。

```
CLOUDFLARE_API_TOKEN        # 必須（デプロイ）
CLOUDFLARE_ACCOUNT_ID       # 必須（デプロイ・計測）
CF_ANALYTICS_API_TOKEN      # 必須（計測）
DISCORD_WEBHOOK_URL         # 任意（未設定ならログに出るだけ）
CF_WEB_ANALYTICS_SITE_TAG   # 任意（site.json の webAnalyticsToken と違うときだけ）
ANTHROPIC_API_KEY           # 任意（03-generate / 04-assets を使うときだけ）
```

`ANTHROPIC_API_KEY` が無くても Phase 1 は完走する（説明文はテンプレートで生成される）。

### 1-7. Search Console

サイトを登録し、`https://<ドメイン>/sitemap.xml` を送信する。**これは初回1回だけの手作業。**

> Google の sitemap ping エンドポイント（`/ping?sitemap=`）は2023年6月に廃止されている。
> 仕様書には「sitemap ping を送る」と書かれているが、送っても何も起こらないので実装していない。
> 代わりに `robots.txt` の `Sitemap:` 行と Search Console 登録でクロールを促している。

---

## 2. 毎日動くもの

| ワークフロー | 起動条件 | やること |
|---|---|---|
| `ci.yml` | push / PR | 品質ゲート3種 + 拡張パッケージのビルド確認 |
| `deploy.yml` | main への push / 手動 | 品質ゲート → 資材生成 → Cloudflare Pages へデプロイ |
| `daily.yml` | 毎日 18:00 UTC（03:00 JST） | 06-measure → 07-report → `data/` をコミット |

Pages のビルド回数上限（月500回）に当てないため、デプロイは main への push か手動実行のときだけ。
Phase 1 の30日間はコードを触らないので、実質デプロイは起きない。

---

## 3. 人間が手を動かす場面

### 3-1. 拡張の新規登録（Phase 2・1本あたり15分）

`07-report` が「拡張版に昇格」と通知したときだけ発生する。

```bash
pnpm assets       # アイコンと掲載文を生成
pnpm ext:build    # build/ext/<slug>.zip ができる
```

1. [Chrome Web Store デベロッパーダッシュボード](https://chrome.google.com/webstore/devconsole)
   で新規アイテムを作成し、`build/ext/<slug>.zip` をアップロード
2. `packages/tools/<slug>/ext/STORE_LISTING.md` の各見出しの内容を、対応する欄に貼り付ける
   （欄の名前を見出しに揃えてあるので、読みながら貼るだけで終わる）
3. 審査に出す
4. 公開されたら `data/tools.json` の該当ツールの
   `extension.status` を `published`、`extension.item_id` をストアのアイテムIDに更新する

デベロッパー登録は初回のみ $5。

### 3-2. 拡張の更新（Phase 2）

Chrome Web Store API **V2** をサービスアカウント認証で使う（V1は2026年10月15日でサポート終了）。

> 注意: 審査中のバージョンがある状態で新しいバージョンを上げると、審査がキャンセルされて
> 再びキューの最後尾に入る。**同一アイテムへの連続publishを避けるため、更新は週1回のバッチにまとめること。**

### 3-3. レビュー対応（Phase 2）

**手動。自動返信は禁止**（品質と規約の両面で）。

---

## 4. 困ったとき

### 品質ゲートが落ちる

```bash
pnpm gates     # どの段で落ちたかが出る
```

`e2e` で落ちた場合は `playwright-report/` を開く。CI ではアーティファクトとして保存される。

Playwright が管理するブラウザではなく、既に用意されたバイナリを使いたい環境では
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` に実行ファイルのパスを渡す。

### `06-measure` が0件しか返さない

- 公開直後は Analytics にデータが溜まっていない（前日ぶんを取りにいくので最短でも翌日）
- `CF_WEB_ANALYTICS_SITE_TAG` が Pages のプロジェクトIDと混同されていないか確認する
- `config/site.json` の `webAnalyticsToken` が空だとビーコンが読み込まれず、そもそも計測されない

### 生成したツールが毎回ゲートで落ちる

`03-generate` は静的検査の結果を標準エラーに出す。
外部通信・DOM依存・権限過剰のいずれかで落ちていることが多い。
プロンプト（`scripts/03-generate.ts` の `buildPrompt`）に制約を書き足すのが基本の直し方で、
生成物を手で直して通すのは避ける（次回また同じものが出てくるため）。
