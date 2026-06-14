#!/usr/bin/env node
'use strict';

// Shared, dependency-free audio byte validators (magic-byte container detection
// + Ogg granulepos parsing). Extracted to a single source of truth so the smoke
// and its unit tests assert the SAME logic — no more inline replicas.
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

function buildUrl(baseUrl, path) {
  return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
}

/**
 * Minimal 1×1 PNG, base-64 encoded — synthetic fixture for the C3 compare
 * smoke. Used when no real fixture is uploaded by the CI job. The pipeline
 * accepts it (passes magic-byte validation), but a brand-new test pixel will
 * not match any catalogued artwork — so the smoke asserts the endpoint
 * RESPONDS within the contract (200 + matches[] OR 503 + encoder fallback),
 * not that it returns specific neighbours. Real recall regression is the
 * Maestro flow's job (`.maestro/chat-compare.yaml`, T8.8).
 */
const SMOKE_TEST_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/**
 * POST a multipart/form-data payload (used for `/api/chat/compare` which only
 * accepts a file + scalar fields, never JSON). Returns the same `{ status, json }`
 * shape as `fetchJson` so the call sites stay symmetrical.
 */
async function fetchMultipart({ baseUrl, path, token, fields, timeoutMs = DEFAULT_TIMEOUT_MS, expected }) {
  const url = buildUrl(baseUrl, path);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value && typeof value === 'object' && Buffer.isBuffer(value.buffer)) {
        // File field: { buffer, filename, contentType } shape.
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

/**
 * POST/GET an endpoint that returns a binary body (used for `/messages/:id/tts`
 * which streams raw `audio/mpeg` per `createTtsHandler` in chat-media.route.ts).
 * Mirrors `fetchJson` but does NOT `JSON.parse` the response — that would throw
 * on MP3 magic-bytes. On non-expected status it surfaces the text body for
 * diagnostic (typical error envelope shape `{ error: { code, message } }`).
 *
 * Returns `{ status, buffer, contentType, json }` where `json` is the parsed
 * error envelope on failure (or `null` on success — binary path stays in
 * `buffer`).
 *
 * R5 (C7.1) — see docs/roadmap-night/specs/R5.md §3.6 (D5).
 */
async function fetchBinary({ baseUrl, path, method = 'POST', token, body, timeoutMs = DEFAULT_TIMEOUT_MS, expected }) {
  const url = buildUrl(baseUrl, path);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      // Accept both binary (happy path) and JSON (error envelope) — the server
      // chooses based on outcome, so we list both rather than forcing one.
      // `audio/ogg` covers the OpenAI Opus/Ogg container the TTS service has
      // emitted since C9.12a (2026-05-17, text-to-speech.openai.ts:46 —
      // -40% bandwidth + -50-100ms first-byte vs MP3). `audio/mpeg` kept for
      // legacy MP3 path in case the response_format is ever rolled back.
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
      // Failure path — try to parse the body as JSON to surface error.code for
      // R6/R7 caller diagnostics. If it's not JSON, fall back to truncated text.
      const text = await response.text();
      let json = null;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch (error) {
          // Non-JSON error body — keep `json` null, caller falls back to status.
        }
      }
      return { status: response.status, buffer: Buffer.alloc(0), contentType, json, rawText: text };
    }

    // Success path — binary buffer.
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
  // M-SMOKE-HEALTH-REQUIRE-OK (INV-1) — strict-by-default. `status` is the only
  // health field emitted in prod (checks.redis is redacted when NODE_ENV=
  // production, api.router.ts:98/103) and it already collapses redis-down/db-down
  // into 'degraded' (api.router.ts:85 `degraded = !dbUp || redisDown`). So we
  // REQUIRE status==='ok' by default and reject 'degraded'. A DB-down or
  // redis-down prod now fails the smoke loudly instead of passing GREEN.
  // Explicit opt-out (SMOKE_ALLOW_DEGRADED_HEALTH=true) tolerates 'degraded' for
  // intentional partial-outage runs; default never tolerates it.
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
  // M-SMOKE-HEALTH-REQUIRE-OK — default SMOKE_REQUIRE_REDIS to 'true'. The redis
  // gate fires by default, but only WHEN the health payload exposes checks.redis
  // (non-prod; prod redacts it, in which case the status==='ok' gate above
  // already covers a redis-down via 'degraded'). 'skipped' = cache not wired =
  // a prod misconfiguration distinct from 'down'; surface both clearly.
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
    // redisCheck === 'up' → OK. redisCheck === undefined → redacted in prod;
    // the status==='ok' gate above already proves redis is not 'down'.
  }
  console.log('[smoke:api] health OK');

  const session = await ensureLogin(baseUrl, email, password, timeoutMs);
  if (!session?.accessToken || !session?.refreshToken) {
    throw new Error('Auth session payload missing accessToken/refreshToken');
  }
  console.log('[smoke:api] auth OK');

  const accessToken = session.accessToken;

  // GDPR consent grants — REQUIRED before chat POST in V1.
  //
  // `consent-gate.ts:73` enforces `third_party_ai_text_openai` (text channel
  // via provider-resolver.ts) on every text message. Without it, the chat
  // service early-returns at `chat-message.service.ts:223` with a synthetic
  // refusal carrying a `consent_refusal::<scope>` id (consent-gate.ts:108).
  // That id is deliberately NOT a UUID — it must not collide with real
  // `chat_message.id` rows — so the downstream TTS validator
  // (`chat-media.service.ts:72` `isUuid()`) rejects with 400
  // "Invalid message id format", auto-rollback fires on the smoke step,
  // and the deploy reverts. Real users grant via the ConsentBanner before
  // ever reaching the chat screen ; the smoke must mirror that flow.
  //
  // Audio scope also pre-granted in case TTS adds its own gate in V1.x —
  // cheap belt-and-suspenders, no downside if unused.
  //
  // Image scope (`third_party_ai_image_openai`) is REQUIRED before POST
  // /api/chat/compare: the visual-similarity endpoint sends the photo to the
  // third-party image AI (provider-resolver.ts:69), and consent-gate enforcement
  // returns 403 `consent_required` without it. Added 2026-06-05 after the prod
  // smoke failed on compare (scope was introduced with the GDPR consent work
  // 71f103b3/b2a2c53d but the smoke was never updated to mirror the user flow).
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

  // T9.3 — `/api/chat/compare` smoke (Phase 9 / C3 visual similarity).
  //
  // Default: ENABLED. The endpoint MUST exist and respond contractually in
  // every smoke run — it's a public contract. Disable explicitly with
  // `SMOKE_COMPARE_ENABLED=false` only when running against an environment
  // where the SigLIP encoder is genuinely down (and you're in the middle of
  // remediation). Skipping silently in normal operation would defeat the
  // smoke's purpose.
  const compareEnabled = getEnv('SMOKE_COMPARE_ENABLED', 'true').toLowerCase() === 'true';
  if (compareEnabled) {
    // H1-COMPARE-DEFAULT-200 (INC-2026-06-14 regression guard, INV-2).
    //
    // DEFAULT expected = [200]. A 503 from /api/chat/compare means the SigLIP
    // encoder is dead (similarity.service.ts:432-438 returns the
    // encoder_unavailable fallback → chat-compare.route.ts:216-223 maps it to
    // 503 COMPARE_ENCODER_UNAVAILABLE). The previous smoke tolerated that 503 as
    // "contractual", so a broken prod encoder passed the smoke GREEN — the exact
    // INC-2026-06-14 incident. Now a 503 throws 'Unexpected status for POST
    // /api/chat/compare: 503' (fetchMultipart) and exits 1, FAILING loudly.
    //
    // The 503 tolerance is gated behind an explicit, named opt-out env
    // (SMOKE_COMPARE_ALLOW_ENCODER_DOWN, default 'false'). Only when truthy does
    // the encoder-down 503 become acceptable AND the 503-envelope assertion run.
    const allowEncoderDown =
      getEnv('SMOKE_COMPARE_ALLOW_ENCODER_DOWN', 'false').toLowerCase() === 'true';
    const compareExpected = allowEncoderDown ? [200, 503] : [200];

    // H1-COMPARE-MODELVERSION-PINNED (INV-3). A 200 must carry the EXACT model
    // version the encoder catalogues (siglip-onnx.adapter.ts:30/151), not merely
    // a non-empty string. The encoder-fallback stamps modelVersion='' (similarity
    // .service.ts:436) — but that path is 503, never 200. Pinning the value
    // proves the encoder actually ran the catalogued model on a healthy 200,
    // not a silent fallback that leaked a 200.
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
      // Synthetic 1×1 PNG → matches[] may be empty (no neighbour in catalog),
      // BUT a 200 MUST carry the catalogued modelVersion (proves the encoder ran).
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
      // 503 — only reachable when SMOKE_COMPARE_ALLOW_ENCODER_DOWN is truthy.
      // Verify the contractual fallback envelope before tolerating it.
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

  // R5 (C7.1) — TTS voice round-trip (docs/roadmap-night/specs/R5.md).
  //
  // ALWAYS runs (no env flag per N1 + feedback_no_feature_flags_prelaunch).
  // Sequenced AFTER compare so a compare regression does not mask TTS, and
  // BEFORE the DELETE cleanup so the session still exists for the chat POST.
  // The whole stage is wrapped in try/finally so the DELETE cleanup runs
  // unconditionally even when TTS fails (R10 / AC8).
  try {
    // 1. POST a fixed FR art prompt to drive an assistant reply (R1).
    //    Textbook art topic so guardrails pass (V1 keyword + V2 LLM Guard).
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
    // M-SMOKE-CHAT-TEXT-LENGTH — a real LLM art answer about la Joconde is far
    // longer than 50 chars. A truncated/stub reply (e.g. a guardrail refusal,
    // an empty-completion fallback, a degraded model) is caught here. We do NOT
    // assert citations: it is .nullable() on the healthy path
    // (main-assistant-output.schema.ts:146-149), so asserting it would false-fail
    // healthy runs (INV-4).
    if (assistantText.trim().length <= 50) {
      throw new Error(
        `Chat POST 201 assistant text too short (len=${assistantText.trim().length}, expected >50): ` +
          `${JSON.stringify(assistantText).slice(0, 200)} — suspect a truncated/stub/refusal reply.`,
      );
    }

    // M-SMOKE-CHAT-ROUNDTRIP — re-read the session and assert the assistant
    // message persisted and is re-readable. GET /api/chat/sessions/:id returns
    // messages[] (chat-session.route.ts:130 → chat-session.service.ts:194-202);
    // there is NO single-message GET endpoint. This proves the reply was
    // actually written to the store, not just echoed back in the POST response.
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

    // 2. POST /messages/:id/tts → binary MP3 (R3).
    //    Accept 200 happy-path here; we explicitly check 204/501 below to emit
    //    R6/R7 contractual failure messages with the exact required wording.
    const ttsResult = await fetchBinary({
      baseUrl,
      path: `/api/chat/messages/${assistantMessageId}/tts`,
      method: 'POST',
      token: accessToken,
      timeoutMs,
      expected: [200, 204, 501],
    });

    if (ttsResult.status === 501 && ttsResult.json?.error?.code === 'FEATURE_UNAVAILABLE') {
      // R7 / N3 — DisabledTextToSpeechService active → deploy is broken.
      throw new Error('TTS unavailable (501 FEATURE_UNAVAILABLE)');
    }
    if (ttsResult.status === 204) {
      // R6 — empty assistant text surfaced via createTtsHandler's `res.status(204).end()`.
      throw new Error('TTS returned 204 (empty assistant text)');
    }
    if (ttsResult.status !== 200) {
      // R8 — any other unexpected status (cost guard 402, rate limit 429, etc.).
      const bodyPreview = ttsResult.json
        ? JSON.stringify(ttsResult.json).slice(0, 300)
        : (ttsResult.rawText || '<empty>').slice(0, 300);
      throw new Error(`TTS unexpected status ${ttsResult.status}: ${bodyPreview}`);
    }

    // 3. Content-Type must be audio/* (R3).
    if (!ttsResult.contentType.toLowerCase().startsWith('audio/')) {
      throw new Error(
        `TTS 200 response Content-Type not audio/*: ${JSON.stringify(ttsResult.contentType)}`,
      );
    }

    // 4. Magic-byte validation per R4 / D2, via the shared `validate-audio.cjs`
    //    `detectAudioContainer`. Accept any container the backend has shipped :
    //      - "OggS" header (0x4f 0x67 0x67 0x53) — Ogg container (current
    //        path : OpenAI Opus, response_format='opus' since C9.12a)
    //      - "ID3" header (0x49 0x44 0x33) — MP3 with ID3v2 tag
    //      - MPEG frame-sync (0xFF followed by 0xF*, (b1 & 0xE0) === 0xE0)
    //        — bare MP3 frame
    //    No ffprobe — pure byte check.
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

    // 5. Length floor per R5 — sub-1KB body almost always = error envelope
    //    misrouted as binary or truncated stream.
    if (buf.length < MIN_TTS_BYTE_LENGTH) {
      throw new Error(
        `TTS audio length ${buf.length} < ${MIN_TTS_BYTE_LENGTH} (suspect truncated or error envelope)`,
      );
    }

    // 5b. M-SMOKE-TTS-GRANULEPOS (INV-5) — magic-bytes + the byte floor are
    //     cheap pre-filters but a silence/truncated Opus stub carries a valid
    //     OggS header and can exceed the floor while containing ~0s of audio.
    //     The backend emits Ogg/Opus (response_format:'opus',
    //     text-to-speech.openai.ts:50; audio/ogg, :184). Parse the last Ogg
    //     page's granule position (Opus = sample count at 48 kHz) and require it
    //     to imply >= ~2s of audio (MIN_GRANULEPOS_2S_48KHZ samples), allowing
    //     for pre-skip. A silence/empty stub yields granulepos ~0 and fails
    //     loudly. Pure byte parse — only applies when the container is Ogg.
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

    // 6. Happy log per R9 / AC9 — exact one-line shape, anchored regex in test.
    console.log(
      `[smoke:api] tts OK (bytes=${buf.length}, contentType=${ttsResult.contentType}, msgId=${assistantMessageId.slice(0, 8)})`,
    );

    // 7. S3 OBJECT-STORE verification (INC-2026-06-14). A chat message WITH an
    //    image runs the shared image pipeline → imageStorage.save = a REAL S3
    //    upload (NOT the compare's skipStorage path). A working object store
    //    returns 201; a misconfigured one fails the upload with a 500
    //    `S3 upload failed (...)`. This is the only smoke assertion that exercises
    //    the real S3 credentials end to end (audit finding #1 residual). The 1×1
    //    PNG is fine — we verify the upload path, not vision quality.
    //    expected=[201,402,429,503]: a 500 (S3) fails the smoke loudly; a
    //    402/429/503 means S3 succeeded but the vision/LLM side is degraded
    //    (cost guard / rate limit / breaker) — not an S3 fault, so warn only.
    const imageChatEnabled =
      getEnv('SMOKE_IMAGE_CHAT_ENABLED', 'true').toLowerCase() === 'true';
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
    // R10 / AC8 — DELETE cleanup runs UNCONDITIONALLY, even on TTS failure.
    //
    // M-SMOKE-DELETE-ASSERT-FALSE-AND-GET-200 (INV-6). `/api/chat/sessions/:id`
    // maps to `deleteSessionIfEmpty`, which returns `{deleted:false}` WITHOUT
    // deleting when the session has messages (chat.repository.typeorm.ts:138-139).
    // By this point the chat POST above persisted a user + assistant message, so
    // the session is GUARANTEED non-empty. Therefore:
    //   - deleted MUST be false. A `true` here would mean the persistence path
    //     silently lost the messages → fail loudly.
    //   - the session row MUST survive → a follow-up GET returns 200, never 404.
    // This replaces the previous "tolerate both true and false" comment: that
    // tolerance was vacuous; with a guaranteed-non-empty session only false is
    // correct. (Note: this finally runs unconditionally — if TTS threw BEFORE
    // the chat POST persisted, deleted could legitimately be true. But the chat
    // POST + its assertions run at the TOP of the try, before TTS, so any path
    // that reaches the TTS stage has already persisted the messages. The only
    // way to reach this finally with an empty session is a throw inside the chat
    // POST itself — which would have already failed the smoke before here.)
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

    // The DELETE was a no-op (deleted=false), so the session row still exists.
    // A GET MUST return 200 (NOT 404) — proves the messages persisted and the
    // no-op-delete contract holds.
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
    console.log(
      `[smoke:api] cleanup delete session OK (deleted=false, session survives GET 200)`,
    );
  }

  console.log('[smoke:api] PASS');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[smoke:api] FAIL: ${message}`);
  process.exit(1);
});
