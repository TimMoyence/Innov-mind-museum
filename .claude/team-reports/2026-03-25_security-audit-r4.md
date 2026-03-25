# Security Audit R4 -- Musaium (Enterprise-Grade)

**Date:** 2026-03-25
**Agent:** Security Analyst
**Scope:** Full READ-ONLY audit -- backend (`museum-backend/`) + frontend (`museum-frontend/`)
**Standard:** OWASP Top 10 (2021) + OWASP LLM Top 10

---

## Executive Summary

Musaium exhibits a **mature security posture** for a startup-stage product. The codebase demonstrates deliberate security engineering: layered authentication with refresh token rotation and family-based reuse detection, proper bcrypt hashing, HMAC-based API key validation with timing-safe comparison, comprehensive audit logging, and a multi-layer LLM guardrail pipeline. The main areas for improvement are around the login route missing its IP-based rate limiter, password policy lacking special character requirement, and the keyword-based guardrail being inherently bypassable by a determined attacker.

**Global Security Score: 3.8 / 5**

---

## Domain 1: Authentication & Authorization (OWASP A01, A07)

**Maturity: 4/5**

### Findings

#### [MEDIUM] SEC-R4-01 -- Login route has no IP-based rate limiter

- **File:** `museum-backend/src/modules/auth/adapters/primary/http/auth.route.ts:68`
- **Detail:** The `/login` route does NOT use `createRateLimitMiddleware`. It relies solely on the in-memory per-email `login-rate-limiter.ts` (10 attempts / 10 min per email). An attacker can brute-force login against many email addresses from a single IP without hitting any rate limit. Compare with `/register` (line 45) and `/forgot-password` (line 274) which both have IP-based limiters.
- **OWASP:** A07 -- Identification and Authentication Failures
- **Impact:** Credential stuffing attacks across multiple accounts.
- **Recommendation:** Add `registerLimiter` (or a dedicated login limiter) to the `/login` route handler.

#### [LOW] SEC-R4-02 -- Password policy missing special character requirement

- **File:** `museum-backend/src/shared/validation/password.ts:18-44`
- **Detail:** Policy requires 8-128 chars, uppercase, lowercase, digit -- but no special character. NIST SP 800-63B no longer mandates special characters but recommends checking against breach databases (e.g., HaveIBeenPwned).
- **OWASP:** A07
- **Recommendation:** Consider adding breached-password check (HIBP k-anonymity API) rather than complexity rules.

#### [INFO] SEC-R4-03 -- JWT implementation is solid

- **File:** `museum-backend/src/modules/auth/core/useCase/authSession.service.ts`
- **Detail:**
  - Separate access (`15m` default) and refresh (`30d`) token secrets enforced in production (lines 199-207 of `env.ts`).
  - Refresh token rotation with SHA-256 hash storage, family-based reuse detection, and full family revocation on reuse (lines 263-281).
  - `jti` (JWT ID) on both access and refresh tokens -- enables per-token revocation.
  - `type` claim distinguishes access from refresh tokens (cross-type confusion impossible).
  - Bcrypt with 12 rounds for password hashing (`BCRYPT_ROUNDS = 12`).
  - Change password revokes all refresh tokens for the user (line 47 of `changePassword.useCase.ts`).

#### [INFO] SEC-R4-04 -- Social login properly implemented

- **File:** `museum-backend/src/modules/auth/adapters/secondary/social-token-verifier.ts`
- **Detail:**
  - Apple: RS256 verification against Apple JWKS (`https://appleid.apple.com/auth/keys`), correct issuer/audience validation.
  - Google: RS256 verification against Google JWKS, multiple issuers accepted, audience validated against configured client IDs.
  - JWKS cached for 1 hour with cache-invalidate-and-retry on key miss.
  - Apple private-relay emails excluded from account linking (line 70-72 of `socialLogin.useCase.ts`).
  - Account linking only for verified emails (line 74).

