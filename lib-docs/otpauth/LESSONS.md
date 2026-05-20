# Lessons — otpauth (v9.4.1)

Project-specific gotchas. Audit enterprise-grade 2026-05-18 : **APPROVED — 8/8 PASS, zero deviations**.

## 2026-05-18 — Configuration MFA exemplaire
- **Secret** : 160 bits (`size: 20`) — exceeds 128-bit minimum
- **Algorithm** : SHA1 (universal compat Google Authenticator/Authy/1Password)
- **Period** : 30s standard (PATTERNS.md §4 DON'T #7 warns against period:60)
- **Digits** : 6 default + regex `/^\d{6}$/` defends drift (totpService.ts:39 + verifyMfa.useCase.ts:27)
- **Window** : 1 = ±30s clock tolerance, replay window 90s (RFC 6238 §5.2)
- **Site canonique** : `museum-backend/src/modules/auth/useCase/totp/totpService.ts`

## 2026-05-18 — Defense-in-depth complète
- ✅ Secret AES-256-GCM at rest via `MFA_ENCRYPTION_KEY` (distinct from JWT/media)
- ✅ Wire format `base64(iv):base64(tag):base64(ciphertext)` (totp-secret.entity.ts:18-29,45)
- ✅ Decryption just-in-time only in verifyMfa.useCase.ts:40
- ✅ Recovery codes bcrypt-hashed (cost ≥10), `consumedAt` single-use enforcement
- ✅ Recovery codes returned plain ONCE on enroll (enrollMfa.useCase.ts:14-16,59)
- ✅ URI generation via `totp.toString()` (PATTERNS.md §4 DON'T #6 — no hand-rolled URI)
- ✅ Issuer 'Musaium' + label=user.email
- ✅ `validate().delta !== null` discrimination (PATTERNS.md §4 DON'T #2 — never `> 0`)

## Anti-patterns à éviter sur nouvelles features 2FA
- ❌ Arbitrary string secret (always Secret instance or fromBase32)
- ❌ `validate()` retour interprété comme boolean (use `!== null`)
- ❌ Direct `.bytes`/`.buffer` access
- ❌ Hand-roll URI string (always `toString()`)
- ❌ Period 60s+ ou digits ≠ 6/8

## Status : NO TD entry. NO action needed. Pattern de référence pour future security work.

## 2026-05-20 — Refresh cycle, rate-limit ordering verified

Doc-refresh check (lib-docs mini-bundle UFR-022). Confirmed against current code (`mfa.route.ts` rev sans changement depuis 2026-05-18) :

- ✅ TD-EX-01 reste RESOLVED — `validateBody(challengeSchema)` puis `challengeLimiter` (mfa.route.ts:157-159), idem `/recovery` (mfa.route.ts:204-206). Counter ne s'incrémente PAS sur Zod 400. Cross-ref `lib-docs/zod/PATTERNS.md §3 L202-206` + CLAUDE.md "Mutating middleware ordering".
- ✅ Replay protection — assurée par le route-level rate limiter (5/15 min keyed `user:` ou `mfa-session:`). Pas de tracker "last delta seen" en DB → noté PATTERNS.md §4 #8 comme amélioration future si la fenêtre 5/15 vient à se relâcher.
- ✅ Audit attribution sur challenge échoué — `verifyMfaSessionToken` best-effort puis fallback `actorType:'anonymous'` (mfa.route.ts:175-198).
- ✅ Recovery flow — `findRecoveryCodeIndex` scanne la liste complète post-match (timing-safe-ish), `markCodeConsumed` immuable, persistance avant issuance JWT (`recoveryMfa.useCase.ts:64-68`).

## 2026-05-20 — Upgrade 9.4.1 → 9.5.1 : safe-to-defer

Latest npm = 9.5.1 (2026-04-25). 9.4.1 → 9.5.0 → 9.5.1 (pas de 9.4.2).

- **API surface** : identique. Le paramètre `hmac` config était déjà présent en 9.4.1 (visible dans le snapshot TOTP/HOTP/URI 2026-05-18) ; v9.5.0 l'a juste promu en README (#666). v9.5.1 = dep updates seulement.
- **Security advisories** : aucune publiée (verified 2026-05-20).
- **Default behaviour** : SHA1 / 30s / 6 / window 1 — inchangé. Tokens wire-compatibles.
- **Dep tree** : `@noble/hashes` 1.8.0 → 2.2.0 (transitive).
- **Bundler delta** : nouvelle sortie "bare build" (`dist/otpauth.bare.*`), opt-in, non utilisée.
- **Décision** : DEFER V2 (post-launch). Aligné remediation roadmap D3 (cache-first priorité). Pas de blocker, pas d'incentive.

## 2026-05-20 — Replay-protection (rappel doctrinal)

`validate({ window: 1 })` SEUL ne fait PAS de replay protection — il répond "ce token est-il actuellement valide ?". La défense contre le rejeu sur Musaium repose AUJOURD'HUI sur le rate-limiter (5/15 min). Si la fenêtre est un jour relâchée (>20 tentatives/min), il faudra ajouter une colonne `last_delta_seen` sur `totp_secrets` (RFC 6238 §5.2 "MUST NOT accept the second attempt").

