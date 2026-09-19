# 自作アクセス解析システム Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GitHub Pages上の複数サイトの日別PV/UUを、自分専用のGASダッシュボードで確認できるアクセス解析システムを構築する。

**Architecture:** ブラウザに埋め込む `tracker.js`（純粋関数を分離しNodeでTDD）が `collector.gs`（公開doPost、LockServiceで排他制御、siteId許可リストで検証）にデータを送り、`raw`シートへ蓄積。`dashboard.gs`（自分のみアクセス可のdoGet）が日次トリガーで`raw`→`daily`に集計しつつ90日超の`raw`を削除し、`dashboard.html`が`daily`＋当日`raw`を合成して表示する。

**Tech Stack:** Vanilla JS（ビルドツールなし）、Node.js組み込みテストランナー（`node:test`）、Google Apps Script（GASネイティブAPIのみ）、Google Charts（gstatic CDN、唯一の外部ライブラリ例外）

参照設計書: `docs/superpowers/specs/2026-09-18-site-analytics-design.md`

---

## File Structure

- `tracker.js` — 計測スニペット本体（純粋関数はCommonJSエクスポートガード付きでテスト可能にする）
- `test/tracker.test.js` — `tracker.js` の純粋関数のユニットテスト
- `package.json` — `npm test` で `node --test` を実行するためのメタデータ（依存ライブラリなし）
- `collector.gs` — 受信専用GASプロジェクトのコード（別GASプロジェクトへ貼り付け）
- `dashboard.gs` — ダッシュボード用GASプロジェクトのコード（集計・トリガー含む、別GASプロジェクトへ貼り付け）
- `dashboard.html` — GAS HtmlServiceのダッシュボード画面（dashboard.gsと同じGASプロジェクトへ貼り付け）
- `README.md` — セットアップ手順・埋め込み手順・既知の制約
- `.gitignore` — Node関連の無視設定

---

### Task 1: リポジトリの初期スキャフォールド

**Files:**
- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: package.json を作成**

```json
{
  "name": "site-analytics",
  "version": "1.0.0",
  "private": true,
  "description": "Self-hosted access analytics for GitHub Pages sites (tracker.js + Google Apps Script)",
  "scripts": {
    "test": "node --test test/"
  }
}
```

- [ ] **Step 2: .gitignore を作成**

```
node_modules/
*.log
```

- [ ] **Step 3: コミット**

```bash
git add package.json .gitignore
git commit -m "chore: scaffold repo with test runner config"
```

---

### Task 2: tracker.js — ホスト判定・bot判定（TDD）

**Files:**
- Create: `tracker.js`
- Create: `test/tracker.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`test/tracker.test.js`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const tracker = require('../tracker.js');

test('isLocalHost detects localhost and 127.0.0.1', () => {
  assert.equal(tracker.isLocalHost('localhost'), true);
  assert.equal(tracker.isLocalHost('127.0.0.1'), true);
  assert.equal(tracker.isLocalHost('example.com'), false);
  assert.equal(tracker.isLocalHost('mysite.github.io'), false);
});

test('isBotUA detects bot/crawler/spider case-insensitively', () => {
  assert.equal(tracker.isBotUA('Mozilla/5.0 Googlebot/2.1'), true);
  assert.equal(tracker.isBotUA('some-CRAWLER-agent'), true);
  assert.equal(tracker.isBotUA('SpiderMan Browser'), true);
  assert.equal(tracker.isBotUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), false);
  assert.equal(tracker.isBotUA(''), false);
  assert.equal(tracker.isBotUA(undefined), false);
});
```

- [ ] **Step 2: テストを実行し失敗を確認**

Run: `npm test`
Expected: FAIL（`../tracker.js` が存在しない、または `module.exports` が未定義でエラー）

- [ ] **Step 3: tracker.js の骨格と対象関数を実装**

`tracker.js`:

```javascript
(function () {
  'use strict';

  var ENDPOINT = 'https://script.google.com/macros/s/PUT_COLLECTOR_DEPLOYMENT_ID_HERE/exec';
  var BOT_UA_PATTERN = /bot|crawler|spider/i;

  function isLocalHost(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1';
  }

  function isBotUA(ua) {
    return BOT_UA_PATTERN.test(ua || '');
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      isLocalHost: isLocalHost,
      isBotUA: isBotUA
    };
  }
})();
```

- [ ] **Step 4: テストを実行し成功を確認**

Run: `npm test`
Expected: PASS（2 tests）

- [ ] **Step 5: コミット**

```bash
git add tracker.js test/tracker.test.js
git commit -m "feat(tracker): add localhost and bot UA detection"
```

---

