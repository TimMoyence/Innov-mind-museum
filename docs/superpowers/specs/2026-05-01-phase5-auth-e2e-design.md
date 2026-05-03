# Phase 5 — Auth E2E Completeness (Design Spec)

- **Status**: Proposed (2026-05-01)
- **Owner**: QA/SDET
- **Scope**: museum-backend `tests/e2e/` + `tests/helpers/auth/`
- **Pre-req for**: nothing (independent of Phases 6–8)
- **Estimated effort**: 1 working week
- **Spec lineage**: Phase 0 spec §5 (auth e2e gaps) + F1 rate-limit (`b554333d3`) + F3 nonce binding (`76e860d4`)

## 1. Problem Statement

`tests/e2e/auth.e2e.test.ts` covers register + login only. Production-shipped auth features lack e2e proof of behaviour:

| Feature | Status | E2E coverage |
|---|---|---|
| Email verification | shipped (`/api/auth/verify-email`) | NONE — token consumption never exercised end-to-end |
| Social login (Apple + Google) | shipped + F3 nonce binding | unit-tested only — verifier mocked, JWKS path unexercised |
| Refresh-token rate limit (F1) | shipped (`b554333d3`) | unit-tested only — limiter behaviour unverified against real Express middleware chain |
| Refresh-token rotation | shipped | unit-tested only — replay-attack contract unverified |

Phase 5 adds e2e tests for each gap, exercising the real Express harness, real Postgres, real verifier code paths.

## 2. Goals

1. **Verify-email e2e** — register → capture raw verification token via test-email-service interception → POST `/api/auth/verify-email` → assert DB `email_verified = true`.
2. **Social-login e2e** — local JWT + JWKS spoof for Apple + Google → assert successful login + nonce binding contract (F3) + replay-old-nonce returns 401.
3. **Refresh rate-limit e2e** — blast 31 reqs/min on `/api/auth/refresh` → assert 31st returns 429 (per F1 contract).
4. **Refresh rotation e2e** — refresh once, attempt replay of old refresh token, assert 401 + family invalidation.
5. Each gap = its own `tests/e2e/auth-<gap>.e2e.test.ts` file (Q1=B).
6. New helpers: `tests/helpers/auth/test-email-service.ts` + `tests/helpers/auth/social-jwt-spoof.ts`.

## 3. Non-Goals

- New auth routes or use-cases (Phase 5 only adds tests).
- Mutation testing of auth files (Phase 4 already covers `authSession.service.ts` + `refresh-token.repository.pg.ts`).
- Mobile RN auth e2e (Phase 2 Maestro covers auth-flow.yaml + auth-persistence.yaml).
- Web admin auth e2e (Phase 3 covers it).

## 4. Architecture

### 4.1 Test email service interception

**File:** `museum-backend/tests/helpers/auth/test-email-service.ts`

The production `BrevoEmailService` sends real emails via Brevo API. For e2e, a test-only `TestEmailService` (implements the same `EmailService` port) records every email sent in an in-memory store. Tests retrieve the captured token after registration.

```ts
import type { EmailService } from '@shared/email/email-service.port';

export interface CapturedEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  sentAt: Date;
}

export class TestEmailService implements EmailService {
  private readonly emails: CapturedEmail[] = [];

  async send(input: { to: string; subject: string; html: string; text?: string }): Promise<void> {
    this.emails.push({ to: input.to, subject: input.subject, html: input.html, text: input.text ?? '', sentAt: new Date() });
  }

  /** Find the most recent email sent to `email` whose body contains a verification token. */
  findVerificationTokenFor(email: string): string | null {
    const sent = [...this.emails].reverse().find((e) => e.to === email);
    if (!sent) return null;
    // The verify-email URL embeds the raw token as `?token=<raw>` per the existing template.
    const match = sent.html.match(/[?&]token=([A-Za-z0-9_\-]+)/);
    return match ? match[1] : null;
  }

  reset(): void {
    this.emails.length = 0;
  }
}
```

The harness needs a way to inject this service. The existing `createE2EHarness()` already supports overrides for `chatService` / `healthCheck`. **Phase 5 extends the harness to accept an `emailService` override.** Default behaviour unchanged (no override → production Brevo or whatever `env.brevoApiKey` configures).

`tests/helpers/e2e/e2e-app-harness.ts` change: add an `emailService` field to the override options and pass it into `createApp()`. Each module composition root (auth + chat etc.) reads `app.locals.emailService` if present, falls back to `BrevoEmailService` otherwise.