#### [INFO] SEC-R4-05 -- RBAC properly enforced

- **File:** `museum-backend/src/helpers/middleware/require-role.middleware.ts`
- **Detail:** Admin routes use `isAuthenticated + requireRole('admin')` or `requireRole('admin', 'moderator')`. API key management endpoints use `isAuthenticatedJwtOnly` (prevents API-key-based access to sensitive endpoints). Museum write operations are admin-only. Support ticket listing scoped to user or admin/moderator.

#### [INFO] SEC-R4-06 -- API key authentication is well-designed

- **File:** `museum-backend/src/helpers/middleware/apiKey.middleware.ts`
- **Detail:** HMAC-SHA256 with per-key salt, timing-safe comparison (`crypto.timingSafeEqual`), prefix-based lookup (no brute force on the full key), expiration checking, active status checking, per-user key limit (5), plaintext shown only once at creation.

---

## Domain 2: Input Validation & Injection (OWASP A03)

**Maturity: 4/5**

### Findings

#### [LOW] SEC-R4-07 -- No Zod schema validation on auth routes

- **File:** `museum-backend/src/modules/auth/adapters/primary/http/auth.route.ts`
- **Detail:** Auth routes use manual destructuring (`const { email, password } = req.body`) without schema validation. The chat routes use `parseCreateSessionRequest()`, `parsePostMessageRequest()`, etc. (manual but structured). Auth routes rely on use-case-level validation (email format, password strength) which is functionally sufficient but less consistent.
- **OWASP:** A03 -- Injection
- **Recommendation:** Low priority -- use-case validation catches invalid inputs. Consider adding Zod schemas for consistency.

#### [INFO] SEC-R4-08 -- SQL injection properly prevented

- **File:** `museum-backend/src/modules/auth/adapters/secondary/user.repository.pg.ts`
- **Detail:** All queries use parameterized placeholders (`$1`, `$2`...) via `pool.query(query, values)`. No string concatenation of user input into SQL. TypeORM repositories (chat module) also use parameterized queries. The raw SQL pool (`data/db/`) uses the same pattern.

#### [INFO] SEC-R4-09 -- Input sanitization for LLM pipeline is present

- **File:** `museum-backend/src/shared/validation/input.ts:14-21`
- **Detail:** `sanitizePromptInput()` applies NFC normalization, strips zero-width characters (U+200B-200D, FEFF, 2060, 00AD), removes control chars, trims, and truncates to 200 chars. Applied to `location` field and visit context fields before prompt inclusion. Name fields validated with Unicode letter pattern.

#### [INFO] SEC-R4-10 -- User text is HTML-escaped in LLM messages

- **File:** `museum-backend/src/modules/chat/adapters/secondary/langchain.orchestrator.ts:287`
- **Detail:** User text has `<` and `>` replaced with fullwidth equivalents before injection into `<user_message>` tags. This prevents XML/HTML injection in the prompt structure.

---

## Domain 3: Prompt Injection & LLM Security (OWASP LLM01-LLM10)

**Maturity: 3/5**

### Findings

#### [HIGH] SEC-R4-11 -- Keyword-based guardrail is bypassable

- **File:** `museum-backend/src/modules/chat/application/art-topic-guardrail.ts`
- **Detail:** The input guardrail uses exact keyword matching after normalization. Bypass vectors:
  1. **Homoglyph substitution:** "ignnore prevvious" (doubled letters), Cyrillic "a" instead of Latin "a".
  2. **Base64/encoding:** "aWdub3JlIHByZXZpb3Vz" (base64 of "ignore previous").
  3. **Unicode tricks:** Using combining characters, direction override characters (RLO), or mathematical alphanumeric symbols.
  4. **Semantic rewriting:** "Forget what you were told earlier" or "Start fresh -- new role."
  5. **Multi-language evasion:** Injection phrases in languages not covered (Arabic, Korean, Hindi, etc.).
  6. **Payload splitting:** Across multiple messages that individually pass guardrail.
