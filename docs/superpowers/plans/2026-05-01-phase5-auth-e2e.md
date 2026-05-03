# Phase 5 — Auth E2E Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 e2e files covering verify-email, social-login (Apple+Google with JWT/JWKS spoof), refresh rate-limit, refresh rotation — proving the auth contracts shipped by F1 + F3 + parallel work.

**Architecture:** Each gap = its own e2e file. `TestEmailService` intercepts verification emails via an `AUTH_EMAIL_SERVICE_KIND=test` env-var branch in the auth composition root. A local `startSocialJwtSpoof()` helper boots a tiny HTTP server with a JWKS endpoint + signs ID tokens locally; the harness redirects `APPLE_OIDC_JWKS_URL` / `GOOGLE_OIDC_JWKS_URL` to the spoof. Refresh limit + rotation tests exercise existing F1 + F7 contracts via the real Express harness. A sentinel asserts production env never accepts `AUTH_EMAIL_SERVICE_KIND=test`.

**Tech Stack:** Node 22 crypto (`generateKeyPairSync`, `createSign`), Jest, supertest via `createE2EHarness`, real Postgres testcontainer, no new npm deps.

**Spec:** `docs/superpowers/specs/2026-05-01-phase5-auth-e2e-design.md`

**Total commits:** 4 (A / B / C / D per spec §7).

---

## Pre-Flight (no commit)

