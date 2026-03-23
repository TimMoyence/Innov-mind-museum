import http from 'k6/http';
import { check, sleep } from 'k6';
import { registerUser, loginUser, authHeaders, BASE_URL } from './helpers/auth.js';

export const options = {
  vus: 5,
  duration: '2m',
  thresholds: {
    http_req_duration: ['p(95)<2000'],
  },
};

// Setup: register and login users, return their tokens
export function setup() {
  const users = [];
  for (let i = 0; i < 5; i++) {
    const email = `chatvu${i}_${Date.now()}@loadtest.com`;
    const password = 'LoadTest123!';

    const regRes = registerUser(email, password);
    if (regRes.status !== 201) {
      console.warn(`Setup: registration failed for ${email}: ${regRes.status}`);
      continue;
    }

    const loginData = loginUser(email, password);
    if (!loginData) {
      console.warn(`Setup: login failed for ${email}`);
      continue;
    }

    users.push({
      email,
      accessToken: loginData.accessToken,
      refreshToken: loginData.refreshToken,
    });

    sleep(0.5);
  }

  if (users.length === 0) {
    throw new Error('Setup failed: no users could be created');
  }

  return { users };
}

export default function (data) {
  const user = data.users[__VU % data.users.length];
  const hdrs = authHeaders(user.accessToken);

  // Create session
  const createRes = http.post(
    `${BASE_URL}/api/chat/sessions`,
    JSON.stringify({ title: `Load test session VU${__VU} iter${__ITER}` }),
    hdrs,
  );
  check(createRes, {
    'create session 201': (r) => r.status === 201,
  });

  if (createRes.status !== 201) {
    console.warn(`Create session failed: ${createRes.status} ${createRes.body}`);
    return;
  }

  const session = JSON.parse(createRes.body);
  const sessionId = session.id || session.sessionId;

  sleep(0.5);

  // Post 3 messages (text only to avoid LLM/image dependency)
  const messages = [
    'What is impressionism?',
    'Tell me about the Mona Lisa.',
    'Who painted Starry Night?',
  ];

  for (const text of messages) {
    const msgRes = http.post(
      `${BASE_URL}/api/chat/sessions/${sessionId}/messages`,
      JSON.stringify({ text }),
      hdrs,
    );
    check(msgRes, {
      'post message 2xx': (r) => r.status >= 200 && r.status < 300,
    });

    sleep(1);
  }

  // List sessions
  const listRes = http.get(`${BASE_URL}/api/chat/sessions`, hdrs);
  check(listRes, {
    'list sessions 200': (r) => r.status === 200,
    'list contains sessions': (r) => {
      if (r.status !== 200) return false;
      const body = JSON.parse(r.body);
      return Array.isArray(body) || (body.sessions && body.sessions.length > 0);
    },
  });

  sleep(0.5);

  // Get session detail
  const detailRes = http.get(`${BASE_URL}/api/chat/sessions/${sessionId}`, hdrs);
  check(detailRes, {
    'get session 200': (r) => r.status === 200,
  });

  sleep(0.3);

  // Delete session
  const deleteRes = http.del(`${BASE_URL}/api/chat/sessions/${sessionId}`, null, hdrs);
  check(deleteRes, {
    'delete session 2xx': (r) => r.status >= 200 && r.status < 300,
  });

  sleep(0.5);
}