- **OWASP LLM:** LLM01 -- Prompt Injection
- **Recommendation:** The guardrail is a good first layer. Consider adding an LLM-based classifier as a second layer for critical deployments. Document the known limitations.

#### [MEDIUM] SEC-R4-12 -- OCR text injection vector (partially mitigated)

- **File:** `museum-backend/src/modules/chat/application/chat-message.service.ts:186-203`
- **Detail:** OCR guard runs the extracted text through `evaluateUserInputGuardrail`. However: (a) the OCR guard is behind a feature flag (`ocrGuard`) defaulting to `false`, so it's disabled by default; (b) if OCR extraction fails, the system **fail-opens** (line 196-199), meaning a malformed image could bypass OCR analysis while still being analyzed by the LLM. When disabled, an attacker can embed prompt injection text in an image.
- **OWASP LLM:** LLM01
- **Recommendation:** Enable `ocrGuard` by default. Consider fail-closed for OCR errors.

#### [LOW] SEC-R4-13 -- Output guardrail may block legitimate responses

- **File:** `museum-backend/src/modules/chat/application/art-topic-guardrail.ts:357-392`
- **Detail:** The output guardrail checks for insults, injection keywords, external actions, and off-topic signals in the LLM output. If no art keyword is found AND no art context in history, it blocks with "off_topic". This could produce false positives for legitimate edge-case responses, but the design is correct -- fail-closed is the right strategy for output filtering.

#### [INFO] SEC-R4-14 -- System/user message isolation is properly implemented

- **File:** `museum-backend/src/modules/chat/adapters/secondary/langchain.orchestrator.ts:337-364`
- **Detail:** Message ordering: `[SystemMessage(system), SystemMessage(section), optional(memory/redirect), ...history, HumanMessage(user), SystemMessage(anti-injection reminder)]`. The anti-injection reminder at the end reinforces system instructions. The `[END OF SYSTEM INSTRUCTIONS]` boundary marker separates system from user content. User text wrapped in `<user_message>` tags with angle-bracket escaping.

---

## Domain 4: Data Protection & Privacy (OWASP A02)

**Maturity: 4/5**

### Findings

#### [MEDIUM] SEC-R4-15 -- Verification token logged in dev mode

- **File:** `museum-backend/src/modules/auth/core/useCase/register.useCase.ts:77`
- **Detail:** When no email service is configured: `logger.info('verification_token_generated', { userId: user.id, token })`. The verification token is logged. In dev this is acceptable, but if the logger is misconfigured in a staging environment, tokens would appear in logs.
- **File:** `museum-backend/src/modules/auth/core/useCase/forgotPassword.useCase.ts:47`
- **Detail:** Same pattern: `logger.info('forgot_password_token', { email, token })` logs the password reset token.
- **OWASP:** A02 -- Cryptographic Failures
- **Recommendation:** Guard these log statements with `if (env.nodeEnv === 'development')` explicitly.

#### [LOW] SEC-R4-16 -- Debug reset token returned in dev response

- **File:** `museum-backend/src/modules/auth/adapters/primary/http/auth.route.ts:293`
- **Detail:** `...(env.nodeEnv === 'development' ? { debugResetToken: token } : {})` -- correctly guarded by nodeEnv check. This is safe as long as NODE_ENV is never misconfigured in production. The `env.ts` already enforces `required('JWT_ACCESS_SECRET')` in prod, so misconfiguration would crash at startup.

#### [INFO] SEC-R4-17 -- GDPR compliance is well-implemented

- **Detail:**
  - **Data export:** `GET /api/auth/export-data` returns all user data + chat data (lines 212-246 of auth.route.ts).
  - **Account deletion:** `DELETE /api/auth/account` performs full cascading deletion: chat sessions (CASCADE to messages, artwork matches, reports), user (CASCADE to refresh tokens, social accounts), plus image cleanup via S3/local storage (deleteAccount.useCase.ts).
  - **Audit trail:** All security-relevant actions are audit-logged (register, login, social login, password changes, deletions, etc.).
  - Both operations require authentication.

