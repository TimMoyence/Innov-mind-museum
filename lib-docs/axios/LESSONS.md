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

## 2026-05-20 — refresh (lib-doc-curator, axios 1.16.0 installed / 1.16.1 latest)

### Status of prior findings (2026-05-18 audit) — most RESOLVED
- **F1 TD-AX-01 (maxContentLength/maxBodyLength) — RESOLVED.** `httpClient.ts:175-176` now caps both at 10 MiB. Note: axios 1.16.0 also extends `maxContentLength`/`maxBodyLength` enforcement to the **fetch adapter** (previously XHR/http only) — relevant only if the app switches adapters.
- **F4 TD-AX-02 (AbortSignal plumbing) — RESOLVED.** `httpRequest.ts:21` exposes `signal?: AbortSignal` forwarded to `AxiosRequestConfig.signal`; wired to TanStack Query `QueryFunctionContext.signal` (TD-TQ-01 resolved). Closes the closure-cell stale-fetch recurrence (MEMORY B1/B2/B6).
- **F2 (duck-typed isAxiosError) — STILL OPEN (intentional, LOW).** `httpErrorMapper.ts:5,36` duck-types `isAxiosError?` instead of `import { isAxiosError } from 'axios'`. Intentional: the mapper also accepts synthetic axios-like errors from the refresh path. New code handling only real axios errors should use `axios.isAxiosError()`.
- **F3 (`transitional.clarifyTimeoutError`) — STILL OPEN (LOW).** Not set; mapper already classifies `ECONNABORTED` → `Timeout`, so value is negligible. Optional polish.

### NEW: version posture — bump to 1.16.1 recommended (LOW-MEDIUM)
- Installed = **1.16.0**, latest = **1.16.1** (2026-05-13). `^1.16.0` range permits 1.16.1; a `pnpm/npm update axios` (no lockfile pin issue) closes the gap.
- 1.16.1 adds: prototype-pollution hardening in `formDataToJSON` (own-property traversal), **fix for HTTPS data sent cleartext to an HTTP proxy** (Node/proxy path — N/A to RN client), Unicode-header-through-interceptor fix, RFC-2397 data-URI parsing.
- **Why it matters for RN:** the proxy/SSRF/socketPath/cloud-metadata CVEs (CVE-2026-42038/42043, CVE-2025-62718, CVE-2026-40175, GHSA NO_PROXY family) target the **Node http/https adapter + proxy path** — a React-Native client uses the XHR/fetch adapter with no proxy, so these do NOT apply. The classes that DO apply to any adapter are **prototype pollution** (config/response objects: CVE-2026-42033/42035/42264) and **CRLF/header injection** (CVE-2026-42037) — addressed across the 1.15.1→1.16.1 line. Staying on the latest patch (1.16.1) closes them with zero code change.
- CVE-2024-28849 (follow-redirects credential leak across hosts) is historical/transitive, fixed long before current 1.x.

### Confirmed best-in-class (re-verified 2026-05-21)
- Trace headers (`sentry-trace`/`baggage`) stamped by **Sentry RN** (`sentry-init.ts:21`), NOT the axios interceptor — correct. `tracePropagationTargets` host-scoped to prod API + `/api/` path (no third-party leak). Do not double-stamp in axios.
- No token leakage: `__DEV__` request log omits Authorization; breadcrumbs carry method/url/status/duration only; `sendDefaultPii:false` + scrubber.
- Cert pinning (`react-native-ssl-public-key-pinning`) sits below axios at the native layer — axios sends over the pinned connection transparently, no `httpsAgent` involved (RN has no Node adapter). Don't try to configure pinning via axios.
- `baseURL` seeded from `expo-constants`, runtime-switchable, localhost blocked in non-dev builds (`assertApiBaseUrlAllowed`).
