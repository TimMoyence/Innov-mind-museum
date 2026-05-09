// k6 spike test — saturate /chat/sessions/:id/messages until end-to-end
// p99 breaches 6s for ≥5 minutes, then verify AlertManager fires
// `chat_e2e_p99_high` and the Telegram bridge delivers the message.
//
// Production = staging (D10) — this script does NOT target prod. Run it
// against the local Docker compose stack:
//
//   docker compose -f infra/grafana/docker-compose.local.yml up -d
//   k6 run museum-backend/tests/load/chat-spike.k6.js
//
// The local stack pins the backend, Prometheus, Grafana, AlertManager,
// and the Telegram bridge together so the alerting wire is end-to-end.
//
// Required env (override on the k6 CLI):
//   TARGET_BASE_URL  — default http://host.docker.internal:3000
//   AUTH_BEARER      — required (no /chat allow-anonymous in dev)
//   SESSION_ID       — pre-created session UUID (avoid POST /sessions in
//                       hot loop)

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    // Phase A — ramp 0→100 VUs over 1 min
    // Phase B — hold 100 VUs for 6 min (≥5 min over budget triggers alert)
    // Phase C — drain 100→0 over 1 min
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 100 },
        { duration: '6m', target: 100 },
        { duration: '1m', target: 0 },
      ],
      gracefulStop: '30s',
    },
  },
  thresholds: {
    // Soft check — we DELIBERATELY want p99 > 6s to fire the alert.
    // Hard threshold: failure rate must stay below 50% (otherwise the
    // backend itself is broken and the spike is invalid).
    http_req_failed: ['rate<0.5'],
  },
};

const BASE = __ENV.TARGET_BASE_URL || 'http://host.docker.internal:3000';
const TOKEN = __ENV.AUTH_BEARER || '';
const SESSION = __ENV.SESSION_ID || '';

if (!TOKEN || !SESSION) {
  throw new Error('AUTH_BEARER and SESSION_ID env vars are required');
}

export default function () {
  const payload = JSON.stringify({
    text: 'Tell me about this artwork in detail, with historical context, technique, and the artist biography.',
    context: { museumMode: true },
  });
  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    timeout: '30s',
  };

  const res = http.post(`${BASE}/chat/sessions/${SESSION}/messages`, payload, params);

  check(res, {
    'status is 2xx': (r) => r.status >= 200 && r.status < 300,
  });

  // Modest think-time so 100 VUs overlap roughly proportional to LLM latency.
  sleep(0.5);
}

export function handleSummary(data) {
  // Print a compact summary so the operator can correlate with Grafana.
  return {
    stdout: JSON.stringify(
      {
        iterations: data.metrics.iterations?.values?.count ?? 0,
        http_req_duration_p99_ms: data.metrics.http_req_duration?.values?.['p(99)'] ?? null,
        http_req_failed_rate: data.metrics.http_req_failed?.values?.rate ?? null,
        scenarios: Object.keys(data.metrics).filter((k) => k.startsWith('group_duration_')),
      },
      null,
      2,
    ),
  };
}
