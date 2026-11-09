import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    constant_request_rate: {
      executor: 'constant-arrival-rate',
      rate: 100000,
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 5000,
      maxVUs: 20000,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(99)<5000'],
  },
};

const BASE_URL = __ENV.BASE_URL ?? 'https://musaium-staging.example.com';

export default function () {
  const res = http.get(`${BASE_URL}/api/health`);
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(0.01);
}