**This is a non-trivial refactor.** Two implementation paths:

- **Path A — composition-root override:** modify `museum-backend/src/modules/auth/useCase/index.ts` to accept an injected `emailService` instead of constructing `BrevoEmailService` at module load. Touch `RegisterUseCase`, `ForgotPasswordUseCase`, `ChangeEmailUseCase` constructors.

- **Path B — env-var-only swap:** introduce a new env var `AUTH_EMAIL_SERVICE_KIND=test|brevo|noop` that the composition root reads at init time. `test` returns the in-memory `TestEmailService` instance. The instance is stored on `app.locals` so test code can retrieve it.

**Decision: Path B** (less invasive, no module refactor, fits the existing `env.brevoApiKey` boolean-driven branch). Path A is a Phase 6+ refactor if needed.

### 4.2 Social JWT + JWKS spoof

**File:** `museum-backend/tests/helpers/auth/social-jwt-spoof.ts`

Production `SocialTokenVerifierAdapter` calls Apple's and Google's JWKS endpoints to fetch signing keys. For e2e, we:
1. Generate an RSA-256 key pair locally.
2. Stand up a tiny HTTP server that exposes a `/keys` endpoint matching the JWKS shape.
3. Override the `APPLE_JWKS_URL` and `GOOGLE_JWKS_URL` env vars in the harness to point at the local server.
4. Sign test ID tokens with the private key + the matching `kid` header.

```ts
import { generateKeyPairSync, createSign } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface SocialJwtSpoofServer {
  url: string;
  signToken: (claims: Record<string, unknown>) => string;
  stop: () => Promise<void>;
}

export async function startSocialJwtSpoof(): Promise<SocialJwtSpoofServer> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = 'phase5-test-kid';

  // Convert the public key to JWK format (n + e in base64url)
  const jwk = publicKey.export({ format: 'jwk' });
  const jwks = { keys: [{ ...jwk, kid, use: 'sig', alg: 'RS256' }] };

  const server = createServer((req, res) => {
    if (req.url === '/keys' || req.url === '/jwks.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(jwks));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;

  function signToken(claims: Record<string, unknown>): string {
    // ... [JWT signing logic — header { alg: RS256, kid }, payload, RSA-PKCS1-v1_5 sig]
  }

  return {
    url,
    signToken,
    stop: () => new Promise((r) => server.close(() => r())),
  };
}
```

The harness override sets:
- `APPLE_OIDC_JWKS_URL=<spoof_url>/keys`
- `GOOGLE_OIDC_JWKS_URL=<spoof_url>/keys`
- `APPLE_AUDIENCE=<test_aud>` etc. so the verifier's audience-check passes.

**Caveat:** the production verifier may have hard-coded provider issuer URLs (`https://appleid.apple.com`). If so, the verifier's `iss` claim check would fail against our test issuer. The harness sets test `iss` claims to whatever the verifier expects, OR we expose `APPLE_OIDC_ISSUER` / `GOOGLE_OIDC_ISSUER` env vars (likely already present per OIDC convention).

Read `museum-backend/src/modules/auth/adapters/secondary/social-token-verifier.adapter.ts` at plan time to confirm what env-knobs already exist; the spoof config aligns with them.

### 4.3 Test file map

```
museum-backend/tests/e2e/
├── auth.e2e.test.ts                      (existing — register + login, unchanged)
├── auth-verify-email.e2e.test.ts         (Phase 5 Commit A)
├── auth-social-login.e2e.test.ts         (Phase 5 Commit B)
├── auth-refresh-rate-limit.e2e.test.ts   (Phase 5 Commit C)
└── auth-refresh-rotation.e2e.test.ts     (Phase 5 Commit D)

museum-backend/tests/helpers/auth/
├── test-email-service.ts                  (Phase 5 Commit A)
└── social-jwt-spoof.ts                    (Phase 5 Commit B)

museum-backend/tests/helpers/e2e/
└── e2e-app-harness.ts                     (modified — add emailService override)
```

### 4.4 Acceptance contracts per file