#### [INFO] SEC-R4-18 -- Token storage on frontend uses SecureStore

- **File:** `museum-frontend/features/auth/infrastructure/authTokenStore.ts`
- **Detail:** Access token is memory-only (never persisted). Refresh token uses `expo-secure-store` on native platforms (iOS Keychain / Android Keystore). Falls back to AsyncStorage on web (less secure, but web is not the primary target). This is the correct pattern for mobile apps.

#### [INFO] SEC-R4-19 -- Sentry does not send PII

- **File:** `museum-backend/src/shared/observability/sentry.ts`
- **Detail:** Sentry `setUser` only sends `{ id: String(user.id) }` -- no email, name, or IP. Error handler sends `requestId`, `method`, `path`, `statusCode` -- no PII. Error messages for 5xx are generic "Internal server error" to clients.

---

## Domain 5: API Security (OWASP A04, A05)

**Maturity: 4/5**

### Findings

#### [MEDIUM] SEC-R4-20 -- Login route is the only high-value endpoint without IP rate limiter

- **File:** `museum-backend/src/app.ts:74-80`
- **Detail:** Global IP rate limiter is 120 requests per 60 seconds (default). `/register` has a specific 5/10min IP limiter. `/forgot-password` has 5/5min. `/login` has per-email limiter only. The global rate limiter provides some protection but 120 req/min is generous for login attempts.
- **OWASP:** A04 -- Insecure Design
- **See also:** SEC-R4-01

#### [INFO] SEC-R4-21 -- Security headers properly configured

- **File:** `museum-backend/src/app.ts:82-86`
- **Detail:**
  - **Helmet** enabled with CSP in production (`contentSecurityPolicy: isProd ? undefined : false`).
  - **CORS** origins required in production (`required('CORS_ORIGINS')` in env.ts:335).
  - **Cache-Control:** `no-store` on all dynamic API responses (line 104-107).
  - **Compression** disabled for SSE streams.
  - **Request timeout** enforced (default 20s).
  - **JSON body limit** enforced (default 1MB).
  - **trust proxy** configurable.

#### [INFO] SEC-R4-22 -- Error responses don't leak internals

- **File:** `museum-backend/src/helpers/middleware/error.middleware.ts`
- **Detail:** Unknown errors return `{ code: 'INTERNAL_ERROR', message: 'Internal server error' }` with no stack trace. Known `AppError`s return their code/message. 5xx errors are logged server-side and sent to Sentry.

#### [INFO] SEC-R4-23 -- Health endpoint doesn't leak sensitive info

- **File:** `museum-backend/src/shared/routers/api.router.ts:92-109`
- **Detail:** Returns `status`, `database: up/down`, `llmConfigured: boolean`, `environment`, `version`, `timestamp`. Version is the app version (not dependency versions). No internal IPs, secrets, or config details.

#### [INFO] SEC-R4-24 -- Image URLs are HMAC-signed with timing-safe verification

- **File:** `museum-backend/src/modules/chat/adapters/primary/http/chat.image-url.ts`
- **Detail:** Image read URLs use HMAC-SHA256 signing with configurable TTL (default 900s). Verification uses `crypto.timingSafeEqual`. The image endpoint (`GET /messages/:messageId/image`) does not require JWT auth -- it relies on the signed URL, which is the correct pattern for CDN-compatible image serving.

---

## Domain 6: Dependency Security

**Maturity: 3/5**

### Findings

#### [MEDIUM] SEC-R4-25 -- Backend: langsmith SSRF vulnerability (moderate)

