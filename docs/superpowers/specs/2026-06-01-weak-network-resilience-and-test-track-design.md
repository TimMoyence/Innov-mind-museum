# Weak-Network Resilience + Edge Compression + 3-Layer Test Track — Unified Design

**Status:** DESIGN (pre-implementation). Scope LOCKED by user (Approach A *non-séquencée* — all 3 layers + the compression feature, delivered across 3 waves but as ONE plan).
**Pipeline:** UFR-022 fresh-context 5-phase, 3 waves, registry-first. Each wave = a full `/team` run (spec → plan → red → green → verify → security → review).
**Date:** 2026-06-01. **Author:** brainstorming workflow `edge-resilience-design` (7 design facets + synthesis) + user decisions.

---

## North Star

Make Musaium genuinely usable on a museum **EDGE/2G** cell (≈120–200 kbps, RTT 300–800 ms, high jitter, intermittent) and **prove it** with a first-class, deterministic, three-layer weak-network test track — turning *"works in the basement of the Cité du Vin"* into a demonstrable competitive advantage.

A single frozen **Network Profile Registry** is the keystone: every test layer (app-level Jest, backend fault-injection middleware, Toxiproxy transport proxy) **and** the new client-side image/request **compression feature** derive their behaviour from the same named profiles, so the matrix cannot drift and a one-line edit re-tunes all layers at once. All fault-injection is test-only and **hard-refuses to boot under `NODE_ENV=production`**, mirroring the existing `DB_SYNCHRONIZE` / `resolveChaosRate` prod-guard doctrine.

---

## Goals & Non-Goals

### Goals
- **G1 — Survive the floor.** App never crashes/hangs on `offline`/`2g`/`edge`/`3g-lossy`/`flapping`; degrades to correct UX (offline banner, low-data state, bounded spinner, actionable i18n error, retry).
- **G2 — Zero data loss + resync.** Messages typed offline are queued and resynced **exactly once** on recovery (`offlineQueue` → `useOfflineSync`), proven even under flapping, **enforced backend-side via `Idempotency-Key`** (user decision).
- **G3 — Budgets respected.** Latency/timeout budgets honoured against real sockets (axios 15 s client timeout, 20 s server socket timeout).
- **G4 — Compress for edge (the headline).** Adaptive client-side image recompression + JSON request gzip + backend decompression cut a typical museum-photo upload from ~2.5 MB / ~3+ min to **~150 KB / ~13 s** on EDGE uplink; a higher-quality local-only derivative feeds the post-visit carnet.
- **G5 — One source of truth.** A frozen Network Profile Registry consumed by all 3 layers + compression; drift = CI red.
- **G6 — No prod footgun.** Fault-injection middleware refuses prod boot **unconditionally (no escape hatch)** + CI sentinel + server-mirrored anti-bypass.
- **G7 — CI without budget blowout.** Reuse existing jobs; Layer 3 nightly + tiny paths-filtered PR smoke; **+0 new required-check names**.

### Non-Goals
- **NG1 — Android emulator network shaping** (EXCLUDED by user; Toxiproxy replaces it for realistic shaping).
- **NG2 — Real token-streaming SSE on the chat *client*.** FE SSE is dormant/buried (`send.ts:159–172`); chat "streaming" at the client is a slow *synchronous* `postMessage`. Server-side SSE pacing is asserted only at Layer 2/3 on the media pipe.
- **NG3 — Client-side brotli encoding** (high RN CPU cost on low-end phones; gzip only from client, `br` accepted server-side).
- **NG4 — Multi-replica fault-counter state** (CI runs single backend instance; in-memory Map is sufficient).
- **NG5 — Reworking response compression** (already correct: `app.ts:163–169`, SSE excluded).

---

## Glossary

| Term | Meaning |
|---|---|
| **Profile** | A named entry in the Network Profile Registry (`offline`/`2g`/`edge`/`3g-lossy`/`flapping`/`normal`). |
| **Layer 1 (L1)** | App-level Jest tests: NetInfo mock + injected latency/failure on the axios `httpClient`. Runs in `npm test`. |
| **Layer 2 (L2)** | Backend env-gated Express middleware reading `X-Net-Profile` → deterministic delay/failure/pacing. |
| **Layer 3 (L3)** | Toxiproxy container shaping the real TCP transport (bandwidth/latency/loss) for device e2e. |
| **DataMode** | `resolveDataMode()` output `'low' | 'normal'` (`DataModeProvider.tsx:44`). |
| **Force-low hook** | `useDataModePreferenceStore.setPreference('low')` — deterministic low-data trigger that short-circuits NetInfo (resolves iOS-sim caveat). |
| **Duty cycle** | The on/off schedule modelling `flapping` (onlineMs/offlineMs over a baseProfile). |
| **Mode A / Mode B** | L2 pacing of the real media byte-pipe (A) vs trickling the buffered chat JSON body (B). |

