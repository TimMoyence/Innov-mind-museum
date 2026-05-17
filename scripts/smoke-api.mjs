#!/usr/bin/env node
// scripts/smoke-api.mjs
//
// Local API contract smoke runner — covers the critical auth/account paths
// that the FE depends on, with auto-cleanup of every test account created.
//
// Why this exists : on 2026-05-17 a missing migration (User.tier) made
// /api/auth/login return 500s, and the FE remapped it to a generic
// "Veuillez vérifier votre saisie" message. No automated test caught the
// regression because CI auto-runs migrations on a fresh DB while local
// Docker persists volumes between restarts. This script closes that gap.
//
// Usage :
//   pnpm smoke:api              # default: localhost:3000
//   API_BASE=https://staging... pnpm smoke:api
//
// Exit codes :
//   0 = all scenarios pass
//   1 = one or more scenarios fail
//   2 = setup failure (backend unreachable, no node fetch, etc.)
//
// Each created account is tracked in CLEANUP and DELETEd in a finally
// block, so re-runs don't accumulate orphan rows.

const API_BASE = process.env.API_BASE ?? 'http://localhost:3000';
const VERBOSE = process.env.VERBOSE === '1';

const C = process.stdout.isTTY
  ? {
      green: '\x1b[32m',
      red: '\x1b[31m',
      yellow: '\x1b[33m',
      gray: '\x1b[90m',
      bold: '\x1b[1m',
      reset: '\x1b[0m',
    }
  : { green: '', red: '', yellow: '', gray: '', bold: '', reset: '' };

// ──────────────────────────────────────────────────────────────────────────
// Test fixtures + helpers
// ──────────────────────────────────────────────────────────────────────────

const RUN_TAG = Date.now().toString(36);
const fixtures = {
  email: (suffix) => `smoke+${RUN_TAG}-${suffix}@local.dev`,
  freshPassword: () => `MuseumSmk!${RUN_TAG}A1`, // unique, non-pwned
  breachedPassword: () => 'password123', // widely breached, in any HIBP list
  shortPassword: () => 'ab',
  validDob: () => '1994-08-10',
  minorDob: () => '2015-01-01', // under 15 → MINOR_PARENTAL_CONSENT_REQUIRED
  firstname: 'Smoke',
  lastname: 'Local',
};

const CLEANUP_TOKENS = []; // accumulated tokens for accounts we created

