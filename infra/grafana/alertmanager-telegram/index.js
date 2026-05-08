// AlertManager → Telegram Bot bridge.
//
// AlertManager has no native Telegram receiver. This shim accepts the AM
// webhook payload at POST /alert, formats a Markdown message with one
// alert summary per `alerts[]` entry, and POSTs to
//   https://api.telegram.org/bot<TOKEN>/sendMessage
//
// Fail-open contract (D11 + spec R5 acceptance):
//   - Telegram API failure → log + return 200 so AlertManager does not
//     retry-storm and burn its repeat budget.
//   - Bridge process exits cleanly on SIGINT / SIGTERM.
//
// No external deps. Pure node:http + global fetch.

'use strict';

const http = require('node:http');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const PORT = Number.parseInt(process.env.PORT || '9094', 10);
const DASHBOARD_BASE = process.env.DASHBOARD_BASE_URL || '';

if (!TOKEN || !CHAT_ID) {
  console.error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set');
  process.exit(1);
}

const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}/sendMessage`;

// ── HTTP server ──────────────────────────────────────────────────────

function createBridgeServer() {
  return http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  if (req.method !== 'POST' || req.url !== '/alert') {
    res.writeHead(404);
    res.end();
    return;
  }
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', async () => {
    try {
      const payload = JSON.parse(body || '{}');
      await handleAlerts(payload);
    } catch (err) {
      console.warn('alertmanager_telegram_handle_failed', String(err));
    }
    // Always 200 — AlertManager does not retry on 2xx.
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  });
}

if (require.main === module) {
  const server = createBridgeServer();
  server.listen(PORT, () => {
    console.log(`alertmanager-telegram listening on :${PORT}`);
  });
  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// ── Formatting ───────────────────────────────────────────────────────

function formatAlert(alert) {
  const labels = alert.labels || {};
  const annotations = alert.annotations || {};
  const status = (alert.status || 'firing').toUpperCase();
  const severity = labels.severity || 'unknown';
  const name = labels.alertname || 'unnamed';
  const summary = annotations.summary || '';
  const description = annotations.description || '';
  const dashboard = annotations.dashboard || (DASHBOARD_BASE ? `${DASHBOARD_BASE}` : '');
  const runbook = annotations.runbook || '';

  const lines = [
    `*${escapeMarkdown(name)}* — \`${escapeMarkdown(status)}\` (${escapeMarkdown(severity)})`,
  ];
  if (summary) lines.push(escapeMarkdown(summary));
  if (description) lines.push('', escapeMarkdown(truncate(description, 800)));
  if (dashboard) lines.push('', `[Dashboard](${dashboard})`);
  if (runbook) lines.push(`[Runbook](${runbook})`);
  return lines.join('\n');
}

function escapeMarkdown(s) {
  // Telegram MarkdownV2 reserved chars. Conservative — escape every one
  // so user-controlled annotations (rare here, but possible) cannot break
  // the parse.
  return String(s).replace(/[_*\[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`);
}

function truncate(s, n) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// ── Telegram delivery ────────────────────────────────────────────────

async function handleAlerts(payload) {
  const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];
  if (alerts.length === 0) return;

  for (const alert of alerts) {
    const text = formatAlert(alert);
    try {
      const res = await fetch(TELEGRAM_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text,
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        console.warn('telegram_send_failed', res.status, errBody.slice(0, 200));
      }
    } catch (err) {
      console.warn('telegram_send_error', String(err));
    }
  }
}

module.exports = { formatAlert, escapeMarkdown, createBridgeServer };
