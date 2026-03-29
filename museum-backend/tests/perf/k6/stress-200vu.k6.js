/**
 * Stress test: 200 Virtual Users — validates scalability changes.
 *
 * Usage:
 *   brew install k6                                              # install (once)
 *   k6 run tests/perf/k6/stress-200vu.k6.js                     # against localhost:3000
 *   k6 run -e BASE_URL=https://api.musaium.app tests/perf/k6/stress-200vu.k6.js  # against prod
 *
 * What it does:
 *   1. Ramps up from 0 to 200 concurrent users over 3 minutes
 *   2. Holds 200 VUs for 5 minutes (steady state)
 *   3. Ramps down over 1 minute
 *   Each VU: register → login → create session → send message → list → delete → logout
 *
 * Pass criteria:
 *   - Auth p95 < 500ms
 *   - Chat p95 < 3000ms (LLM calls are slow)
 *   - Error rate < 5%
 *   - No 503 (semaphore queue full) under normal conditions
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { registerUser, loginUser, authHeaders, BASE_URL } from './helpers/auth.js';

const authDuration = new Trend('auth_req_duration');
const chatDuration = new Trend('chat_req_duration');
const errorCount = new Counter('custom_errors');
const semaphoreRejects = new Counter('semaphore_503');
const successRate = new Rate('success_rate');

export const options = {
  stages: [
    { duration: '1m', target: 50 }, // warm up
    { duration: '2m', target: 200 }, // ramp to 200 VUs
    { duration: '5m', target: 200 }, // hold at 200 VUs (steady state)
    { duration: '1m', target: 0 }, // ramp down
  ],
  thresholds: {
    auth_req_duration: ['p(95)<500'],
    chat_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.05'],
    semaphore_503: ['count<10'], // max 10 queue-full rejections
  },
};

function setupUser() {
  const email = `stress_vu${__VU}_iter${__ITER}_${Date.now()}@loadtest.com`;
  const password = 'StressTest123!';

  const regRes = registerUser(email, password);
  authDuration.add(regRes.timings.duration);

  if (regRes.status !== 201) {
    errorCount.add(1);
    successRate.add(false);
    return null;
  }

  const loginData = loginUser(email, password);
  if (!loginData) {
    errorCount.add(1);
    successRate.add(false);
    return null;
  }

  successRate.add(true);
  return { email, ...loginData };
}

function runChatFlow(token) {
  const hdrs = authHeaders(token);

  // Create session
  const createRes = http.post(
    `${BASE_URL}/api/chat/sessions`,
    JSON.stringify({ title: `Stress VU${__VU}` }),
    hdrs,
  );
  chatDuration.add(createRes.timings.duration);
  check(createRes, { 'create session 201': (r) => r.status === 201 });

  if (createRes.status !== 201) {
    errorCount.add(1);
    if (createRes.status === 503) semaphoreRejects.add(1);
    return;
  }

  const session = JSON.parse(createRes.body);
  const sessionId = session.id || session.sessionId;

  sleep(0.3 + Math.random() * 0.5); // jitter to avoid thundering herd

  // Send message (the expensive LLM call)
  const msgRes = http.post(
    `${BASE_URL}/api/chat/sessions/${sessionId}/messages`,
    JSON.stringify({ text: 'What style is this artwork?' }),
    hdrs,
  );
  chatDuration.add(msgRes.timings.duration);
  const msgOk = msgRes.status >= 200 && msgRes.status < 300;
  check(msgRes, { 'post message 2xx': () => msgOk });
  if (!msgOk) {
    errorCount.add(1);
    if (msgRes.status === 503) semaphoreRejects.add(1);
  }
  successRate.add(msgOk);

  sleep(0.3 + Math.random() * 0.3);

  // List sessions
  const listRes = http.get(`${BASE_URL}/api/chat/sessions`, hdrs);
  chatDuration.add(listRes.timings.duration);
  check(listRes, { 'list sessions 200': (r) => r.status === 200 });

  sleep(0.2);

  // Cleanup
  http.del(`${BASE_URL}/api/chat/sessions/${sessionId}`, null, hdrs);
}

export default function () {
  const user = setupUser();
  if (!user) {
    sleep(1);
    return;
  }

  sleep(0.3);
  runChatFlow(user.accessToken);

  // Logout
  http.post(
    `${BASE_URL}/api/auth/logout`,
    JSON.stringify({ refreshToken: user.refreshToken }),
    authHeaders(user.accessToken),
  );

  sleep(0.5 + Math.random());
}