async function api(method, path, { body, token } = {}) {
  const url = `${API_BASE}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _rawText: text };
  }
  if (VERBOSE) {
    console.log(`${C.gray}  → ${method} ${path} → ${res.status}${C.reset}`);
  }
  return { status: res.status, body: json };
}

const errCode = (responseBody) => responseBody?.error?.code ?? responseBody?.code;

// Reset Redis rate-limit + auth-lockout buckets so back-to-back smoke runs
// don't trip the IP-keyed registerLimiter (5 req / 10 min by default) or the
// email-keyed loginByAccountLimiter. Scoped to `ratelimit:*`, `auth:lockout:*`,
// `ratelimit:auth-login-account:*` — no app data touched. Local-only operation
// against dev-redis container.
async function resetLocalRateLimits() {
  const { execSync } = await import('node:child_process');
  const patterns = ['ratelimit:*', 'auth:lockout:*'];
  for (const pattern of patterns) {
    try {
      const cmd = `docker exec dev-redis sh -c "redis-cli --scan --pattern '${pattern}' | xargs -r redis-cli del" 2>/dev/null || true`;
      execSync(cmd, { stdio: VERBOSE ? 'inherit' : 'pipe' });
    } catch {
      // best-effort; rate-limit miss is not fatal
    }
  }
}

// Local-only DB poke to flip the email_verified flag on accounts we created
// via /api/auth/register. Mirrors what museum-backend/scripts/seed-smoke-account.ts
// does for the CI pre-seeded account. Scoped to smoke+RUN_TAG-*@local.dev so we
// can never accidentally flip a real user. Uses `docker exec` against the dev
// Postgres container — no DB driver dependency in this script.
async function verifyEmailViaDb(email) {
  const { execSync } = await import('node:child_process');
  const sql = `UPDATE users SET email_verified = true WHERE email = '${email.replace(/'/g, "''")}'`;
  try {
    execSync(
      `docker exec dev-postgres psql -U postgres -d museumAI -c "${sql}" -t -A`,
      { stdio: VERBOSE ? 'inherit' : 'pipe' },
    );
  } catch (err) {
    throw new Error(`verifyEmailViaDb(${email}): ${err.message}`);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Assertion DSL
// ──────────────────────────────────────────────────────────────────────────

function assertStatus(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected status ${expected}, got ${actual}`);
  }
}

function assertCode(body, expected, label) {
  const actual = errCode(body);
  if (actual !== expected) {
    throw new Error(`${label}: expected error.code "${expected}", got "${actual}"`);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Scenarios (each is { name, fn() })
// ──────────────────────────────────────────────────────────────────────────

const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });

// Track the primary happy-path account for the duplicate-email + login tests.
let happyEmail = null;
let happyToken = null;

scenario('SETUP: backend reachable + rate-limit buckets reset', async () => {
  const r = await api('GET', '/api/health');
  assertStatus(r.status, 200, 'health');
  if (r.body?.checks?.database !== 'up') {
    throw new Error(`DB not healthy: ${JSON.stringify(r.body)}`);
  }
  await resetLocalRateLimits();
});

scenario('AUTH register — happy path (201 + user id)', async () => {
  happyEmail = fixtures.email('happy');
  const r = await api('POST', '/api/auth/register', {
    body: {
      email: happyEmail,
      password: fixtures.freshPassword(),
      firstname: fixtures.firstname,
      lastname: fixtures.lastname,
      dateOfBirth: fixtures.validDob(),
    },
  });
  assertStatus(r.status, 201, 'register happy');
  if (!r.body?.user?.id) throw new Error('register: no user.id in response');
});

scenario('AUTH register — PASSWORD_BREACHED (HIBP rejection)', async () => {
  const r = await api('POST', '/api/auth/register', {
    body: {
      email: fixtures.email('breached'),
      password: fixtures.breachedPassword(),
      firstname: fixtures.firstname,
      lastname: fixtures.lastname,
      dateOfBirth: fixtures.validDob(),
    },
  });
  assertStatus(r.status, 400, 'register breached');
  assertCode(r.body, 'PASSWORD_BREACHED', 'register breached');
});

scenario('AUTH register — CONFLICT (duplicate email)', async () => {
  if (!happyEmail) throw new Error('precondition: happy register did not run');
  const r = await api('POST', '/api/auth/register', {
    body: {
      email: happyEmail,
      password: fixtures.freshPassword(),
      firstname: fixtures.firstname,
      lastname: fixtures.lastname,
      dateOfBirth: fixtures.validDob(),
    },
  });
  assertStatus(r.status, 409, 'register duplicate');
  assertCode(r.body, 'CONFLICT', 'register duplicate');
});

scenario('AUTH register — MINOR_PARENTAL_CONSENT_REQUIRED (DOB under 15)', async () => {
  const r = await api('POST', '/api/auth/register', {
    body: {
      email: fixtures.email('minor'),
      password: fixtures.freshPassword(),
      firstname: fixtures.firstname,
      lastname: fixtures.lastname,
      dateOfBirth: fixtures.minorDob(),
    },
  });
  assertStatus(r.status, 422, 'register minor');
  assertCode(r.body, 'MINOR_PARENTAL_CONSENT_REQUIRED', 'register minor');
});

scenario('AUTH register — BAD_REQUEST (password too short)', async () => {
  const r = await api('POST', '/api/auth/register', {
    body: {
      email: fixtures.email('shortpw'),
      password: fixtures.shortPassword(),
      firstname: fixtures.firstname,
      lastname: fixtures.lastname,
      dateOfBirth: fixtures.validDob(),
    },
  });
  if (r.status < 400 || r.status >= 500) {
    throw new Error(`register short pw: expected 4xx, got ${r.status}`);
  }
});

scenario('AUTH login — EMAIL_NOT_VERIFIED (account just created)', async () => {
  if (!happyEmail) throw new Error('precondition: happy register did not run');
  const r = await api('POST', '/api/auth/login', {
    body: { email: happyEmail, password: fixtures.freshPassword() },
  });
  assertStatus(r.status, 403, 'login unverified');
  assertCode(r.body, 'EMAIL_NOT_VERIFIED', 'login unverified');
});

scenario('AUTH login — happy path (200 + tokens, after email verified)', async () => {
  if (!happyEmail) throw new Error('precondition: happy register did not run');
  await verifyEmailViaDb(happyEmail);
  const r = await api('POST', '/api/auth/login', {
    body: { email: happyEmail, password: fixtures.freshPassword() },
  });
  assertStatus(r.status, 200, 'login happy');
  if (!r.body?.accessToken || !r.body?.refreshToken) {
    throw new Error('login: missing accessToken/refreshToken in response');
  }
  happyToken = r.body.accessToken;
  CLEANUP_TOKENS.push(happyToken);
});

scenario('AUTH login — INVALID_CREDENTIALS (wrong password)', async () => {
  if (!happyEmail) throw new Error('precondition: happy register did not run');
  const r = await api('POST', '/api/auth/login', {
    body: { email: happyEmail, password: 'WrongPassword!1' },
  });
  assertStatus(r.status, 401, 'login wrong pw');
  assertCode(r.body, 'INVALID_CREDENTIALS', 'login wrong pw');
});

scenario('AUTH /me — authenticated (200 + profile)', async () => {
  if (!happyToken) throw new Error('precondition: login did not run');
  const r = await api('GET', '/api/auth/me', { token: happyToken });
  assertStatus(r.status, 200, 'me with token');
  // Shape: { user: { id, email, firstname, lastname, role, ... } } per auth-profile.route.ts:40
  if (!r.body?.user?.email) throw new Error('me: response missing user.email');
  if (r.body.user.email !== happyEmail) {
    throw new Error(`me: returned email "${r.body.user.email}" does not match registered "${happyEmail}"`);
  }
});

scenario('AUTH /me — anonymous (401)', async () => {
  const r = await api('GET', '/api/auth/me');
  assertStatus(r.status, 401, 'me without token');
});

scenario('ONBOARDING /auth/onboarding-complete — anonymous (401)', async () => {
  const r = await api('PATCH', '/api/auth/onboarding-complete');
  assertStatus(r.status, 401, 'onb without token');
});

scenario('ONBOARDING /auth/onboarding-complete — authenticated (200/204)', async () => {
  if (!happyToken) throw new Error('precondition: login did not run');
  const r = await api('PATCH', '/api/auth/onboarding-complete', { token: happyToken });
  if (r.status !== 200 && r.status !== 204) {
    throw new Error(`onb with token: expected 200/204, got ${r.status}`);
  }
});

// ──────────────────────────────────────────────────────────────────────────
// Cleanup — delete every account we created (called from finally)
// ──────────────────────────────────────────────────────────────────────────

async function cleanup() {
  if (CLEANUP_TOKENS.length === 0) return;
  console.log(`\n${C.gray}Cleaning up ${CLEANUP_TOKENS.length} test account(s)...${C.reset}`);
  for (const token of CLEANUP_TOKENS) {
    try {
      const r = await api('DELETE', '/api/auth/account', { token });
      if (r.status !== 200 && r.status !== 204) {
        console.log(`${C.yellow}  ⚠ DELETE /auth/account returned ${r.status}${C.reset}`);
      }
    } catch (err) {
      console.log(`${C.yellow}  ⚠ cleanup error: ${err.message}${C.reset}`);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Runner
// ──────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`${C.bold}Musaium API smoke — ${API_BASE}${C.reset}`);
  console.log(`${C.gray}Run tag : ${RUN_TAG} (test emails: smoke+${RUN_TAG}-*@local.dev)${C.reset}\n`);

  const results = [];
  let stopOnSetupFail = false;

  for (const { name, fn } of scenarios) {
    if (stopOnSetupFail) {
      results.push({ name, status: 'skipped' });
      continue;
    }
    try {
      await fn();
      results.push({ name, status: 'pass' });
      console.log(`${C.green}✓${C.reset} ${name}`);
    } catch (err) {
      results.push({ name, status: 'fail', error: err.message });
      console.log(`${C.red}✗${C.reset} ${name}`);
      console.log(`  ${C.red}${err.message}${C.reset}`);
      if (name.startsWith('SETUP:')) {
        stopOnSetupFail = true;
        console.log(`${C.red}${C.bold}Setup failed — aborting remaining scenarios.${C.reset}`);
      }
    }
  }

  try {
    await cleanup();
  } catch (err) {
    console.log(`${C.yellow}Cleanup error: ${err.message}${C.reset}`);
  }

  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const skip = results.filter((r) => r.status === 'skipped').length;

  console.log('');
  console.log(`${C.bold}${pass}/${results.length} pass${C.reset}`);
  if (fail) console.log(`${C.red}${fail} fail${C.reset}`);
  if (skip) console.log(`${C.yellow}${skip} skipped${C.reset}`);

  if (stopOnSetupFail) process.exit(2);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(`${C.red}Fatal: ${err.stack ?? err.message ?? err}${C.reset}`);
  process.exit(2);
});