### Task 3: tracker.js — ローカル日付生成（TDD）

**Files:**
- Modify: `tracker.js`
- Modify: `test/tracker.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`test/tracker.test.js` に追記:

```javascript
test('formatLocalDate formats as YYYY-MM-DD with zero padding', () => {
  assert.equal(tracker.formatLocalDate(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(tracker.formatLocalDate(new Date(2026, 11, 31)), '2026-12-31');
  assert.equal(tracker.formatLocalDate(new Date(2026, 8, 18)), '2026-09-18');
});
```

- [ ] **Step 2: テストを実行し失敗を確認**

Run: `npm test`
Expected: FAIL（`tracker.formatLocalDate is not a function`）

- [ ] **Step 3: formatLocalDate を実装**

`tracker.js` の `isBotUA` 関数の下に追加:

```javascript
  function formatLocalDate(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
```

`module.exports` オブジェクトに `formatLocalDate: formatLocalDate` を追加。

- [ ] **Step 4: テストを実行し成功を確認**

Run: `npm test`
Expected: PASS（5 tests）

- [ ] **Step 5: コミット**

```bash
git add tracker.js test/tracker.test.js
git commit -m "feat(tracker): add local date formatting (YYYY-MM-DD)"
```

---

### Task 4: tracker.js — UU判定（localStorage、try/catch保護、TDD）

**Files:**
- Modify: `tracker.js`
- Modify: `test/tracker.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`test/tracker.test.js` に追記:

```javascript
function makeMemoryStorage() {
  var store = {};
  return {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
    setItem: function (key, value) { store[key] = value; }
  };
}

function makeThrowingStorage() {
  return {
    getItem: function () { throw new Error('storage disabled'); },
    setItem: function () { throw new Error('storage disabled'); }
  };
}

test('buildUUKey namespaces by siteId and date', () => {
  assert.equal(tracker.buildUUKey('portfolio', '2026-09-18'), 'sa_uu_portfolio_2026-09-18');
});

test('checkAndMarkUU returns true on first visit, false on repeat', () => {
  var storage = makeMemoryStorage();
  assert.equal(tracker.checkAndMarkUU('portfolio', '2026-09-18', storage), true);
  assert.equal(tracker.checkAndMarkUU('portfolio', '2026-09-18', storage), false);
});

test('checkAndMarkUU treats a different site or date as a new UU', () => {
  var storage = makeMemoryStorage();
  tracker.checkAndMarkUU('portfolio', '2026-09-18', storage);
  assert.equal(tracker.checkAndMarkUU('portfolio', '2026-09-19', storage), true);
  assert.equal(tracker.checkAndMarkUU('other-site', '2026-09-18', storage), true);
});

test('checkAndMarkUU falls back to true when storage throws', () => {
  var storage = makeThrowingStorage();
  assert.equal(tracker.checkAndMarkUU('portfolio', '2026-09-18', storage), true);
});
```

- [ ] **Step 2: テストを実行し失敗を確認**

Run: `npm test`
Expected: FAIL（`tracker.buildUUKey is not a function`）

- [ ] **Step 3: buildUUKey / checkAndMarkUU を実装**

`tracker.js` の `formatLocalDate` の下に追加:

```javascript
  function buildUUKey(siteId, dateStr) {
    return 'sa_uu_' + siteId + '_' + dateStr;
  }

  function checkAndMarkUU(siteId, dateStr, storage) {
    var key = buildUUKey(siteId, dateStr);
    try {
      if (storage.getItem(key)) {
        return false;
      }
      storage.setItem(key, '1');
      return true;
    } catch (e) {
      return true;
    }
  }
```

`module.exports` に `buildUUKey: buildUUKey, checkAndMarkUU: checkAndMarkUU` を追加。

- [ ] **Step 4: テストを実行し成功を確認**

Run: `npm test`
Expected: PASS（9 tests）

- [ ] **Step 5: コミット**

```bash
git add tracker.js test/tracker.test.js
git commit -m "feat(tracker): add UU dedup via localStorage with try/catch fallback"
```

---

### Task 5: tracker.js — ペイロード生成（TDD）

**Files:**
- Modify: `tracker.js`
- Modify: `test/tracker.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`test/tracker.test.js` に追記:

```javascript
test('buildPayload assembles the full tracking payload', () => {
  var storage = makeMemoryStorage();
  var now = new Date(2026, 8, 18, 10, 30, 0);
  var payload = tracker.buildPayload({
    siteId: 'portfolio',
    path: '/about',
    referrer: 'https://google.com/',
    ua: 'Mozilla/5.0',
    screenWidth: 1440,
    now: now,
    storage: storage
  });

  assert.equal(payload.siteId, 'portfolio');
  assert.equal(payload.path, '/about');
  assert.equal(payload.referrer, 'https://google.com/');
  assert.equal(payload.ua, 'Mozilla/5.0');
  assert.equal(payload.screenWidth, 1440);
  assert.equal(payload.date, '2026-09-18');
  assert.equal(payload.timestamp, now.toISOString());
  assert.equal(payload.isUU, true);
});

test('buildPayload marks isUU false on a repeat visit same day', () => {
  var storage = makeMemoryStorage();
  var now = new Date(2026, 8, 18, 10, 30, 0);
  var opts = { siteId: 'portfolio', path: '/', referrer: '', ua: '', screenWidth: 800, now: now, storage: storage };
  tracker.buildPayload(opts);
  var second = tracker.buildPayload(opts);
  assert.equal(second.isUU, false);
});
```

- [ ] **Step 2: テストを実行し失敗を確認**

Run: `npm test`
Expected: FAIL（`tracker.buildPayload is not a function`）

- [ ] **Step 3: buildPayload を実装**

`tracker.js` の `checkAndMarkUU` の下に追加:

```javascript
  function buildPayload(opts) {
    var dateStr = formatLocalDate(opts.now);
    var isUU = checkAndMarkUU(opts.siteId, dateStr, opts.storage);
    return {
      siteId: opts.siteId,
      path: opts.path,
      referrer: opts.referrer,
      ua: opts.ua,
      screenWidth: opts.screenWidth,
      timestamp: opts.now.toISOString(),
      date: dateStr,
      isUU: isUU
    };
  }
```

`module.exports` に `buildPayload: buildPayload` を追加。

- [ ] **Step 4: テストを実行し成功を確認**

Run: `npm test`
Expected: PASS（11 tests）

- [ ] **Step 5: コミット**

```bash
git add tracker.js test/tracker.test.js
git commit -m "feat(tracker): compose tracking payload from date and UU logic"
```

---

### Task 6: tracker.js — 送信処理とブラウザ実行エントリポイント（手動検証）

自動テストでは `fetch` / `document` / `window` をモックせず（外部ライブラリ非使用の方針のため jsdom 等は使わない）、ここはブラウザでの手動検証とする。

**Files:**
- Modify: `tracker.js`

- [ ] **Step 1: send() と main() を実装し、モジュールエクスポートガードを完成させる**

`tracker.js` の `buildPayload` の下、IIFE末尾の `if (typeof module...)` ブロックの手前に追加:

```javascript
  function send(payload, endpoint) {
    try {
      fetch(endpoint, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      }).catch(function () {});
    } catch (e) {
      // no-op: tracker must never throw into the host page
    }
  }

  function main() {
    try {
      if (isLocalHost(location.hostname)) return;
      if (isBotUA(navigator.userAgent)) return;
      var scriptEl = document.currentScript;
      var siteId = scriptEl && scriptEl.getAttribute('data-site-id');
      if (!siteId) return;
      var payload = buildPayload({
        siteId: siteId,
        path: location.pathname,
        referrer: document.referrer,
        ua: navigator.userAgent,
        screenWidth: window.innerWidth,
        now: new Date(),
        storage: window.localStorage
      });
      send(payload, ENDPOINT);
    } catch (e) {
      // no-op: tracker must never throw into the host page
    }
  }
```

`module.exports` ブロックを次のように変更（エクスポート時は `main()` を呼ばず、ブラウザ実行時のみ呼ぶ）:

```javascript
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      isLocalHost: isLocalHost,
      isBotUA: isBotUA,
      formatLocalDate: formatLocalDate,
      buildUUKey: buildUUKey,
      checkAndMarkUU: checkAndMarkUU,
      buildPayload: buildPayload
    };
  } else {
    main();
  }