- [ ] **Step 0.1: Capture baseline + read load-bearing files**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend && pnpm test 2>&1 | tail -3
cat src/modules/auth/useCase/index.ts | head -80
cat src/modules/auth/adapters/secondary/social-token-verifier.adapter.ts | head -120
cat src/modules/auth/useCase/authSession.service.ts | grep -E "refresh|rotate|familyId|revoke" | head -20
cat src/config/env.ts | grep -A2 "brevo\|oidc\|nonce"
```

Capture: existing test count, the exact env-var names the social verifier reads, the exact `authSessionService.refresh()` revocation contract.

- [ ] **Step 0.2: Anti-leak protocol**

NEVER touch `museum-frontend/ios/...`, `museum-frontend/__tests__/hooks/useSocialLogin.test.ts`, `museum-frontend/__tests__/infrastructure/socialAuthProviders.test.ts`, `museum-frontend/features/auth/...`, parallel-session plans.

Apply before EVERY commit:
```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind && git restore --staged . && git add <intended only> && git diff --cached --name-only | sort
```

---

## Commit A — Verify-email e2e

### Task A1: Add `AUTH_EMAIL_SERVICE_KIND` env var

**Files:**
- Modify: `museum-backend/src/config/env.ts`

- [ ] **Step A1.1: Find the `auth:` block in env.ts**

```bash
grep -n "auth:\|brevoApiKey" /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/src/config/env.ts | head
```

Locate the `auth: { ... }` block.

- [ ] **Step A1.2: Add the env var**

In `museum-backend/src/config/env.ts`, find the `auth: {` block (around the `oidcNonceEnforce` line) and add:

```ts
  auth: {
    // ... existing fields ...
    /** Email service implementation. 'test' enables in-memory capture for e2e tests. Production rejects 'test'. */
    emailServiceKind: (process.env.AUTH_EMAIL_SERVICE_KIND as 'test' | 'brevo' | 'noop' | undefined) ?? 'brevo',
  },
```

Use `Edit` — preserve existing fields verbatim.

- [ ] **Step A1.3: Add a sentinel that rejects 'test' in production**

In the same file, add (after the `auth:` block, in the existing `validateProduction()` or similar — read the file to find the right spot):

```ts
if (isProduction && env.auth.emailServiceKind === 'test') {
  throw new Error(
    "AUTH_EMAIL_SERVICE_KIND='test' is forbidden in production. Set BREVO_API_KEY or use 'noop'.",
  );
}
```

If no `validateProduction()` exists, scan for similar invariants (e.g., the `DB_SYNCHRONIZE` ban) and follow the same pattern.

- [ ] **Step A1.4: Run typecheck**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend && npx tsc --noEmit 2>&1 | tail -5
```

Expected: 0 errors.

### Task A2: Create `TestEmailService` in `src/shared/email/`

**Files:**
- Create: `museum-backend/src/shared/email/test-email-service.ts`

- [ ] **Step A2.1: Read the email port shape**

```bash
cat /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/src/shared/email/email.port.ts 2>&1
```

Match its `EmailService` interface signature exactly.

- [ ] **Step A2.2: Write the test service**

```bash
cat > /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/src/shared/email/test-email-service.ts <<'EOF'
import type { EmailService } from './email.port';

export interface CapturedEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  sentAt: Date;
}

/**
 * Test-only email service: records every send into an in-memory store.
 *
 * Production wiring guards against this being instantiated outside tests via
 * the `AUTH_EMAIL_SERVICE_KIND` env-var sentinel in `config/env.ts`.
 */
export class TestEmailService implements EmailService {
  private readonly emails: CapturedEmail[] = [];

  async send(input: { to: string; subject: string; html: string; text?: string }): Promise<void> {
    this.emails.push({
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? '',
      sentAt: new Date(),
    });
  }

  /** Return every captured email (most recent last). */
  all(): readonly CapturedEmail[] {
    return [...this.emails];
  }

  /** Find the most recent email sent to `address` whose body has a `?token=<raw>` URL parameter. */
  findVerificationTokenFor(address: string): string | null {
    for (let i = this.emails.length - 1; i >= 0; i -= 1) {
      const e = this.emails[i];
      if (e.to !== address) continue;
      const match = e.html.match(/[?&]token=([A-Za-z0-9_\-]+)/);
      if (match) return match[1];
    }
    return null;
  }

  /** Wipe captured emails; call between e2e tests. */
  reset(): void {
    this.emails.length = 0;
  }
}
EOF
```

- [ ] **Step A2.3: Verify TS compiles**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend && npx tsc --noEmit 2>&1 | tail -5
```

Expected: 0 errors.

### Task A3: Wire `TestEmailService` into the auth composition root

**Files:**
- Modify: `museum-backend/src/modules/auth/useCase/index.ts`

- [ ] **Step A3.1: Update the `emailService` selection logic**

In `museum-backend/src/modules/auth/useCase/index.ts`, find the line:

```ts
const emailService: EmailService | undefined = env.brevoApiKey
  ? new BrevoEmailService(env.brevoApiKey)
  : undefined;
```

Replace with:

```ts
import { TestEmailService } from '@shared/email/test-email-service';

const testEmailService =
  env.auth.emailServiceKind === 'test' ? new TestEmailService() : null;

const emailService: EmailService | undefined =
  testEmailService ??
  (env.brevoApiKey ? new BrevoEmailService(env.brevoApiKey) : undefined);

/** Test-only handle on the in-memory email service. Null in prod. */
export const __testEmailService = testEmailService;
```

The `__testEmailService` export is the harness's hook — naming convention prefixes with `__` to signal "do not use outside tests".

- [ ] **Step A3.2: Run typecheck + existing unit tests**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend
npx tsc --noEmit 2>&1 | tail -5
pnpm test -- --testPathPattern='unit/auth' 2>&1 | tail -10
```

Expected: 0 type errors; existing auth unit tests still green.

### Task A4: Extend `e2e-app-harness.ts` to expose the test email service

**Files:**
- Modify: `museum-backend/tests/helpers/e2e/e2e-app-harness.ts`

- [ ] **Step A4.1: Add env var setting + harness field**

Find the env-var setup block in `createE2EHarness()` (where `process.env.NODE_ENV = 'test'` etc. are set). Add:

```ts
process.env.AUTH_EMAIL_SERVICE_KIND ??= 'test';
```

Add a field to the `E2EHarness` interface:

```ts
export interface E2EHarness {
  // ... existing fields ...
  testEmailService: import('@shared/email/test-email-service').TestEmailService | null;
}
```

After the dynamic import + `createApp()` call (before returning the harness), add:

```ts
const authModule = await import('@modules/auth/useCase');
const testEmailService = authModule.__testEmailService ?? null;
```

Include `testEmailService` in the returned harness object.

- [ ] **Step A4.2: Verify the existing e2e tests still pass with the harness change**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend && RUN_E2E=true pnpm test -- --testPathPattern='auth.e2e' 2>&1 | tail -15
```

Expected: existing register + login tests still green. If a test breaks because the harness shape changed, fix the test to use the new field (likely a no-op for existing tests).

### Task A5: Write `auth-verify-email.e2e.test.ts`

**Files:**
- Create: `museum-backend/tests/e2e/auth-verify-email.e2e.test.ts`

- [ ] **Step A5.1: Write the test file**

```bash
cat > /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/e2e/auth-verify-email.e2e.test.ts <<'EOF'
import { createE2EHarness, type E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('auth verify-email e2e', () => {
  jest.setTimeout(180_000);

  let harness: E2EHarness;

  beforeAll(async () => {
    harness = await createE2EHarness();
    expect(harness.testEmailService).not.toBeNull();
  });

  afterAll(async () => {
    await harness?.stop();
  });

  beforeEach(() => {
    harness.testEmailService?.reset();
  });

  async function registerAndCaptureToken(email: string): Promise<string> {
    const reg = await harness.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password: 'Password123!',
        firstname: 'Verify',
        lastname: 'Test',
        gdprConsent: true,
      }),
    });
    expect(reg.status).toBe(201);
    const token = harness.testEmailService?.findVerificationTokenFor(email) ?? null;
    expect(token).toMatch(/^[A-Za-z0-9_\-]{16,}$/);
    return token!;
  }

  async function fetchEmailVerified(email: string): Promise<boolean> {
    const result = await harness.dataSource.query<Array<{ email_verified: boolean }>>(
      'SELECT email_verified FROM users WHERE email = $1',
      [email],
    );
    return result[0]?.email_verified === true;
  }

  it('happy path: register sends an email with a verification token', async () => {
    const email = `e2e-verify-happy-${Date.now()}@musaium.test`;
    const token = await registerAndCaptureToken(email);
    expect(token.length).toBeGreaterThanOrEqual(16);
    expect(await fetchEmailVerified(email)).toBe(false);
  });

  it('POST /api/auth/verify-email consumes the token and sets email_verified=true', async () => {
    const email = `e2e-verify-consume-${Date.now()}@musaium.test`;
    const token = await registerAndCaptureToken(email);

    const res = await harness.request('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ verified: true });
    expect(await fetchEmailVerified(email)).toBe(true);
  });

  it('replaying the same token returns 400', async () => {
    const email = `e2e-verify-replay-${Date.now()}@musaium.test`;
    const token = await registerAndCaptureToken(email);
    const first = await harness.request('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    expect(first.status).toBe(200);

    const replay = await harness.request('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    expect(replay.status).toBe(400);
  });

  it('tampered token returns 400', async () => {
    const email = `e2e-verify-tampered-${Date.now()}@musaium.test`;
    const token = await registerAndCaptureToken(email);
    const tampered = `${token.slice(0, -3)}AAA`;

    const res = await harness.request('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: tampered }),
    });
    expect(res.status).toBe(400);
    expect(await fetchEmailVerified(email)).toBe(false);
  });

  it('whitespace-padded token is accepted (verifyEmailUseCase trims)', async () => {
    const email = `e2e-verify-trim-${Date.now()}@musaium.test`;
    const token = await registerAndCaptureToken(email);

    const res = await harness.request('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: `  ${token}  ` }),
    });
    expect(res.status).toBe(200);
    expect(await fetchEmailVerified(email)).toBe(true);
  });

  it('empty token returns 400', async () => {
    const res = await harness.request('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: '' }),
    });
    expect([400, 422]).toContain(res.status);
  });

  it('unknown user token returns 400 (not 404 — avoid enumeration)', async () => {
    const res = await harness.request('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: 'totally-fake-token-that-does-not-exist-anywhere' }),
    });
    expect(res.status).toBe(400);
  });
});
EOF
```

- [ ] **Step A5.2: Run the e2e (with Docker up locally) — expect green**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
docker compose -f museum-backend/docker-compose.dev.yml up -d
cd museum-backend && RUN_E2E=true pnpm test:e2e -- --testPathPattern='auth-verify-email' 2>&1 | tail -25
```

