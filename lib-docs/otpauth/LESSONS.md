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