```

- [ ] **Step 2: 既存テストが引き続き通ることを確認**

Run: `npm test`
Expected: PASS（11 tests、全て変わらず成功）

- [ ] **Step 3: ブラウザでの手動検証手順（このタスクの受け入れ確認）**

1. `tracker.js` と同じ階層に一時的な `test.html` を作成し、以下を貼り付けてブラウザで開く（GitHub Pages公開前のローカル確認用。コミットしない）:
   ```html
   <!DOCTYPE html><html><body>
   <script src="tracker.js" data-site-id="portfolio"></script>
   </body></html>
   ```
2. `localhost` で開いているため、DevToolsのNetworkタブに `script.google.com` へのリクエストが**出ないこと**を確認する（ローカル開発時は送信しないガードの確認）。
3. `test.html` を削除する（`rm test.html`）。

- [ ] **Step 4: コミット**

```bash
git add tracker.js
git commit -m "feat(tracker): wire up fetch send and browser entry point"
```

---

### Task 7: Google スプレッドシート作成とシート初期化（手動 + dashboard.gs実装）

GASはローカル実行できないため、このタスク以降は手動検証（README記載の確認手順）で受け入れを確認する。

**Files:**
- Create: `dashboard.gs`

- [ ] **Step 1: dashboard.gs を作成**

```javascript
var SPREADSHEET_ID = 'PUT_YOUR_SPREADSHEET_ID_HERE'; // collector.gs と同じスプレッドシートID
var RAW_SHEET_NAME = 'raw';
var DAILY_SHEET_NAME = 'daily';
var RAW_RETENTION_DAYS = 90;

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('dashboard')
    .setTitle('Site Analytics')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function setup() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var raw = ss.getSheetByName(RAW_SHEET_NAME) || ss.insertSheet(RAW_SHEET_NAME);
  if (raw.getLastRow() === 0) {
    raw.appendRow(['date', 'timestamp', 'siteId', 'path', 'referrer', 'ua', 'screenWidth', 'isUU']);
  }
  raw.getRange('A:A').setNumberFormat('@');
  var daily = ss.getSheetByName(DAILY_SHEET_NAME) || ss.insertSheet(DAILY_SHEET_NAME);
  if (daily.getLastRow() === 0) {
    daily.appendRow(['date', 'siteId', 'pv', 'uu']);
  }
  daily.getRange('A:A').setNumberFormat('@');
}
```

`raw.getRange('A:A').setNumberFormat('@')` / `daily.getRange('A:A').setNumberFormat('@')` は、
両シートの `date` 列（A列）をプレインテキスト形式に固定する。Sheetsのセル書式が「自動」の
ままだと、`YYYY-MM-DD` のような日付に見える文字列を `appendRow`/`setValue` で書き込んだ際に
Dateオブジェクトへ自動変換されてしまい、`aggregateDaily` / `deleteOldRawRows_` /
`getDashboardData` / `getTodayStats` が行う `String(row.date)` ベースの文字列比較が
静かに壊れる（集計が一切走らない、90日超の `raw` 行が永久に削除されない、「直近30日」
フィルタが機能しない等）。列全体（`'A:A'`）に対して書式を設定することで、既存行だけでなく
`collector.gs`（未実装）を含む今後の追記行にも書式が自動的に適用される。これらの呼び出しは
ヘッダー作成の `if` 節の外（無条件）に置き、既に初期化済みのスプレッドシートに対して
`setup()` を再実行しても書式が再適用される（同じ書式を再設定するだけなので安全・冪等）。

```javascript
function createDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'aggregateDaily') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('aggregateDaily').timeBased().everyDays(1).atHour(2).create();
}

