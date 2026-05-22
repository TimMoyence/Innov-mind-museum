# Lessons — multer (v2.1.1)

Project-specific gotchas. Audit enterprise-grade 2026-05-18 : **APPROVED_WITH_MINOR_HARDENING**.

## 2026-05-18 — Configuration security exemplaire
- ✅ Version pin 2.1.1 EXACT (no caret/tilde) — CVE-2025-47935/47944/7338 + CVE-2026-3520 patchés
- ✅ memoryStorage (downstream sharp/LLM consume Buffer, never persist)
- ✅ files: 1 cap (prevents .single() bypass via duplicate fields)
- ✅ fileFilter whitelist MIME (image/jpeg+png+webp, audio/mp4+mpeg+webm+wav+x-m4a) avec cb(badRequest(...)) hard error
- ✅ limits.fileSize : env-overrideable, defaults 3MB image / 12MB audio
- ✅ MulterError instanceof discrimination (LIMIT_FILE_SIZE→413)
- ✅ Per-route mount (NOT global)
- ✅ Auth required avant multer (isAuthenticated first middleware)
- ✅ Rate-limit AVANT multer (dailyChatLimit + userLimiter + sessionLimiter) — bursts fail at limiter
- ✅ Defense-in-depth : ImageProcessingService re-validates via magic-byte (not just Content-Type)
- ✅ Finite res.setTimeout (totalBudgetMs + 10s) → no slowloris upload DoS

## ⚠️ 2026-05-18 — F1 LOW : limits.fields/parts/headerPairs NOT set (defense-in-depth DoS)
- **Cause** : Multer defaults to Infinity → PATTERNS §3 DO + §4 DON'T call out as DoS vector.
- **Mitigation actuelle** : upstream rate-limiters cap requests, but defense-in-depth requires `{fields: 10, parts: 20, headerPairs: 50}`.
- **Fix** : voir TD-MUL-01. Add to both upload + audioUpload dans `chat-route.helpers.ts`.

## ⚠️ 2026-05-18 — F2 LOW : MulterError code discrimination incomplete
- **Cause** : `error.middleware.ts:31-45` discrimine LIMIT_FILE_SIZE → 413 PAYLOAD_TOO_LARGE. Mais LIMIT_UNEXPECTED_FILE (frontend sends wrong field) + LIMIT_FILE_COUNT collapse en generic 400 — pas clean pour client diagnostics.
- **Fix** : voir TD-MUL-02. Add dedicated codes (UNEXPECTED_FILE_FIELD, TOO_MANY_FILES).

## 2026-05-18 — Anti-patterns à éviter
- ❌ `.any()` (uncontrolled fields)
- ❌ Global `app.use(upload.single(...))` (always per-route)
- ❌ memoryStorage SANS `files: 1` cap (burst DoS)
- ❌ Caret on multer version (`^2.1.1` autoriserait 2.0.x si Renovate fait downgrade — INTERDIT)

## 2026-05-20 — Refresh audit (UFR-022)
- ✅ TD-MUL-01 fixé : `fields: 10, parts: 20, headerPairs: 50` shippé sur `upload` + `audioUpload` (`chat-route.helpers.ts:93-95, 107-109`).
- ✅ TD-MUL-02 fixé : `MULTER_PAYLOAD_TOO_LARGE_CODES` couvre `LIMIT_FIELD_COUNT`/`LIMIT_FIELD_KEY`/`LIMIT_FIELD_VALUE`/`LIMIT_PART_COUNT` → 413 ; `LIMIT_FILE_COUNT`/`LIMIT_UNEXPECTED_FILE` → 400 (semantic shape error, voir `error.middleware.ts:38-44`). Test contract verrouillé dans `tests/unit/middleware/multer-field-limit-413.test.ts` + `error-handler.test.ts:200-220`.
- ✅ Pas de release multer postérieure à 2.1.1 (2026-03-04). Pin EXACT confirmé safe au 2026-05-20 (Snyk 0/0/0/0, GHSA: zéro open).
- ⚠️ `3.0.0-alpha.1` existe sur npm — NE PAS adopter (alpha, pas de SLA).
- ⚠️ Path-traversal via `Buffer.from(originalname, 'latin1').toString('utf8')` documenté chez nodejs-security.com. Musaium IMMUNE (memory storage + `originalname` jamais utilisé comme path component → S3 key = UUID-based). Garder en tête si TD-50 (logo upload) est implémenté un jour : NEVER use `originalname` for the S3 key, NEVER round-trip latin1→utf8.

## 2026-05-20 — Pattern défense-en-profondeur (à dupliquer pour toute nouvelle route upload)
1. `isAuthenticated` AVANT multer (sinon attacker non-auth peut burst-upload).
2. Rate-limiters AVANT multer (sessionLimiter + userLimiter + dailyChatLimit selon contexte).
3. `extendTimeoutForUpload` (finite ceiling `totalBudgetMs + 10_000`, JAMAIS 0/Infinity) AVANT multer.
4. `multer({storage: memoryStorage, limits: {fileSize, files:1, fields:10, parts:20, headerPairs:50}, fileFilter})`.
5. `fileFilter` = MIME allowlist + `cb(badRequest(...))` hard error (jamais `cb(null, false)` silent).
6. Handler GUARD `if (!req.file) throw badRequest('...')`.
7. Magic-byte re-validation downstream (ImageProcessingService).
8. EXIF strip avant LLM/storage.
9. S3 key = UUID/ULID (jamais `originalname`).
10. `error.middleware.ts` mappe MulterError → 413/400 selon `MULTER_PAYLOAD_TOO_LARGE_CODES`.

Si une PR upload skip ≥1 étape ci-dessus → CHANGES_REQUESTED systématique.

## 2026-05-20 — TD-50 (logo upload) deferred
V1 admin panel branding accepte HTTPS URL only. Pas de multer côté `/admin/museums/:id/branding`. Quand l'upload réel sera implémenté (V1.1+) : appliquer rigoureusement le pattern §10. NE PAS bolt-on multer sans review sécurité — c'est une nouvelle surface d'attaque (museum admin authentifié mais multi-tenant, donc faille = compromis cross-tenant).
