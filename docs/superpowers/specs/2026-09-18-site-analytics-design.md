# 自作アクセス解析システム 設計書

- 日付: 2026-09-18
- ステータス: 承認済み（実装計画へ進行）

## 目的

GitHub Pagesで公開している複数の静的サイト（ポートフォリオ、各種シミュレーター等）の
日別アクセス数（PV/UU）を、自分だけが見られる1つのダッシュボードで確認する。

## 全体構成

- 新規GitHubリポジトリ `site-analytics` を作成し、GitHub Pagesで `tracker.js` を公開する
  （ローカルフォルダ: `~/projects/site-analytics`）
- GASプロジェクトを **2つに分割**し、同一スプレッドシート（IDで参照）を共有する
  - **collector**（`doPost` 専用）: デプロイ設定「実行者: 自分 / アクセスできるユーザー: 全員」
    → tracker.js の送信先エンドポイント
  - **dashboard**（`doGet` 専用、集計・トリガーもここに集約）: デプロイ設定「実行者: 自分 / アクセスできるユーザー: 自分のみ」
    → Google認証必須。秘密トークン方式は採用しない
- データは1つのスプレッドシートに集約（`raw` / `daily` の2シート）

## 成果物

- `tracker.js` — 計測スニペット
- `collector.gs` — 受信用GASプロジェクトのコード
- `dashboard.gs` — ダッシュボード用GASプロジェクトのコード（集計・トリガー含む）
- `dashboard.html` — GAS HtmlService ダッシュボード画面
- `README.md` — セットアップ手順（スプレッドシート作成→GASデプロイ→各サイトへの埋め込み）と既知の制約

## tracker.js

### 埋め込み

```html
<script src="https://<user>.github.io/site-analytics/tracker.js?v=1" data-site-id="portfolio"></script>
```

- クエリ `?v=` でバージョン管理する。tracker.js の内容を更新した場合は、埋め込みタグ側の
  `?v=` の数字を上げてブラウザ/CDNキャッシュを回避する（README に更新手順を記載）
- 送信先エンドポイント（collectorのWebアプリURL）は tracker.js 内に定数として埋め込む。
  各サイトは `data-site-id` のみ指定すればよい

### 挙動

- 起動時ガード
  - `location.hostname` が `localhost` / `127.0.0.1` の場合は何もしない
  - `navigator.userAgent` が `/bot|crawler|spider/i` にマッチする場合は何もしない
- 日付生成: **クライアント側でローカル日付から `YYYY-MM-DD` を生成**し、送信データの `date`
  フィールドに含める。GAS側はサーバーで日付を再計算せず、この値をそのまま集計キーとして使う
- UU判定: `localStorage` キー `sa_uu_{siteId}_{date}` の有無で判定。存在しなければ
  `isUU: true` として送信データに含め、キーをセットする
  - `localStorage` への読み書きは**個別に `try/catch` で保護**する。読み書きに失敗した場合
    （プライベートブラウジング等でストレージ利用不可）は UU 判定を諦め、PVのみ記録する目的で
    `isUU: true` を送る（UU過大計上のフォールバック。README に注記）
- 送信データ: `{ siteId, path, referrer, ua, screenWidth, timestamp, date, isUU }`
- 送信方式: `fetch(ENDPOINT, { method: 'POST', keepalive: true, headers: { 'Content-Type':
  'text/plain' }, body: JSON.stringify(payload) })`
  - **CORS対策**: `Content-Type: application/json` で送るとブラウザがプリフライト
    （OPTIONS）リクエストを発行し、GAS Web App はプリフライトに正しく応答できず失敗する。
    そのため `Content-Type: text/plain` として送信し、GAS 側の `doPost` で
    `JSON.parse(e.postData.contents)` により手動でパースする方式を採用する
  - スクリプト全体を `try/catch` で包み、`fetch` の失敗も `.catch(() => {})` で握りつぶす
    （サイト本体の動作に一切影響しない）

## collector.gs

- `ALLOWED_SITE_IDS` 定数配列を保持する。受信した `siteId` がこの配列に含まれない場合は
  **記録せず破棄**する（レスポンスは通常どおり返す。新しいサイトを追加する際は配列に手動追加）
- `LockService.getScriptLock()` による排他制御。`tryLock(3000)`（3秒待機）が失敗した場合は
  **黙って終了**する（エラーを投げず、書き込みも行わない）
- `doPost(e)` の処理順序:
  1. `JSON.parse(e.postData.contents)`（失敗時は静かに終了）
  2. `siteId` が `ALLOWED_SITE_IDS` に含まれるかチェック（含まれなければ終了）
  3. `ua` の bot 判定（マッチすれば終了）
  4. `LockService.getScriptLock().tryLock(3000)`（失敗すれば終了）
  5. `path` / `referrer` / `ua` を `sanitizeForSheet_()` でサニタイズ（値が `=` `+` `-` `@`
     のいずれかで始まる場合、先頭にシングルクォートを付与して文字列として強制する。
     これらの値は「アクセスできるユーザー: 全員」で受信するため攻撃者が任意の文字列を
     送信可能であり、無害化しないと Google スプレッドシートの数式として解釈され、
     シートを開いた際に意図しない数式実行や外部へのデータ流出（CSV/数式インジェクション）
     を招く恐れがある）
  6. `raw` シートへ1行追記（`date, timestamp, siteId, path, referrer, ua, screenWidth, isUU`）
  7. ロック解放