function formatDate_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function readSheetAsObjects_(sheet) {
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = {};
    for (var c = 0; c < headers.length; c++) {
      row[headers[c]] = values[i][c];
    }
    rows.push(row);
  }
  return rows;
}
```

- [ ] **Step 2: 手動検証**

1. Googleドライブで新規スプレッドシートを作成し、URLからスプレッドシートIDを控える。
2. `拡張機能 > Apps Script` からスタンドアロンではなくこのスプレッドシート**バインド**のGASプロジェクトを開く（後続タスクでファイルを追加していく）。
3. このステップでは実行しない（`setup()` はTask 9の後にまとめて実行・確認する）。

- [ ] **Step 3: コミット**

```bash
git add dashboard.gs
git commit -m "feat(dashboard.gs): add doGet, setup, and trigger installer"
```

---

### Task 8: aggregateDaily / getTodayStats / getSiteList / getDashboardData の実装

**Files:**
- Modify: `dashboard.gs`

- [ ] **Step 1: 集計・削除・取得関数を実装**

`dashboard.gs` の末尾に追加:

```javascript
function aggregateDaily() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var rawSheet = ss.getSheetByName(RAW_SHEET_NAME);
  var dailySheet = ss.getSheetByName(DAILY_SHEET_NAME);

  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  var targetDate = formatDate_(yesterday);

  var rawRows = readSheetAsObjects_(rawSheet);
  var stats = {};
  rawRows.forEach(function (row) {
    if (String(row.date) !== targetDate) return;
    var siteId = row.siteId;
    if (!stats[siteId]) stats[siteId] = { pv: 0, uu: 0 };
    stats[siteId].pv += 1;
    if (Number(row.isUU) === 1) stats[siteId].uu += 1;
  });

  var dailyValues = dailySheet.getDataRange().getValues();
  var dailyHeaders = dailyValues[0];
  var dateCol = dailyHeaders.indexOf('date');
  var siteCol = dailyHeaders.indexOf('siteId');
  var pvCol = dailyHeaders.indexOf('pv');
  var uuCol = dailyHeaders.indexOf('uu');

  Object.keys(stats).forEach(function (siteId) {
    var existingRowIndex = -1;
    for (var i = 1; i < dailyValues.length; i++) {
      if (String(dailyValues[i][dateCol]) === targetDate && dailyValues[i][siteCol] === siteId) {
        existingRowIndex = i;
        break;
      }
    }
    var pv = stats[siteId].pv;
    var uu = stats[siteId].uu;
    if (existingRowIndex === -1) {
      dailySheet.appendRow([targetDate, siteId, pv, uu]);
    } else {
      dailySheet.getRange(existingRowIndex + 1, pvCol + 1).setValue(pv);
      dailySheet.getRange(existingRowIndex + 1, uuCol + 1).setValue(uu);
    }
  });

  deleteOldRawRows_(rawSheet);
}