If Docker is unavailable, skip; CI on next push will validate. Note in commit body if skipped.

If a test fails:
- The harness `request()` body might need different shape — read the existing `auth.e2e.test.ts` for the call pattern.
- The email subject/body template may use different URL parameters than `?token=`. Inspect `museum-backend/src/modules/auth/...email-template...` (or wherever the email body is built) and adjust the regex in `findVerificationTokenFor` if needed (but the spec helper covers `?token=` and `&token=` already).
- The `verifyEmail` repo method may not exist on `IUserRepository` (it does — read `verifyEmail.useCase.ts:21`). If it does, the SQL `SELECT email_verified` should work.

### Task A6: Anti-leak commit A

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
git restore --staged .
git add museum-backend/src/config/env.ts
git add museum-backend/src/shared/email/test-email-service.ts
git add museum-backend/src/modules/auth/useCase/index.ts
git add museum-backend/tests/helpers/e2e/e2e-app-harness.ts
git add museum-backend/tests/e2e/auth-verify-email.e2e.test.ts

git diff --cached --name-only | sort
```

Verify exactly 5 paths.

```bash
git commit -m "$(cat <<'EOF'
test(e2e-auth): verify-email full leg + TestEmailService harness (Phase 5 Group A)

Phase 5 Group A — closes the verify-email e2e gap.

- src/shared/email/test-email-service.ts: TestEmailService records every
  send + exposes findVerificationTokenFor() for e2e tests. Prod-safe via
  the AUTH_EMAIL_SERVICE_KIND='test' env-var branch.
- src/config/env.ts: new AUTH_EMAIL_SERVICE_KIND env var (test|brevo|noop,
  default brevo). Production sentinel rejects 'test' loud.
- src/modules/auth/useCase/index.ts: composition root now picks
  TestEmailService when env.auth.emailServiceKind === 'test', else falls
  back to BrevoEmailService when brevoApiKey set, else undefined.
  Exposes __testEmailService handle for harness.
- tests/helpers/e2e/e2e-app-harness.ts: sets AUTH_EMAIL_SERVICE_KIND=test
  by default + exposes harness.testEmailService.
- tests/e2e/auth-verify-email.e2e.test.ts: 7 cases — happy path, full
  consume, replay → 400, tampered → 400, whitespace trim, empty → 400,
  unknown token → 400.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git log --oneline -3
git show --stat HEAD | head -10
```

If pre-commit hook bundles unrelated files: STOP, do NOT amend, report DONE_WITH_CONCERNS.

---

## Commit B — Social-login e2e w/ JWT+JWKS spoof

### Task B1: Read the social verifier adapter to discover env knobs

- [ ] **Step B1.1: Inspect the adapter**

```bash
cat /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/src/modules/auth/adapters/secondary/social-token-verifier.adapter.ts | head -150
```

Capture: which env vars set the JWKS URL, issuer, audience, allowed algos. Common names:
- `APPLE_OIDC_JWKS_URL` / `APPLE_TEAM_ID` / `APPLE_AUDIENCE` / `APPLE_OIDC_ISSUER`
- `GOOGLE_OIDC_JWKS_URL` / `GOOGLE_AUDIENCE` / `GOOGLE_OIDC_ISSUER`

If the adapter uses hard-coded URLs, this commit may need to introduce env-var overrides (small refactor).

### Task B2: Create the social JWT spoof helper

**Files:**
- Create: `museum-backend/tests/helpers/auth/social-jwt-spoof.ts`

- [ ] **Step B2.1: Write the helper**

```bash
mkdir -p /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/helpers/auth
cat > /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/helpers/auth/social-jwt-spoof.ts <<'EOF'
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { generateKeyPairSync, createSign, KeyObject } from 'node:crypto';
import { promisify } from 'node:util';

const KID = 'phase5-spoof-kid';

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export interface SocialJwtSpoof {
  /** URL of the spoof JWKS endpoint, e.g. http://127.0.0.1:54321/keys */
  jwksUrl: string;
  /** Sign an ID token with the spoof private key. */
  signToken: (claims: Record<string, unknown>) => string;
  /** Stop the HTTP server. Idempotent. */
  stop: () => Promise<void>;
}

