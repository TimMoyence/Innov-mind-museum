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

## 2026-05-20 — Refresh wave (no upstream drift)
- **Upstream cadence** : `bcrypt@6.0.0` (npm 2025-05-11) reste la dernière release. Aucun tag, advisory ou wiki edit depuis le 2026-05-18. La lib est en **low-maintenance mode** (1 release en 12 mois) — pas d'urgence sécurité, mais signal de fond qui appuie TD-29.
- **OWASP 2026** : Argon2id classé #1, scrypt #2, bcrypt #3 ("legacy systems only" mais acceptable au floor `cost ≥ 10`). Musaium pin `BCRYPT_ROUNDS=12` confirmé conforme. Pre-hash mitigation (`bcrypt(base64(hmac-sha384(pw, pepper)), …)`) documentée OWASP mais NON adoptée (introduit un pepper dans le secret-management, incompatible avec la facade TD-29 dual-hash).
- **Floor guard à 2 couches** désormais opérationnel (delta vs 2026-05-18 : ajout `withFloorAssert` boot-time) : `shared/security/bcrypt.ts:27-34` throw au module-load si quelqu'un descend < 12. Jest pin `tests/unit/auth/bcrypt-cost-factor.test.ts` redonde en CI. Cf. §8 PATTERNS.md.
- **TD-BC-03 fermé** : `scripts/seed-smoke-account.ts:46` migré vers `BCRYPT_ROUNDS` (vérifié 2026-05-20). Commentaire TD-BC-03 conservé pour archéologie.
- **TD-BC-01 reste OUVERTE (MEDIUM)** : `shared/validation/password.ts:22` cap toujours en CHARS (128), pas en BYTES (72). Décision pré-V1 requise — option (a) `Buffer.byteLength(pw, 'utf8') <= 72` reste la reco PATTERNS §3. Audience FR-locale (accents 2 bytes) = risque réel de troncation silencieuse.
- **TD-BC-02 reste OUVERTE (LOW)** : 0 hit `getRounds`/rehash dans `src/`. Design désormais explicitement folded into TD-29 Phase A (`needsRehash(stored)` après successful verify → opportunistic re-hash via la facade `shared/security/password-hash.ts`). Ne PAS implémenter en isolation — l'argon2id swap arrive dans la même release. Réf : `docs/PASSWORD_HASH_MIGRATION.md` §3.
- **Pattern timing recovery codes confirmé** : `findRecoveryCodeIndex` (recoveryCodes.ts:54-69) — full-scan loop continue après match, persiste l'index sans `break`. À PRÉSERVER — toute PR qui "optimise" par early-return est un review-rejection (positional timing leak).
- **TD-29 (bcrypt → argon2id)** : plan complet committé dans `docs/PASSWORD_HASH_MIGRATION.md` (2026-05-20). Sites affectés énumérés (5 hash, 4 compare). Migration mécanique grâce au pin central `BCRYPT_ROUNDS`. POST-LAUNCH only — V1 ship sur bcrypt-12.
- **`bcrypt.promises.use(...)`** : explicitement banni dans PATTERNS §2 (legacy Promise swap, inutile sur Node 22). 0 hit en `src/`. Tout retour = CHANGES_REQUESTED.
- **Pré-guard `if (!user.password)`** confirmé à 4/4 compare sites (authSession, changePassword, disableMfa, changeEmail). Le message d'erreur reste GÉNÉRIQUE (`Invalid credentials`) pour ne pas révéler social-vs-local sign-in — pattern à préserver (cf. authSession.service.ts:90-93).
- **Reviewer cheat-sheet ajoutée** (§9 PATTERNS.md) : 8 invariants à vérifier sur toute PR touchant bcrypt. Reviewer doit citer le numéro en CHANGES_REQUESTED.
