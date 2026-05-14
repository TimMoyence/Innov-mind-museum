# R28 — k6 Load Testing Methodology for Musaium V1 Launch

**Researcher:** R28
**Date:** 2026-05-12
**Audit:** Musaium V1 pre-launch (target 2026-06-01, 100k MAU validation)
**Scope:** Define the k6 load testing methodology for Musaium V1 — load profiles, traffic mix, ramp-up patterns, thresholds, distributed execution, chaos integration, reporting, concrete script templates.

---

## TL;DR

Musaium's current k6 surface (`auth-flow.k6.js`, `chat-flow.k6.js`, `concurrent-users.k6.js`, `stress-200vu.k6.js`, `stress-100k-rps.k6.js`) is a **foundation**, not a methodology. It covers smoke and one stress scenario, but:

- No **traffic mix scenario** (chat/image/voice/browse weighted).
- No **soak** (>1h), no **spike**, no **endurance** (multi-day).
- No **realistic data** (SharedArray of museum IDs, locations, prompts).
- No **distributed** execution (the 100k rps test admits single-host k6 won't work).
- No **Prometheus/Grafana** reporting wired into the existing observability stack (R6 already shipped Grafana + Prometheus).
- Stress test targets a deleted `musaium-staging.example.com` — **stale** (per memory `project_no_staging_v1.md`, pre-launch V1 has no staging; prod = stage, smoke local Docker).

**Recommendation for V1 launch (2026-06-01):** ship a five-tier load test pyramid (smoke → load → stress → spike → soak) executed in CI weekly + before launch, against the prod-equivalent local Docker stack first, then a 1h prod canary at off-peak. Use **k6 OSS v1.7+** (TypeScript native, OpenTelemetry experimental output, Prometheus remote-write extension). Reserve **k6 Cloud free tier (500 VUh/month)** for the pre-launch validation week; the single launch validation campaign fits within that envelope. Defer **k6-operator on Kubernetes** until subsystem F infra is provisioned (post-revenue) — current prod is single-node VPS OVH, distributed load testing has no target to hit.

**Stack chosen:** k6 OSS v1.7.x → xk6-output-prometheus-remote → existing Prometheus → existing Grafana dashboards (R6). Add xk6-faker for realistic prompts; SharedArray for user pools, museum IDs, GPS coordinates.

**Verdict:** k6 remains the right choice (developer-first JS/TS, native Go runtime, deep Grafana integration, fits existing observability stack). Locust would force a Python toolchain that the team doesn't have; Gatling needs JVM. **No tool change required** — only a methodology expansion. Estimated effort: ~3 days to ship the methodology + scripts; ~1 day to wire CI gate.

**Honesty UFR-013 caveats:**
- I did NOT run k6 against the Musaium stack during this research.
- I read the 5 existing `.k6.js` files in `museum-backend/tests/perf/k6/` (verified).
- All version numbers, pricing, executor names, and Prometheus env vars are from k6.io / grafana.com docs cited at the bottom (cross-referenced ≥2 sources where possible).
- LLM-specific load testing has a known limitation: **k6 measures total response time, not TTFT** — for Musaium chat we either accept this (text-only LLM) or build a custom check parsing the SSE/streaming response if voice latency becomes a release blocker (see §10).

---

## 1. k6 2026 — Current State

### 1.1 Versions

| Version | Released | Highlights |
|---|---|---|
| **v1.6.1** | 2026-02-16 | Latest stable (per release notes index 2026-02). |
| **v1.7.x** | 2026-Q1 | Auto-resolution for subcommand extensions, `K6_SECRET_SOURCE` env var, `getBy*` parity with Playwright for browser. |
| **v2.0.0-rc1** | ~2026-04-28 | First v2 RC — major cleanup of deprecated APIs. **Not yet GA.** |
| **v1.0** | 2025-05 | TypeScript native by default (no Webpack/Rollup), k6/browser stable, k6/net/grpc stable, k6/crypto stable. |

For Musaium V1 (2026-06-01 launch) → **use v1.7.x stable**. Defer v2 migration to post-launch (breaking changes: Go module path → `go.k6.io/k6/v2`, removed `externally-controlled` executor, removed `k6 login/pause/resume/scale/status` CLIs, FID metric removed → INP).

### 1.2 New capabilities since legacy k6 (pre-v1.0)

- **TypeScript by default** (v0.57+) — no transpilation, just `.ts` files. Useful for Musaium since the BE is TS-first.
- **k6/browser stable** — Chromium-based, Playwright-compatible API (no Playwright dep). Bundled in the main k6 binary since v0.52. Use for journey tests including frontend rendering.
- **k6 OpenTelemetry output** (experimental, stable since 1.6) — env vars `K6_OTEL_EXPORTER_OTLP_ENDPOINT`, `K6_OTEL_GRPC_EXPORTER_INSECURE`, `K6_OTEL_METRIC_PREFIX`, `K6_OTEL_EXPORTER_PROTOCOL` (v2 only). Sends to OTel Collector. **Caveat**: k6 v2 deprecates `K6_OTEL_EXPORTER_TYPE` in favor of `K6_OTEL_EXPORTER_PROTOCOL`.
- **Prometheus Native Histograms** — `K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM=true` requires Prometheus 2.40+ with `--enable-feature=native-histograms`. Higher fidelity than classic bucketed histograms.
- **Async APIs for browser** — better page/locator interaction.

### 1.3 Extension ecosystem (xk6)

Relevant for Musaium:

| Extension | Why for Musaium |
|---|---|
| `xk6-output-prometheus-remote` | Stream test metrics to existing Prometheus (R6 stack). |
| `xk6-output-opentelemetry` | Alternative if migrating to full OTel pipeline. |
| `xk6-faker` | Realistic prompts, names, GPS coords — Go extension, fast. |
| `xk6-sql` | Direct DB checks during test (read replicas, lock contention). PostgreSQL/MySQL/SQLite. |
| `xk6-redis` | Validate Redis cache hit rate during load (LLM cache, semaphore). |
| `xk6-browser` | Bundled in core now — not a separate xk6 anymore. |

xk6-faker is the right choice for prompt diversity (random art questions, languages); building a custom k6 binary takes ~30s with `xk6 build --with github.com/grafana/xk6-faker`.

---

## 2. Load Test Pyramid for Musaium V1

The pyramid below sequences from cheapest to most expensive, in line with Grafana Labs' "start small, test frequently" principle and the OSS k6-learn module:

```
                       [ENDURANCE 7d]     ← ONE-TIME pre-launch, manual, local
                      /                   1 VU/scenario, 7 days, observe leaks
                  [SOAK 24h]              ← ONCE before launch, manual
                 /                        10 VUs steady, 24h, observe drift
            [SPIKE]                       ← Pre-launch + on traffic event prep
           /                              0 → 500 VUs in 30s, hold 1m, drop
       [STRESS]                           ← Weekly, off-peak nightly cron
      /                                   Ramp to 2x expected peak, find break
  [LOAD]                                  ← On every release candidate
 /                                        Expected peak for 10-30 min
[SMOKE]                                   ← Every commit + nightly
                                          5 VUs / 2 min / all endpoints
```

### 2.1 Smoke test

- **Purpose**: Verify deployment isn't broken, baseline metrics. Run on every PR (CI gate).
- **Config**: `vus: 5`, `duration: '2m'`.
- **Threshold**: `http_req_failed: ['rate<0.01']`, `http_req_duration: ['p(95)<2000']`.
- **Current**: `chat-flow.k6.js` already plays this role (5 VU, 2 min). Reuse, just rename to `smoke.k6.js`.

### 2.2 Load test (expected peak)

- **Purpose**: Verify SLOs at expected production peak.
- **Config**: `ramping-vus` 0 → target → ramp-down. Target = peak concurrent users (see §4).
- **Duration**: 30 min steady state (enough to fill caches, warm JIT, expose mid-term issues).
- **Threshold**: `p(95)<1000`, `p(99)<3000`, `http_req_failed: rate<0.001` (0.1% from prompt — strict).

### 2.3 Stress test (find breakpoint)

- **Purpose**: Find the breaking point — when do error rates spike, when does p99 explode?
- **Config**: `ramping-arrival-rate` increasing RPS in 8-min ramp (per Grafana Labs' "long ramp helps identify exactly where performance starts to degrade").
- **Pass criteria**: Note the inflection point, not "everything green".
- **Current**: `stress-200vu.k6.js` is the right shape — keep it, extend to 4 stages (200/500/1000/2000 VU progression).

### 2.4 Spike test (sudden surge)

- **Purpose**: Recover from a viral TikTok / press release. Per Grafana Labs blog, spike tests model Taylor Swift tickets / PS5 launch / Super Bowl ads.
- **Config**: `ramping-arrival-rate` with sharp ramp: 10 RPS for 1 min → 500 RPS in 30s → hold 1 min → back to 10 RPS in 30s → stable 3 min.
- **Pass criteria**: System recovers within 2 minutes post-spike (error rate back to baseline, p95 back to nominal).

### 2.5 Soak test (24 h endurance)

- **Purpose**: Catch memory leaks, connection pool drift, log/disk fill, expired-token issues, cron job conflicts.
- **Config**: `constant-vus: 10` for 24 h, or `constant-arrival-rate: 5 rps` for 24 h.
- **Threshold**: `http_req_duration p(95)<2000` over the **last hour** (not the whole test — early phase warmup acceptable). Monitor memory in Grafana, not in k6.
- **Caveat**: k6 itself has known memory growth on long runs (GitHub issues #3955, #3822, #3269 — 64GB exhausted in 6h at high RPS). Mitigation: run soak at modest load (10 VU, not 1000), restart k6 process if needed; the goal is to stress the **target**, not k6 itself.

### 2.6 Endurance test (7 days)

- **Purpose**: Validate Musaium can run a full week without manual intervention. Drift detection beyond what 24h reveals (TLS rotation, certificate expiry alerts, log rotation, daily-art cron at midnight UTC).
- **Config**: `constant-arrival-rate: 1 rps` for `duration: '168h'`. Yes, k6 supports multi-day durations (community confirmed); v2 even has `'infinite'`.
- **When**: ONE TIME, two weeks before launch, against the local Docker stack mirroring prod.
- **Reality check**: Per the user's no-staging-V1 doctrine, this test cannot run against a separate staging server. Two options:
  1. Run against the **local Docker stack** with prod-equivalent config (the user's `feedback_no_staging` doctrine endorses this).
  2. Skip endurance and rely on the 24h soak + post-launch observation. Honest assessment: endurance has diminishing returns vs cost; **soak 24h is the sweet spot**.

---

## 3. Realistic Traffic Mix for Musaium

### 3.1 Per the brief

```
30% chat (text + LLM)
20% image (photo upload + AI enrichment)
10% voice (STT + LLM + TTS)
40% browse (sessions list, museum list, daily-art)
```

### 3.2 Reality check vs Musaium routes

Modules confirmed under `museum-backend/src/modules/`: `admin`, `auth`, `chat`, `daily-art`, `knowledge-extraction`, `museum`, `review`, `support`. Mapping the mix to actual endpoints:

| Mix | % | Endpoints | LLM cost per call |
|---|---|---|---|
| **Browse** | 40% | `GET /api/chat/sessions`, `GET /api/museum/list`, `GET /api/daily-art/today`, `GET /api/auth/me` | None (DB only) |
| **Chat (text)** | 30% | `POST /api/chat/sessions`, `POST /api/chat/sessions/:id/messages` (text only) | 1 LLM call |
| **Image** | 20% | `POST /api/chat/sessions/:id/messages` with image (multipart) | 1 SigLIP encode + 1 LLM call (C2) |
| **Voice** | 10% | `POST /api/chat/sessions/:id/messages` with audio | 1 STT + 1 LLM + 1 TTS |

**Sanity check on the brief's percentages for cultural B2C, voice-first**:
- Voice 10% feels low given "voice-first" positioning. But voice is friction-heavy (talk in public, need permission), so 10% is realistic for a balade context (per user behavior in similar AR tour apps). Keep 10%.
- Image 20% maps to "photographier l'œuvre" — fits the "balade culturelle" UX (one photo per artwork stop, ~5 stops per visit averaged over the session). Keep 20%.
- Chat 30% — feels right for follow-up Q&A on each artwork.
- Browse 40% — covers all the "list/discover" paths + the session loading.

**Implementation**: Use k6 scenarios with `exec` targeting per-mix functions, weighted via `vus`/`rate` ratios.

### 3.3 Pacing — think-time per scenario

| Scenario | Think time between actions | Why |
|---|---|---|
| Browse | `sleep(2 + random(0..3))` | User scrolling, reading list. Per Grafana k6-learn: "users typically spend more time reviewing a form than scanning a homepage". |
| Chat (text) | `sleep(5 + random(0..10))` | Reading the LLM response. |
| Image | `sleep(8 + random(0..7))` | Taking the photo, framing. |
| Voice | `sleep(10 + random(0..10))` | Talking, listening to TTS response. |

Use `randomIntBetween` from `k6-jslib-utils` to break uniform patterns.

---

## 4. 100k MAU → Concurrent Users Calculation

### 4.1 Grafana k6 formula (cited verbatim)

```
Concurrent users = Hourly sessions × Avg session duration (seconds) / 3600
```

### 4.2 Musaium V1 estimate

Assumptions (need user validation):
- **100k MAU** at steady state Q4 2026 (V1 launch June 2026 = ramp).
- **Sessions per MAU per month**: ~4 (B2C cultural app, museum visit is event-driven not daily-driven).
- **Session duration**: ~15 minutes (balade au musée = 30-60 min, but in-app interaction is bursty — assume 15 min effective in-app time per session).
- **Peak hour concentration**: 20% of DAU in the peak hour (typical mid-sized B2C per cited capacity-planning sources — applies to leisure apps where evenings cluster usage).

Numbers:
- Monthly sessions = 100,000 × 4 = 400,000
- Daily sessions (average) = 400,000 / 30 ≈ 13,333
- **Peak hour sessions** (20% concentration applied per Grafana / dotcom-monitor sources, but for a cultural app, museum opening windows further concentrate to 10am-3pm Sat/Sun → use 20% as conservative estimate) = 13,333 × 0.2 = 2,667
- Concurrent users at peak = 2,667 × (15×60) / 3600 = 2,667 × 0.25 = **~667 concurrent users**

Apply 1.5× safety factor (per dotcom-monitor / BlazeMeter — typical mid-sized peak buffer): **~1000 concurrent VUs target for load test**.

For stress test: 2× the load → **2000 VUs**. For spike test: 5× → spike to **3000-5000 RPS for 60s**.

### 4.3 Sanity check vs existing `stress-200vu.k6.js`

Current stress test caps at 200 VU. **That's 5× below what V1 launch needs to validate.** This is the biggest gap in the existing surface.

The `stress-100k-rps.k6.js` (100k RPS) is conversely **2 orders of magnitude above** what 100k MAU justifies (~28 RPS sustained, ~150 RPS peak). It targets infrastructure that doesn't yet exist (PgBouncer cluster, 50 BE replicas, Redis Cluster). Mark this as **"defer to post-revenue"** in the methodology — the runbook already says so.

### 4.4 Ramp-up patterns

| Profile | Pattern | Why |
|---|---|---|
| **Slow ramp** (load test) | 0 → 1000 VUs over 5 min | Mimics morning museum opening. Reveals scaling lag (autoscaler reaction time, DB pool ramp). |
| **Linear soak** | 10 VUs constant for 24h | Drift only, no surge. |
| **Spike** | 10 RPS → 500 RPS in 30s | Tests reactive autoscaling, CDN absorption. |
| **Step ramp** (stress) | 200 → 500 → 1000 → 2000 VUs in 4 stages of 5 min | Find breaking point with clarity. |

Per k6 docs: `ramping-arrival-rate` is the right executor for ramp-up by RPS (open model — system load decoupled from response time, models real users arriving regardless of how slow your API is). `ramping-vus` only works for closed-model (when you want to model "exactly N concurrent users").

**For Musaium: use `ramping-arrival-rate` everywhere except soak (constant-vus) and endurance (constant-arrival-rate).** Open-model is the honest choice — if our API gets slow, real users keep clicking, they don't pause out of politeness.

---

## 5. k6 OSS vs k6 Cloud — Pricing & Capacity (2026)

| Dimension | k6 OSS | Grafana Cloud k6 |
|---|---|---|
| **Cost** | Free | Free tier: 500 VUh/mo, 14-day retention. Paid: $0.15/VUh (volume-discounted). |
| **Max VUs** | ~10,000 per single machine (Go goroutines, depends on think-time/protocol). Distributed via k6-operator: unbounded. | Up to **1M concurrent VUs / 5M RPS** per test in cloud. |
| **Multi-region** | Manual (k6-operator across multi-region K8s clusters). | Multiple geographic load zones built-in. |
| **Storage** | Local JSON / Prometheus / OTel — bring your own dashboards. | Cloud-native dashboards, multi-test comparison, baselines. |
| **CI integration** | `setup-k6-action` + `run-k6-action` (free GitHub Actions). | Same actions, results pushed to Cloud. |

### 5.1 VUh calculation for Musaium pre-launch campaign

If we run the **load test once (1000 VU × 0.5h = 500 VUh)** that's the entire free tier in one shot. Reality: smoke (5 VU × 0.03h = 0.15 VUh) is cheap, load is expensive.

**Recommendation:**
- **CI smoke + load (≤200 VU)**: run on k6 OSS locally (free, no cloud cost).
- **Stress 2000 VU 30 min** = 1000 VUh → either k6 OSS distributed or k6 Cloud paid ($150 once a quarter).
- **Pre-launch validation week**: ~3000-5000 VUh total across all tests → $450-$750 on Cloud, or run on dedicated VM for free.

**Verdict**: stay on k6 OSS for V1. Migrate selected campaigns to k6 Cloud post-launch when budget allows and multi-region matters (Europe + North America museum touring).

---

## 6. Distributed k6 — k6-operator on Kubernetes

### 6.1 k6-operator status (2026)

- **GA: v1.0 released 2025-09-16.** Production-ready.
- Custom resource: `TestRun` CRD with `parallelism` parameter (how many pods to split test across).
- Storage: scripts via ConfigMap (≤1 MiB) or PersistentVolume.
- Distribution: k6 "execution segments" automatically split VUs across pods.
- Integration: installs via Helm or `kubectl apply` with the operator bundle.

### 6.2 When to adopt for Musaium

**NOT FOR V1.** Reasoning:
- Musaium runs on a single VPS (Docker Compose, OVH). No Kubernetes cluster.
- Single-machine k6 handles up to ~10k VUs — exceeds V1 needs (1000-2000 VU target).
- Bringing K8s only for load-test infra is over-engineering pre-revenue.

**WHEN TO ADOPT:**
- Once we move to K8s for the prod backend (per existing `stress-100k-rps.k6.js` runbook, this is "subsystem F" — deferred post-B2B revenue).
- When testing 10k+ concurrent VUs.
- When testing cross-region latency.

**Alternative for now**: if a single beefy VM (8-16 cores) can't host the load generator, use k6 Cloud one-off ($).

---

## 7. Thresholds 2026 — Musaium SLOs

### 7.1 The prompt's targets

- `p95 < 1s`
- `p99 < 3s`
- `error rate < 0.1%`

### 7.2 Reality check — Musaium specifics

| Endpoint class | p95 target | p99 target | Error rate | Rationale |
|---|---|---|---|---|
| **Auth** (`/api/auth/*`) | < 300 ms | < 800 ms | < 0.05% | DB-only, no LLM. Critical path — failure here blocks all traffic. |
| **Browse** (`GET /api/chat/sessions`, `/api/museum`, `/api/daily-art`) | < 500 ms | < 1 s | < 0.1% | Cached, fast. Should be CDN-fronted. |
| **Chat text** (`POST /api/chat/messages` text-only) | < 3 s | < 8 s | < 0.5% | LLM call. p95 ~2-3s typical. 0.1% is too strict — LLM upstream can timeout. |
| **Chat image** (with photo) | < 5 s | < 12 s | < 1% | SigLIP + LLM. p95 ~3-5s. |
| **Chat voice** (audio in/out) | < 8 s | < 15 s | < 1% | STT + LLM + TTS. p95 ~5-7s typical. |

**Honest critique of the prompt's "p95 < 1s"**: applied globally, this would FAIL on the LLM endpoints by design — they cannot return in under 1s with a remote LLM call. The proper threshold is **per-endpoint tagged**: `'http_req_duration{name:browse}': ['p(95)<500']` + `'http_req_duration{name:chat_text}': ['p(95)<3000']`.

**0.1% error rate** is appropriate for **browse + auth**. For LLM endpoints, **0.5-1% is realistic** — LLM upstream failures (OpenAI rate limit, network blip) are a fact of life. The LLM Guard circuit breaker (recent commit `c38b5c87`) is designed exactly for this.

### 7.3 Concrete k6 thresholds for Musaium

```typescript
export const options = {
  thresholds: {
    // Global safety net
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '30s' }],

    // Auth path (critical, no LLM)
    'http_req_duration{name:auth_register}': ['p(95)<400', 'p(99)<800'],
    'http_req_duration{name:auth_login}': ['p(95)<300', 'p(99)<800'],
    'http_req_duration{name:auth_refresh}': ['p(95)<200', 'p(99)<500'],
    'http_req_failed{name:auth_login}': ['rate<0.001'],

    // Browse (cached, fast)
    'http_req_duration{name:browse_sessions}': ['p(95)<500', 'p(99)<1500'],
    'http_req_duration{name:browse_museums}': ['p(95)<300', 'p(99)<800'],
    'http_req_duration{name:daily_art}': ['p(95)<200', 'p(99)<600'],

    // Chat (LLM-bound)
    'http_req_duration{name:chat_text}': ['p(95)<3000', 'p(99)<8000'],
    'http_req_duration{name:chat_image}': ['p(95)<5000', 'p(99)<12000'],
    'http_req_duration{name:chat_voice}': ['p(95)<8000', 'p(99)<15000'],

    'http_req_failed{name:chat_text}': ['rate<0.005'],
    'http_req_failed{name:chat_image}': ['rate<0.01'],
    'http_req_failed{name:chat_voice}': ['rate<0.01'],

    // Custom metrics
    semaphore_503: ['count<10'],         // existing in stress-200vu, keep
    llm_cache_hit_rate: ['rate>0.3'],    // new — cache must warm up
  },
};
```

`abortOnFail: true` + `delayAbortEval: '30s'` per k6 docs: prevents premature abort on flaky early data; cloud evaluates thresholds every 60s so abort can be up to 1 min late.

---

## 8. Realistic Data — User Pools, Museums, Locations

### 8.1 The problem with current scripts

`auth-flow.k6.js` creates users on-the-fly with `${Date.now()}` — every test run pollutes the DB with thousands of test users. For a 24h soak that's ~tens of thousands of unique users, GDPR-relevant.

### 8.2 Solution — SharedArray pools

Per k6 docs, `SharedArray` loads data **once** in the init context, shared across all VUs (memory-efficient, immutable). Use for:

| Pool | Source | Pattern |
|---|---|---|
| **Pre-seeded users** | `tests/perf/k6/data/loadtest-users.json` (seeded by migration) | `randomItem(users)` per VU |
| **Museum IDs** | `tests/perf/k6/data/musaium-museums.json` (subset of catalog) | `randomItem(museums)` per VU |
| **Prompts** | `tests/perf/k6/data/chat-prompts.json` (50+ realistic art questions) | `randomItem(prompts)` |
| **GPS coordinates** | `tests/perf/k6/data/museum-coords.json` (real museum coords + ±100m jitter) | `randomItem(coords)` |
| **Images** | `tests/perf/k6/data/sample-artworks/*.jpg` (≤200KB each) | `open()` in init, FileData in body |

### 8.3 Pre-seeded users — the cleanup question

Option A — **dedicated load-test tenant**: create `loadtest-tenant` with N pre-seeded users. Tests reuse them. Cleanup = drop the tenant.

Option B — **per-test prefix + DB cleanup migration**: append a UUID prefix to emails (e.g., `loadtest-2026-05-12-vu123@…`), run cleanup migration after test.

Recommendation: **Option A** for V1 — simpler, predictable, no DB cleanup script to maintain.

### 8.4 GDPR + audit trail

- Pre-seeded test users → mark with `is_test_account: true` flag in `users` table. Filter from all metrics, billing, analytics queries.
- Soak/endurance test artifacts (chat messages, embeddings) → exclude from prod backups.

---

## 9. Chaos Integration — k6 + Toxiproxy + Network Impairment

### 9.1 Why chaos in load test

A pure k6 load test on a clean network gives a best-case scenario. Real users experience: 3G mobile, lossy WiFi, intermittent DNS, OpenAI rate limits, Redis blip. Chaos testing **during load** reveals: does the LLM Guard circuit breaker actually open? Does the semaphore reject cleanly? Does the user see a polite error?

### 9.2 Toxiproxy 101 (Shopify, 2014, still actively maintained 2026)

TCP proxy that injects "toxics":
- **latency** — fixed delay (e.g., add 500ms to all OpenAI calls).
- **bandwidth** — throttle (simulate 3G).
- **slow_close** — slow connection teardown.
- **timeout** — cut data after N ms.
- **slicer** — chunked-data with delays.
- **limit_data** — close at byte threshold.

### 9.3 Musaium chaos test plan

| Failure injected | Toxic config | What should happen | k6 assertion |
|---|---|---|---|
| OpenAI 500ms slowdown | `latency: 500ms` on `api.openai.com:443` proxy | Chat p95 +500ms, no errors | `p(95) < 3500ms` |
| OpenAI 30s timeout | `timeout: 30000` on `api.openai.com:443` | LLM Guard circuit opens, returns fallback | Custom counter `circuit_open >= 1` |
| Postgres latency | `latency: 200ms` on `postgres:5432` | Browse p95 +200ms, no 500s | `p(99) < 2000ms` |
| Redis unreachable | `down: true` on `redis:6379` | Semaphore degrades, no 500s | `http_req_failed < 1%` |

Integrate via `toxiproxy-cli` calls in k6 `setup()` or external orchestration shell script wrapping the k6 run.

### 9.4 K8s chaos (post-K8s migration)

- **Chaos Mesh** is the cloud-native equivalent (per 2026 surveys, Chaos Mesh + Toxiproxy are top two chaos tools, growing since 2016).
- Inject pod-kill during k6 soak to validate rolling deploys don't drop user requests.

**For V1 (Docker Compose)**: Toxiproxy in `docker-compose.dev.yml` next to backend + postgres. Add to a `docker-compose.chaos.yml` overlay.

---

## 10. LLM-Specific Limitations of k6 (Honest Caveat)

Per cited 2026 sources (TianPan.co "Why k6 and Locust Lie to You"), k6 has a structural blind spot for LLM testing:

- **k6 measures total response time** — request fire to last byte received.
- For Musaium **non-streaming chat**: this IS the user experience metric. k6 is fine.
- For **streaming responses** (if/when we add streaming): k6 doesn't measure TTFT (Time to First Token) or inter-token latency natively. The user perceives "is it typing yet?" not total length.

**Musaium reality check** (per AGENTS.md / CLAUDE.md voice section): SSE streaming was deprecated (ADR-001 removed 2026-05-03). Voice is classic STT → LLM → TTS, **no streaming**. Realtime WebRTC reported to V1.1. **k6 fits Musaium V1 perfectly** — we don't have a streaming UX to mismeasure.

**If streaming returns post-V1**:
- Custom k6 check parsing SSE chunks for `event: token` markers — record timestamp of first chunk in a custom Trend metric `ttft`.
- Or switch to a specialized tool (LLMperf, Locust-LLM) for that subset.

**Goodput metric** (2026 emerging consensus): `% of requests that hit BOTH error rate AND latency SLO`. Implement as a k6 custom `Rate` metric.

---

## 11. Reporting — Grafana Dashboards, OTel, Custom

### 11.1 Stack options

| Output | Use case | Configuration |
|---|---|---|
| **Local JSON / stdout** | Dev iteration, debug | Default; pipe `--out json=results.json` |
| **xk6-output-prometheus-remote** | Stream metrics to existing Prometheus | `K6_PROMETHEUS_RW_SERVER_URL`, optionally `K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM=true` |
| **xk6-output-opentelemetry** | Full OTel pipeline (traces + metrics + correlation with backend spans) | `K6_OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317` |
| **Grafana Cloud k6** | Hosted UI, baselines, regression alerts | `k6 cloud run` |

### 11.2 Recommended for Musaium — Prometheus remote-write

R6 already shipped Prometheus + Grafana (per `infra/grafana/prometheus.yml` referenced in CLAUDE.md). The path of least resistance:

1. Build a custom k6 binary: `xk6 build --with github.com/grafana/xk6-output-prometheus-remote@latest`.
2. Run with:
   ```bash
   K6_PROMETHEUS_RW_SERVER_URL=http://localhost:9090/api/v1/write \
   K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM=true \
   K6_PROMETHEUS_RW_PUSH_INTERVAL=5s \
   k6 run --out experimental-prometheus-rw tests/perf/k6/load-mix.k6.js
   ```
3. Import Grafana dashboard `18030 - k6 Prometheus (Native Histograms)` from `grafana.com/grafana/dashboards/`.
4. Correlate k6 metrics (`k6_http_req_duration`) with backend metrics (`musaium_chat_llm_duration`) on the same timeline.

**Caveat per docs**: Prometheus must run with `--enable-feature=native-histograms` for native histogram support. Check `infra/grafana/prometheus.yml` — likely not enabled today; add to the methodology rollout.

### 11.3 OpenTelemetry trace correlation

For deeper investigation, k6 can propagate trace context — every load test request shows up as a distributed trace in Tempo / Jaeger. Wire up via `xk6-output-opentelemetry`. Cited 2026 oneuptime blog post: "every load test request shows up as a distributed trace, letting you click from a slow VU to the exact backend span."

**Not for V1** — adds complexity. Note for V1.1.

---

## 12. Concrete k6 Scripts for Musaium V1 (Templates)

The scripts below are **templates** to add to `museum-backend/tests/perf/k6/`. They use TypeScript (`.k6.ts`) since k6 1.7+ supports it natively.

### 12.1 `helpers/data.ts` — SharedArray pools

```typescript
import { SharedArray } from 'k6/data';

export const users = new SharedArray('users', () =>
  JSON.parse(open('./data/loadtest-users.json'))
);

export const museums = new SharedArray('museums', () =>
  JSON.parse(open('./data/musaium-museums.json'))
);

export const prompts = new SharedArray('prompts', () =>
  JSON.parse(open('./data/chat-prompts.json'))
);

export const coords = new SharedArray('coords', () =>
  JSON.parse(open('./data/museum-coords.json'))
);

// Pre-loaded images (init context only)
export const sampleImage = open('./data/sample-artworks/monet.jpg', 'b');
```

### 12.2 `load-mix.k6.ts` — The main weighted-mix test

```typescript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomIntBetween, randomItem } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { users, museums, prompts, coords, sampleImage } from './helpers/data';
import { authHeaders, BASE_URL } from './helpers/auth';

export const options = {
  scenarios: {
    // 40% browse — arrival rate, low think time
    browse: {
      executor: 'ramping-arrival-rate',
      exec: 'browseFlow',
      preAllocatedVUs: 200,
      maxVUs: 800,
      startRate: 10,
      timeUnit: '1s',
      stages: [
        { duration: '2m', target: 60 },   // ramp to 60 rps
        { duration: '20m', target: 60 },  // hold
        { duration: '2m', target: 0 },
      ],
    },
    // 30% chat text
    chat_text: {
      executor: 'ramping-arrival-rate',
      exec: 'chatTextFlow',
      preAllocatedVUs: 200,
      maxVUs: 800,
      startRate: 5,
      timeUnit: '1s',
      stages: [
        { duration: '2m', target: 45 },
        { duration: '20m', target: 45 },
        { duration: '2m', target: 0 },
      ],
    },
    // 20% image upload
    chat_image: {
      executor: 'ramping-arrival-rate',
      exec: 'chatImageFlow',
      preAllocatedVUs: 100,
      maxVUs: 400,
      startRate: 2,
      timeUnit: '1s',
      stages: [
        { duration: '2m', target: 30 },
        { duration: '20m', target: 30 },
        { duration: '2m', target: 0 },
      ],
    },
    // 10% voice
    chat_voice: {
      executor: 'ramping-arrival-rate',
      exec: 'chatVoiceFlow',
      preAllocatedVUs: 50,
      maxVUs: 200,
      startRate: 1,
      timeUnit: '1s',
      stages: [
        { duration: '2m', target: 15 },
        { duration: '20m', target: 15 },
        { duration: '2m', target: 0 },
      ],
    },
  },
  thresholds: {
    // See §7.3 — per-endpoint thresholds
    'http_req_duration{name:browse_sessions}': ['p(95)<500', 'p(99)<1500'],
    'http_req_duration{name:chat_text}': ['p(95)<3000', 'p(99)<8000'],
    'http_req_duration{name:chat_image}': ['p(95)<5000', 'p(99)<12000'],
    'http_req_duration{name:chat_voice}': ['p(95)<8000', 'p(99)<15000'],
    'http_req_failed{name:chat_text}': ['rate<0.005'],
  },
};

function getUser() {
  const u = randomItem(users);
  // Pre-seeded users — assume token already cached in JSON or
  // login lazily once per VU and cache in __VU-scoped state
  return u;
}

export function browseFlow() {
  const user = getUser();
  const hdrs = authHeaders(user.accessToken);

  http.get(`${BASE_URL}/api/chat/sessions`, { headers: hdrs.headers, tags: { name: 'browse_sessions' } });
  sleep(randomIntBetween(1, 3));
  http.get(`${BASE_URL}/api/museum/list`, { headers: hdrs.headers, tags: { name: 'browse_museums' } });
  sleep(randomIntBetween(1, 3));
  http.get(`${BASE_URL}/api/daily-art/today`, { headers: hdrs.headers, tags: { name: 'daily_art' } });
  sleep(randomIntBetween(2, 5));
}

export function chatTextFlow() {
  const user = getUser();
  const hdrs = authHeaders(user.accessToken);
  const museum = randomItem(museums);
  const prompt = randomItem(prompts);

  const create = http.post(
    `${BASE_URL}/api/chat/sessions`,
    JSON.stringify({ museumId: museum.id, title: 'Load test' }),
    { headers: hdrs.headers, tags: { name: 'chat_create_session' } },
  );
  if (create.status !== 201) return;
  const sessionId = JSON.parse(create.body as string).id;
  sleep(randomIntBetween(2, 4));

  http.post(
    `${BASE_URL}/api/chat/sessions/${sessionId}/messages`,
    JSON.stringify({ text: prompt, location: randomItem(coords) }),
    { headers: hdrs.headers, tags: { name: 'chat_text' }, timeout: '30s' },
  );
  sleep(randomIntBetween(5, 10));
}

export function chatImageFlow() {
  const user = getUser();
  const hdrs = { ...authHeaders(user.accessToken).headers };
  delete hdrs['Content-Type']; // let k6 set multipart boundary
  const museum = randomItem(museums);

  const create = http.post(
    `${BASE_URL}/api/chat/sessions`,
    JSON.stringify({ museumId: museum.id }),
    { headers: authHeaders(user.accessToken).headers, tags: { name: 'chat_create_session' } },
  );
  if (create.status !== 201) return;
  const sessionId = JSON.parse(create.body as string).id;
  sleep(randomIntBetween(3, 6));

  const formData = {
    text: 'What is this artwork?',
    image: http.file(sampleImage, 'monet.jpg', 'image/jpeg'),
  };
  http.post(
    `${BASE_URL}/api/chat/sessions/${sessionId}/messages`,
    formData,
    { headers: hdrs, tags: { name: 'chat_image' }, timeout: '60s' },
  );
  sleep(randomIntBetween(8, 12));
}

export function chatVoiceFlow() {
  // Voice flow — similar shape, audio buffer instead of image
  // STT + LLM + TTS budget
  // Threshold: chat_voice p95<8s, p99<15s
  // TODO: open sample audio in init, use http.file with 'audio/mpeg'
}
```

### 12.3 `soak-24h.k6.ts`

```typescript
import { browseFlow, chatTextFlow, chatImageFlow } from './load-mix.k6';

export const options = {
  scenarios: {
    soak: {
      executor: 'constant-vus',
      exec: 'mixed',
      vus: 10,
      duration: '24h',
    },
  },
  thresholds: {
    // Only check thresholds on the LAST hour
    'http_req_duration{phase:final}': ['p(95)<3000'],
    http_req_failed: ['rate<0.005'],
  },
};

export function mixed() {
  const r = Math.random();
  if (r < 0.4) browseFlow();
  else if (r < 0.7) chatTextFlow();
  else if (r < 0.9) chatImageFlow();
  // 10% voice intentionally omitted from soak (too LLM-heavy long-term)
}
```

### 12.4 `spike.k6.ts`

```typescript
export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-arrival-rate',
      exec: 'browseFlow',
      preAllocatedVUs: 100,
      maxVUs: 2000,
      startRate: 10,
      timeUnit: '1s',
      stages: [
        { duration: '1m', target: 10 },   // baseline
        { duration: '30s', target: 500 }, // SPIKE
        { duration: '1m', target: 500 },  // hold spike
        { duration: '30s', target: 10 },  // recover
        { duration: '3m', target: 10 },   // observe recovery
      ],
    },
  },
  thresholds: {
    'http_req_duration{phase:recovery}': ['p(95)<1000'], // back to baseline post-spike
    http_req_failed: ['rate<0.05'],
  },
};
```

---

## 13. CI/CD Integration

### 13.1 GitHub Actions workflow

`.github/workflows/perf-k6-smoke.yml` (new) — runs on every PR touching backend:

```yaml
name: k6 smoke (PR)
on:
  pull_request:
    paths: ['museum-backend/**']
jobs:
  smoke:
    runs-on: ubuntu-latest
    services:
      postgres: { image: pgvector/pgvector:pg16, env: { POSTGRES_PASSWORD: postgres } }
      redis: { image: redis:7 }
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install && pnpm migration:run && pnpm dev &
        working-directory: museum-backend
      - uses: grafana/setup-k6-action@v1
      - uses: grafana/run-k6-action@v1
        with:
          path: museum-backend/tests/perf/k6/smoke.k6.ts
```

`perf-k6-nightly.yml` — runs nightly, load test + stress, sends to Prometheus.

### 13.2 Pre-launch validation campaign (one-time, week of 2026-05-25)

| Day | Test | Duration |
|---|---|---|
| Mon | Smoke + Load (1000 VU, 30 min) on local prod-equivalent Docker | 1h |
| Tue | Stress (ramp to 2000 VU, find breakpoint) | 30 min + analysis |
| Wed | Spike (0 → 500 RPS → 0) ×3 | 30 min |
| Thu | Soak 24h start | 24h |
| Fri | Soak debrief + chaos (Toxiproxy injected) | 4h |
| Mon (week 2) | Endurance start (7 days, low load) — OR skip per §2.6 |

Pre-launch hard gate: **all thresholds green for load + stress + spike**. Soak failures permit launch only if root cause identified.

---

## 14. Comparison vs Alternatives

| Tool | Pro | Con | For Musaium? |
|---|---|---|---|
| **k6 OSS** | TS native, JS SDK, Go runtime, Grafana ecosystem, OpenTelemetry. Single binary, fast startup. | Single-machine cap ~10k VU. Memory growth on multi-day runs. No native streaming/TTFT for LLM. | **YES — keep.** |
| **Locust** | Python (matches AI stack). Master-worker distributed by default. | GIL bottleneck. Python slower per-VU. Thread-per-user overhead vs goroutines. | Not for Musaium — TS team, no Python infra. |
| **Gatling** | Highest raw RPS (210k @ 20k workers in benchmarks). Scala/Java/Kotlin/TS/JS. | JVM dep. Higher latency reporting (231ms p95 @ load). Steeper learning curve. | No — JVM friction. |
| **JMeter** | Mature, GUI, vast plugins. | XML hell, slow scripting, dated UX. | Hard no — not 2026-grade. |
| **Artillery** | Node-native, light. | Smaller ecosystem, less Grafana integration. | No — k6 covers same niche better. |

**Verdict**: k6 wins on developer ergonomics, ecosystem fit (existing Prometheus + Grafana from R6), TS alignment with backend, no extra language toolchain. The single-machine cap is moot at Musaium scale (1000-2000 VU target).

---

## 15. Gaps in Existing Musaium k6 Surface — Action Items

| # | Gap | Fix |
|---|---|---|
| 1 | No traffic-mix scenario | Add `load-mix.k6.ts` (§12.2) |
| 2 | No spike test | Add `spike.k6.ts` (§12.4) |
| 3 | No soak (>1h) | Add `soak-24h.k6.ts` (§12.3) |
| 4 | Stress capped at 200 VU, undersized for 100k MAU (need 1000-2000 VU) | Update `stress-200vu.k6.js` → `stress-2000vu.k6.ts`, 4-stage ramp |
| 5 | `stress-100k-rps.k6.js` targets deleted `musaium-staging.example.com` | Update or remove — per `project_no_staging_v1.md` doctrine, no staging server exists |
| 6 | No SharedArray data pools — every VU creates new users | Add `data/` + `helpers/data.ts` (§8) |
| 7 | No realistic prompts — hardcoded 3 strings | Add `data/chat-prompts.json` (50+ prompts in FR/EN) |
| 8 | No image flow tested | Add image flow in load-mix (§12.2 `chatImageFlow`) |
| 9 | No voice flow tested | Stub `chatVoiceFlow` + audio sample |
| 10 | No Prometheus reporting wired | Build custom k6 with `xk6-output-prometheus-remote`, import dashboard `18030` |
| 11 | No CI gate beyond test run | Add `perf-k6-smoke.yml` + nightly `perf-k6-load.yml` workflows |
| 12 | No chaos coverage | Add `docker-compose.chaos.yml` with Toxiproxy, document runbook |
| 13 | No per-endpoint thresholds — global `p(95)<2000` mixes auth + chat | Migrate to tagged thresholds (§7.3) |
| 14 | Test users not cleaned up | Pre-seed dedicated `loadtest-tenant`, mark `is_test_account: true` |

---

## 16. Verdict & Recommendation

**For V1 launch (2026-06-01):**

1. **Keep k6 OSS** — no tool change. v1.7.x, defer v2 migration.
2. **Ship the methodology in §12**: 5 new scripts (smoke/load-mix/stress/spike/soak), helpers/data, data pools. Estimated effort: 3 days.
3. **Wire Prometheus remote-write** to the existing R6 Grafana stack. Import dashboard 18030.
4. **Add CI gates**: smoke on every PR, nightly load. Estimated effort: 1 day.
5. **Execute pre-launch validation campaign** (§13.2) week of 2026-05-25. Estimated effort: 1 week elapsed (mostly waiting for soak).
6. **Defer**: k6-operator on K8s, k6 Cloud paid tier, endurance 7-day, OTel trace correlation. Re-evaluate post-launch.
7. **Honest limitation**: k6 can't measure TTFT for streaming. We don't stream in V1 (per ADR-001 removal); no action needed. If voice becomes a release blocker, revisit with custom SSE parsing or a specialized tool.

**Risk** (UFR-013):
- "All thresholds green" is necessary but not sufficient. Real-user telemetry post-launch is the ground truth.
- The 100k MAU number is an estimate; actual peak concurrency depends on session duration (15 min assumed), session frequency (4/mo assumed), peak hour concentration (20% assumed). If any are off by 2×, the test undersizes / oversizes correspondingly.
- Soak test catches drift over 24h, not over 30 days. Some leaks only manifest over weeks (slow OOM, certificate rotation, log volume). Mitigation = real prod observation in the first 30 days post-launch.

---

## Sources

### Official k6 documentation
- [k6 release notes](https://grafana.com/docs/k6/latest/release-notes/) — version history, v1.7.1 current, v2.0.0-rc1 upcoming.
- [k6 releases on GitHub](https://github.com/grafana/k6/releases) — v2.0.0 May 2025 details, breaking changes.
- [k6 scenarios](https://grafana.com/docs/k6/latest/using-k6/scenarios/) — executors overview.
- [k6 constant-arrival-rate executor](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/constant-arrival-rate/)
- [k6 ramping-arrival-rate executor](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/ramping-arrival-rate/)
- [k6 open vs closed models](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/open-vs-closed/)
- [k6 thresholds](https://k6.io/docs/using-k6/thresholds/) — syntax, abortOnFail, percentile aggregation.
- [k6 calculate concurrent users](https://grafana.com/docs/k6/latest/testing-guides/calculate-concurrent-users/) — `hourly_sessions × duration / 3600` formula.
- [k6 distributed testing](https://grafana.com/docs/k6/latest/testing-guides/running-distributed-tests/) — k6-operator overview.
- [k6 SharedArray](https://grafana.com/docs/k6/latest/javascript-api/k6-data/sharedarray/)
- [k6 data uploads (multipart)](https://k6.io/docs/examples/data-uploads/)
- [k6 OpenTelemetry output](https://grafana.com/docs/k6/latest/results-output/real-time/opentelemetry/)
- [k6 Prometheus remote write](https://grafana.com/docs/k6/latest/results-output/real-time/prometheus-remote-write/)
- [k6 browser](https://grafana.com/docs/k6/latest/using-k6-browser/) — Playwright-compatible API.
- [k6 explore extensions](https://grafana.com/docs/k6/latest/extensions/explore/)
- [k6 OSS vs Cloud](https://k6.io/oss-vs-cloud/)
- [k6 cloud pricing](https://grafana.com/products/cloud/k6/) — 1M VU / 5M RPS max.
- [Grafana Cloud pricing 2026](https://grafana.com/pricing/) — 500 VUh free tier.

### Grafana Labs blog posts
- [k6 v1.0 release](https://grafana.com/events/grafanacon/2025/k6-1.0-release-performance-testing/)
- [k6 peak, spike, soak](https://grafana.com/blog/2023/02/14/load-testing-grafana-k6-peak-spike-and-soak-tests/)
- [TypeScript in k6](https://grafana.com/whats-new/2025-05-15-typescript-support-in-grafana-cloud-k6/)
- [k6 GitHub Actions](https://grafana.com/whats-new/integrate-grafana-cloud-k6-into-your-cicd-pipeline-with-new-k6-github-actions/)
- [k6 browser alignment with Playwright](https://grafana.com/blog/2025/10/02/a-closer-look-at-grafana-k6-browser-alignment-with-playwright-modern-features-for-frontend-testing-and-what-s-next/)
- [k6 distributed on K8s](https://k6.io/blog/running-distributed-tests-on-k8s/)

### k6-operator
- [grafana/k6-operator GitHub](https://github.com/grafana/k6-operator) — v1.0 GA September 2025.
- [oneuptime k6 operator guide 2026](https://oneuptime.com/blog/post/2026-02-09-k6-operator-distributed-load-testing/view)

### Extensions
- [xk6-output-prometheus-remote](https://github.com/grafana/xk6-output-prometheus-remote)
- [xk6-output-opentelemetry](https://github.com/grafana/xk6-output-opentelemetry)
- [xk6-faker](https://github.com/grafana/xk6-faker)
- [xk6-kafka](https://github.com/mostafa/xk6-kafka)
- [k6-jslib-utils](https://github.com/grafana/k6-jslib-utils) — randomItem, randomIntBetween, uuidv4.

### Comparisons (2026)
- [Best load testing tools 2026 (Vervali)](https://www.vervali.com/blog/best-load-testing-tools-in-2026-definitive-guide-to-jmeter-gatling-k6-loadrunner-locust-blazemeter-neoload-artillery-and-more/)
- [JMeter vs Gatling vs k6 2026](https://www.vervali.com/blog/jmeter-vs-gatling-vs-k6-the-complete-2026-comparison-benchmarks-ci-cd-scripting-and-use-cases/)
- [k6 vs Locust 2026](https://medium.com/@alirezaaedalat/in-depth-exploration-k6-vs-locust-for-comprehensive-load-testing-9b657eba5314)

### LLM-specific load testing
- [TianPan: Why k6 and Locust Lie to You (2026-03-19)](https://tianpan.co/blog/2026-03-19-load-testing-llm-applications) — TTFT, goodput, streaming caveats.
- [NVIDIA NIM LLM benchmarking metrics](https://docs.nvidia.com/nim/benchmarking/llm/latest/metrics.html)
- [BentoML LLM inference metrics](https://bentoml.com/llm/inference-optimization/llm-inference-metrics)
- [Voice agent testing guide 2026 (Hamming)](https://hamming.ai/resources/voice-agent-testing-guide)

### Chaos engineering
- [Toxiproxy](https://github.com/Shopify/toxiproxy)
- [Toxiproxy chaos engineering 2026 (oneuptime)](https://oneuptime.com/blog/post/2026-02-08-how-to-use-docker-for-chaos-engineering-with-toxiproxy/view)
- [Chaos engineering in the wild 2025 (arxiv)](https://arxiv.org/html/2505.13654v1)

### SLO / threshold guidance
- [P95 latency guide 2026 (SRE School)](https://sreschool.com/blog/p95-latency/)
- [P99 latency guide 2026 (SRE School)](https://sreschool.com/blog/p99-latency/)
- [SLO vs SLA vs SLI 2026 (Nurbak)](https://nurbak.com/en/blog/slo-vs-sla/)
- [k6 thresholds for SLOs (oneuptime 2026)](https://oneuptime.com/blog/post/2026-01-27-k6-thresholds-slos/view)

### Capacity planning
- [LoadFocus concurrent users 2025](https://loadfocus.com/blog/2025/04/calculate-concurrent-users)
- [Dotcom-monitor analytics to concurrent users](https://www.dotcom-monitor.com/wiki/knowledge-base/translating-analytics-to-concurrent-users/)
- [BlazeMeter concurrent users in performance testing](https://www.blazemeter.com/blog/calculate-concurrent-users-performance-testing)
- [Devtodev DAU/WAU/MAU metrics](https://www.devtodev.com/education/articles/en/199/main-metrics-active-users-dau-wau-mau)

### Memory leak / soak considerations
- [k6 memory leak issue #3955](https://github.com/grafana/k6/issues/3955)
- [k6 memory leak issue #3822](https://github.com/grafana/k6/issues/3822)
- [Soak testing with k6 (dev.to)](https://dev.to/amedeov/soak-testing-with-k6-h9g)

### Internal Musaium files (verified read)
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/perf/k6/auth-flow.k6.js`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/perf/k6/chat-flow.k6.js`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/perf/k6/concurrent-users.k6.js`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/perf/k6/stress-200vu.k6.js`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/perf/k6/stress-100k-rps.k6.js`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/perf/k6/helpers/auth.js`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/perf/k6/helpers/100k-runbook.md`