export async function startSocialJwtSpoof(): Promise<SocialJwtSpoof> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

  // Export public key as JWK
  const jwk = publicKey.export({ format: 'jwk' });
  const jwks = {
    keys: [{ kty: jwk.kty, n: jwk.n, e: jwk.e, kid: KID, use: 'sig', alg: 'RS256' }],
  };

  const server: Server = createServer((req, res) => {
    if (req.url === '/keys' || req.url === '/jwks.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(jwks));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const jwksUrl = `http://127.0.0.1:${port}/keys`;

  function signToken(claims: Record<string, unknown>): string {
    const header = { alg: 'RS256', typ: 'JWT', kid: KID };
    const headerSeg = base64url(Buffer.from(JSON.stringify(header)));
    const payloadSeg = base64url(Buffer.from(JSON.stringify(claims)));
    const signingInput = `${headerSeg}.${payloadSeg}`;

    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();
    const signature = signer.sign(privateKey);
    return `${signingInput}.${base64url(signature)}`;
  }

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    await new Promise<void>((r) => server.close(() => r()));
  };

  return { jwksUrl, signToken, stop };
}
EOF
```

### Task B3: Extend `e2e-app-harness.ts` to plumb spoof URLs

- [ ] **Step B3.1: Wire the spoof into the harness**

The harness needs to set the OIDC JWKS env vars BEFORE module imports. Per the env vars discovered in Task B1, set them. Example:

In `museum-backend/tests/helpers/e2e/e2e-app-harness.ts`, in the env-var block, add:

```ts
// Phase 5: social-login spoof. Set placeholder URLs; the e2e test starts the
// real spoof server in beforeAll and overrides at runtime via env.
process.env.APPLE_OIDC_JWKS_URL ??= 'http://127.0.0.1:0/will-be-overridden';
process.env.GOOGLE_OIDC_JWKS_URL ??= 'http://127.0.0.1:0/will-be-overridden';
process.env.APPLE_OIDC_ISSUER ??= 'https://appleid.apple.com';
process.env.GOOGLE_OIDC_ISSUER ??= 'https://accounts.google.com';
process.env.APPLE_AUDIENCE ??= 'com.musaium.mobile.test';
process.env.GOOGLE_AUDIENCE ??= 'phase5-test-audience.apps.googleusercontent.com';
```

(Adjust env var names to match what the adapter actually reads.)

The actual spoof URL is set inside the e2e test via `process.env.APPLE_OIDC_JWKS_URL = spoof.jwksUrl` BEFORE the social-login request. The verifier reads env on each call (or caches it — verify in adapter).

If the verifier caches the JWKS URL at construction time (singleton), the adapter constructor may need a refactor to read env on each call. **If that refactor is needed, defer it: add a `// @TODO Phase 5 follow-up` comment + skip the social-login e2e for now, OR do the small refactor as a Commit B prerequisite.**

Read the adapter at Task B1 to know which path applies.

### Task B4: Write `auth-social-login.e2e.test.ts`

**Files:**
- Create: `museum-backend/tests/e2e/auth-social-login.e2e.test.ts`

- [ ] **Step B4.1: Write the test file**

```bash
cat > /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/e2e/auth-social-login.e2e.test.ts <<'EOF'
import { createE2EHarness, type E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import { startSocialJwtSpoof, type SocialJwtSpoof } from 'tests/helpers/auth/social-jwt-spoof';
import { createHash } from 'node:crypto';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('auth social-login e2e (Apple + Google + F3 nonce)', () => {
  jest.setTimeout(180_000);

  let harness: E2EHarness;
  let spoof: SocialJwtSpoof;

  beforeAll(async () => {
    spoof = await startSocialJwtSpoof();
    process.env.APPLE_OIDC_JWKS_URL = spoof.jwksUrl;
    process.env.GOOGLE_OIDC_JWKS_URL = spoof.jwksUrl;
    process.env.OIDC_NONCE_ENFORCE = 'true';
    harness = await createE2EHarness();
  });

  afterAll(async () => {
    await harness?.stop();
    await spoof?.stop();
  });

  async function fetchNonce(): Promise<string> {
    const res = await harness.request('/api/auth/social-nonce', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const nonce = (res.body as { nonce: string }).nonce;
    expect(nonce.length).toBeGreaterThan(0);
    return nonce;
  }

  function googleClaims(opts: { sub?: string; email?: string; aud?: string; nonce?: string; expSec?: number }): Record<string, unknown> {
    const now = Math.floor(Date.now() / 1000);
    return {
      iss: 'https://accounts.google.com',
      sub: opts.sub ?? `google-test-sub-${Date.now()}`,
      aud: opts.aud ?? process.env.GOOGLE_AUDIENCE,
      email: opts.email ?? `e2e-google-${Date.now()}@example.com`,
      email_verified: true,
      iat: now - 5,
      exp: opts.expSec ?? now + 600,
      nonce: opts.nonce,
    };
  }

  function appleClaims(opts: { sub?: string; email?: string; nonce?: string }): Record<string, unknown> {
    const now = Math.floor(Date.now() / 1000);
    const hashedNonce = opts.nonce
      ? createHash('sha256').update(opts.nonce).digest('hex')
      : undefined;
    return {
      iss: 'https://appleid.apple.com',
      sub: opts.sub ?? `apple-test-sub-${Date.now()}`,
      aud: process.env.APPLE_AUDIENCE,
      email: opts.email ?? `e2e-apple-${Date.now()}@example.com`,
      email_verified: 'true',
      iat: now - 5,
      exp: now + 600,
      nonce: hashedNonce,
    };
  }

  it('Google: valid ID token + nonce → 200 + tokens', async () => {
    const nonce = await fetchNonce();
    const idToken = spoof.signToken(googleClaims({ nonce }));
    const res = await harness.request('/api/auth/social-login', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', idToken, nonce }),
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        user: expect.objectContaining({ email: expect.any(String) }),
      }),
    );
  });

  it('Apple: valid ID token + sha256(nonce) → 200', async () => {
    const nonce = await fetchNonce();
    const idToken = spoof.signToken(appleClaims({ nonce }));
    const res = await harness.request('/api/auth/social-login', {
      method: 'POST',
      body: JSON.stringify({ provider: 'apple', idToken, nonce }),
    });
    expect(res.status).toBe(200);
  });

  it('F3 replay: same nonce twice → 401 INVALID_NONCE', async () => {
    const nonce = await fetchNonce();
    const idToken = spoof.signToken(googleClaims({ nonce }));

    const first = await harness.request('/api/auth/social-login', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', idToken, nonce }),
    });
    expect(first.status).toBe(200);

    const replay = await harness.request('/api/auth/social-login', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', idToken, nonce }),
    });
    expect(replay.status).toBe(401);
  });

  it('wrong audience → 401', async () => {
    const nonce = await fetchNonce();
    const idToken = spoof.signToken(googleClaims({ nonce, aud: 'wrong-audience.example.com' }));
    const res = await harness.request('/api/auth/social-login', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', idToken, nonce }),
    });
    expect(res.status).toBe(401);
  });

  it('expired token → 401', async () => {
    const nonce = await fetchNonce();
    const past = Math.floor(Date.now() / 1000) - 600;
    const idToken = spoof.signToken(googleClaims({ nonce, expSec: past }));
    const res = await harness.request('/api/auth/social-login', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', idToken, nonce }),
    });
    expect(res.status).toBe(401);
  });

  it('Apple: nonce mismatch (claim != sha256(rawNonce)) → 401', async () => {
    const nonce = await fetchNonce();
    const idToken = spoof.signToken(
      appleClaims({ nonce: 'other-nonce-not-the-server-issued-one' }),
    );
    const res = await harness.request('/api/auth/social-login', {
      method: 'POST',
      body: JSON.stringify({ provider: 'apple', idToken, nonce }),
    });
    expect(res.status).toBe(401);
  });

  it('Google: missing nonce claim with OIDC_NONCE_ENFORCE=true → 401', async () => {
    const nonce = await fetchNonce();
    const claims = googleClaims({ nonce });
    delete (claims as Record<string, unknown>).nonce;
    const idToken = spoof.signToken(claims);
    const res = await harness.request('/api/auth/social-login', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', idToken, nonce }),
    });
    expect(res.status).toBe(401);
  });

  it('mobile audience accepted (reproduces f7437490 contract)', async () => {
    const nonce = await fetchNonce();
    const idToken = spoof.signToken(googleClaims({ nonce, aud: process.env.GOOGLE_AUDIENCE }));
    const res = await harness.request('/api/auth/social-login', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', idToken, nonce }),
    });
    expect(res.status).toBe(200);
  });

  it('repeat sub is treated as same user (no duplicate user row)', async () => {
    const nonce1 = await fetchNonce();
    const sub = `google-test-stable-sub-${Date.now()}`;
    const idToken1 = spoof.signToken(googleClaims({ sub, nonce: nonce1 }));
    const r1 = await harness.request('/api/auth/social-login', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', idToken: idToken1, nonce: nonce1 }),
    });
    expect(r1.status).toBe(200);
    const userId1 = (r1.body as { user: { id: number } }).user.id;

    const nonce2 = await fetchNonce();
    const idToken2 = spoof.signToken(googleClaims({ sub, nonce: nonce2 }));
    const r2 = await harness.request('/api/auth/social-login', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', idToken: idToken2, nonce: nonce2 }),
    });
    expect(r2.status).toBe(200);
    expect((r2.body as { user: { id: number } }).user.id).toBe(userId1);
  });
});
EOF
```

- [ ] **Step B4.2: Run the e2e (with Docker up)**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend && RUN_E2E=true pnpm test:e2e -- --testPathPattern='auth-social-login' 2>&1 | tail -30
```

If a test fails because the verifier caches JWKS URL: read the adapter, add an env-var-aware `JwksRpcClient` per-call, OR mark Phase 5 follow-up `// @TODO`. Don't loosen.

### Task B5: Anti-leak commit B

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
git restore --staged .
git add museum-backend/tests/helpers/auth/social-jwt-spoof.ts
git add museum-backend/tests/helpers/e2e/e2e-app-harness.ts
git add museum-backend/tests/e2e/auth-social-login.e2e.test.ts
# If verifier adapter required a small refactor:
git add museum-backend/src/modules/auth/adapters/secondary/social-token-verifier.adapter.ts 2>/dev/null || true

git diff --cached --name-only | sort

git commit -m "$(cat <<'EOF'
test(e2e-auth): social-login e2e with JWT+JWKS spoof + F3 nonce contract (Phase 5 Group B)

Phase 5 Group B — Apple + Google ID-token verification end-to-end.

- tests/helpers/auth/social-jwt-spoof.ts: starts a local HTTP server
  exposing a JWKS endpoint; signs RS256 ID tokens with a generated
  RSA key pair; the harness redirects APPLE/GOOGLE_OIDC_JWKS_URL to
  this spoof.
- tests/e2e/auth-social-login.e2e.test.ts: 9 cases covering:
  Google happy path + Apple happy path (with sha256-hashed nonce) +
  F3 replay 401 + wrong audience 401 + expired 401 + Apple nonce
  mismatch 401 + missing-nonce-when-enforced 401 + mobile audience
  acceptance (reproduces f7437490 contract) + stable-sub user reuse.

The spoof exercises the real verifier path (JWKS fetch + signature
check + claims extraction + F3 nonce binding). No production code
shortcut.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git log --oneline -3
git show --stat HEAD | head -10
```

---

## Commit C — Refresh rate-limit e2e

### Task C1: Write the test

**Files:**
- Create: `museum-backend/tests/e2e/auth-refresh-rate-limit.e2e.test.ts`

- [ ] **Step C1.1: Inspect the F1 limit values**

```bash
grep -A5 "refreshLimiter\|/refresh.*limit" /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/src/modules/auth/adapters/primary/http/auth.route.ts | head -15
grep -A5 "refresh.*window\|F1.*30" /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/src/helpers/middleware/rate-limit.middleware.ts | head -10
```

Confirm: 30 req/min on /refresh per F1 commit `b554333d3`.

- [ ] **Step C1.2: Write the test**

```bash
cat > /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/e2e/auth-refresh-rate-limit.e2e.test.ts <<'EOF'
import { createE2EHarness, type E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import { registerUser } from 'tests/helpers/e2e/e2e-auth.helpers';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

const REFRESH_LIMIT_PER_MIN = 30;

describeE2E('auth /refresh rate-limit e2e (F1 contract)', () => {
  jest.setTimeout(180_000);

  let harness: E2EHarness;

  beforeAll(async () => {
    harness = await createE2EHarness();
  });

  afterAll(async () => {
    await harness?.stop();
  });

  async function loginAndGetTokens(): Promise<{ refreshToken: string; accessToken: string }> {
    const email = `e2e-refresh-rate-${Date.now()}-${Math.random().toString(36).slice(2)}@musaium.test`;
    const password = 'Password123!';
    await registerUser(harness, { email, password });
    const login = await harness.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    const body = login.body as { accessToken: string; refreshToken: string };
    return { accessToken: body.accessToken, refreshToken: body.refreshToken };
  }

  it('30 sequential /refresh succeed; 31st returns 429', async () => {
    const { refreshToken: initial } = await loginAndGetTokens();
    let current = initial;

    for (let i = 0; i < REFRESH_LIMIT_PER_MIN; i += 1) {
      const r = await harness.request('/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: current }),
      });
      expect(r.status).toBe(200);
      current = (r.body as { refreshToken: string }).refreshToken;
    }

    // The 31st should be rate-limited
    const overLimit = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: current }),
    });
    expect(overLimit.status).toBe(429);
  });

  it('rate-limit response carries Retry-After or rate-limit envelope', async () => {
    const { refreshToken: initial } = await loginAndGetTokens();
    let current = initial;

    for (let i = 0; i < REFRESH_LIMIT_PER_MIN; i += 1) {
      const r = await harness.request('/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: current }),
      });
      expect(r.status).toBe(200);
      current = (r.body as { refreshToken: string }).refreshToken;
    }

    const overLimit = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: current }),
    });
    expect(overLimit.status).toBe(429);
    // Either Retry-After header OR a structured body indicating rate-limit
    const hasRetryAfter = overLimit.headers && (overLimit.headers as Record<string, string>)['retry-after'];
    const bodyMentionsRateLimit = JSON.stringify(overLimit.body).match(/rate.?limit|too.?many/i);
    expect(hasRetryAfter || bodyMentionsRateLimit).toBeTruthy();
  });

  it('limit is keyed per-family: a fresh login from a different user is unaffected', async () => {
    const userA = await loginAndGetTokens();
    let aRefresh = userA.refreshToken;

    // Burn user A's quota
    for (let i = 0; i < REFRESH_LIMIT_PER_MIN; i += 1) {
      const r = await harness.request('/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: aRefresh }),
      });
      expect(r.status).toBe(200);
      aRefresh = (r.body as { refreshToken: string }).refreshToken;
    }
    const aOver = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: aRefresh }),
    });
    expect(aOver.status).toBe(429);

    // User B has its own family; should not be limited
    const userB = await loginAndGetTokens();
    const bRefresh = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: userB.refreshToken }),
    });
    expect(bRefresh.status).toBe(200);
  });

  it('429 response body does not leak the refresh token back', async () => {
    const { refreshToken: initial } = await loginAndGetTokens();
    let current = initial;
    for (let i = 0; i < REFRESH_LIMIT_PER_MIN; i += 1) {
      const r = await harness.request('/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: current }),
      });
      expect(r.status).toBe(200);
      current = (r.body as { refreshToken: string }).refreshToken;
    }
    const blocked = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: current }),
    });
    expect(blocked.status).toBe(429);
    expect(JSON.stringify(blocked.body)).not.toContain(current);
  });
});
EOF
```

- [ ] **Step C1.3: Run with Docker up**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend && RUN_E2E=true pnpm test:e2e -- --testPathPattern='auth-refresh-rate-limit' 2>&1 | tail -25
```