---

## User Decisions (locked at spec-review entry)

| # | Decision | Consequence |
|---|---|---|
| **D1 — Image target** | **Adaptive**: ~150 KB WebP @1024px **uploaded** for AI recognition + a ~250–400 KB local-only derivative for the carnet thumbnail (never uploaded). | Compression decision produces **two outputs**; the carnet reads the local copy, never re-downloads the uploaded one. Touches the image pipeline + carnet storage. |
| **D2 — Idempotency** | **Backend-enforced** `Idempotency-Key`. | FE forwards `queued.id` as `Idempotency-Key`; new backend dedup store + middleware (prod-safe). Lands in **W1**. Closes the zero-loss gap under flapping. |
| **D3 — Fault-injection prod posture** | **OFF unconditionally in prod, no escape hatch.** | Boot-throw is unconditional (stricter than `resolveChaosRate`); no `'I-know-what-I-am-doing'` token for this middleware. |

### Defaults taken (the other 13 open questions, resolvable by reviewer if contested)
- **Registry home:** FE module `museum-frontend/shared/infrastructure/connectivity/networkProfiles.ts` + **vendored byte-identical BE copy** `museum-backend/src/shared/net-shaping/networkProfiles.ts` guarded by a **sha256 parity sentinel** (NOT a `@musaium/shared` export — avoids the `file:`-package install-churn gotcha).
- **Canonical numbers:** the merged table in §"Profile Registry" is **ratified** as the design default.
- **`flapping`:** `{ onlineMs: 5000, offlineMs: 3000, baseProfile: '3g-lossy' }` — the offline windows already stress the queue (online↔offline alternation).
- **Latency semantics:** L3 Toxiproxy applies full one-way `latencyMs` to **both** streams (≈2× RTT) **as the sole shaper**; L1/L2 endpoint mocks each apply latency **once**. Locked so budgets aren't double/half-counted. Mappers do **not** need a `soleShaper` flag (L2 and L3 never co-shape one request).
- **WebP fallback:** WebP @1024px q60; if `expo-image-manipulator` WebP is unreliable on a platform → JPEG q55 @1024px (~220 KB, still ~11×). Verified at runtime in W1 red phase.
- **Import boundary:** ESLint `no-restricted-imports` so `shared/testing/**` is never imported by `app/` runtime.
- **Coverage:** remove `offlineQueue.ts` (and keep an eye on `chatSessionLogic.pure.ts`) from `coveragePathIgnorePatterns` once M3 lands; hold the repo-wide branch threshold.
- **LLM in test cells:** mock/canned everywhere chat-stream is exercised (zero token cost); the only real-provider job stays the existing out-of-scope `ai-tests`.
- **CI:** L3 = `maestro-netshape-nightly` cron + conditional paths-filtered 2-flow PR smoke; **+0 new required checks** (mirrors the `e2e` exclusion from `deploy-prod.needs`).
- **Loss fidelity:** Toxiproxy `slicer` + probabilistic `timeout` as the `lossPct` proxy (no `tc`/netem sidecar for V1; loss-driven retry is already deterministically covered at L1/L2, so L3 loss is corroborative).
- **Weak-net APK:** separate cached build (distinct cache namespace) pointed at `:3100`; nightly + conditional-PR (cold prebuild ~30 min only on cache miss).
- **CI upstream target:** Toxiproxy `upstream` → host backend via `--add-host host.docker.internal:host-gateway` (or `172.17.0.1:3000`) since CI runs the backend on the host via `pnpm dev`, not compose.
- **Branch protection:** the prod-guard rides the already-required `sentinel-mirror`; **no protection edit / PAT needed** for this work.

---

## The Profile Registry (the keystone)

### Authoring home & vendoring
- **FE canonical:** `museum-frontend/shared/infrastructure/connectivity/networkProfiles.ts` — pure, dependency-free (no React/NetInfo import), co-located with `isOnline.ts` / `DataModeProvider.tsx`. The FE owns the `netinfoType`/`cellularGeneration` enum mapping because that is where `resolveDataMode` consumes them (`DataModeProvider.tsx:58–63`).
- **Backend copy:** `museum-backend/src/shared/net-shaping/networkProfiles.ts` — vendored byte-identical data region; sha256 CI sentinel compares the two (anti-drift, same doctrine as `cache-key-parity.mjs`).
- **Toxiproxy:** toxics generated **at runtime** by a bootstrap script reading the registry — never a hand-written compose block (the kbps→KB/s conversion lives in one place).

