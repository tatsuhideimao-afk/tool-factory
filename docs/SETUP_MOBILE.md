# スマホだけでセットアップする手順

PCなしで公開まで到達するための手順書。所要 30〜45分。
コマンド実行は一切ありません（全部 GitHub Actions が代わりに走ります）。

## 事前に

- **ブラウザは「デスクトップ用サイトを表示」に切り替えてください。**
  Cloudflare と GitHub の設定画面はモバイル表示だと項目が隠れます。
  - Safari: アドレスバー左の「ぁあ」→ デスクトップ用Webサイトを表示
  - Chrome: 右上「⋮」→ PC版サイト
- GitHub は**アプリではなくブラウザ**で開いてください（アプリはファイル編集と Secrets 登録ができません）
- コピペする値が5つほど出てきます。メモアプリを1つ開いておくと楽です

---

## Step 0. 公開URLを決める（最重要）

先に決めきってください。**あとから変えると30日実測がやり直しになります**
（canonical と sitemap のURLが全部変わるため）。

| 選択肢 | 費用 | 備考 |
|---|---|---|
| A. `https://<好きな名前>.pages.dev` | 0円 | Cloudflare の無料サブドメイン。すぐ始められる |
| B. 独自ドメイン | 約1,500円/年 | SEO上は本命。取得もスマホで可能 |

迷ったら **A で始めて構いません**。ただし「30日測ってから独自ドメインに移す」は
測定のやり直しになるので、独自ドメインにする気があるなら最初からBにしてください。

以降この手順書では、プロジェクト名を `tool-factory` として書きます。
A を選んだ場合、公開URLは `https://tool-factory.pages.dev` になります。

---

## Step 1. Cloudflare のアカウントを作る

<https://dash.cloudflare.com/sign-up> でサインアップ。無料プランのままで構いません。
（既にアカウントがあればスキップ）

---

## Step 2. Web Analytics を追加して token を控える

サイトがまだ公開されていなくても登録できます。先にやっておくと再デプロイが1回減ります。

1. 左メニュー **Analytics & Logs** → **Web Analytics**
2. **Add a site** をタップ
3. ホスト名に Step 0 で決めたドメインを入力
   （A なら `tool-factory.pages.dev`、B なら取得したドメイン）
4. JS スニペットが表示されます。その中の

   ```
   data-cf-beacon='{"token": "0123456789abcdef..."}'
   ```

   の **token の値だけ**をメモ → これを ①token と呼びます

> ①token はページに埋め込まれる公開値です。リポジトリに置いて問題ありません。

---

## Step 3. アカウントIDを控える

1. 左メニュー **Workers & Pages** を開く
2. 右側（デスクトップ表示なら右カラム）に **Account ID** が出ます
3. コピー → ②アカウントID

---

## Step 4. API トークンを作る

1. 右上のアイコン → **My Profile** → **API Tokens**
2. **Create Token** → 一番下の **Create Custom Token** の「Get started」
3. 名前: `tool-factory`
4. **Permissions** に次の2行を追加（+ Add more で行を足す）

   | | | |
   |---|---|---|
   | Account | Cloudflare Pages | Edit |
   | Account | Account Analytics | Read |

5. **Account Resources** で自分のアカウントを選ぶ
6. Continue → Create Token → 表示されたトークンをコピー → ③APIトークン

> **この画面を離れると二度と表示されません。** 先にメモしてから次に進んでください。
>
> 権限を分けたい場合はデプロイ用と計測用でトークンを2つ作っても構いませんが、
> スマホでは行き来が増えるので、まずは1つにまとめて構いません
> （Step 5 で2つの Secret に同じ値を入れます）。

---

## Step 5. GitHub に Secrets を登録する

ブラウザで <https://github.com/tatsuhideimao-afk/tool-factory> を開き、
**Settings** → 左メニュー **Secrets and variables** → **Actions** →
**New repository secret** で1つずつ登録します。

| Name | Secret |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | ②アカウントID |
| `CLOUDFLARE_API_TOKEN` | ③APIトークン |
| `CF_ANALYTICS_API_TOKEN` | ③APIトークン（同じ値でOK） |

