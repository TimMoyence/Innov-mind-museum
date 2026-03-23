import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { registerUser, loginUser, authHeaders, BASE_URL } from './helpers/auth.js';

// Custom metrics
const authDuration = new Trend('auth_req_duration');
const chatDuration = new Trend('chat_req_duration');
const errorCount = new Counter('custom_errors');

export const options = {
  stages: [
    { duration: '2m', target: 50 },  // ramp up to 50 VUs
    { duration: '3m', target: 50 },  // hold at 50 VUs
    { duration: '1m', target: 0 },   // ramp down
  ],
  thresholds: {
    auth_req_duration: ['p(95)<500'],
    chat_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.05'],   // error rate < 5%
  },
};

// Each VU registers + logs in during setup phase of its iteration
function setupUser() {
  const email = `concurrent_vu${__VU}_iter${__ITER}_${Date.now()}@loadtest.com`;
  const password = 'LoadTest123!';

  const regRes = registerUser(email, password);
  authDuration.add(regRes.timings.duration);

  if (regRes.status !== 201) {
    errorCount.add(1);
    return null;
  }

  const loginData = loginUser(email, password);
  if (!loginData) {
    errorCount.add(1);
    return null;
  }

  return { email, ...loginData };
}

function runAuthOperations(token, refreshToken) {
  // GET /me
  const meRes = http.get(`${BASE_URL}/api/auth/me`, authHeaders(token));
  authDuration.add(meRes.timings.duration);
  check(meRes, { 'me 200': (r) => r.status === 200 });
  if (meRes.status !== 200) errorCount.add(1);

  sleep(0.3);

  // Refresh token
  const refreshRes = http.post(
    `${BASE_URL}/api/auth/refresh`,
    JSON.stringify({ refreshToken }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  authDuration.add(refreshRes.timings.duration);
  check(refreshRes, { 'refresh 200': (r) => r.status === 200 });

  if (refreshRes.status === 200) {
    return JSON.parse(refreshRes.body).accessToken;
  }
  return token;
}

function runChatOperations(token) {
  const hdrs = authHeaders(token);

  // Create session
  const createRes = http.post(
    `${BASE_URL}/api/chat/sessions`,
    JSON.stringify({ title: `Concurrent test VU${__VU}` }),
    hdrs,
  );
  chatDuration.add(createRes.timings.duration);
  check(createRes, { 'create session 201': (r) => r.status === 201 });

  if (createRes.status !== 201) {
    errorCount.add(1);
    return;
  }

  const session = JSON.parse(createRes.body);
  const sessionId = session.id || session.sessionId;

  sleep(0.5);

  // Post a message
  const msgRes = http.post(
    `${BASE_URL}/api/chat/sessions/${sessionId}/messages`,
    JSON.stringify({ text: 'Describe this painting style.' }),
    hdrs,
  );
  chatDuration.add(msgRes.timings.duration);
  check(msgRes, { 'post message 2xx': (r) => r.status >= 200 && r.status < 300 });
  if (msgRes.status < 200 || msgRes.status >= 300) errorCount.add(1);

  sleep(0.5);

  // List sessions
  const listRes = http.get(`${BASE_URL}/api/chat/sessions`, hdrs);
  chatDuration.add(listRes.timings.duration);
  check(listRes, { 'list sessions 200': (r) => r.status === 200 });

  sleep(0.3);

  // Delete session
  const deleteRes = http.del(`${BASE_URL}/api/chat/sessions/${sessionId}`, null, hdrs);
  chatDuration.add(deleteRes.timings.duration);
  check(deleteRes, { 'delete session 2xx': (r) => r.status >= 200 && r.status < 300 });

  sleep(0.3);
}

export default function () {
  // Setup user for this iteration
  const user = setupUser();
  if (!user) {
    sleep(1);
    return;
  }

  sleep(0.5);

  // Auth operations
  const freshToken = runAuthOperations(user.accessToken, user.refreshToken);

  sleep(0.5);

  // Chat operations
  runChatOperations(freshToken);

  // Logout
  const logoutRes = http.post(
    `${BASE_URL}/api/auth/logout`,
    JSON.stringify({ refreshToken: user.refreshToken }),
    authHeaders(freshToken),
  );
  authDuration.add(logoutRes.timings.duration);
  check(logoutRes, { 'logout 2xx': (r) => r.status >= 200 && r.status < 300 });

  sleep(1);
}
