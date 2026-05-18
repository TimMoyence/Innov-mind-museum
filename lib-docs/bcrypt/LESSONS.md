# Lessons — bcrypt (v6.0.0)

Project-specific gotchas. Audit enterprise-grade 2026-05-18.

## 2026-05-18 — BCRYPT_ROUNDS centralized constant — never inline magic number
- **Pattern** : tous les hot-path hashers importent `BCRYPT_ROUNDS` depuis `@shared/security/bcrypt` (currently 12). Cost-bump = 1-line change.
- **Sites conformes** : `user.repository.pg.ts:44,72`, `resetPassword.useCase.ts:31`, `recoveryCodes.ts:42`.
- **Anti-pattern à éviter** : `bcrypt.hash(password, 10)` inline avec magic number.

## 🚨 2026-05-18 — 72-byte cap NOT enforced (BLOCKER pre-V1 décision)
- **Symptôme** : password 128 chars avec multibyte (emoji=4 bytes, accents=2 bytes) peut excéder 72 bytes → bcrypt truncate silencieusement, weakening hash sans warning.
- **Cause** : `shared/validation/password.ts:22` caps length at 128 CHARS, mais bcrypt cap silently at 72 BYTES.
- **Fix** : voir TD-BC-01. Décision pré-V1 requise : (a) reject inputs >72 bytes au validation, OR (b) document explicitement la truncation.
- **Audience FR-locale** : likely accents → impact réel.

## 2026-05-18 — Recovery code verification scans full array (positional timing mitigation)
- **Pattern** : `findRecoveryCodeIndex` (recoveryCodes.ts:54-69) continue bcrypt.compare APRÈS match found, mitige positional leakage.
- **Anti-pattern à éviter** : early return sur match qui leak l'index par timing.

## 2026-05-18 — No rehash-on-login mechanism (cost drift)
- **Symptôme** : si BCRYPT_ROUNDS bump 12→13, hashes existants stay at 12 forever (jusqu'à manual change password).
- **Fix** : voir TD-BC-02 (LOW priority post-launch).

## 2026-05-18 — Pre-guard `if (!user.password)` mandatory (social-only accounts)
- **Pattern** : tous les bcrypt.compare sites guardent contre null hash (authSession.service.ts:90, changePassword.useCase.ts:27, disableMfa.useCase.ts:24, changeEmail.useCase.ts:33).
- **Anti-pattern à éviter** : oublier le guard → bcrypt throws sur undefined hash en v6.

## 2026-05-18 — Validations positives
- ✅ Zero `bcrypt.hashSync/compareSync/genSaltSync` dans src/
- ✅ Zero password leak dans logs
- ✅ All bcrypt.compare against stored bcrypt hashes (no generic constant-time misuse)