Discord に通知したい場合は、Discord のチャンネル設定 → 連携サービス → ウェブフック
から URL を作り、`DISCORD_WEBHOOK_URL` としてもう1つ登録してください（任意。
未登録でもワークフローのログに判定結果が出ます）。

---

## Step 6. `config/site.json` を編集する

GitHub のファイル画面はスマホのブラウザから直接編集できます。

1. <https://github.com/tatsuhideimao-afk/tool-factory/blob/main/config/site.json> を開く
2. 右上の **鉛筆アイコン**（Edit this file）をタップ
3. 中身を書き換える

   ```json
   {
     "origin": "https://tool-factory.pages.dev",
     "siteName": "サイトの表示名",
     "contactEmail": "あなたのメールアドレス",
     "pagesProject": "tool-factory",
     "webAnalyticsToken": "①token"
   }
   ```

   - `origin` — Step 0 で決めたURL。**末尾にスラッシュを付けない**
   - `pagesProject` — Cloudflare Pages のプロジェクト名。A を選んだ場合は
     `<pagesProject>.pages.dev` が公開URLになるので、`origin` と揃えること
   - `siteName` — ページ上部とOGPに出る名前
   - `webAnalyticsToken` — Step 2 の ①token を **ダブルクォートで囲んで**入れる

4. **Commit changes** → Commit directly to the `main` branch → コミット

コミットすると Deploy ワークフローが自動で走ります。

---

## Step 7. 公開されたか確認する

1. リポジトリの **Actions** タブ → 一番上の **Deploy (Web)** を開く
2. 全ステップが緑になるまで待つ（約1分）
3. `https://<あなたのURL>/` を開いて、ツール3本が並んでいれば成功

Pages プロジェクトはワークフローが自動で作るので、Cloudflare 側での事前作成は不要です。

**もし失敗したら**、失敗したステップをタップするとログが出ます。
よくある原因は次の2つです。

| ログに出る内容 | 原因 |
|---|---|
| `Authentication error` / `10000` | ③APIトークンの権限不足。Step 4 の2行が入っているか確認 |
| `CLOUDFLARE_API_TOKEN ... 未設定` | Secret 名のタイプミス。大文字・アンダースコアまで一致しているか確認 |

---

## Step 8.（Bを選んだ場合のみ）独自ドメインを紐づける

1. Cloudflare → **Workers & Pages** → `tool-factory` → **Custom domains**
2. **Set up a custom domain** → ドメインを入力して指示に従う
3. 反映後、`config/site.json` の `origin` をそのドメインに変えて再コミット

---

## Step 9. Search Console に登録する

**これだけは自動化できません**（Google が ping API を廃止したため）。1回だけの作業です。

1. <https://search.google.com/search-console> を開く
2. プロパティを追加 → **URL プレフィックス** に公開URLを入力
3. 所有権の確認
   - 独自ドメインなら DNS レコード（Cloudflare の DNS 画面で追加）
   - `.pages.dev` なら HTMLタグ方式を選び、出てきた `<meta name="google-site-verification" ...>`
     の content の値を教えてください。こちらでページに埋め込んでコミットします
4. 確認できたら左メニュー **サイトマップ** → `sitemap.xml` と入力して送信

---

## Step 10. Day 0 を記録して実測開始

1. <https://github.com/tatsuhideimao-afk/tool-factory/blob/main/docs/PHASE1.md> を開く
2. 鉛筆アイコンで編集し、**開始日 (Day 0)** に今日の日付を書いてコミット
3. `data/tools.json` の3件の `created_at` も同じ日付に揃える
   （判定の起点になります。ここがズレると30日判定の日がズレます）

ここから30日間は、

- **宣伝しない**（SNS投稿・被リンク・知人への共有すべて）
- **コードを触らない**
- **ツールを追加しない**

を守ってください。毎日 03:00 JST に計測が回り、Discord を設定していれば通知が届きます。

---

## 詰まったときのために

Actions のログのスクリーンショットか、失敗したステップ名を送ってもらえれば、
原因を特定して修正を push します。Cloudflare の画面構成は変わることがあるので、
「そんな項目が見当たらない」場合も遠慮なく聞いてください。
