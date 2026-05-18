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
