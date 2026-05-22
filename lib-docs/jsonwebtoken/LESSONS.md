# Lessons — jsonwebtoken (v9.0.3)

Project-specific gotchas. Audit enterprise-grade 2026-05-18.

## 🚨 2026-05-18 — F1 HIGH : google-oauth-state.ts MISSING `algorithms` option (CVE-2022-23540 doctrine)
- **Symptôme** : `jwt.verify(token, secret, { issuer })` SANS `algorithms: ['HS256']` → attacker peut envoyer `alg: 'none'` ou downgrade HS256→RS256 si secret pourrait être interpretable comme public key (low exploitability ici mais doctrine violation).
- **Cause** : `museum-backend/src/modules/auth/adapters/secondary/social/google-oauth-state.ts:59` `jwt.verify(token, env.auth.jwtSecret, { issuer: STATE_ISSUER })` omits `algorithms`.
- **Fix** : voir TD-JWT-01 (BLOCKER pre-V1 par doctrine, low actual exploitability). Add `algorithms: ['HS256']` aux VerifyOptions.
- **Anti-pattern à éviter** : verify() SANS algorithms array est INTERDIT (PATTERNS.md §3 + §4 + §5 'algorithms is the #1 footgun').

## 2026-05-18 — Validations positives (excellent baseline auth)
- ✅ HMAC/RS256 separation : HS256 secrets envar, RS256 public keys JWKS-derived. Pas de cross-pollution.
- ✅ Token expiration : access 15m, refresh 14d (sliding 24h idle).
- ✅ Refresh rotation : family-bound (familyId JWT + DB), reuse detection sha256 mismatch → revokeFamily.
- ✅ Secrets : env.production-validation.ts asserts JWT_ACCESS != JWT_REFRESH, length ≥32 chars (256 bits HS256, NIST SP 800-117).
- ✅ Decode safe usage : project-local `decodeJwtHeader()` for kid extraction THEN re-verify with full signature (social-token-verifier.ts:125).
- ✅ Error handling : `instanceof TokenExpiredError / JsonWebTokenError` pattern (social-token-verifier.ts:160-168).
- ✅ External OIDC : Apple + Google iss + aud pinned.

## 2026-05-18 — Polish opportunities (LOW)
- `clockTolerance: 5` non set → future multi-region readiness.
- iss/aud non set sur internal access/refresh tokens → token-confusion defense (low priority single-issuer).
- env.ts:122 dev fallback MFA_SESSION_TOKEN_SECRET → JWT_ACCESS_SECRET — add inline comment "dev-only collapse".

## 2026-05-20 — Refresh round (verification + state confirmation)

### Verification
- Upstream version unchanged : `9.0.3` (2025-12-04) still latest. No 9.1.x / 10.x branch.
- `master` README byte-identical to 2026-05-18 capture (sign/verify/decode option lists, supported-algorithms table, security warnings).
- No new GHSA advisories filed since 2026-05-18 ; the 4 historical advisories all cover `<=8.5.1` (patched in 9.0.0). CVE-2022-23529 reminder : the CVE was **retracted** 2023-01-27 (insufficient exploitability) but GHSA-27h2-hvpr-p74q remains published. Musaium never passes attacker-controlled key material, so this is structurally not-applicable.

### State changes in Musaium since 2026-05-18
- ✅ **TD-JWT-01 RESOLVED 2026-05-19** (run `2026-05-19-cluster5-jwt-ratelimit`). `google-oauth-state.ts:60` now passes `algorithms:['HS256']`. Defense layered : (a) `SafeJwtVerifyOptions` TypeScript `NonNullable` at wrapper boundary, (b) runtime guard in `safeJwtVerify` (`social-token-verifier.ts:175-178`), (c) `tools/ast-grep-rules/jwt-verify-needs-algorithms.yml` wired pre-push Gate 14, (d) 23 unit assertions across 4 test files.
- ✅ **TD-JWT-02 effectively closed** (TECH_DEBT.md L1120 listing is stale). `iss`+`aud` now pinned at all 3 internal HS256 sites — verified by re-reading `token-jwt.service.ts:71/100/132/153` and `mfaSessionToken.ts:25/48`. **Action recommended :** mark TD-JWT-02 as CLOSED in TECH_DEBT.md in a follow-up housekeeping commit.

### What's still good (no regression vs 2026-05-18)
- HMAC/RS256 separation : HS256 secrets envar, RS256 public keys JWKS-derived. Zero cross-pollution.
- Token expiration : access 15m, refresh 14d (sliding 24h idle).
- Refresh rotation : family-bound (`familyId` JWT + `auth_refresh_tokens` table), reuse detection via sha256 mismatch → `revokeFamily`.
- Secrets : `env.production-validation.ts` asserts JWT_ACCESS != JWT_REFRESH, length ≥32 chars (256 bits HS256), distinct from REDIS_PASSWORD / MEDIA_SIGNING / MFA_* / CSRF.
- Decode safe usage : project-local `decodeJwtHeader()` for `kid` extraction THEN re-verify with full signature (`social-token-verifier.ts:125-131`). Zero direct `jwt.decode` calls in tree.
- Error handling : `instanceof TokenExpiredError / JsonWebTokenError` pattern at every verify call site.
- External OIDC : Apple + Google `iss` + `aud` pinned + nonce (sha256-hashed for Apple, plain for Google) + constant-time comparison.
- JWKS rotation : 1h cache TTL + Zod shape validation + one re-fetch on `kid` miss + typed `JWKS_MALFORMED` 401 boundary.

### Remaining low-priority polish (post-V1)
- `clockTolerance: 5` non set on internal verify sites — single-region today, multi-region readiness later.
- `env.ts:120-128` dev fallback for MFA_SESSION_TOKEN_SECRET collapses to JWT_ACCESS_SECRET — add inline comment "dev-only collapse, prod fail-fast blocks this surfacing" (cosmetic).
- TECH_DEBT.md L1120 (TD-JWT-02) stale — mark CLOSED in follow-up.
