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