function deleteOldRawRows_(rawSheet) {
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RAW_RETENTION_DAYS);
  var cutoffStr = formatDate_(cutoff);

  var values = rawSheet.getDataRange().getValues();
  var rowsToDelete = [];
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) < cutoffStr) {
      rowsToDelete.push(i + 1);
    }
  }
  for (var j = rowsToDelete.length - 1; j >= 0; j--) {
    rawSheet.deleteRow(rowsToDelete[j]);
  }
}

function getSiteList() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var daily = readSheetAsObjects_(ss.getSheetByName(DAILY_SHEET_NAME));
  var seen = {};
  daily.forEach(function (row) {
    if (row.siteId) seen[row.siteId] = true;
  });
  return Object.keys(seen).sort();
}

function getDashboardData(siteId) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var daily = readSheetAsObjects_(ss.getSheetByName(DAILY_SHEET_NAME));
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  var cutoffStr = formatDate_(cutoff);

  return daily
    .filter(function (row) {
      return row.siteId === siteId && String(row.date) >= cutoffStr;
    })
    .map(function (row) {
      return { date: String(row.date), pv: Number(row.pv), uu: Number(row.uu) };
    })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
}

function getTodayStats(siteId) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var raw = readSheetAsObjects_(ss.getSheetByName(RAW_SHEET_NAME));
  var today = formatDate_(new Date());

  var pv = 0;
  var uu = 0;
  raw.forEach(function (row) {
    if (row.siteId === siteId && String(row.date) === today) {
      pv += 1;
      if (Number(row.isUU) === 1) uu += 1;
    }
  });

  return { date: today, pv: pv, uu: uu };
}
```

- [ ] **Step 2: 手動検証（GASエディタで後続タスク後にまとめて実施）**

このステップでは実行しない。Task 11のREADME確認手順でまとめて検証する。

- [ ] **Step 3: コミット**

```bash
git add dashboard.gs
git commit -m "feat(dashboard.gs): add daily aggregation, raw retention, and dashboard data getters"
```

---

### Task 9: collector.gs の実装

**Files:**
- Create: `collector.gs`

- [ ] **Step 1: collector.gs を作成**

```javascript
var SPREADSHEET_ID = 'PUT_YOUR_SPREADSHEET_ID_HERE'; // dashboard.gs と同じスプレッドシートID
var ALLOWED_SITE_IDS = ['portfolio']; // 例。計測したいサイトのsiteIdに置き換え・追加する
var BOT_UA_PATTERN = /bot|crawler|spider/i;
var RAW_SHEET_NAME = 'raw';