> The registry lives under `infrastructure/connectivity/` (consumed by production-adjacent compression code), NOT `shared/testing/`. The L1 **harness helpers** (`netInfoFromProfile`, `withNetworkSim`, `paceTokens`) live under `shared/testing/` and must never be imported by `app/` runtime (ESLint boundary rule).

### TS shape

```ts
export type NetinfoType = 'none' | 'cellular' | 'wifi' | 'unknown';
export type CellularGeneration = '2g' | '3g' | '4g' | '5g' | null;
export type NetworkProfileName = 'offline' | '2g' | 'edge' | '3g-lossy' | 'flapping' | 'normal';

export interface DutyCycle {
  onlineMs: number;
  offlineMs: number;
  baseProfile: Exclude<NetworkProfileName, 'flapping' | 'offline'>;
}

export interface NetworkProfile {
  readonly name: NetworkProfileName;
  readonly latencyMs: number;        // one-way base
  readonly jitterMs: number;
  readonly bwDownKbps: number;       // 0 = blocked
  readonly bwUpKbps: number;         // 0 = blocked
  readonly lossPct: number;          // 0..1
  readonly netinfoType: NetinfoType;
  readonly cellularGeneration: CellularGeneration;
  readonly expectedDataMode: 'low' | 'normal';   // asserted vs real resolveDataMode
  readonly dutyCycle?: DutyCycle;    // present iff name === 'flapping'
  readonly label: string;
}

export const NETWORK_PROFILES: Readonly<Record<NetworkProfileName, NetworkProfile>> = Object.freeze({ /* below */ });
```

**Self-test invariant:** each profile's `{isConnected, type, details.cellularGeneration, isConnectionExpensive}` is fed into the **real** `resolveDataMode` (`DataModeProvider.tsx:44`) and asserted to equal `expectedDataMode`. If the resolution rule changes, this test goes red — the registry can never silently lie about which profile is "low".

### Canonical numbers (ratified default)

`latencyMs` is one-way; RTT ≈ 2×.

| Profile | latencyMs (1-way) | jitterMs | bwDown kbps | bwUp kbps | lossPct | netinfoType | cellGen | expectedDataMode |
|---|---|---|---|---|---|---|---|---|
| `offline` | 0 | 0 | 0 | 0 | 1.0 | `none` | `null` | low |
| `2g` | 350 | 150 | 100 | 40 | 0.02 | `cellular` | `2g` | low |
| `edge` | 200 | 120 | 200 | 90 | 0.01 | `cellular` | `2g` | low |
| `3g-lossy` | 120 | 80 | 700 | 300 | 0.08 | `cellular` | `3g` | low |
| `flapping` | (base) | (base) | (base) | (base) | (base) | `cellular` | `3g` | low* |
| `normal` | 25 | 10 | 20000 | 8000 | 0.0 | `wifi` | `null` | normal |

\* `flapping.expectedDataMode = 'low'` via the `isConnected === false` branch during offline windows (`DataModeProvider.tsx:56`) and 3g during online windows.

**Justifications:** `edge` 90 kbps uplink is the binding constraint for image upload and the canonical number the compression feature quantifies against (the registry owns it; the compression facet references it). `2g` is the worst-case floor. `3g-lossy` keeps decent bandwidth but 8% loss to exercise `retry.ts` backoff `[500, 2000, 8000]`. `normal` is the control to catch over-degradation.

### `flapping` duty cycle (shared schedule)

```ts
export interface FlapTick { online: boolean; baseProfile: NetworkProfile; }
export const flapScheduleAt = (p: NetworkProfile, elapsedMs: number): FlapTick => { /* phase = elapsedMs % (onlineMs + offlineMs) */ };
```

Default `{ onlineMs: 5000, offlineMs: 3000, baseProfile: '3g-lossy' }`. All 3 layers flip at the **same boundaries** from this one helper.

### Three mappers (pure, unit-tested — the only place raw knobs are computed)

| Mapper | Output | Consumed by |
|---|---|---|
| `toFetchMockShape(p)` | `{preResponseDelayMs, failProbability, msPerKbitUp/Down, netinfo snapshot, forcedDataModePreference}` | L1 Jest |
| `toMiddlewareDescriptor(p)` | `{delayMs, jitterMs, failProbability, sseChunkDelayMs, ingressKbps}` | L2 middleware |
| `toToxics(p)` | `ToxiproxyToxic[]` (kbps/8 → KB/s conversion lives HERE) | L3 bootstrap script |

```
        NETWORK_PROFILES (frozen, FE)  ──sha256──  vendored copy (BE)
          │                  │                       │
   toFetchMockShape   toMiddlewareDescriptor      toToxics / flapScheduleAt
          │                  │                       │
     L1 Jest mock      L2 X-Net-Profile mw      L3 toxiproxy-apply.mjs
```

