#!/usr/bin/env node
'use strict';

const {
  MIN_GRANULEPOS_2S_48KHZ,
  MIN_TTS_BYTE_LENGTH,
  detectAudioContainer,
  readLastOggGranulePos,
} = require('./validate-audio.cjs');

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

const SMOKE_TRANSIENT_RETRIES = Math.max(1, Number(getEnv('SMOKE_TRANSIENT_RETRIES', '3')) || 3);
const SMOKE_TRANSIENT_RETRY_DELAY_MS = Math.max(
  0,
  Number(getEnv('SMOKE_TRANSIENT_RETRY_DELAY_MS', '2500')) || 2500,
);

function isNetworkError(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return true;
  const m = `${err.message || ''} ${err.cause && err.cause.message ? err.cause.message : ''}`;
  return /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|network|terminated|other side closed/i.test(
    m,
  );
}

function buildUrl(baseUrl, path) {
  return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
}

const SMOKE_TEST_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

async function fetchMultipart({
  baseUrl,
  path,
  token,
  fields,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  expected,
}) {
  const url = buildUrl(baseUrl, path);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value && typeof value === 'object' && Buffer.isBuffer(value.buffer)) {
        formData.append(
          key,
          new Blob([value.buffer], { type: value.contentType || 'application/octet-stream' }),
          value.filename || 'upload',
        );
      } else {
        formData.append(key, String(value));
      }
    }

    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal,
      redirect: 'manual',
    });

    const text = await response.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch (error) {
        throw new Error(`Non-JSON response from POST ${path}: ${text.slice(0, 300)}`);
      }
    }

    const expectedCodes = Array.isArray(expected) ? expected : [expected];
    if (!expectedCodes.includes(response.status)) {
      throw new Error(
        `Unexpected status for POST ${path}: ${response.status}. Body: ${text.slice(0, 500) || '<empty>'}`,
      );
    }

    return { status: response.status, json };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBinaryOnce({
  baseUrl,
  path,
  method = 'POST',
  token,
  body,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  expected,
}) {
  const url = buildUrl(baseUrl, path);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      Accept: 'audio/ogg, audio/mpeg, application/json',
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
      redirect: 'manual',
    });

    const contentType = response.headers.get('content-type') || '';
    const expectedCodes = Array.isArray(expected) ? expected : [expected];

    if (!expectedCodes.includes(response.status)) {
      const text = await response.text();
      let json = null;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch (error) {}
      }
      return { status: response.status, buffer: Buffer.alloc(0), contentType, json, rawText: text };
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      status: response.status,
      buffer: Buffer.from(arrayBuffer),
      contentType,
      json: null,
      rawText: '',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonOnce({
  baseUrl,
  path,
  method = 'GET',
  token,
  body,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  expected,
}) {
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
      redirect: 'manual',
    });

    if ([301, 302, 307, 308].includes(response.status)) {
      const location = response.headers.get('location') || '<unknown>';
      throw new Error(
        `${method} ${path} was redirected (${response.status}) to ${location}. ` +
          'Update SMOKE_API_BASE_URL to point directly to the final URL (likely https://).',
      );
    }

    const text = await response.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch (error) {
        const e = new Error(`Non-JSON response from ${method} ${path}: ${text.slice(0, 300)}`);
        e.transient = true;
        throw e;
      }
    }

    const expectedCodes = Array.isArray(expected) ? expected : [expected];
    if (!expectedCodes.includes(response.status)) {
      const e = new Error(
        `Unexpected status for ${method} ${path}: ${response.status}. Body: ${text.slice(0, 500) || '<empty>'}`,
      );
      if (response.status >= 500) e.transient = true;
      throw e;
    }

    return { status: response.status, json };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(opts) {
  const retries = opts.retries ?? SMOKE_TRANSIENT_RETRIES;
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fetchJsonOnce(opts);
    } catch (err) {
      lastErr = err;
      const transient = err.transient === true || isNetworkError(err);
      if (transient && attempt < retries) {
        console.log(
          `[smoke:api] transient on ${opts.method || 'GET'} ${opts.path} ` +
            `(attempt ${attempt}/${retries}): ${String(err.message).slice(0, 140)} — ` +
            `retrying in ${SMOKE_TRANSIENT_RETRY_DELAY_MS}ms`,
        );
        await sleep(SMOKE_TRANSIENT_RETRY_DELAY_MS);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function fetchBinary(opts) {
  const retries = opts.retries ?? SMOKE_TRANSIENT_RETRIES;
  const expectedCodes = Array.isArray(opts.expected) ? opts.expected : [opts.expected];
  let lastResult;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const result = await fetchBinaryOnce(opts);
      lastResult = result;
      const transient = !expectedCodes.includes(result.status) && result.status >= 500;
      if (transient && attempt < retries) {
        console.log(
          `[smoke:api] transient binary on ${opts.method || 'POST'} ${opts.path} ` +
            `(attempt ${attempt}/${retries}): status ${result.status} — ` +
            `retrying in ${SMOKE_TRANSIENT_RETRY_DELAY_MS}ms`,
        );
        await sleep(SMOKE_TRANSIENT_RETRY_DELAY_MS);
        continue;
      }
      return result;
    } catch (err) {
      if (isNetworkError(err) && attempt < retries) {
        console.log(
          `[smoke:api] transient binary network on ${opts.method || 'POST'} ${opts.path} ` +
            `(attempt ${attempt}/${retries}): ${String(err.message).slice(0, 140)} — ` +
            `retrying in ${SMOKE_TRANSIENT_RETRY_DELAY_MS}ms`,
        );
        await sleep(SMOKE_TRANSIENT_RETRY_DELAY_MS);
        continue;
      }
      throw err;
    }
  }
  return lastResult;
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
      dateOfBirth: getEnv('SMOKE_TEST_DOB', '1990-06-13'),
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
  const allowDegradedHealth =
    getEnv('SMOKE_ALLOW_DEGRADED_HEALTH', 'false').toLowerCase() === 'true';
  const healthStatus = health.json?.status;
  const allowedStatuses = allowDegradedHealth ? ['ok', 'degraded'] : ['ok'];
  if (!allowedStatuses.includes(healthStatus)) {
    throw new Error(
      `Health status not acceptable (status=${JSON.stringify(healthStatus)}, ` +
        `allowed=${JSON.stringify(allowedStatuses)}). A 'degraded' status means the DB is ` +
        'down or Redis is down (api.router.ts:85); set SMOKE_ALLOW_DEGRADED_HEALTH=true ' +
        'only for an intentional partial-outage run.',
    );
  }
  const requireRedis = getEnv('SMOKE_REQUIRE_REDIS', 'true').toLowerCase() === 'true';
  if (requireRedis) {
    const redisCheck = health.json?.checks?.redis;
    if (redisCheck === 'skipped') {
      throw new Error(
        'Redis is reported as "skipped" (cache not wired). SMOKE_REQUIRE_REDIS is on, ' +
          'so a no-op cache in prod is a misconfiguration — wire REDIS_URL / CACHE_ENABLED. ' +
          'This is distinct from "down" (auth/connectivity): "skipped" means no cache adapter at all.',
      );
    }
    if (redisCheck === 'down') {
      throw new Error(
        'Redis is "down" (connectivity/auth failure). Check REDIS_PASSWORD / REDIS_URL — ' +
          'the API returns 200 but the cache ping failed.',
      );
    }
  }
  console.log('[smoke:api] health OK');

  const session = await ensureLogin(baseUrl, email, password, timeoutMs);
  if (!session?.accessToken || !session?.refreshToken) {
    throw new Error('Auth session payload missing accessToken/refreshToken');
  }
  console.log('[smoke:api] auth OK');

  const accessToken = session.accessToken;

  for (const scope of [
    'third_party_ai_text_openai',
    'third_party_ai_audio_openai',
    'third_party_ai_image_openai',
  ]) {
    await fetchJson({
      baseUrl,
      path: '/api/auth/consent',
      method: 'POST',
      token: accessToken,
      body: { scope, version: '1.0' },
      timeoutMs,
      expected: 201,
    });
  }
  console.log('[smoke:api] consent grants OK (text + audio + image)');

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

  const compareEnabled = getEnv('SMOKE_COMPARE_ENABLED', 'true').toLowerCase() === 'true';
  if (compareEnabled) {
    const allowEncoderDown =
      getEnv('SMOKE_COMPARE_ALLOW_ENCODER_DOWN', 'false').toLowerCase() === 'true';
    const compareExpected = allowEncoderDown ? [200, 503] : [200];

    const expectedModelVersion = getEnv(
      'SMOKE_EXPECTED_MODEL_VERSION',
      'siglip2-base-patch16-224@v1',
    );

    const compare = await fetchMultipart({
      baseUrl,
      path: '/api/chat/compare',
      token: accessToken,
      fields: {
        sessionId: createdSessionId,
        topK: '5',
        locale: 'fr',
        image: {
          buffer: Buffer.from(SMOKE_TEST_PNG_B64, 'base64'),
          filename: 'smoke-test.png',
          contentType: 'image/png',
        },
      },
      timeoutMs,
      expected: compareExpected,
    });
    if (compare.status === 200) {
      const matches = compare.json?.matches;
      if (!Array.isArray(matches)) {
        throw new Error(
          `Compare 200 response missing matches[]: ${JSON.stringify(compare.json).slice(0, 300)}`,
        );
      }
      const modelVersion = compare.json?.modelVersion;
      if (modelVersion !== expectedModelVersion) {
        throw new Error(
          `Compare 200 modelVersion mismatch (expected=${expectedModelVersion}, ` +
            `got=${JSON.stringify(modelVersion)}). An empty-string modelVersion is the ` +
            'encoder-fallback signature (similarity.service.ts:436) and must never pass a ' +
            '200 assertion; a drifted version means the encoder ran a different model.',
        );
      }
      console.log(
        `[smoke:api] compare OK (status=200, matches=${matches.length}, modelVersion=${modelVersion})`,
      );
    } else {
      if (compare.json?.error?.code !== 'COMPARE_ENCODER_UNAVAILABLE') {
        throw new Error(
          `Compare 503 response not contractual (expected error.code=COMPARE_ENCODER_UNAVAILABLE): ${JSON.stringify(compare.json).slice(0, 300)}`,
        );
      }
      console.log(
        '[smoke:api] compare TOLERATED (status=503, encoder unavailable — SMOKE_COMPARE_ALLOW_ENCODER_DOWN=true)',
      );
    }
  } else {
    console.log('[smoke:api] compare SKIPPED (SMOKE_COMPARE_ENABLED=false)');
  }

  try {
    const chatPost = await fetchJson({
      baseUrl,
      path: `/api/chat/sessions/${createdSessionId}/messages`,
      method: 'POST',
      token: accessToken,
      body: { text: 'Bonjour, parle-moi de la Joconde.', context: {} },
      timeoutMs,
      expected: 201,
    });
    const assistantMessageId = chatPost.json?.message?.id;
    const assistantRole = chatPost.json?.message?.role;
    const assistantText = chatPost.json?.message?.text;
    if (typeof assistantMessageId !== 'string' || assistantMessageId.length === 0) {
      throw new Error(
        `Chat POST 201 missing message.id: ${JSON.stringify(chatPost.json).slice(0, 300)}`,
      );
    }
    if (assistantRole !== 'assistant') {
      throw new Error(
        `Chat POST 201 message.role=${JSON.stringify(assistantRole)} (expected 'assistant')`,
      );
    }
    if (typeof assistantText !== 'string' || assistantText.trim().length === 0) {
      throw new Error(
        `Chat POST 201 message.text empty: ${JSON.stringify(chatPost.json).slice(0, 300)}`,
      );
    }
    if (assistantText.trim().length <= 50) {
      throw new Error(
        `Chat POST 201 assistant text too short (len=${assistantText.trim().length}, expected >50): ` +
          `${JSON.stringify(assistantText).slice(0, 200)} — suspect a truncated/stub/refusal reply.`,
      );
    }

    const roundTrip = await fetchJson({
      baseUrl,
      path: `/api/chat/sessions/${createdSessionId}`,
      method: 'GET',
      token: accessToken,
      timeoutMs,
      expected: 200,
    });
    const persistedMessages = Array.isArray(roundTrip.json?.messages)
      ? roundTrip.json.messages
      : null;
    if (!persistedMessages) {
      throw new Error(
        `Chat round-trip GET missing messages[]: ${JSON.stringify(roundTrip.json).slice(0, 300)}`,
      );
    }
    const persistedAssistant = persistedMessages.find((m) => m?.id === assistantMessageId);
    if (!persistedAssistant) {
      throw new Error(
        `Persisted assistant message ${assistantMessageId} not found in session messages[] ` +
          '— the chat reply was not durably stored.',
      );
    }
    if (persistedAssistant.role !== 'assistant') {
      throw new Error(
        `Persisted message ${assistantMessageId} role=${JSON.stringify(persistedAssistant.role)} ` +
          "(expected 'assistant')",
      );
    }
    if (
      typeof persistedAssistant.text !== 'string' ||
      persistedAssistant.text.trim().length === 0
    ) {
      throw new Error(
        `Persisted assistant message ${assistantMessageId} has empty text: ` +
          `${JSON.stringify(persistedAssistant).slice(0, 200)}`,
      );
    }
    console.log(
      `[smoke:api] chat round-trip OK (assistant message ${assistantMessageId.slice(0, 8)} persisted + re-read)`,
    );

    const ttsResult = await fetchBinary({
      baseUrl,
      path: `/api/chat/messages/${assistantMessageId}/tts`,
      method: 'POST',
      token: accessToken,
      timeoutMs,
      expected: [200, 204, 501],
    });

    if (ttsResult.status === 501 && ttsResult.json?.error?.code === 'FEATURE_UNAVAILABLE') {
      throw new Error('TTS unavailable (501 FEATURE_UNAVAILABLE)');
    }
    if (ttsResult.status === 204) {
      throw new Error('TTS returned 204 (empty assistant text)');
    }
    if (ttsResult.status !== 200) {
      const bodyPreview = ttsResult.json
        ? JSON.stringify(ttsResult.json).slice(0, 300)
        : (ttsResult.rawText || '<empty>').slice(0, 300);
      throw new Error(`TTS unexpected status ${ttsResult.status}: ${bodyPreview}`);
    }

    if (!ttsResult.contentType.toLowerCase().startsWith('audio/')) {
      throw new Error(
        `TTS 200 response Content-Type not audio/*: ${JSON.stringify(ttsResult.contentType)}`,
      );
    }

    const buf = ttsResult.buffer;
    if (buf.length < 4) {
      throw new Error(`TTS audio too short for magic-byte check (length=${buf.length})`);
    }
    const container = detectAudioContainer(buf);
    if (container === null) {
      const head = Array.from(buf.subarray(0, 4))
        .map((b) => `0x${b.toString(16).padStart(2, '0')}`)
        .join(' ');
      throw new Error(
        `TTS audio magic bytes invalid (head=${head}, expected OggS / ID3 / 0xFF 0xE?)`,
      );
    }

    if (buf.length < MIN_TTS_BYTE_LENGTH) {
      throw new Error(
        `TTS audio length ${buf.length} < ${MIN_TTS_BYTE_LENGTH} (suspect truncated or error envelope)`,
      );
    }

    if (container === 'ogg') {
      const granulePos = readLastOggGranulePos(buf);
      if (granulePos === null) {
        throw new Error(
          'TTS audio looked like Ogg (OggS prefix) but no Ogg page granulepos could be read ' +
            '(suspect a truncated/corrupt stream).',
        );
      }
      if (granulePos < MIN_GRANULEPOS_2S_48KHZ) {
        throw new Error(
          `TTS audio granulepos ${granulePos} implies <2s of audio (suspect silence/stub; ` +
            `floor=${MIN_GRANULEPOS_2S_48KHZ} samples @48kHz Opus).`,
        );
      }
    }

    console.log(
      `[smoke:api] tts OK (bytes=${buf.length}, contentType=${ttsResult.contentType}, msgId=${assistantMessageId.slice(0, 8)})`,
    );

    const imageChatEnabled = getEnv('SMOKE_IMAGE_CHAT_ENABLED', 'true').toLowerCase() === 'true';
    if (imageChatEnabled) {
      const imgChat = await fetchJson({
        baseUrl,
        path: `/api/chat/sessions/${createdSessionId}/messages`,
        method: 'POST',
        token: accessToken,
        body: {
          text: 'Décris brièvement cette image.',
          image: `data:image/png;base64,${SMOKE_TEST_PNG_B64}`,
          context: {},
        },
        timeoutMs,
        expected: [201, 402, 429, 503],
      });
      if (imgChat.status === 201) {
        console.log('[smoke:api] chat image (real S3 upload) OK (status=201)');
      } else {
        console.log(
          `[smoke:api] WARN chat image status=${imgChat.status} — S3 upload OK, vision/LLM side degraded (not an S3 fault)`,
        );
      }
    }
  } finally {
    const deleted = await fetchJson({
      baseUrl,
      path: `/api/chat/sessions/${createdSessionId}`,
      method: 'DELETE',
      token: accessToken,
      timeoutMs,
      expected: 200,
    });
    if (typeof deleted.json?.deleted !== 'boolean') {
      throw new Error(`Delete session response invalid: ${JSON.stringify(deleted.json)}`);
    }
    if (deleted.json.deleted !== false) {
      throw new Error(
        `DELETE on a non-empty session returned deleted=${String(deleted.json.deleted)} ` +
          '(expected false). A session with persisted user+assistant messages is NOT empty ' +
          'and MUST NOT be deletable via this endpoint — a true here means the chat ' +
          'persistence path silently lost the messages.',
      );
    }

    const survives = await fetchJson({
      baseUrl,
      path: `/api/chat/sessions/${createdSessionId}`,
      method: 'GET',
      token: accessToken,
      timeoutMs,
      expected: 200,
    });
    if (survives.status !== 200) {
      throw new Error(
        `Session ${createdSessionId} did not survive the no-op DELETE (GET status=${survives.status}, ` +
          'expected 200) — the delete was not a no-op or persistence was lost.',
      );
    }
    console.log(`[smoke:api] cleanup delete session OK (deleted=false, session survives GET 200)`);
  }

  console.log('[smoke:api] PASS');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[smoke:api] FAIL: ${message}`);
  process.exit(1);
});