Each test logs in fresh + does 30 refreshes. If the rate-limit window is real-time 60s, tests run sequentially and each consumes a fresh user's bucket. Total runtime: 4 tests × ~30 reqs × small latency ≈ ~30–60s.

If a test fails because the limit is something other than 30/min, **read the F1 commit + adjust `REFRESH_LIMIT_PER_MIN`**. Don't loosen the assertion — fix the constant.

If the limit is keyed by IP and all tests come from the same `127.0.0.1`, the second test's quota would already be exhausted from the first. Either:
- Add `RATE_LIMIT_REFRESH=200` env var override in the harness so we can run multiple consecutive bucket exhaustions.
- Run each test in serial with a sleep between.
- Confirm F1's actual key — if it's `IP:familyId`, each fresh login = fresh family = fresh bucket. Tests work.

### Task C2: Anti-leak commit C

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
git restore --staged .
git add museum-backend/tests/e2e/auth-refresh-rate-limit.e2e.test.ts

git diff --cached --name-only | sort

git commit -m "$(cat <<'EOF'
test(e2e-auth): /refresh rate-limit e2e — exact F1 contract (Phase 5 Group C)

Phase 5 Group C — proves the F1 limiter shipped in b554333d3 actually
returns 429 at the boundary.

- tests/e2e/auth-refresh-rate-limit.e2e.test.ts: 4 cases —
  - 30 sequential refresh OK, 31st returns 429
  - 429 response carries Retry-After or structured rate-limit envelope
  - per-family keying: user B unaffected by user A's exhausted bucket
  - 429 body does not leak the refresh token

