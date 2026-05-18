# Lessons — axios (v1.16.0)

Audit 2026-05-18 : **APPROVED_WITH_LOW_PRIORITY_CHANGES**.

## ⚠️ F1 MEDIUM : `maxContentLength` / `maxBodyLength` non capped (defense-in-depth)
- Default `-1` = unlimited → decompression bomb / compromised upstream risk.
- BE first-party (LOW practical risk) mais TTS arraybuffer endpoint should be capped.
- **Fix TD-AX-01** : add `maxContentLength: 10*1024*1024, maxBodyLength: 10*1024*1024` to `axios.create()`.

## ⚠️ F4 LOW : No AbortController/signal plumbing in `httpRequest` helper
- `RequestOptions` does NOT expose `signal`. Screen unmount during in-flight fetch ne peut PAS abort → 'cell mutation' pattern doc MEMORY (B1/B2/B6 recurrence).
- **Fix TD-AX-02** : add `signal?: AbortSignal` to `RequestOptions`.

## ⚠️ F2 LOW : Duck-typed isAxiosError instead of `axios.isAxiosError()`
- `httpErrorMapper.ts:29-45` uses duck-typing. Should `import { isAxiosError } from 'axios'`.

## ⚠️ F3 LOW : `transitional.clarifyTimeoutError` not enabled
- Cannot distinguish ETIMEDOUT (server) vs ECONNABORTED (client abort). Negligible today (no AbortController consumers).

## ✅ Positives (best-in-class)
- Single canonical `axios.create()` instance (httpClient.ts:168) — zero direct axios.get/post elsewhere
- **Single-flight auth refresh + tri-state discriminated union** (success/invalid/transient) — EXCEEDS PATTERNS guidance, prevents double-logout
- DAILY_LIMIT_REACHED excluded from 429 retry (avoid hammering permanent failure)
- Header casing defensive (lowercase + TitleCase fallback)
- Sentry breadcrumb per-request with duration_ms
- Paywall handler decoupled via setter-injection (mirrors auth-refresh pattern)
- Zero deprecated `CancelToken` usage
