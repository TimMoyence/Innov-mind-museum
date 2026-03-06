#!/usr/bin/env node
'use strict';

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_HEALTH_RETRIES = 18;
const DEFAULT_HEALTH_RETRY_DELAY_MS = 5000;

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value.trim();
}

function getEnv(name, fallback) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    return fallback;
  }
  return value.trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(baseUrl, path) {
  return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
}

async function fetchJson({ baseUrl, path, method = 'GET', token, body, timeoutMs = DEFAULT_TIMEOUT_MS, expected }) {
  const url = buildUrl(baseUrl, path);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      Accept: 'application/json',
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch (error) {
        throw new Error(`Non-JSON response from ${method} ${path}: ${text.slice(0, 300)}`);
      }
    }

    const expectedCodes = Array.isArray(expected) ? expected : [expected];
    if (!expectedCodes.includes(response.status)) {
      throw new Error(
        `Unexpected status for ${method} ${path}: ${response.status}. Body: ${text.slice(0, 500) || '<empty>'}`,
      );
    }

    return { status: response.status, json };
  } finally {
    clearTimeout(timer);
  }
}

async function waitForHealthyApi({ baseUrl, timeoutMs, retries, retryDelayMs }) {
  const url = buildUrl(baseUrl, '/api/health');

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      const body = await response.text();
      if (response.status === 200) {
        console.log(`[smoke:api] health warmup OK (attempt ${attempt}/${retries})`);
        return;
      }

      console.log(
        `[smoke:api] health warmup not ready (attempt ${attempt}/${retries}) status=${response.status} body=${body.slice(0, 120)}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[smoke:api] health warmup error (attempt ${attempt}/${retries}): ${message}`);
    } finally {
      clearTimeout(timer);
    }

    if (attempt < retries) {
      await sleep(retryDelayMs);
    }
  }

  throw new Error(`API was not healthy after ${retries} attempts (${url})`);
}

async function ensureLogin(baseUrl, email, password, timeoutMs) {
  const login = async () =>
    fetchJson({
      baseUrl,
      path: '/api/auth/login',
      method: 'POST',
      body: { email, password },
      timeoutMs,
      expected: [200, 401],
    });

  let loginResult = await login();
  if (loginResult.status === 200) {
    return loginResult.json;
  }

  const allowRegister = getEnv('SMOKE_ALLOW_REGISTER', 'true').toLowerCase() !== 'false';
  if (!allowRegister) {
    throw new Error('Login failed and SMOKE_ALLOW_REGISTER=false');
  }

  await fetchJson({
    baseUrl,
    path: '/api/auth/register',
    method: 'POST',
    body: {
      email,
      password,
      firstname: getEnv('SMOKE_TEST_FIRSTNAME', 'Smoke'),
      lastname: getEnv('SMOKE_TEST_LASTNAME', 'Runner'),
    },
    timeoutMs,
    expected: [201, 409],
  });

  loginResult = await fetchJson({
    baseUrl,
    path: '/api/auth/login',
    method: 'POST',
    body: { email, password },
    timeoutMs,
    expected: 200,
  });

  return loginResult.json;
}

async function main() {
  const baseUrl = requireEnv('SMOKE_API_BASE_URL');
  const email = requireEnv('SMOKE_TEST_EMAIL');
  const password = requireEnv('SMOKE_TEST_PASSWORD');
  const timeoutMs = Number.parseInt(getEnv('SMOKE_TIMEOUT_MS', String(DEFAULT_TIMEOUT_MS)), 10);
  const healthRetries = Number.parseInt(
    getEnv('SMOKE_HEALTH_RETRIES', String(DEFAULT_HEALTH_RETRIES)),
    10,
  );
  const healthRetryDelayMs = Number.parseInt(
    getEnv('SMOKE_HEALTH_RETRY_DELAY_MS', String(DEFAULT_HEALTH_RETRY_DELAY_MS)),
    10,
  );
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`Invalid SMOKE_TIMEOUT_MS: ${process.env.SMOKE_TIMEOUT_MS}`);
  }
  if (!Number.isFinite(healthRetries) || healthRetries <= 0) {
    throw new Error(`Invalid SMOKE_HEALTH_RETRIES: ${process.env.SMOKE_HEALTH_RETRIES}`);
  }
  if (!Number.isFinite(healthRetryDelayMs) || healthRetryDelayMs <= 0) {
    throw new Error(
      `Invalid SMOKE_HEALTH_RETRY_DELAY_MS: ${process.env.SMOKE_HEALTH_RETRY_DELAY_MS}`,
    );
  }

  console.log(`[smoke:api] base=${baseUrl}`);

  await waitForHealthyApi({
    baseUrl,
    timeoutMs,
    retries: healthRetries,
    retryDelayMs: healthRetryDelayMs,
  });

  const health = await fetchJson({
    baseUrl,
    path: '/api/health',
    method: 'GET',
    timeoutMs,
    expected: 200,
  });
  if (health.json?.status !== 'ok' && health.json?.status !== 'degraded') {
    throw new Error(`Unexpected health payload status: ${JSON.stringify(health.json)}`);
  }
  console.log('[smoke:api] health OK');

  const session = await ensureLogin(baseUrl, email, password, timeoutMs);
  if (!session?.accessToken || !session?.refreshToken) {
    throw new Error('Auth session payload missing accessToken/refreshToken');
  }
  console.log('[smoke:api] auth OK');

  const accessToken = session.accessToken;
  const created = await fetchJson({
    baseUrl,
    path: '/api/chat/sessions',
    method: 'POST',
    token: accessToken,
    body: { museumMode: false },
    timeoutMs,
    expected: 201,
  });
  const createdSessionId = created.json?.session?.id;
  if (!createdSessionId) {
    throw new Error(`Create session response missing session.id: ${JSON.stringify(created.json)}`);
  }
  console.log(`[smoke:api] create session OK (${createdSessionId})`);

  const listed = await fetchJson({
    baseUrl,
    path: '/api/chat/sessions?limit=5',
    method: 'GET',
    token: accessToken,
    timeoutMs,
    expected: 200,
  });
  const sessions = Array.isArray(listed.json?.sessions) ? listed.json.sessions : null;
  if (!sessions) {
    throw new Error(`List sessions response missing sessions[]: ${JSON.stringify(listed.json)}`);
  }
  if (!sessions.some((s) => s?.id === createdSessionId)) {
    throw new Error('Created session not found in list response');
  }
  console.log('[smoke:api] list sessions OK');

  const deleted = await fetchJson({
    baseUrl,
    path: `/api/chat/sessions/${createdSessionId}`,
    method: 'DELETE',
    token: accessToken,
    timeoutMs,
    expected: 200,
  });
  if (deleted.json?.deleted !== true) {
    throw new Error(`Delete session response invalid: ${JSON.stringify(deleted.json)}`);
  }
  console.log('[smoke:api] cleanup delete session OK');

  console.log('[smoke:api] PASS');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[smoke:api] FAIL: ${message}`);
  process.exit(1);
});