## dashboard.gs

- `doGet(e)`: `dashboard.html` を返す（デプロイ設定が「自分のみ」のため、未認証ユーザーは
  そもそもこの関数に到達しない）
- `getSiteList()`: `daily` シートから既知の `siteId` を自動検出して返す（ダッシュボードの
  プルダウン用。新サイト追加時も手動登録不要）
- `getDashboardData(siteId)`: `daily` シートから直近30日分（`date, pv, uu`）を返す
- `getTodayStats(siteId)`: **当日分を `raw` シートから直接集計**して返す（`date` フィールドが
  本日の行を対象に PV/UU を計算）
- `aggregateDaily()`: 日次トリガーで実行。前日分の `raw` を `siteId` ごとに集計し、`daily`
  シートへ upsert（同じ `date`+`siteId` の行が既にあれば更新、なければ追加）。
  併せて **90日より前の `raw` 行を削除**する
- `setup()`: `raw` / `daily` シートのヘッダー行を作成する初期セットアップ関数（初回に手動実行）。
  併せて両シートの `date` 列（A列）を `setNumberFormat('@')` でプレイン
  テキスト形式に固定する。Sheetsのセル書式が「自動」のままだと、`appendRow`
  等で書き込んだ `YYYY-MM-DD` 形式の文字列がDateオブジェクトへ自動変換されてしまい、
  `aggregateDaily` / `deleteOldRawRows_` / `getDashboardData` / `getTodayStats` が行う
  `String(row.date)` ベースの日付文字列比較が静かに壊れる（集計されない・削除されない・
  フィルタが機能しない等）。列全体（`'A:A'`）に書式を設定することで、既存行だけでなく
  `collector.gs` を含む今後の追記行にも自動で適用される
- `createDailyTrigger()`: `aggregateDaily` の日次時間主導トリガーを設置する関数
  （初回に手動実行）

## dashboard.html

- Google Charts（`https://www.gstatic.com/charts/loader.js`。「外部ライブラリは極力使わない」
  方針の例外として明記）で直近30日の折れ線グラフを描画
- サイト切り替えプルダウン（`getSiteList()` で自動検出した一覧）
- `getDashboardData(siteId)`（昨日まで）と `getTodayStats(siteId)`（当日）の両方を呼び出し、
  クライアント側で `date` をキーにマージしてテーブル・グラフを表示する
  （「昨日までの確定値＋当日の速報値」を1本の系列として表示）

## データフロー

```
サイト訪問
  → tracker.js（bot/localhost判定、YYYY-MM-DD生成、UU判定はtry/catchで保護）
  → fetch keepalive POST（text/plain）
  → collector.gs doPost（siteId許可チェック→bot判定→Lock→raw追記）
  → （日次トリガー）
  → dashboard.gs aggregateDaily()（raw→daily集計、90日超rawを削除）
  → 自分のみアクセス可の doGet → dashboard.html
  → getDashboardData（daily）+ getTodayStats（raw当日分）をマージして表示
```

## エラーハンドリング

- tracker.js: 例外・送信失敗をすべて握りつぶし、サイト本体に一切影響を与えない
- collector.gs: 不正な入力（JSON不正・siteId不一致・ロック取得失敗）はすべて静かに無視し、
  エラーを外部に見せない
- dashboard.gs の集計処理: 個人用ツールのため通知等は行わず、実行ログのみ残す

## テスト方針

自動テスト基盤は個人ツールとしてはオーバーエンジニアリングと判断し、作成しない。
README に以下の手動確認手順を明記する。

1. ブラウザで計測対象ページを開き、Network タブで collector への POST が飛んでいることを確認
2. スプレッドシートの `raw` シートに1行追記されていることを確認
3. `aggregateDaily()` を手動実行し、`daily` シートへの集計・90日超`raw`の削除を確認
4. `getTodayStats()` の戻り値をGASエディタの実行ログで確認
5. ダッシュボードURL（Google認証必須）を開き、サイト切り替え・テーブル・グラフ表示を確認

## 既知の制約（READMEに記載）

- **なりすまし送信のリスク**: `collector.gs` は「アクセスできるユーザー: 全員」でデプロイする
  ため、`siteId` さえ一致すれば第三者が任意のデータを送り込める（例: PV/UU水増し）。個人の
  参考指標としての利用を想定しており、厳密な不正対策（署名検証等）は行わない
- **`getTodayStats()` のパフォーマンス**: `raw` シートを毎回全走査して当日分を集計するため、
  `raw` の行数が増えるとダッシュボードの当日分表示が遅くなる（`aggregateDaily()` による
  90日超`raw`削除で行数の上限は一定に保たれるが、直近90日分のアクセスが非常に多い場合は
  体感速度に影響し得る）
- ローカルストレージが使えない環境（プライベートブラウジング等）では UU が PV と同数に
  近づく（過大計上side）