- **Source:** `pnpm audit`
- **Detail:** `langsmith@0.3.87` (transitive via `@langchain/core@0.3.80`) affected by SSRF via tracing header injection (GHSA-v34v-rq6j-cj6p). Patched in `>=0.4.6`.
- **Impact:** Moderate -- exploitable if LangSmith tracing is enabled (not used in production config).
- **Recommendation:** Update `@langchain/core` or override `langsmith` to `>=0.4.6`.

#### [LOW] SEC-R4-26 -- Frontend: 10 vulnerabilities (5 low, 5 moderate)

- **Source:** `npm audit`
- **Detail:**
  - `@tootallnate/once` -- control flow scoping (transitive via `jest-expo`/`jsdom`). Test-only dependency.
  - `ajv@7-8.17.1` -- ReDoS with `$data` option (transitive via `expo-dev-launcher`). Dev-only.
  - `markdown-it@13-14.1` -- ReDoS (transitive via `@ronradtke/react-native-markdown-display`). Production dependency but attack requires malicious markdown input, which is server-controlled.
- **Recommendation:** No critical action needed. The `markdown-it` ReDoS is the most relevant -- ensure markdown content comes from trusted sources (the LLM).

---

## Domain 7: Security Configuration

**Maturity: 4/5**

### Findings

#### [INFO] SEC-R4-27 -- DB_SYNCHRONIZE properly guarded

- **File:** `museum-backend/src/data/db/data-source.ts:47`
- **Detail:** `synchronize: env.nodeEnv === 'production' ? false : env.dbSynchronize` -- hard-coded `false` for production regardless of env var. CI also blocks if `DB_SYNCHRONIZE=true` in `.env*` files.

#### [INFO] SEC-R4-28 -- Production env validation is comprehensive

- **File:** `museum-backend/src/config/env.ts:328-358`
- **Detail:** In production, the following are required: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `PGDATABASE`, `CORS_ORIGINS`, `MEDIA_SIGNING_SECRET`, and the LLM API key for the configured provider. Missing any of these crashes at startup (fail-fast).

#### [INFO] SEC-R4-29 -- No secrets committed to repository

- **Detail:** `.env` files are in `.gitignore`. The only "secrets" found in code are test fixtures (`e2e-access-secret`, `e2e-fake-openai-key`) in test files, which is standard practice. Google OAuth Client IDs in `app.config.ts` (lines 308-309) are public identifiers (not secrets) -- they are intentionally public per Google's OAuth documentation.

#### [INFO] SEC-R4-30 -- Dev fallback JWT secrets are confined to non-production

- **File:** `museum-backend/src/config/env.ts:199-207`
- **Detail:** `isDev` check allows `'local-dev-jwt-secret'` fallback. In production, `required()` throws if not set. The `isDev` boolean is true only for `development` and `test` NODE_ENV values, never for production.

---

## OWASP Top 10 Compliance Checklist

| OWASP Category | Status | Notes |
|---|---|---|
| A01 -- Broken Access Control | PASS | RBAC enforced, session ownership checks, admin routes protected |
| A02 -- Cryptographic Failures | PASS | bcrypt-12, HMAC-SHA256, timing-safe comparisons, separate JWT secrets |
| A03 -- Injection | PASS | Parameterized SQL, sanitized LLM inputs, HTML-escaped user text |
| A04 -- Insecure Design | PARTIAL | Login route missing IP rate limiter |
| A05 -- Security Misconfiguration | PASS | Helmet, CORS enforced in prod, no-store cache, production env validation |
| A06 -- Vulnerable Components | PARTIAL | langsmith SSRF (moderate), markdown-it ReDoS (low) |
| A07 -- Auth Failures | PASS | Solid JWT implementation, refresh rotation, brute-force protection (per-email) |
| A08 -- Software/Data Integrity | PASS | Lockfiles present, signed image URLs, atomic token consumption |
| A09 -- Logging & Monitoring | PASS | Structured logging, audit trail, Sentry integration, request IDs |
| A10 -- SSRF | PASS | Image URLs validated (HTTPS-only, private IP blocked), no server-side fetch |