function sanitizeForSheet_(value) {
  var str = String(value == null ? '' : value);
  if (/^[=+\-@]/.test(str)) {
    return "'" + str;
  }
  return str;
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput('ok');
  }

  if (!body || ALLOWED_SITE_IDS.indexOf(body.siteId) === -1) {
    return ContentService.createTextOutput('ok');
  }

  if (BOT_UA_PATTERN.test(body.ua || '')) {
    return ContentService.createTextOutput('ok');
  }

  var lock = LockService.getScriptLock();
  var acquired = false;
  try {
    acquired = lock.tryLock(3000);
  } catch (err) {
    acquired = false;
  }

  if (!acquired) {
    return ContentService.createTextOutput('ok');
  }

  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(RAW_SHEET_NAME);
    sheet.appendRow([
      sanitizeForSheet_(body.date || ''),
      sanitizeForSheet_(body.timestamp || ''),
      body.siteId || '',
      sanitizeForSheet_(body.path || ''),
      sanitizeForSheet_(body.referrer || ''),
      sanitizeForSheet_(body.ua || ''),
      Number(body.screenWidth) || 0,
      body.isUU ? 1 : 0
    ]);
  } catch (err) {
    Logger.log(err); // visible in GAS Executions log for debugging; never surfaces to the HTTP caller
  } finally {
    lock.releaseLock();
  }

  return ContentService.createTextOutput('ok');
}
```

- [ ] **Step 2: 手動検証（GASデプロイ後にまとめて実施）**

このステップでは実行しない。Task 11のREADME確認手順でまとめて検証する。

- [ ] **Step 3: コミット**

```bash
git add collector.gs
git commit -m "feat(collector.gs): add doPost with site allowlist, script lock, and formula-injection guard"
```

---

### Task 10: dashboard.html の実装

**Files:**
- Create: `dashboard.html`

- [ ] **Step 1: dashboard.html を作成**

```html
<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <meta charset="utf-8">
  <script src="https://www.gstatic.com/charts/loader.js"></script>
  <style>
    body { font-family: sans-serif; margin: 24px; }
    select { font-size: 14px; padding: 4px; margin-bottom: 16px; }
    table { border-collapse: collapse; margin-top: 16px; }
    th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: right; }
    th:first-child, td:first-child { text-align: left; }
    #chart { width: 100%; max-width: 800px; height: 320px; }
  </style>
</head>
<body>
  <h1>Site Analytics</h1>
  <select id="siteSelect"></select>
  <div id="chart"></div>
  <table id="statsTable">
    <thead><tr><th>date</th><th>pv</th><th>uu</th></tr></thead>
    <tbody></tbody>
  </table>

  <script>
    google.charts.load('current', { packages: ['corechart'] });

    function init() {
      google.script.run.withSuccessHandler(populateSiteSelect).getSiteList();
    }

    function populateSiteSelect(siteIds) {
      var select = document.getElementById('siteSelect');
      select.innerHTML = '';
      siteIds.forEach(function (siteId) {
        var option = document.createElement('option');
        option.value = siteId;
        option.textContent = siteId;
        select.appendChild(option);
      });
      select.addEventListener('change', function () {
        loadStats(select.value);
      });
      if (siteIds.length > 0) {
        loadStats(siteIds[0]);
      }
    }

    function loadStats(siteId) {
      google.script.run.withSuccessHandler(function (dailyRows) {
        google.script.run.withSuccessHandler(function (todayRow) {
          renderStats(mergeStats(dailyRows, todayRow));
        }).getTodayStats(siteId);
      }).getDashboardData(siteId);
    }

    function mergeStats(dailyRows, todayRow) {
      var rows = dailyRows.slice();
      if (todayRow && rows.length > 0 && rows[rows.length - 1].date === todayRow.date) {
        rows[rows.length - 1] = todayRow;
      } else if (todayRow) {
        rows.push(todayRow);
      }
      return rows;
    }

    function renderStats(rows) {
      renderTable(rows);
      renderChart(rows);
    }

    function renderTable(rows) {
      var tbody = document.querySelector('#statsTable tbody');
      tbody.innerHTML = '';
      rows.forEach(function (row) {
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + row.date + '</td><td>' + row.pv + '</td><td>' + row.uu + '</td>';
        tbody.appendChild(tr);
      });
    }

    function renderChart(rows) {
      var data = new google.visualization.DataTable();
      data.addColumn('string', 'date');
      data.addColumn('number', 'PV');
      data.addColumn('number', 'UU');
      rows.forEach(function (row) {
        data.addRow([row.date, row.pv, row.uu]);
      });
      var chart = new google.visualization.LineChart(document.getElementById('chart'));
      chart.draw(data, { legend: { position: 'top' }, curveType: 'function' });
    }

    google.charts.setOnLoadCallback(init);
  </script>
</body>
</html>
```

- [ ] **Step 2: コミット**

```bash
git add dashboard.html
git commit -m "feat(dashboard.html): add site dropdown, table, and Google Charts line chart"
```

---

### Task 11: README.md 作成（セットアップ手順・埋め込み手順・既知の制約）

**Files:**
- Create: `README.md`

- [ ] **Step 1: README.md を作成**

```markdown
# site-analytics

GitHub Pagesで公開している複数サイトの日別PV/UUを、自分専用のダッシュボードで見るための
自作アクセス解析システムです。

構成: `tracker.js`（計測）→ `collector.gs`（受信）→ スプレッドシート（`raw`/`daily`）
→ `dashboard.gs` + `dashboard.html`（集計・表示）

## セットアップ手順

### 1. スプレッドシートを作成する