The TDD red was the F1 unit tests at b554333d3; this commit is the
matching e2e proof against the real Express harness.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git log --oneline -3
```

---

## Commit D — Refresh rotation e2e + CLAUDE.md + sentinel

### Task D1: Inspect the rotation contract

- [ ] **Step D1.1: Read `authSession.service.ts` for the exact replay behaviour**

```bash
grep -A15 "refresh\|rotate\|revoked\|family" /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/src/modules/auth/useCase/authSession.service.ts | head -60
```

Identify:
- Does the service revoke the entire family on replay, or just the replayed token?
- What error code does the route return on replay (401? 403? specific code)?
- Are there DB columns like `revoked_at`, `revoked_reason`, `family_id` to inspect?

### Task D2: Write the test

**Files:**
- Create: `museum-backend/tests/e2e/auth-refresh-rotation.e2e.test.ts`

- [ ] **Step D2.1: Write the test**

```bash
cat > /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/e2e/auth-refresh-rotation.e2e.test.ts <<'EOF'
import { createE2EHarness, type E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import { registerUser } from 'tests/helpers/e2e/e2e-auth.helpers';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('auth refresh-token rotation e2e', () => {
  jest.setTimeout(180_000);

  let harness: E2EHarness;

  beforeAll(async () => {
    harness = await createE2EHarness();
  });

  afterAll(async () => {
    await harness?.stop();
  });

  async function loginAndGetTokens(): Promise<{ refreshToken: string }> {
    const email = `e2e-rotation-${Date.now()}-${Math.random().toString(36).slice(2)}@musaium.test`;
    const password = 'Password123!';
    await registerUser(harness, { email, password });
    const login = await harness.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    return { refreshToken: (login.body as { refreshToken: string }).refreshToken };
  }

  it('refresh rotates: token A → token B; A is revoked', async () => {
    const { refreshToken: a } = await loginAndGetTokens();

    const first = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: a }),
    });
    expect(first.status).toBe(200);
    const b = (first.body as { refreshToken: string }).refreshToken;
    expect(b).not.toBe(a);

    // Reusing A → 401 (replay detection)
    const replay = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: a }),
    });
    expect(replay.status).toBe(401);
  });

  it('replay attack revokes the family: B is invalidated after A is replayed', async () => {
    const { refreshToken: a } = await loginAndGetTokens();

    const first = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: a }),
    });
    expect(first.status).toBe(200);
    const b = (first.body as { refreshToken: string }).refreshToken;

    // Attacker replays A
    const replay = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: a }),
    });
    expect(replay.status).toBe(401);

    // Legit user's B should now also fail (family revoked)
    const usingB = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: b }),
    });
    expect(usingB.status).toBe(401);
  });

  it('chained rotations work: A → B → C → D, only D is valid', async () => {
    const { refreshToken: a } = await loginAndGetTokens();
    let current = a;
    for (let i = 0; i < 3; i += 1) {
      const r = await harness.request('/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: current }),
      });
      expect(r.status).toBe(200);
      const next = (r.body as { refreshToken: string }).refreshToken;
      expect(next).not.toBe(current);
      current = next;
    }
    // current = D; A/B/C all revoked
    const replayA = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: a }),
    });
    expect(replayA.status).toBe(401);
  });

  it('logout invalidates the entire family', async () => {
    const { refreshToken: a } = await loginAndGetTokens();
    const logout = await harness.request('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: a }),
    });
    expect([200, 204]).toContain(logout.status);

    const post = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: a }),
    });
    expect(post.status).toBe(401);
  });

  it('malformed refresh token returns 401, not 500', async () => {
    const r = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: 'not-a-jwt' }),
    });
    expect([401, 400]).toContain(r.status);
  });
});
EOF
```

- [ ] **Step D2.2: Run with Docker up**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend && RUN_E2E=true pnpm test:e2e -- --testPathPattern='auth-refresh-rotation' 2>&1 | tail -25
```

