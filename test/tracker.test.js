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

test('formatLocalDate formats as YYYY-MM-DD with zero padding', () => {
  assert.equal(tracker.formatLocalDate(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(tracker.formatLocalDate(new Date(2026, 11, 31)), '2026-12-31');
  assert.equal(tracker.formatLocalDate(new Date(2026, 8, 18)), '2026-09-18');
});

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
