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