Adjust assertions to match the actual production contract surfaced in Task D1. Don't loosen — fix the constants/expectations.

### Task D3: CLAUDE.md update

- [ ] **Step D3.1: Add Phase 5 subsection**

Read CLAUDE.md to find Phase 4 subsection insertion point (under "## CI" or wherever Phases 2/3/4 live):

```bash
grep -n "Stryker\|Phase 4\|Maestro\|Playwright" /Users/Tim/Desktop/all/dev/Pro/InnovMind/CLAUDE.md | head -10
```

Use `Edit` to add immediately after the Phase 4 subsection:

```markdown
### Auth e2e completeness (Phase 5)

- 4 e2e files in `museum-backend/tests/e2e/auth-*`:
  - `auth-verify-email.e2e.test.ts` — full token consumption leg via TestEmailService interception (7 cases).
  - `auth-social-login.e2e.test.ts` — Apple + Google ID-token verification with local JWT+JWKS spoof, F3 nonce binding contract, replay/expired/wrong-audience paths (9 cases).
  - `auth-refresh-rate-limit.e2e.test.ts` — exact F1 contract: 30 req/min OK, 31st returns 429 (4 cases).
  - `auth-refresh-rotation.e2e.test.ts` — token rotation, replay-attack family revocation, chained rotations, logout invalidates family (5 cases).
- TestEmailService activated by `AUTH_EMAIL_SERVICE_KIND=test` env var. Production env rejects 'test' loud (sentinel in `config/env.ts`).
- Social JWT+JWKS spoof helper at `tests/helpers/auth/social-jwt-spoof.ts` boots a local HTTP JWKS server + signs RS256 ID tokens — exercises the real verifier code path, not a mock.
- See `docs/superpowers/specs/2026-05-01-phase5-auth-e2e-design.md`.
```

