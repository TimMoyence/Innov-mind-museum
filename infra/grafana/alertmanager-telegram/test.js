// node --test infra/grafana/alertmanager-telegram/test.js
//
// Smoke tests for the formatter helpers — pure functions, no fetch.

'use strict';

process.env.TELEGRAM_BOT_TOKEN = 'fake-token-for-test';
process.env.TELEGRAM_CHAT_ID = 'fake-chat-id';

const test = require('node:test');
const assert = require('node:assert/strict');

const { formatAlert, escapeMarkdown } = require('./index');

test('escapeMarkdown escapes Telegram MarkdownV2 reserved characters', () => {
  const out = escapeMarkdown('hello (world) - *bold* [link].');
  // Every special char gets a leading backslash.
  assert.ok(out.includes('\\('));
  assert.ok(out.includes('\\)'));
  assert.ok(out.includes('\\*'));
  assert.ok(out.includes('\\['));
  assert.ok(out.includes('\\]'));
  assert.ok(out.includes('\\-'));
  assert.ok(out.includes('\\.'));
});

test('formatAlert produces a multi-section message with status + severity + summary', () => {
  const msg = formatAlert({
    status: 'firing',
    labels: { alertname: 'chat_e2e_p99_high', severity: 'warning' },
    annotations: { summary: 'Chat p99 over budget', description: 'p99 is 7.2s' },
  });
  // alertname has underscores which get escaped → `chat\_e2e\_p99\_high`
  assert.ok(msg.includes('chat\\_e2e\\_p99\\_high'));
  assert.ok(msg.includes('FIRING'));
  assert.ok(msg.includes('warning'));
  assert.ok(msg.includes('Chat p99 over budget'));
  assert.ok(msg.includes('7\\.2s'));
});

test('formatAlert handles missing annotations gracefully (no crash, no empty sections)', () => {
  const msg = formatAlert({
    status: 'resolved',
    labels: { alertname: 'foo', severity: 'info' },
    annotations: {},
  });
  assert.match(msg, /RESOLVED/);
  assert.ok(!msg.includes('Dashboard'));
  assert.ok(!msg.includes('Runbook'));
});

test('formatAlert truncates long description to keep the Telegram message under the 4096-char limit', () => {
  const longDesc = 'x'.repeat(2000);
  const msg = formatAlert({
    status: 'firing',
    labels: { alertname: 'test', severity: 'warning' },
    annotations: { description: longDesc },
  });
  // 800 char ceiling enforced by truncate(s, 800)
  assert.ok(msg.length < 1500, `expected truncated message, got ${msg.length} chars`);
  assert.match(msg, /…/);
});