1. Googleドライブ（drive.google.com）を開き、「新規」→「Google スプレッドシート」を作成する。
2. 名前を「site-analytics-data」などに変更する。
3. アドレスバーのURLから `https://docs.google.com/spreadsheets/d/【ここがID】/edit` の
   【ここがID】部分（英数字とハイフンの文字列）をコピーしてメモしておく。
   これが以降 `SPREADSHEET_ID` として使う値です。

### 2. collector プロジェクト（受信用）を作成する

1. `script.google.com` を開き、「新しいプロジェクト」をクリックする。
2. プロジェクト名を「site-analytics-collector」などに変更する。
3. エディタ内の `コード.gs` の中身を全て削除し、このリポジトリの `collector.gs` の内容を
   貼り付ける。
4. 1行目付近の `SPREADSHEET_ID` の値を、手順1でメモしたスプレッドシートIDに書き換える。
5. `ALLOWED_SITE_IDS` の配列に、計測したいサイトのsiteId（自分で決める識別子、例:
   `'portfolio'`, `'keiba-simulator'`）を追加する。
6. 保存する（Ctrl+S）。
7. 右上の「デプロイ」→「新しいデプロイ」をクリックする。
8. 歯車アイコン（種類の選択）から「ウェブアプリ」を選ぶ。
9. 「次のユーザーとして実行」は「自分」のままにする。
10. 「アクセスできるユーザー」は **「全員」** を選ぶ（サイト訪問者からの送信を受け付けるため）。
11. 「デプロイ」をクリックし、確認を求められたら自分のGoogleアカウントで許可する。
12. 表示された「ウェブアプリ」のURL（`https://script.google.com/macros/s/.../exec` の形式）を
    コピーしてメモしておく。これが `tracker.js` の送信先エンドポイントです。

### 3. dashboard プロジェクト（表示用）を作成する

1. `script.google.com` を開き、「新しいプロジェクト」をクリックする（collectorとは別の
   新規プロジェクトにすること）。
2. プロジェクト名を「site-analytics-dashboard」などに変更する。
3. `コード.gs` の中身を全て削除し、このリポジトリの `dashboard.gs` の内容を貼り付ける。
4. `SPREADSHEET_ID` の値を、手順1でメモしたスプレッドシートIDに書き換える
   （collector.gsと同じ値）。
5. 左側のファイル一覧の「+」→「HTML」をクリックし、ファイル名を `dashboard`
   （拡張子は自動で`.html`になる）にする。
6. 作成された `dashboard.html` の中身を全て削除し、このリポジトリの `dashboard.html` の
   内容を貼り付ける。
7. 保存する（Ctrl+S）。
8. 関数選択のドロップダウン（ツールバー中央の「実行する関数を選択」）から `setup` を選び、
   「実行」ボタン（▷）をクリックする。初回は権限の許可を求められるので、自分のGoogle
   アカウントで許可する。
9. スプレッドシートを開き、`raw` と `daily` の2つのシートが作られ、ヘッダー行が入って
   いることを確認する。
10. 関数選択を `createDailyTrigger` に変え、実行する。これで毎日決まった時刻に
    `aggregateDaily` が自動実行されるようになる（トリガーは「トリガー」画面
    （時計アイコン）から確認できる）。
11. 「デプロイ」→「新しいデプロイ」→種類「ウェブアプリ」を選ぶ。
12. 「次のユーザーとして実行」は「自分」のまま。
13. 「アクセスできるユーザー」は **「自分のみ」** を選ぶ（これで自分のGoogleアカウントで
    ログインしている時だけダッシュボードが見られるようになる）。
14. 「デプロイ」をクリックし、表示されたURLがダッシュボードのURL。ブックマークしておく。

### 4. tracker.js を GitHub Pages で公開する

1. このリポジトリをGitHubにpushし、リポジトリの Settings → Pages で公開設定を行う
   （Branch: `main` / フォルダ: `/(root)`）。
2. `tracker.js` の1行目付近の `ENDPOINT` の値を、手順2-12でメモした collector の
   ウェブアプリURLに書き換えてコミット・pushする。
3. 数分後、`https://<あなたのGitHubユーザー名>.github.io/site-analytics/tracker.js?v=1`
   でファイルが表示されることを確認する。

### 5. 計測したい各サイトに埋め込む

各サイトのHTMLの `</body>` 直前などに以下を1行追加する（`data-site-id` は
`collector.gs` の `ALLOWED_SITE_IDS` に登録した値と一致させる）:

```html
<script src="https://<あなたのGitHubユーザー名>.github.io/site-analytics/tracker.js?v=1" data-site-id="portfolio"></script>
```