#### `auth-verify-email.e2e.test.ts`
1. Register a new user → `email_verified=false` in DB.
2. Test email service captured an email to that address with a `?token=<raw>` URL parameter.
3. POST `/api/auth/verify-email` with `{ token: <raw> }` → 200 `{ verified: true }`.
4. DB `email_verified=true`.
5. Replay (same token) → 400 `INVALID_OR_EXPIRED_TOKEN`.
6. Tampered token → 400.
7. Whitespace tolerance: `'  <token>  '` accepted (matches `verifyEmailUseCase.execute()`'s `trim()`).

#### `auth-social-login.e2e.test.ts`
1. Spoof server boots; Apple and Google JWKS endpoints expose the same key.
2. Sign a Google ID token with valid `sub`, `email`, `email_verified`, `iss`, `aud`, `exp`, `nonce`.
3. POST `/api/auth/social-nonce` to obtain a server nonce.
4. POST `/api/auth/social-login` with `{ provider: 'google', idToken, nonce }` → 200 + tokens.
5. Replay same `idToken + nonce` → 401 `INVALID_NONCE` (nonce single-use per F3).
6. Apple variant: nonce hashed (SHA-256) inside the ID token claim; verifier accepts if `claim === sha256(rawNonce)`.
7. Wrong audience → 401 / 4xx.
8. Expired token (`exp < now`) → 401.
9. Reproduces the f7437490 Google iOS bridge contract: ID token from a "mobile" client (audience matches mobile aud) should still be accepted by the backend.

#### `auth-refresh-rate-limit.e2e.test.ts`
1. Register + login → obtain refreshToken.
2. Issue 30 sequential requests to `/api/auth/refresh` with the rotating tokens → all 200 (the F1 limit is 30/min).
3. The 31st request → 429 with the rate-limit response shape.
4. Wait the bucket TTL (or use a fast-forward env-var if available) → next request succeeds.

The test is timing-sensitive. Stryker mutation testing on the limiter (via Phase 4 hot-files registry) caught the `<` vs `<=` boundary; this e2e proves the contract end-to-end.

To avoid wall-clock TTL (60s), the harness can set `RATE_LIMIT_WINDOW_MS=2000` for the test process. If the limiter's bucket store is in-memory + reset-on-process-restart, the test exits cleanly. If it's Redis-backed, the test resets the Redis DB at suite end.

#### `auth-refresh-rotation.e2e.test.ts`
1. Login → refresh token A.
2. POST `/api/auth/refresh` with token A → 200 + new tokens (B).
3. POST `/api/auth/refresh` with token A again (replay) → 401 + family revoked.
4. POST `/api/auth/refresh` with token B → 401 (because the family is revoked after the replay attack).
5. Verify DB row `revoked_reason='replay_detected'` (or similar — match the actual production semantics).

### 4.5 Harness modifications (Path B for Q2=iii)

**File:** `museum-backend/tests/helpers/e2e/e2e-app-harness.ts`

Two extension points:
1. Set `process.env.AUTH_EMAIL_SERVICE_KIND='test'` BEFORE the dynamic import of `data-source` and `app`. The auth module composition root reads this env var.
2. Add an `emailService: TestEmailService | undefined` field to the harness object. After `createApp()`, the harness reaches into the auth module's exported singleton and exposes the test instance.

Concretely:

```ts
// In createE2EHarness():
process.env.AUTH_EMAIL_SERVICE_KIND ??= 'test';
// ... existing env setup ...

// After dynamic import:
const auth = await import('@modules/auth');
harness.testEmailService = auth.testEmailServiceInstance ?? null;
```

The auth composition root is updated to:

```ts
// museum-backend/src/modules/auth/useCase/index.ts
import { TestEmailService } from 'tests/helpers/auth/test-email-service';

const emailService: EmailService | undefined =
  env.authEmailServiceKind === 'test'
    ? new TestEmailService()
    : env.brevoApiKey
      ? new BrevoEmailService(env.brevoApiKey)
      : undefined;

export const testEmailServiceInstance = emailService instanceof TestEmailService ? emailService : null;
```

This branch only fires in test mode; production behaviour is unchanged.

`env.authEmailServiceKind` is added to `museum-backend/src/config/env.ts` as a new optional env var with values `'test' | 'brevo' | 'noop'` (default `'brevo'` if `brevoApiKey` is set, else `'noop'`).

**Caveat:** importing test code from production modules is a violation of the existing module boundaries. Instead, expose the `TestEmailService` class via a separate `museum-backend/src/shared/email/test-email-service.ts` file marked as test-only via JSDoc + ESLint rule. The auth composition root reads from `@shared/email/test-email-service` only when `env.authEmailServiceKind === 'test'` — at runtime, the test env var triggers the import but production code never loads it (still in the bundle, but inert).

This is a small concession to test ergonomics. The alternative — Path A composition-root injection — is cleaner but expands the diff significantly.

## 5. Risks & Mitigations

### Risk: Test-only branch in production composition root pollutes the prod codebase

The `env.authEmailServiceKind === 'test'` branch is a runtime concession.

**Mitigation:** the env var is only read in test process; production env never sets it. A sentinel in `tests/integration/security/...` could assert that production env (`NODE_ENV=production` config) rejects the `test` value loudly. Phase 5 adds this sentinel.

### Risk: Spoofed JWT signature path differs from production

If the production verifier uses a different signature algo (ES256 vs RS256) or different claims, the spoof won't match.

**Mitigation:** read the actual verifier code in the plan. Use the same algo + claim shape. If Apple uses ES256 and Google uses RS256, the spoof exposes both kid+alg in JWKS.

### Risk: F1 rate-limit test is flaky on slow runners

Wall-clock-sensitive.

**Mitigation:** set `RATE_LIMIT_WINDOW_MS=2000` in the harness. Use deterministic time via injection if available; otherwise tolerate a 100ms margin in assertions.

### Risk: Refresh rotation family invalidation logic differs from spec assumption

The exact behaviour after replay (revoke family vs revoke single token) needs verification.

**Mitigation:** read `authSession.service.ts` at plan time and align the test to the actual contract. If the service revokes only the replayed token (not the family), the spec is wrong; update the spec to match production reality.

### Risk: Concurrent parallel-session interference (still ongoing)

Same anti-leak protocol as Phases 0-4.

**Mitigation:** every commit goes through `git restore --staged .` + scoped `git add`.

## 6. Acceptance Criteria

Phase 5 is **done** when ALL hold:

- [ ] `museum-backend/tests/helpers/auth/test-email-service.ts` exists and implements the `EmailService` port.
- [ ] `museum-backend/src/shared/email/test-email-service.ts` (or similar location) re-exports the `TestEmailService` class so production composition roots can conditionally instantiate it without importing from `tests/`.
- [ ] `museum-backend/src/modules/auth/useCase/index.ts` reads `env.authEmailServiceKind` and instantiates `TestEmailService` when `'test'`.
- [ ] `museum-backend/src/config/env.ts` adds the new env var with documented values.
- [ ] `museum-backend/tests/helpers/e2e/e2e-app-harness.ts` extended with `testEmailService` field + sets `AUTH_EMAIL_SERVICE_KIND='test'`.
- [ ] `museum-backend/tests/helpers/auth/social-jwt-spoof.ts` exports `startSocialJwtSpoof()` returning a server with `signToken()` + `stop()`.
- [ ] `museum-backend/tests/e2e/auth-verify-email.e2e.test.ts` covers 7 cases per §4.4.
- [ ] `museum-backend/tests/e2e/auth-social-login.e2e.test.ts` covers 9 cases per §4.4.
- [ ] `museum-backend/tests/e2e/auth-refresh-rate-limit.e2e.test.ts` covers 4 cases per §4.4.
- [ ] `museum-backend/tests/e2e/auth-refresh-rotation.e2e.test.ts` covers 5 cases per §4.4.
- [ ] All 4 e2e files pass when `RUN_E2E=true pnpm test:e2e` runs locally with Docker up.
- [ ] CLAUDE.md "Phase 5 — auth e2e" subsection added.
- [ ] Phase 5 lands as 4 commits.

## 7. Phase 5 Commit Decomposition

1. **Commit A** — verify-email harness pieces (TestEmailService + env-var branch + harness extension) + `auth-verify-email.e2e.test.ts`.
2. **Commit B** — social JWT spoof + `auth-social-login.e2e.test.ts`.
3. **Commit C** — `auth-refresh-rate-limit.e2e.test.ts` (no harness changes — F1 already wired).
4. **Commit D** — `auth-refresh-rotation.e2e.test.ts` + CLAUDE.md update + sentinel that production rejects `AUTH_EMAIL_SERVICE_KIND=test`.

## 8. Resolved decisions (2026-05-01)

- **Q1 = B** (4 split files).
- **Q2 = iii** (test helper per use-case for verify-email; implemented as `TestEmailService` interception via env-var branch in the auth composition root).
- **Q3 = x** (local JWT + JWKS spoof for Apple + Google).
- **Q4 = β** (exact F1 contract — 31 reqs → 429).
- **Q5 = a** (4 commits, 1 per gap).

No remaining open questions. Ready for plan generation.
