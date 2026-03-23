import http from 'k6/http';
import { check, sleep } from 'k6';
import { registerUser, loginUser, authHeaders, BASE_URL } from './helpers/auth.js';

export const options = {
  vus: 10,
  duration: '1m',
  thresholds: {
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  const email = `vu${__VU}_iter${__ITER}@loadtest.com`;
  const password = 'LoadTest123!';

  // Register
  const regRes = registerUser(email, password);
  check(regRes, {
    'register 201': (r) => r.status === 201,
    'register has tokens': (r) => {
      if (r.status !== 201) return false;
      const body = JSON.parse(r.body);
      return !!body.accessToken && !!body.refreshToken;
    },
  });

  if (regRes.status !== 201) {
    console.warn(`Registration failed for ${email}: ${regRes.status} ${regRes.body}`);
    return;
  }

  sleep(0.5);

  // Login
  const loginData = loginUser(email, password);
  if (!loginData) {
    console.warn(`Login failed for ${email}`);
    return;
  }

  const { accessToken, refreshToken } = loginData;

  sleep(0.3);

  // Refresh token
  const refreshRes = http.post(
    `${BASE_URL}/api/auth/refresh`,
    JSON.stringify({ refreshToken }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(refreshRes, {
    'refresh 200': (r) => r.status === 200,
    'refresh returns new tokens': (r) => {
      if (r.status !== 200) return false;
      const body = JSON.parse(r.body);
      return !!body.accessToken;
    },
  });

  const currentToken = refreshRes.status === 200
    ? JSON.parse(refreshRes.body).accessToken
    : accessToken;

  sleep(0.3);

  // GET /me
  const meRes = http.get(`${BASE_URL}/api/auth/me`, authHeaders(currentToken));
  check(meRes, {
    'me 200': (r) => r.status === 200,
    'me has email': (r) => {
      if (r.status !== 200) return false;
      const body = JSON.parse(r.body);
      return body.email === email;
    },
  });

  sleep(0.3);

  // Logout
  const logoutRes = http.post(
    `${BASE_URL}/api/auth/logout`,
    JSON.stringify({ refreshToken }),
    authHeaders(currentToken),
  );
  check(logoutRes, {
    'logout 2xx': (r) => r.status >= 200 && r.status < 300,
  });

  sleep(0.5);
}