---

## Layer 1 — App-Level (NetInfo mock + injected latency, runs in `npm test`)

**Boundary:** pure Jest/jest-expo, no Docker/emulator/socket. Proves the **logic half** of the contract. Transport is **axios** (`httpClient.ts:168`, `timeout: 15000`) wrapped by `httpRequest` (`httpRequest.ts:38`) — **NOT raw fetch**; the latency wrapper targets the `httpRequest` port, not a global `fetch` monkeypatch.

### Harness helpers (`shared/testing/`)
- **A — `netInfoFromProfile(p)`** → the exact `{type, isConnected, isInternetReachable, details:{isConnectionExpensive, cellularGeneration}}` shape `resolveDataMode`/`isOnline` consume. Replaces hand-rolled NetInfo literals (DRY-factory discipline).
- **B — `withNetworkSim(realFn, {profile, clock, rng})`** — deterministic latency + seeded (mulberry32, never `Math.random`) loss + maps `delay > AXIOS_TIMEOUT_MS (15000)` → `Timeout` AppError (retryable via `retry.ts:21`). Uses jest fake timers + explicit `FakeClock`.
- **C — `paceTokens(...)`** — profile-paced `onToken` emitter for `sendMessageStreaming.ts:78` (tests the strategy's internal token accumulation via the sync fallback; NOT a real wire stream — see NG2).

### Test inventory
**Keep + refactor to consume registry:** `resolveDataMode`, `pickSendStrategy`, `runWithRetry`, `useOfflineSync` (14 cases), `isOnline`, `useOfflineQueue`.

**New (the real gaps):**
- **M1** — registry-parameterised `resolveDataMode` `it.each(NETWORK_PROFILES)`.
- **M2** — enqueue-on-disconnect seam (`pickSendStrategy` → `sendMessageOffline.ts:13`).
- **M3** — `OfflineQueue` full/FIFO/maxAge/prune/corrupted-JSON (remove from `coveragePathIgnorePatterns`).
- **M4** — **dedup/resync idempotency:** FE forwards `queued.id` as `Idempotency-Key` to `postMessage`; tests assert flapping flush posts each item exactly once and that the header is present (D2).
- **M5** — timeout-budget binding (`[500, 2000, 8000]` schedule vs profile latency).
- **M6** — compression **decision math** unit (adaptive: edge → 150 KB upload target + local 250–400 KB derivative; normal → no-op; quantified).
- **M7** — geo/museum-search + auth degraded paths (React Query `shouldRetry` cap, `Unauthorized` not retried).

---

## Layer 2 — Backend Fault-Injection Middleware (env-gated, test-only)

**Location:** `museum-backend/src/shared/net-shaping/` (`net-profile-fault.middleware.ts`, `net-fault.config.ts`, `failure-counter.store.ts`, `chunk-pacer.ts`).

**Activation:** header `X-Net-Profile: <name>` AND env gate on. No header → `next()` (zero overhead on normal traffic). Unknown profile → `next()` + debug log (NOT 400).

### Code reality that shaped this (verified)
- Chat reply is **buffered `res.status(201).json(result)`** (`chat-message.route.ts:92`) — NOT SSE. LangChain `.stream()` is server-side only.
- The only true wire-streaming surface is the media byte-pipe (`stream.pipe(res)`, `chat-media.route.ts:147`).
- `compression` already skips `text/event-stream` (`app.ts:166`).

### Behaviour
1. **Deterministic delay** = `latencyMs + jitterMs` (fixed worst-case add, NOT random — CI flake-freedom). Extends `res.setTimeout` so injected latency doesn't collide with the 20 s socket timeout (`app.ts:172`) and mask the degraded-UX assertion.
2. **Deterministic failure** = `X-Net-Fail-Count: N` → fail next N then succeed (keyed by sessionId/userId/path in an in-memory Map). Probabilistic `lossPct` offered separately as `X-Net-Fail-Mode: lossy` (seeded). Failure body reuses the **real** `@shared/errors` 503 envelope → flows through `errorHandler` (`app.ts:282`) so the FE i18n actionable-error path is exercised genuinely.
3. **Chunk pacing (two real modes):**
   - **Mode A** — paces the media byte-pipe via a token bucket from `bwDownKbps` (the real "stream qui rame").
   - **Mode B** — `X-Net-Pace: 1` patches `res.json` to trickle the buffered chat JSON body in `bwDownKbps`-paced slices. Must run AFTER `compression` (`app.ts:164`) so slices aren't re-coalesced by gzip. **Scoped to tagged routes only** to avoid skewing `httpMetricsMiddleware` (`app.ts:253`) / Sentry instrumentation timing.

### Mounting & ordering
Mount inside `applyGlobalMiddleware` (`app.ts:125`) **after** `requestId`/`tracePropagation` (faults still carry request-id + trace), **after** `compression` (`app.ts:164`), **before** the timeout setter (`app.ts:172`) and routers. Add `X-Net-Profile`, `X-Net-Fail-Count`, `X-Net-Fail-Mode`, `X-Net-Pace` to CORS `allowedHeaders` next to existing `X-Data-Mode` (`app.ts:148`) or the preflight strips them.

**Mutating-middleware caveat (CLAUDE.md gotcha):** the failure-counter is keyed on URL `sessionId` (not body), so a Zod 400 cannot burn the counter for an unrelated path. Documented inline.

### Control surface
Header-only for profile selection (parallel-test-safe). One gated endpoint `POST /api/__test__/net-fault/reset` (route literally not registered in prod) to clear the failure counter between flows.

---

## Layer 3 — Proxy (Toxiproxy, realistic transport)

**Why:** only this layer caps real byte-rate over the full socket lifetime, shapes the **upstream/upload** path independently, and does real TCP-level mid-flight drops — what L1/L2 endpoint-shaping cannot.

### Who owns what (L2 pacing vs L3 bandwidth)
L2 (backend middleware) owns **deterministic, header-driven, fast** shaping for PR-time assertions (no Docker proxy). L3 (Toxiproxy) owns **realistic, byte-rate, transport-level** shaping for the nightly device track, the **upload/upstream** path, and the **measured** compression numbers. They are **never both active on the same request**: L2 is for the PR `e2e` job; L3 is for the device Maestro track. L3 applies full one-way `latencyMs` to both streams (≈2× RTT) as sole shaper.

### Service & wiring
- Add `toxiproxy` to `museum-backend/docker-compose.dev.yml` under `profiles: ["weaknet"]` so everyday `pnpm dev` is unchanged. Ports `8474` (admin), `3100` (shaped data). One proxy `musaium-api: listen :3100 → upstream <host backend>:3000`.
- **Device points at proxy via existing build-time bake:** weak-net APK is a separate cached build with `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3100` (mirrors current `:3000` bake at `ci-cd-mobile.yml:206`). `assertApiBaseUrlAllowed` permits `10.0.2.2` on the `development` variant; cleartext already whitelisted. Distinct APK cache namespace.
- **Maestro selects profile** via a `runScript` pre-step hitting the admin API on `:8474` from the runner host (DELETE+recreate for determinism). `profile-to-toxics.mjs` imports the registry and emits admin JSON (no hard-coded numbers).
- **Loss** modelled as `slicer` fragmentation + probabilistic `timeout` (V1 default).
- **Flapping/offline:** toggle `proxy.enabled` per `flapScheduleAt` (sidecar duty-cycle loop for true flapping; single transition via runScript for the simpler offline→recover case).

### Upstream is shaped — the measurement instrument
`bandwidth` toxic on `stream: upstream` byte-rate-caps the multipart photo body. Running the same `chat-image-describe` flow under `edge` with compression off vs on is how the competitive-advantage claim is **measured** (wall-clock), surfaced as the headline metric in `maestro-summary`.

---

## The Compression Feature (build) — adaptive (D1)

**Ground truth (verified):** client image resize/recompress EXISTS but JPEG-only, mode-blind, 2.7 MB/1600px target (`imageUploadOptimization.ts:6–8`). Response gzip EXISTS and is correct, SSE excluded (`app.ts:163–169`). Request-body decompression DOES NOT EXIST. The feature is ~50% built — **EXTEND, don't rebuild**.

### (a) Adaptive client image recompression — extend existing file
Parameterise `optimizeImageForUpload(uri, profile = IMAGE_PROFILES.normal)` (backwards-compatible default keeps non-edge callers untouched). Driven by resolved DataMode:
- `normal` = today (1600px, JPEG, 2.7 MB).
- `low` (edge) = **two outputs (D1):**
  - **uploaded:** 1024px, WebP ~q60, target ~150 KB (backend accepts `image/webp` end-to-end, `image-processing.service.ts:61`).
  - **local-only carnet derivative:** ~1280px WebP ~q70, target ~250–400 KB, written to local image storage (`offlineImageStorage.ts`), **never uploaded**. The carnet reads this copy.
- **Graceful fallback** preserved: WebP unsupported → JPEG q55 @1024px → raw URI; never block upload.
- The decision is a pure function `features/chat/application/compressionDecision.pure.ts` (unit-tested as M6); the picker (`useImagePicker.ts`/`useCompareImagePicker.ts`) reads `useDataMode()` and calls it pre-upload.

### (b) Request-body gzip + backend decompression — NET-NEW (prod-safe)
- **Client:** gzip JSON bodies > ~1 KB via `pako` (RN-safe), ONLY on resolved `low`/edge; set `Content-Type: application/json` + `Content-Encoding: gzip`. NEVER gzip multipart image bodies.
- **Backend:** new `requestDecompressionMiddleware` mounted **before** `express.json` (`app.ts:177`) inflating `gzip|deflate|br`. **Mandatory zip-bomb guard:** cap *decompressed* bytes at `env.jsonBodyLimit` (1 MB), abort 413. Add `Content-Encoding` to CORS `allowedHeaders`.
- **This middleware is prod-SAFE and SHOULD run in prod** — a legitimate capability, NOT a fault injector. Do not conflate with the L2 fault middleware's prod-refusal.

### (c) `Idempotency-Key` dedup — NET-NEW backend (D2, prod-safe)
- **Client:** `useOfflineSync` forwards `queued.id` as `Idempotency-Key` on resync `postMessage` (`useOfflineSync.ts:60`).
- **Backend:** dedup store (seen-key cache, e.g. short-TTL Redis or in-memory with TTL) + middleware on the message-create path: a repeated key returns the original result instead of creating a duplicate. Prod-safe, defends zero-loss under flapping.

### (d) Response compression
Already correct. Optional: pin explicit `level: 6` + `threshold: 1024` (low-risk; reviewer's call).

### Quantified payload reduction (EDGE, 90 kbps up ≈ 11,250 B/s)
| Scenario | Uplink bytes | Time @ 90 kbps up |
|---|---|---|
| Today (1600px JPEG ~2.5 MB) | ~2,500,000 | ~222 s |
| **NEW edge (1024px WebP, uploaded)** | ~150,000 | **~13 s** |
| **Reduction** | **~16×** | **~222 s → ~13 s** |

JSON request body 2 KB → gzip ~0.7 KB → saves ~100–115 ms/message (second-order). **Headline: a museum photo upload drops from un-usable (>3 min, frequent timeout) to ~13 s on EDGE.**

---

## Surfaces × Profiles Matrix + Maestro Flows

Surfaces: `chat-text`, `image-upload`, `offline-queue+resync`, `geo-search+auth`. Legend: **1**=L1, **2**=L2, **M**=Maestro, `·`=dropped (re-homed, never lost).

| Surface ↓ \ Profile → | offline | 2g | edge | 3g-lossy | flapping | normal |
|---|---|---|---|---|---|---|
| **chat-text** | 1,2 | 1,2 | 1,2,**M** | 1,2 | 1 | M (existing) |
| **image-upload** | 1 | 1,2 | 1,2,**M** | 1,2 | 1 | M (existing) |
| **offline-queue+resync** | 1,2,**M** | 1 | 1 | 1,2 | 1,**M** | · |
| **geo-search+auth** | 1 | 1,2 | 1,2,**M** | 1,2 | 1 | M (existing) |

**Rule:** a cell goes to Maestro ONLY when the UI's *reaction* (banner/spinner-bound/error-copy/retry/resync-visibility) is under test. Pure logic stays L1; real-socket budgets stay L2. **24 theoretical → 6 Maestro flows (4 new + 2 reused).**

### iOS-sim NetInfo caveat resolution
New `__DEV__`-gated route `app/(dev)/force-data-mode.tsx` (mirrors the existing `(dev)/` group that redirects to `/` in release — zero prod footgun). Reads `?value=low`, calls `useDataModePreferenceStore.setPreference('low')`, redirects. Because `resolveDataMode(preference==='low')` short-circuits (`DataModeProvider.tsx:52`), the low-data banner lights deterministically on iOS sim. True OFFLINE on Android still uses `setAirplaneMode`; iOS offline stays `optional`. Route resets to `'auto'` on unmount (or flows always `clearState`) so persisted low-mode doesn't leak across same-sim flows.

### Four new flows (full specs in tasks.md; contract assertions summarised)
1. **`net-chat-edge.yaml`** — force-low → send → optimistic echo → `chat-assistant-pending` (bounded) → `chat-bubble-assistant` within budget → assert NO raw `error.*` token.
2. **`net-image-upload-edge.yaml`** — force-low → attach fixture → send → bounded upload spinner → real vision bubble; proves compressed upload completes within budget.
3. **`net-offline-queue-resync.yaml`** — `setAirplaneMode: enabled` → type → optimistic echo + pending-count banner → `setAirplaneMode: disabled` → resync proof = `chat-bubble-assistant` appears AFTER reconnect.
4. **`net-offline-flapping-resync.yaml`** — queue offline → toggle on/off/on → exactly one resynced reply + banner settles (idempotency asserted structurally at L1 + via `Idempotency-Key`).
5. **`net-auth-geo-edge.yaml`** — login + museum search under edge: bounded auth spinner, actionable i18n copy (never raw `Timeout` token), retry path.
6. **`connectivity-offline-banner.yaml`** (existing) — retained for app-shell offline banner.

**Retry-button** assertion is L2-driven (`X-Net-Profile=offline-then-recover`, first POST 503 → error copy + Retry → succeeds) to avoid a flaky device timeout. Assert resolved i18n copy, never a raw AppError token.

---

## Assertion Contract (all 4, every surface)

| Clause | L1 (logic) | L2 (real socket) | L3 (transport) | Maestro (UI) |
|---|---|---|---|---|
| **No-crash / no-hang** | `runWithRetry` always terminates, strategies never reject unhandled | 503 envelope, timeout extended deterministically | TCP drop/reset handled | bounded `extendedWaitUntil`, app alive |
| **Degraded UX** | `resolveDataMode='low'` selects cache/low-data flags; error → i18n key | actionable 503 → i18n error + retry | (same) | offline-banner testID, bounded spinner, i18n copy not raw token |
| **Zero-data-loss + resync** | enqueue/dequeue/poison-drop/dedup-on-replay; `Idempotency-Key` present | `X-Net-Fail-Count` then success → re-send once, BE dedups repeat key | upstream stall → queue captures | pending-count banner → resynced bubble after reconnect |
| **Latency/timeout budget** | `[500,2000,8000]` vs profile RTT; 15 s axios → Timeout | "completed within X" zero-flake | real wall-clock p95 | bounded flow timeouts (calibrated) |

---

## Security & Prod-Guard (strict, no hatch — D3)

Fault-injection is a footgun strictly worse than `DB_SYNCHRONIZE`. Three concentric defenses, copying verified existing patterns but **stricter (no escape hatch)**:

1. **Runtime hard-refuse** — `resolveNetFaultEnabled(raw, nodeEnv)` in `env-helpers.ts`, modeled on `resolveChaosRate` (`env-helpers.ts:87`) **but with NO escape-hatch parameter**. Default OFF; in prod → coerce false + structured stderr `{event:'net_fault_injection_refused'}` regardless of any token.
2. **Boot-throw** — in `validateProductionEnv` (`env.production-validation.ts:147` ban-pattern) throw **unconditionally** if `NET_FAULT_INJECTION_ENABLED=true` in prod (same class as `AUTH_EMAIL_SERVICE_KIND='test'`).
3. **Double-guarded mount** — middleware `app.use`'d only when `nodeEnv !== 'production' && netFaultEnabled` + `logger.warn` on mount.
4. **CI sentinel** `scripts/sentinels/net-fault-prod-guard.mjs` (pure-Node structural): asserts (a) no `.env*` enables it, (b) mount is conditional, (c) boot-throw exists, (d) reset route is gated, (e) sha256 FE↔BE registry parity. **Mirrored in `sentinel-mirror.yml` (UFR-020 anti-bypass).**

> L3 Toxiproxy guard `toxiproxy-no-prod.mjs` fails if any prod compose / EAS profile references the proxy image or `:3100`/`:8474`. The **request-decompression and `Idempotency-Key` middleware are exempt** — they are prod-safe.

---

## CI Integration

| Layer | Job | New job? | Required check? |
|---|---|---|---|
| L1 + compression units | existing mobile `quality` (`npm run test:coverage`, `ci-cd-mobile.yml:165`) | No | rides existing |
| L2 + decompression/idempotency round-trip | existing backend `e2e` (`ci-cd-backend.yml:493`) | No | rides existing (e2e non-required, intentional) |
| L3 Toxiproxy | new `maestro-netshape-nightly` (cron) + conditional 2-flow `netshape-smoke` PR shard (paths-filtered) | 1 nightly + 1 conditional shard | No |
| Prod-guard sentinel | `sentinel-mirror` (already required) | No | rides `sentinel-mirror` |

**Required-checks net change = +0 new names.** Compression payload-reduction is locked as a **test assertion** (FE unit on fixture image + gzipped body) in W1 and **measured** as wall-clock in the W3 nightly summary. No OpenAI tokens in any layer.

---

## 3-Wave Rollout (ONE plan, registry-first, each wave a full UFR-022 run)

Each wave = `spec → plan → red → green → verify → security → review` (fresh-context per phase, flat `red-test-manifest.json` `{path:sha256}`, lib-docs obligation, reviewer rejection loop unlimited). Sequenced by **data dependency**, not by layer.

### Wave 1 — Registry + Layer 1 + Compression feature (adaptive + idempotency) + force-low hook
**Lands:** `networkProfiles.ts` registry + parity sentinel skeleton; L1 harness (helpers A/B/C); M1–M7 tests; adaptive edge image profile (two outputs) + WebP + client gzip (FE) + backend request-decompression middleware (zip-bomb cap) + `Idempotency-Key` forwarding (FE) & dedup store/middleware (BE); `app/(dev)/force-data-mode.tsx`.
**Why first:** registry is consumed by W2/W3. Compression + idempotency are the user-promised feature and their units are pure.
**Security phase load-bearing on:** decompression zip-bomb cap.
**Green:** mobile + backend `quality`/`e2e` green; parity sentinel green; coverage held.

### Wave 2 — Layer 2 fault-injection + prod-guard security
**Lands:** `net-profile-fault.middleware.ts` (X-Net-Profile → registry → delay/failure/Mode-A/Mode-B); `resolveNetFaultEnabled` (no hatch) + env wiring + unconditional boot-throw; all 3 security defenses + `net-fault-prod-guard.mjs` + `sentinel-mirror` entry; backend `e2e` tests over a shaped connection (4 contracts, compressed-request round-trip under pacing).
**Depends on W1.** Deterministic backbone letting PRs assert weak-network without Docker/emulator cost.
**Green:** backend `quality`/`e2e` green; sentinel green locally + mirrored; unit proves middleware absent under `NODE_ENV=production`.

### Wave 3 — Layer 3 Toxiproxy device track + PR smoke
**Lands:** `toxiproxy` service (compose, weaknet profile) + `toxiproxy-no-prod.mjs`; `profile-to-toxics.mjs` + `apply-profile.sh`; `.maestro/shards.json` shards `netshape` (4 flows) + `netshape-smoke` (2 flows); `maestro-netshape-nightly` job + conditional PR smoke; payload-reduction wall-clock metric in `maestro-summary`; 4 new flows using W1's force-low hook + Android `setAirplaneMode`.
**Depends on W1 + W2.** UFR-021 screen-coverage satisfied (references existing screens — no new baseline entry).
**Green:** nightly green on cron; PR-smoke green when triggered. NOT a required check.

---

## Risks

- **R1 — Number drift between layers.** Mitigation: parity sentinel + `expectedDataMode` self-test prevent silent post-build drift.
- **R2 — Maestro flow flake** under live LLM + injected latency (budgets too tight). Mitigation: one calibration run; retry-button assertion moved to deterministic L2 path; LLM mocked in test cells.
- **R3 — Toxiproxy CI plumbing** (upstream host alias on Linux runners). Mitigation: `--add-host host-gateway`; nightly-only so a flake doesn't block PRs.
- **R4 — Zip-bomb** via the new prod decompression middleware. Mitigation: mandatory decompressed-size cap before inflate; security phase load-bearing in W1.
- **R5 — Loss-modelling fidelity** (Toxiproxy has no native packet loss). Mitigation: loss-driven retry already deterministically covered at L1/L2 so L3 loss is corroborative.
- **R6 — Persisted `force-data-mode` leaking** across same-sim flows (zustand persist). Mitigation: route resets to `'auto'` on unmount OR flows always `clearState`.
- **R7 — Coverage regression** from new files. Mitigation: every new file ships its own tests; thresholds held.
- **R8 — Adaptive image local derivative storage growth** (D1: a second larger copy per photo). Mitigation: carnet derivative obeys the existing `offlineImageStorage` eviction/maxAge; verify quota in W1.

---

## Verification ledger

**Verified in the design session:** `DataModeProvider.tsx:44/52/56/58`, `send.ts:159–172`, `chat-message.route.ts:92`, `app.ts:144/148/163–166/172/177`, `env-helpers.ts:87` (chaos pattern + escape-hatch literal), `env.production-validation.ts:147` (`AUTH_EMAIL_SERVICE_KIND` ban), `imageUploadOptimization.ts:6–8`, `docker-compose.dev.yml` services.

**UNVERIFIED — the Red phase of each wave MUST re-verify before relying on:** exact line numbers for `OfflineBanner.tsx`, `ChatMessageList.tsx`, `ChatMessageBubble.tsx`, `Composer.tsx`, `app/(dev)/_layout.tsx`, `offline-prompt-preview.tsx`, `maestro-run-shard.sh`, `shards.json`, sentinel scripts (`cache-key-parity.mjs`, `security-headers-invariants.mjs`, `screen-test-coverage.mjs`), `apiConfig.ts`, `image-processing.service.ts:61`, `httpClient.ts:168`, `httpRequest.ts:38`, `retry.ts:21`, `useOfflineSync.ts:60`, `chat-media.route.ts:147`, `ci-cd-mobile.yml:165/206`, `ci-cd-backend.yml:174/493`, and `lib-docs/@react-native-community/netinfo/PATTERNS.md` line refs.