新しいサイトを追加するときは、`collector.gs` の `ALLOWED_SITE_IDS` にそのsiteIdを追加して
再デプロイ（「デプロイ」→「デプロイを管理」→ 既存デプロイの編集アイコン→
バージョン「新バージョン」→デプロイ）することを忘れないこと。

### tracker.js を更新したときのバージョンアップ手順

`tracker.js` の中身を変更した場合、ブラウザやCDNにキャッシュされた古い版が使われ続けることが
あるため、以下の手順でキャッシュを回避する。

1. `tracker.js` を修正してGitHubにpushする。
2. 全ての埋め込みサイトのscriptタグのクエリを次の番号に上げる（例:
   `tracker.js?v=1` → `tracker.js?v=2`）。
3. 各サイトを再デプロイ・再公開する。

## 動作確認手順

1. 計測対象ページをブラウザで開き、DevToolsのNetworkタブで collector の
   `.../exec` へのPOSTリクエストが飛んでいることを確認する。
2. スプレッドシートの `raw` シートに1行追記されていることを確認する。
3. dashboard プロジェクトのGASエディタで `aggregateDaily` を手動実行し、`daily` シートに
   前日分の集計行ができていること、90日より前の `raw` 行が削除されていることを確認する。
4. GASエディタの実行ログ（表示→実行数）で `getTodayStats` を手動実行し、戻り値に
   当日のPV/UUが入っていることを確認する。
5. 手順3のダッシュボードURLを開き（自分のGoogleアカウントでログインした状態で）、
   サイト切り替えプルダウン・テーブル・折れ線グラフが表示されることを確認する。

## 既知の制約

- **なりすまし送信のリスク**: `collector.gs` は「アクセスできるユーザー: 全員」で
  デプロイするため、`siteId` さえ一致すれば第三者が任意のデータを送り込める
  （例: PV/UUの水増し）。個人の参考指標としての利用を想定しており、署名検証などの
  厳密な不正対策は行っていない。
- **`getTodayStats()` のパフォーマンス**: ダッシュボードの当日分表示は `raw` シートを
  毎回全走査して集計するため、`raw` の行数が増えるほど表示が遅くなる。
  `aggregateDaily()` による90日超`raw`の自動削除で行数の上限は一定に保たれるが、
  直近90日間のアクセスが非常に多い場合は体感速度に影響し得る。
- ローカルストレージが使えない環境（プライベートブラウジング等）では、UU判定ができず
  PVとほぼ同数のUUとして計上される（過大計上側にフォールバックする設計）。
```

- [ ] **Step 2: コミット**

```bash
git add README.md
git commit -m "docs: add setup, embedding, and known-limitations guide"
```

---

### Task 12: 全体テスト実行と最終確認

**Files:** なし（確認のみ）

- [ ] **Step 1: テストスイート全体を実行**

Run: `npm test`
Expected: PASS（Task 2〜5で追加した全テストが成功、11 tests前後）

- [ ] **Step 2: リポジトリの状態を確認**

Run: `git status`
Expected: `nothing to commit, working tree clean`

- [ ] **Step 3: git log で全コミットを確認**

Run: `git log --oneline`
Expected: Task 1〜11の各コミットが順に並んでいる

これでコードとしての実装は完了。以降の「Googleスプレッドシート作成」「GASデプロイ」
「GitHub Pages公開」「各サイトへの埋め込み」はREADME記載の手順に従ってユーザー自身が
（Google/GitHubアカウントでの対話的操作が必須のため）実施する。

---

## Self-Review Notes

- **Spec coverage:** tracker.js（localhost/bot判定、YYYY-MM-DD生成、UU判定try/catch、
  CORS対応text/plain送信）→ Task 2-6。collector.gs（許可siteId、LockService、raw追記）
  → Task 9。dashboard.gs（daily集計、90日超raw削除、getTodayStats、getSiteList、
  getDashboardData、トリガー設置）→ Task 7-8。dashboard.html（プルダウン、テーブル、
  折れ線グラフ、daily+当日rawの合成）→ Task 10。README（手順・既知の制約3点・
  バージョンアップ手順）→ Task 11。全項目に対応するタスクあり。
- **Placeholder scan:** 各ステップに実コードを記載済み。`SPREADSHEET_ID` /
  `ENDPOINT` はGAS/GitHub Pagesの実URLに依存するため意図的なプレースホルダーとし、
  README手順内でユーザーが値を書き換える場所として明記した。
- **Type consistency:** `siteId` / `date` / `pv` / `uu` / `isUU` のフィールド名は
  tracker.jsのペイロード、collector.gsのraw追記、dashboard.gsの読み取り・集計、
  dashboard.htmlの表示まで一貫させた。