---

## OWASP LLM Top 10 Compliance

| LLM Risk | Status | Notes |
|---|---|---|
| LLM01 -- Prompt Injection | PARTIAL | Keyword guardrail + structural isolation, but keyword list is bypassable |
| LLM02 -- Insecure Output | PASS | Output guardrail blocks insults, injection, off-topic |
| LLM03 -- Training Data Poisoning | N/A | Using commercial LLM APIs, no custom training |
| LLM04 -- Model Denial of Service | PASS | Semaphore concurrency limit, per-section timeout, total budget |
| LLM05 -- Supply Chain | PARTIAL | langsmith vulnerability (moderate) |
| LLM06 -- Sensitive Info Disclosure | PASS | No PII in prompts, system instructions not leakable (structural isolation) |
| LLM07 -- Insecure Plugin Design | N/A | No LLM plugins/tools |
| LLM08 -- Excessive Agency | PASS | LLM has no action capabilities, read-only art domain |
| LLM09 -- Overreliance | PASS | Output guardrail + user reporting mechanism |
| LLM10 -- Model Theft | N/A | Using commercial APIs |

---

## Security Maturity Matrix

| Domain | Score | Rationale |
|---|---|---|
| 1. Authentication & Authorization | 4/5 | Excellent JWT implementation, refresh rotation, RBAC, API keys. Missing IP rate limit on login. |
| 2. Input Validation & Injection | 4/5 | Parameterized SQL, LLM sanitization, name validation. Manual validation (no Zod) on auth routes. |
| 3. Prompt Injection & LLM Security | 3/5 | Good layered defense (guardrail + structural isolation + anti-injection). Keyword approach fundamentally limited. |
| 4. Data Protection & Privacy | 4/5 | GDPR export/delete, SecureStore tokens, no PII in logs/Sentry. Dev token logging should be tighter. |
| 5. API Security | 4/5 | Helmet, CORS, rate limiting, signed URLs, clean error responses. Login rate limit gap. |
| 6. Dependency Security | 3/5 | One moderate vuln (langsmith SSRF). Frontend dev-only vulns. |
| 7. Security Configuration | 4/5 | Prod env validation, DB_SYNCHRONIZE guard, no committed secrets, fail-fast startup. |

---

## Top 5 Prioritized Vulnerabilities

| Priority | ID | Severity | Finding | Effort |
|---|---|---|---|---|
| 1 | SEC-R4-01 | MEDIUM | Login route missing IP-based rate limiter | 15 min |
| 2 | SEC-R4-11 | HIGH | Keyword guardrail bypassable by homoglyphs/semantic rewriting | 2-5 days (LLM classifier) |
| 3 | SEC-R4-12 | MEDIUM | OCR guard disabled by default, fail-open on error | 30 min (flag + fail-closed) |
| 4 | SEC-R4-25 | MEDIUM | langsmith SSRF vulnerability | 30 min (dep update) |
| 5 | SEC-R4-15 | MEDIUM | Verification/reset tokens logged without explicit dev guard | 15 min |

---

## Recommendations Summary

### Quick Wins (< 1 hour)
1. Add IP-based rate limiter to `/login` route (SEC-R4-01)
2. Enable `ocrGuard` feature flag by default (SEC-R4-12)
3. Guard token logging with explicit `env.nodeEnv === 'development'` (SEC-R4-15)
4. Update `@langchain/core` or override `langsmith` to `>=0.4.6` (SEC-R4-25)

### Medium-Term (1 sprint)
5. Add breached-password check (HIBP k-anonymity) to password validation (SEC-R4-02)
6. Consider LLM-based guardrail classifier as second layer (SEC-R4-11)
7. Add Zod schemas to auth routes for consistency (SEC-R4-07)

### Long-Term
8. Implement certificate pinning on mobile frontend
9. Consider WAF rules for additional API protection
10. Implement rate limiting in Redis (currently in-memory, lost on restart)
