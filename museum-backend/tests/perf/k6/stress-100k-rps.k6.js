import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * Stress test targeting 100K rps for 60 s. NOT auto-run in CI — operator
 * kicks off when subsystem F infra is provisioned. Runbook in
 * tests/perf/k6/helpers/100k-runbook.md.
 *
 * Spec: see git log (deleted 2026-05-03 — roadmap consolidation, original spec in commit history)
 */
export const options = {
  scenarios: {
    constant_request_rate: {
      executor: 'constant-arrival-rate',
      rate: 100000, // requests per timeUnit
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 5000,
      maxVUs: 20000,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'], // < 1% errors per SLO
    http_req_duration: ['p(99)<5000'], // 5s p99 budget for chat
  },
};

const BASE_URL = __ENV.BASE_URL ?? 'https://musaium-staging.example.com';

export default function () {
  const res = http.get(`${BASE_URL}/api/health`);
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(0.01);
}