### Task D4: Add a sentinel test that production rejects 'test'

**Files:**
- Create: `museum-backend/tests/integration/security/auth-email-service-kind-prod-reject.test.ts`

- [ ] **Step D4.1: Write the test**

```bash
cat > /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/integration/security/auth-email-service-kind-prod-reject.test.ts <<'EOF'
/**
 * Phase 5 sentinel: production env MUST reject AUTH_EMAIL_SERVICE_KIND='test'.
 *
 * The auth composition root has a test-only branch that swaps in
 * TestEmailService when this env var is 'test'. Production must never
 * accept that value or the in-memory email service would silently
 * eat real verification emails.
 */
import { createIntegrationHarness } from 'tests/helpers/integration/integration-harness';

describe('auth: AUTH_EMAIL_SERVICE_KIND=test rejected in production', () => {
  it('env.ts validation throws when NODE_ENV=production AND AUTH_EMAIL_SERVICE_KIND=test', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalKind = process.env.AUTH_EMAIL_SERVICE_KIND;

    process.env.NODE_ENV = 'production';
    process.env.AUTH_EMAIL_SERVICE_KIND = 'test';

    let threwExpected = false;
    try {
      // Re-import env.ts to trigger validation. Use jest.isolateModules to bypass cache.
      jest.isolateModules(() => {
        require('@src/config/env');
      });
    } catch (err) {
      threwExpected = (err as Error).message.toLowerCase().includes('test') &&
        (err as Error).message.toLowerCase().includes('production');
    }

    process.env.NODE_ENV = originalNodeEnv;
    if (originalKind === undefined) {
      delete process.env.AUTH_EMAIL_SERVICE_KIND;
    } else {
      process.env.AUTH_EMAIL_SERVICE_KIND = originalKind;
    }

    expect(threwExpected).toBe(true);
  });

  it('createIntegrationHarness boots fine with default kind', async () => {
    // Smoke that the integration harness does not regress under default env.
    const harness = await createIntegrationHarness();
    harness.scheduleStop();
    const result = await harness.dataSource.query('SELECT 1 as ok');
    expect(result).toEqual([{ ok: 1 }]);
  });
});
EOF
```

- [ ] **Step D4.2: Run the sentinel**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend && pnpm test:integration -- --testPathPattern='auth-email-service-kind-prod-reject' 2>&1 | tail -10
```

Expected: 2 tests pass.

If the production-rejection assertion fails (e.g., env.ts doesn't throw): the Task A1.3 sentinel addition was incomplete; fix env.ts to actually throw on the bad combo.

### Task D5: Anti-leak commit D

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
git restore --staged .
git add museum-backend/tests/e2e/auth-refresh-rotation.e2e.test.ts
git add museum-backend/tests/integration/security/auth-email-service-kind-prod-reject.test.ts
git add CLAUDE.md
# If env.ts validation needed strengthening:
git add museum-backend/src/config/env.ts 2>/dev/null || true

git diff --cached --name-only | sort

git commit -m "$(cat <<'EOF'
test(e2e-auth): refresh rotation + prod-reject sentinel + Phase 5 docs (Phase 5 Group D)

Phase 5 Group D — closes Phase 5.

- tests/e2e/auth-refresh-rotation.e2e.test.ts: 5 cases — A→B
  rotation, replay-attack family revocation, chained A→B→C→D
  rotations, logout family invalidation, malformed token 401-not-500.
- tests/integration/security/auth-email-service-kind-prod-reject.test.ts:
  sentinel asserts that env.ts rejects NODE_ENV=production +
  AUTH_EMAIL_SERVICE_KIND=test combination loud. Banking-grade
  defence-in-depth against the test-only branch ever firing in prod.
- CLAUDE.md: Phase 5 subsection documenting the 4 e2e files and
  the test email service env-var.

Phase 5 closes. Phase 6 (chaos resilience) is the next milestone.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git log --oneline -5
git show --stat HEAD | head -10
```

---

## Phase 5 Final Verification

- [ ] **Step F.1: All 4 commits landed**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind && git log --oneline -6
```

Expected (most recent first): D, C, B, A.

- [ ] **Step F.2: All e2e files present**

```bash
ls museum-backend/tests/e2e/auth-*.e2e.test.ts
```

Expected: `auth-refresh-rate-limit.e2e.test.ts`, `auth-refresh-rotation.e2e.test.ts`, `auth-social-login.e2e.test.ts`, `auth-verify-email.e2e.test.ts`.

- [ ] **Step F.3: Sentinel green**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend && pnpm test:integration -- --testPathPattern='auth-email-service-kind-prod-reject' 2>&1 | tail -5
```

- [ ] **Step F.4: Mark Phase 5 done**

Update tasks #37–#40 to completed.

---

## Out-of-Scope (Phase 6+)

- Chaos resilience tests (Redis down, PG read replica down, LLM provider down) — Phase 6.
- Mutation testing of the new e2e helpers — N/A (helpers tested via the e2e suite itself).
- FE auth migration (Phase 7).
- Coverage uplift (Phase 8).
- Notification on social-login replay surge (production telemetry, separate spec).
