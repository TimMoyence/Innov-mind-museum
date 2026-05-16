# F1 — LLM Guard sidecar scaling fix

> **Author:** F1 critical-gap agent · **Date:** 2026-05-13 · **Status:** Proposal
> **Honesty caveat (UFR-013):** all `file:line` references verified by `Read` on
> commit `e45490c1`. Latency numbers from `protectai/llm-guard` benchmarks are
> upstream-quoted, **not** measured in Musaium prod — VPS perf gap acknowledged
> per the in-tree `docker-compose.guardrails.yml` comment (§ ops). No k6 burst
> run has yet been executed against the deployed sidecar; the "Test plan" below
> is methodology to be executed, not a results report.

---

## TL;DR

The LLM Guard sidecar is the single load-bearing point of the chat safety stack
(ADR-047) and, today, **the single point of failure of chat itself**: one CPU-
bound Python process behind `LLM_GUARD_MAX_INFLIGHT=8` /
`LLM_GUARD_QUEUE_MAX=32` (`env.ts:429-430`). Past 8 concurrent + 32 queued
requests, every additional chat message fail-CLOSES with `service_unavailable`,
which under ADR-047 is the **correct** behavior — the wrong thing is that we
can't tolerate >40 inflight scans before that path kicks in.

The fix that matches "pre-launch V1, no feature flags, no premature ops
sophistication" doctrine is a **three-layer change**:

1. **Horizontal sidecar replicas behind Docker DNS round-robin** (2 replicas, then
   3) — the runbook (`docs/OPS_INCIDENT_LLM_GUARD.md:62-70`) already documents
   the command, the compose file already comments the path
   (`docker-compose.guardrails.yml:58-65`). Today this is a manual `--scale 2`
   command, never automated. Goal: make it the default.
2. **Per-user upstream rate limit on `POST /chat`** (token bucket, Redis-backed,
   ~20 msg/min/user) so a single abusive client cannot exhaust the inflight
   budget for the whole product. We already have Redis (`env.redis`).
3. **Raise `LLM_GUARD_MAX_INFLIGHT` 8 → 16 and `LLM_GUARD_QUEUE_MAX` 32 → 64**
   **only after** the replica count goes ≥ 2, so the bulkhead matches the new
   physical fan-out budget.

We **do not** recommend a "degraded mode that skips LLM Guard for low-risk
queries" — ADR-047 explicitly rules out that path (fail-OPEN under any
condition requires a superseding ADR + security review). We **do not**
recommend a read-only chat fallback either: in a museum-tour app it is
indistinguishable from "broken" for the user, while creating a second code
path the safety guarantees have to be re-proven on.

---

## 1. Current state — verified

### 1.1 Adapter (the consumer)

`museum-backend/src/modules/chat/adapters/secondary/guardrails/llm-guard.adapter.ts`

The adapter is a thin HTTP translator with three defensive layers stacked
in this order — every layer **can short-circuit to `failClosed`**:

```ts
// llm-guard.adapter.ts:240-254
private async scan(path: string, body: Record<string, unknown>): Promise<GuardrailVerdict> {
  this._metricsRequests += 1;

  // Fail-CLOSED contract preserved during breaker OPEN window — see ADR-047.
  if (!this.circuitBreaker.canAttempt()) {
    logger.warn('llm_guard_circuit_breaker_skip', { state: this.circuitBreaker.state, path });
    llmGuardCircuitBreakerSkipsTotal.inc({ path, reason: 'breaker' });
    ...
    return this.failClosed('service_unavailable');
  }
```

```ts
// llm-guard.adapter.ts:257-273
  // Concurrency cap. Overflow → fail-CLOSED (ADR-047), no fan-out to a saturated sidecar.
  try {
    await this.semaphore.acquire();
  } catch (e) {
    if (e instanceof ScanSemaphoreOverflowError) {
      logger.warn('llm_guard_semaphore_overflow', { path, stats: this.semaphore.getStats() });
      ...
      return this.failClosed('service_unavailable');
    }
    throw e;
  }
```

```ts
// llm-guard.adapter.ts:309-320  (inside scanOverHttp)
  if (!response.ok) {
    this.circuitBreaker.recordFailure();
    logger.warn('llm_guard_non_ok_fail_closed', { status: response.status, path });
    return { verdict: this.failClosed('error'), outcome: 'fail_closed' };
  }

  const raw = (await response.json()) as Partial<ScanResponse>;
  if (typeof raw.is_valid !== 'boolean') {
    this.circuitBreaker.recordFailure();
    logger.warn('llm_guard_malformed_fail_closed', { path });
    return { verdict: this.failClosed('error'), outcome: 'fail_closed' };
  }
```

So `scan()` will fail-CLOSED on **breaker-open / semaphore-overflow / HTTP-5xx
/ malformed JSON / abort/timeout / generic network error** — six branches, all
returning `{ allow: false, reason: 'service_unavailable' | 'error' }`. This is
the contract; the user impact is that the chat UI displays the canned
"unsafe_output" refusal.

### 1.2 Bulkhead (concurrency cap)

`museum-backend/src/modules/chat/adapters/secondary/guardrails/scan-inflight-semaphore.ts`

```ts
// scan-inflight-semaphore.ts:44-58
export class ScanInflightSemaphore {
  private inFlight = 0;
  private readonly queue: (() => void)[] = [];

  constructor(
    private readonly maxInflight: number,
    private readonly queueMax: number,
  ) { ... }
```

Wired to env values (`chat-module.ts:464-467`):

```ts
const semaphore = new ScanInflightSemaphore(
  env.guardrails.maxInflight,   // env.ts:429 — LLM_GUARD_MAX_INFLIGHT=8 default
  env.guardrails.queueMax,      // env.ts:430 — LLM_GUARD_QUEUE_MAX=32 default
);
```

**Total per-process budget = 8 inflight + 32 queued = 40 scan requests in
flight before fail-CLOSED.** Because **`checkInput` and `checkOutput` are
called sequentially per chat message** (input scan before LLM, output scan
after), one chat turn consumes **two slots** at different times — not
simultaneously. So **40 budget ≈ 40 chat turns inflight per backend
process at the worst moment.**

### 1.3 Circuit breaker

`guardrail-circuit-breaker.ts` (228 lines). Three-state FSM (CLOSED / OPEN /
HALF_OPEN) with the env knobs documented in `env.ts:419-424`. Defaults:

| Knob | Default | Source |
|---|---|---|
| `LLM_GUARD_CB_FAILURE_THRESHOLD` | 5 | `env.ts:420` |
| `LLM_GUARD_CB_WINDOW_MS` | 60_000 | `env.ts:421` |
| `LLM_GUARD_CB_OPEN_DURATION_MS` | 30_000 | `env.ts:422` |
| `LLM_GUARD_CB_HALF_OPEN_MAX_PROBES` | 1 | `env.ts:423` |

The breaker is **shared between input and output legs** of the same request
(`chat-module.ts:417-421` comment block: "single breaker instance per process").

### 1.4 Sidecar (the bottleneck)

`museum-backend/ops/llm-guard-sidecar/`

- **Python 3.11 + FastAPI + Uvicorn** (single worker) per `Dockerfile:81`:
  `CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8081"]` — **no
  `--workers N` flag**. One async event loop, one process.
- Four input scanners (`PromptInjection,BanTopics→Anonymize,Toxicity`) +
  four output scanners (`NoRefusal,Bias,Sensitive,Relevance`) per
  `docker-compose.guardrails.yml:36-46`. Two of them (PromptInjection,
  Anonymize) are HuggingFace transformer models — CPU-bound, **blocking**
  inside `app.py:149-157`:

  ```python
  @app.post("/scan/prompt", response_model=ScanResponse)
  def scan_prompt(req: PromptScanRequest) -> ScanResponse:
      sanitized, results_valid, results_score = llm_scan_prompt(
          state["input_scanners"], req.prompt
      )
      ...
  ```

  These are `def` not `async def`, so FastAPI offloads them to a thread pool
  — but the **GIL serializes Python bytecode** anyway, and the actual
  transformer inference is the CPU bottleneck regardless. One Uvicorn worker
  = effectively one inference at a time at the model layer.

- **Single replica** in production today. `docker-compose.guardrails.yml:58-65`
  comments the horizontal scaling path *as a manual command*:

  ```yaml
  # Horizontal scaling path (production capacity): `docker compose -f
  # deploy/docker-compose.prod.yml up -d --scale llm-guard=2`. Docker
  # service-name DNS resolves to all replica IPs (undici keep-alive pool
  # round-robins). NOT changed here pre-launch to avoid coupling the safety
  # hotfix to an ops procedure change. Runbook references this command path
  # under "Recovery actions / Scale up". See docs/OPS_INCIDENT_LLM_GUARD.md.
  ```

- Image is **2.5 GB** (`Dockerfile:8`: "Image size note: ~2.5 GB with preloaded
  HF models"); RAM budget ~2 GB per replica per `OPS_INCIDENT_LLM_GUARD.md:38`
  ("llm-guard target: < 2 GB / 4 GB host budget").

### 1.5 Timeout

Raised 300 ms → 500 ms → **1500 ms** on the 2026-05-12 incident
(`docker-compose.guardrails.yml:70-78`, `env.ts:392-399`). Two scans per chat
turn ⇒ **up to ~3 s of guardrail overhead on the happy path**, plus the LLM
itself, plus TTS. This is in ADR-047 §"Consequences" as a known cost.

### 1.6 Failure modes — what actually happens

Mapping each saturation point to what the user sees:

| Trigger | Code path | User-facing result |
|---|---|---|
| ≤ 8 concurrent /scan in process | semaphore green-light | Normal |
| 9–40 concurrent (8 inflight + ≤ 32 queued) | semaphore queues | Latency +Δ ; chat works |
| 41st concurrent /scan | `ScanSemaphoreOverflowError` → `failClosed('service_unavailable')` | "Désolé, message indisponible" canned refusal |
| Sidecar CPU saturated → /scan timeout hit | `AbortController` fires, `recordFailure()` | Same canned refusal **and** failure counter +1 |
| 5 timeouts within 60 s window | breaker trips OPEN for 30 s | All chat fail-CLOSED for 30 s |
| Sidecar container dead | Connection refused, `recordFailure()` | Same as timeout path |
| HF model load OOM mid-flight | 5xx, `recordFailure()` | Same path |

The semaphore **caps** the failure rate (saturated sidecar can't be pushed
deeper into the death spiral), but **does not preserve service availability**
— it converts "every request hangs for 1.5 s then errors" into "every request
fails fast for 0 ms". Both are 100 % chat-broken from the user's POV.

The **30 s breaker open window** is the worst single artefact: even after the
sidecar is healthy again, chat stays fail-CLOSED until either the cooldown
elapses or the operator manually raises `LLM_GUARD_CB_FAILURE_THRESHOLD` per
the runbook (3.4).

---

## 2. LLM Guard architecture 2026 — what upstream supports

### 2.1 Upstream deployment story

`protectai/llm-guard` ships:

1. **Python library** — embed in-process (no sidecar). Highest perf, lowest
   isolation. **Not** what Musaium uses.
2. **`llm_guard_api`** — official FastAPI server with **gunicorn `--preload`
   worker support** per the [deployment docs](https://protectai.github.io/llm-guard/api/deployment/):
   "Production deployment with gunicorn supporting multiple workers with
   preloaded models." Memory requirement: **16 GB RAM** allocated to Docker
   for the full scanner set.
3. **Docker Hub image** — same as #2, container-packaged.

Musaium's sidecar at `ops/llm-guard-sidecar/` is **a custom FastAPI wrapper**
(see `app.py:107` `app = FastAPI(title="LLM Guard POC Sidecar", version="0.1.0")`)
because the official `llm_guard_api` endpoint shape didn't match our
`ScanResponse` contract at the time. We reuse the upstream Python
**scanner library**, not the upstream server.

The upstream server uses **gunicorn `--preload`** so transformer model weights
are loaded **once in the master process** and `fork()`-shared across N
workers via Linux Copy-on-Write — net memory cost is roughly `model_weight ×
1` instead of `× N`. This is the [standard pattern](https://medium.com/trendyol-tech/sharing-large-language-models-among-gunicorn-workers-reducing-memory-usage-and-boosting-18c0efd8e942)
for sharing NLP models across gunicorn workers; one real-world case quoted
"70%+ memory reduction" by enabling `--preload`. **Our sidecar does not use
gunicorn** — Dockerfile line 81 uses `uvicorn` directly, single-worker.

### 2.2 Scanner latencies — upstream numbers

From the upstream
[prompt_injection.md](https://github.com/protectai/llm-guard/blob/main/docs/input_scanners/prompt_injection.md)
docs (single PromptInjection scanner only, not the full chain):

| Infra | Avg latency | QPS |
|---|---|---|
| AWS m5.xlarge CPU | 212.87 ms | 1803 |
| AWS m5.xlarge + ONNX | 104.21 ms | 3684 |
| AWS g5.xlarge GPU | 81.01 ms | 4739 |
| AWS g5.xlarge GPU + ONNX | 7.65 ms | 50_216 |
| Azure Standard_D4as_v4 | 421.46 ms | 911 |

Musaium prod runs on **an OVH VPS** (`docs/OPS_DEPLOYMENT.md` reference in
CLAUDE.md). Without an explicit prod-vCPU spec in the audit corpus, the closest
comparable is the Azure D4as_v4 row at **~421 ms/scan for a single
PromptInjection scanner**. Add Anonymize + Toxicity for input, plus the
output chain (Sensitive runs Presidio NER), and **a measured 1.5 s timeout
ceiling is plausible** even before traffic surges — consistent with the
incident root cause documented in
`ADR-047 §Context`: "the sidecar CPU-bound P95 latency on the production VPS
exceeded the 500 ms timeout."

ONNX optimization is **available but not enabled** in our sidecar
([upstream tutorial](https://github.com/protectai/llm-guard/blob/main/docs/tutorials/optimization.md)).
Enabling it would cut latency ~2× on CPU, plausibly bringing the chain back
under 500 ms. Tradeoff: ONNX dependency adds ~600 MB to the image and a
build step. Out of scope of this scaling fix but worth a follow-up audit.

### 2.3 Statelessness — confirmed

Reading our `app.py:32-105`: the only mutable in-process state is `state =
{"input_scanners": [...], "output_scanners": [...], "vault": Vault()}`,
populated at FastAPI lifespan startup and **never mutated per request**. The
`Vault` is used by the `Anonymize` scanner to deanonymize on output — but in
our wiring the input `Anonymize` and output `Sensitive` are **distinct
scanners with independent state**, so two sidecar replicas do not need to
share session state for a single user's input+output round-trip.

**Conclusion: the sidecar is stateless across requests, suitable for
round-robin DNS load balancing without sticky sessions.** This is also stated
in `docker-compose.guardrails.yml:60-62`: "Docker service-name DNS resolves
to all replica IPs (undici keep-alive pool round-robins)."

### 2.4 Undici round-robin caveat

Per the [undici discussion on DNS](https://github.com/nodejs/undici/discussions/2382)
and [issue #3350](https://github.com/nodejs/undici/issues/3350): undici
**does not redo DNS lookups for an open keep-alive connection**. Once a
connection to a sidecar IP is established, it stays pinned to that IP until
the keep-alive timeout expires (default 4 s `keepAliveTimeout`).

For Docker DNS round-robin across 2-3 replicas this is **fine** in
steady-state: each backend Node process will eventually open connections to
all replicas, and the per-connection request load round-robins on TCP, not
on DNS. The death scenario is: a replica dies, connections pinned to its IP
all time out simultaneously, **and the breaker trips on the survivor for the
other backend Node process** because retries don't redo DNS during the
keep-alive window. Mitigation: enable
[undici's DNS interceptor](https://undici.nodejs.org/) which forces
re-resolution and caches DNS with explicit TTL. **Out of scope of the
immediate fix but flagged as a follow-up.**

---

## 3. Sizing model — 100k MAU at expected chat QPS

### 3.1 MAU → QPS estimate (Musaium-specific)

Per the Musaium product profile (assistant balade culturelle, **voice-first**,
**B2C freemium + B2B museum**), a chat message ≠ a HTTP message. One user
"turn" = STT + LLM + TTS, and our session lifecycle has user messages
clustered tightly around museum visits. Rough cut:

| Quantity | Value | Source / assumption |
|---|---|---|
| MAU | 100 000 | Mission brief |
| DAU / MAU ratio | 15 % | Industry standard for travel/leisure apps |
| DAU | 15 000 | Derived |
| Avg session length | 45 min (1 museum visit) | Product spec proxy |
| Avg chat turns / session | 30 | One turn / 90 s on a visit |
| Daily turns total | 450 000 | DAU × turns |
| Peak hour share | 12 % | Lunchtime visit peak |
| Peak hour turns | 54 000 | 12 % × daily |
| Peak QPS (chat turn) | 15 | 54 000 / 3600 |
| Peak scan QPS (turn × 2) | 30 | input scan + output scan |

**Headline number: 30 /scan QPS peak.** That's per process, before considering
multiple backend replicas — but since our backend is 1 Docker process today
(per the runbook), it stays 30.

### 3.2 Capacity from upstream latency numbers

Single Uvicorn worker, no ONNX, on a VPS-class instance (Azure-D4as proxy):
**421 ms PromptInjection × 4 chained scanners ≈ 1.5 s** worst case. Inflight
budget at 1.5 s/scan = `30 QPS × 1.5 s = 45 concurrent /scan calls`.

**Current `LLM_GUARD_MAX_INFLIGHT=8 + QUEUE_MAX=32 = 40 budget < 45 needed.**

Even **without** a burst, the steady-state 100k-MAU peak hour will saturate
the bulkhead on a single sidecar process. Add Black-Friday-style 2× burst and
we're at 90 concurrent — 2.25× over budget.

### 3.3 Replica count needed

If we treat one replica = one Uvicorn process ≈ one inference at a time at
the model layer, then:

- **1 replica** (today) — 40 budget, 30 QPS steady-state, **saturates on
  every meaningful burst**.
- **2 replicas** — 80 budget, ~60 QPS steady-state ceiling, handles peak +
  1.5× burst.
- **3 replicas** — 120 budget, ~90 QPS, handles peak + 2× burst.

**Recommendation: 2 replicas as the V1 default; 3 replicas if memory budget
allows.** Per runbook 3.3 (`OPS_INCIDENT_LLM_GUARD.md`): `2 × 2 GB sidecar +
1 GB backend + 256 MB postgres < 6 GB on 8 GB VPS`. So **2 replicas is the
realistic ceiling on the current 8 GB OVH host**; 3 replicas requires either
a host bump or dropping one OUTPUT_SCANNER (Bias is named in the runbook as
the lowest priority).

### 3.4 Bulkhead recalibration

With 2 replicas behind round-robin DNS:

- Per-replica steady-state target: 15 QPS = ~22 concurrent at 1.5 s/scan.
- Per-replica overhead margin (2× burst): ~45 concurrent.
- **`LLM_GUARD_MAX_INFLIGHT=16` × 2 replicas = 32 concurrent inflight across
  the fleet, matches expected steady-state with margin.**
- **`LLM_GUARD_QUEUE_MAX=64` per backend process** → can absorb ~80 backlog
  before fail-CLOSING.

Note: the semaphore is **per-backend-process**, not per-sidecar-replica. If
we ever go multi-backend-process, the math compounds — but for the
single-backend / 2-sidecar configuration this is the right balance.

---

## 4. Concrete fix — what to change, where, why

### 4.1 Layer A — horizontal sidecar replicas (the meat)

**File: `museum-backend/docker-compose.guardrails.yml`**

Today the overlay has `services.llm-guard` with no `deploy.replicas`. Add:

```yaml
services:
  llm-guard:
    deploy:
      replicas: 2
      resources:
        limits:
          memory: 2G
```

Note: `deploy.replicas` is honored by `docker compose up --scale` and by
**Swarm mode** but **silently ignored by plain `docker compose up`** without
the `--scale` flag. So in the **same PR** we update the deployment runbook
to make `docker compose up -d --scale llm-guard=2` the **default startup
command** in `OPS_DEPLOYMENT.md` and `_deploy-backend.yml`, **not** the
"recovery action" of `OPS_INCIDENT_LLM_GUARD.md:62-70`.

This isn't a feature flag (consistent with
`feedback_no_feature_flags_prelaunch`) — it's an ops procedure change made
the default. The runbook 3.3 ("Scale up (capacity)") becomes obsolete because
scaling-up is the day-zero posture; the runbook entry stays for the "scale to
3 in incident response" case.

### 4.2 Layer B — per-user rate limit on `/chat` (defense in depth)

**Where:** `museum-backend/src/modules/chat/adapters/primary/http/`

**What:** add `express-rate-limit` middleware with the
[`rate-limit-redis`](https://www.npmjs.com/package/rate-limit-redis) store,
keyed by **authenticated user ID** (falling back to IP for anonymous flows).
Token-bucket semantics, ~20 messages/minute/user (matches the Stream Chat
sizing baseline from the search results) with burst tolerance of 5.

**Why:** the sidecar bulkhead protects the **sidecar**, not the **fleet
budget**. A single abusive client today can fan out 40 simultaneous /chat
calls and drain the entire bulkhead, making chat fail-CLOSED for every other
user across the whole product. Per-user rate-limit upstream of the
guardrail means abuse is bounded to that one user's quota; the fleet is
preserved.

We already have Redis (`env.redis` parsed unconditionally) so this is a pure
middleware add — no infra change. **Fail-open on Redis unavailable** per the
[express-rate-limit guidance](https://www.npmjs.com/package/express-rate-limit)
("always fail open when Redis is unavailable to prevent the rate limiter
from becoming a single point of failure"): this is **not** a security gate
(LLM Guard is), just an abuse-prevention layer.

### 4.3 Layer C — raise the bulkhead bounds **after** A is deployed

**Files:** `museum-backend/src/config/env.ts:429-430` and `.env*`.

Order matters:

1. Deploy A (2 replicas) and verify p95 `/scan` < 800 ms.
2. **Then** raise `LLM_GUARD_MAX_INFLIGHT` 8 → 16 and `LLM_GUARD_QUEUE_MAX`
   32 → 64.
3. Re-run k6 burst (§6) to confirm the breaker no longer trips under target
   load.

Doing C before A would push more concurrent work into a single
already-saturated sidecar — strictly worse (the very death-spiral the
semaphore was added to prevent in ADR-047).

### 4.4 What we **rejected** and why

| Proposal | Decision | Reason |
|---|---|---|
| Degraded mode: skip LLM Guard for "low-risk" queries | **Reject** | Violates ADR-047 §"Decision". The keyword guardrail upstream is documented as **intentionally weaker** than the sidecar (`ADR-047 §Context`). A "fast-path bypass" is fail-OPEN by another name, and per ADR-047 requires a superseding ADR + security review documenting the threat class accepted. Pre-launch V1 doctrine (no feature flags) makes a per-query bypass a non-starter. |
| Read-only chat fallback when sidecar down | **Reject** | "Read-only chat" doesn't map to product (Musaium chat = voice-first dialog about an artwork; there is nothing to "read" without a turn). Creating a second code path doubles the safety surface to validate. The fail-CLOSED canned refusal is already the read-only behavior — improving its copy would help, but that's a UX fix, not a scaling fix. |
| Replace the breaker with `opossum` 9.x | **Reject for this PR** | Opossum 9.x [supports the bulkhead pattern](https://nodeshift.dev/opossum/) natively via the `capacity` option, **and** would eliminate our custom breaker/semaphore code. But: (1) `GuardrailCircuitBreaker` and `ScanInflightSemaphore` are 228 + 108 lines, just landed, just code-reviewed, just shipped (commit `e45490c1`). (2) Opossum `capacity` rejects-on-overflow but doesn't queue — we'd lose the FIFO queue semantics. Worth a follow-up ADR post-launch; not the right surgery on the day-2 incident response. |
| ONNX optimization of the sidecar | **Out of scope, follow-up** | Cuts latency ~2× per the upstream benchmark, which would push the chained-scanner P95 well under 500 ms even on the VPS — addresses the root cause of the original 2026-05-12 incident more durably than scaling. Belongs in its own ADR (model artifact change, image-size impact, scanner-by-scanner validation). |
| Switch sidecar from Uvicorn-single-worker to `gunicorn --preload --workers N` | **Out of scope, follow-up** | The "[shared NLP models across gunicorn workers](https://medium.com/trendyol-tech/sharing-large-language-models-among-gunicorn-workers-reducing-memory-usage-and-boosting-18c0efd8e942)" pattern would extract ~3-4× throughput per replica via fork-shared model weights. But: changes `Dockerfile` and the upstream-quoted "scanners loaded at startup" lifespan model. Worth a focused PR after the horizontal-scaling change has bedded in. |

---

## 5. Migration plan — 3 steps

**Pre-flight (T-1 day):**
- Run k6 baseline (§ 6.1) against current single-replica deploy to capture
  the "before" curve. **Don't skip this** — without a baseline the rollout's
  improvement claim is unverifiable (UFR-013).
- Confirm 8 GB VPS RAM headroom: `ssh ops@vps "free -m"`.
- Verify the `--scale llm-guard=2` command works end-to-end on **a copy of
  prod** (the local Docker stack in `docker-compose.dev.yml` is too thin a
  proxy — model load takes 3-4 min on cold HF cache).

### Step 1 — Layer A — 2 sidecar replicas as default (T-day)

1. PR 1: edit `docker-compose.guardrails.yml` to set `deploy.replicas: 2` +
   `resources.limits.memory: 2G`.
2. PR 1: update `docs/OPS_DEPLOYMENT.md` so the deploy command becomes
   `docker compose -f docker-compose.dev.yml -f docker-compose.guardrails.yml
   up -d --scale llm-guard=2 --remove-orphans`.
3. PR 1: update `_deploy-backend.yml` (reusable workflow) to pass
   `--scale llm-guard=2` on every prod deploy.
4. Merge, watch the deploy. Grafana panel "LLM Guard /scan p95" should drop
   immediately (less queue accumulation per replica). Audit log row
   `SECURITY_LLM_GUARD_BREAKER_OPEN` count should fall to 0 over the
   following hour.
5. **Bake ≥ 24 h before Step 2.** Per the `project_no_staging_v1` doctrine,
   prod is stage — but we observe in prod, we don't ship the next layer on
   top of an unvalidated one.

### Step 2 — Layer B — per-user rate limit (T+1 day)

1. PR 2: add `express-rate-limit` + `rate-limit-redis` dep, wire middleware
   on `POST /chat` only (not on `/api/health` or admin routes).
2. Default config: 20 msg/min per user ID, burst 5, 429 response on
   exceed with `Retry-After` header.
3. Fail-open on Redis unavailable (logged warn, never blocks).
4. Add `musaium_chat_rate_limit_hits_total{user_id}` Prometheus counter for
   per-user observability — useful for support's "why was my message
   rejected" tickets.
5. Merge. Watch the 429 counter. **Bake ≥ 48 h before Step 3.**

### Step 3 — Layer C — raise bulkhead bounds (T+3 days)

1. PR 3: raise the defaults in `env.ts:429-430` (`maxInflight: 16, queueMax:
   64`).
2. Update `.env.production` on the VPS.
3. Restart backend container.
4. Run k6 burst test from § 6.2. If breaker still trips, **revert C** (the
   8/32 ceiling becomes the back-stop, not the entry budget).

**Rollback plan:** at any step,
`docker compose ... up -d --scale llm-guard=1` undoes Layer A;
`git revert` undoes B; `LLM_GUARD_MAX_INFLIGHT=8 LLM_GUARD_QUEUE_MAX=32` env
override undoes C.

---

## 6. Test plan — k6 burst methodology

### 6.1 Baseline test (single replica, current state)

```js
// musaium-llm-guard-burst-baseline.js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    chat_steady: {
      executor: 'constant-arrival-rate',
      rate: 15,           // 15 chat turns / s = our peak-hour estimate
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 50,
      maxVUs: 200,
    },
  },
  thresholds: {
    'http_req_duration{name:chat}': ['p(95)<2500'],  // 1.5s scan + LLM + transport
    'http_req_failed{name:chat}': ['rate<0.005'],    // <0.5% fail-CLOSED tolerated
    'musaium_llm_guard_breaker_open': ['count==0'],  // Grafana annotation
  },
};

export default function () {
  const payload = JSON.stringify({
    text: 'Tell me about the Mona Lisa.',
    locale: 'fr-FR',
  });
  const res = http.post('https://api.musaium.app/api/chat', payload, {
    headers: { 'Content-Type': 'application/json',
               'Authorization': `Bearer ${__ENV.TEST_USER_JWT}` },
    tags: { name: 'chat' },
  });
  check(res, {
    'status 200': (r) => r.status === 200,
    'not a fail-CLOSED canned refusal': (r) =>
      !r.body.includes('Désolé, message indisponible'),
  });
}
```

Run: `k6 run --tag env=prod musaium-llm-guard-burst-baseline.js`.
**Expected result on current (8/32, 1 replica) setup:** fail-CLOSED rate
> 0.5 % during the 5 min steady run, **and** at least one breaker open
event in Grafana. This is the failure mode we want to fix.

### 6.2 Burst test (after Step 1 — 2 replicas)

```js
scenarios: {
  chat_burst: {
    executor: 'ramping-arrival-rate',
    startRate: 5,
    timeUnit: '1s',
    preAllocatedVUs: 100,
    maxVUs: 500,
    stages: [
      { duration: '1m', target: 5 },    // warm-up
      { duration: '30s', target: 30 },  // 2× peak ramp
      { duration: '2m', target: 30 },   // sustain 2× peak
      { duration: '30s', target: 60 },  // 4× peak burst
      { duration: '1m', target: 60 },   // sustain
      { duration: '30s', target: 5 },   // cool-down
    ],
  },
},
```

The [ramping-arrival-rate executor](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/ramping-arrival-rate/)
is the right tool here per the k6 docs: "open-model executor, iterations
start independently of system response" — exactly the property we need so a
slow sidecar doesn't auto-throttle the test the way `ramping-vus` would.

**Expected results after Step 1:**
- Steady-state (rate=30): fail-CLOSED rate < 0.1 %, no breaker open.
- 4× peak burst (rate=60): fail-CLOSED rate may rise to ~5 % for 30 s,
  **breaker should NOT trip** because semaphore overflow is faster than the
  5-failure threshold at 60 QPS.
- Cool-down: fail-CLOSED rate returns to ~0 % within 30 s of rate dropping.

### 6.3 Surge test (after Steps 1+2+3 — full posture)

Add per-user-ID dimension to verify Layer B caps abuse:

```js
const ABUSIVE_USER_JWT = __ENV.ABUSIVE_USER_JWT;  // single user, hammering
const NORMAL_USER_JWTS = JSON.parse(__ENV.NORMAL_USER_JWTS);  // 50 users
```

Scenario: one VU pinned to `ABUSIVE_USER_JWT` running at 100 QPS for 5 min,
concurrent with the 6.2 burst against the normal pool.

**Expected:** the abusive user's 429 rate climbs to ~80 % (they're capped to
20/min); the normal users' fail-CLOSED rate stays at < 0.1 %. **This is the
core property of Layer B — fleet protection from a single bad actor.**

### 6.4 Methodology notes

- Run from a **separate VPS in a different AS** (not the same OVH host) so
  the test isn't bottlenecked by the production network egress.
- Wire k6 output to the existing Prometheus pushgateway (`docs/observability/`)
  so `LLMGuardBreakerOpen` / `LLMGuardLatencyCritical` alerts fire in the
  same loop the test creates load — that verifies the alerts work, not just
  the bulkhead.
- **Snapshot** `pg_stat_statements` / `audit_logs` before each run and diff
  after, so any unintended DB-side effect (rate-limit hits flooding the
  audit log, breaker-open audit row spam) is visible.
- Don't run during peak traffic. Pre-launch this is academic, but post-launch
  it becomes a doctrine.

---

## 7. Verdict

The current implementation is **safety-correct** — ADR-047's fail-CLOSED
contract is preserved, the circuit breaker and semaphore are in place, the
audit trail records every trip. What it is **not** is **available** under any
non-trivial burst, because we run **one CPU-bound Python process** behind it.

The fix is the boring one: **scale out** (Layer A), **rate-limit the input**
(Layer B), **then rescale the bulkhead** (Layer C), in that order, with bake
time between each. No feature flag, no fail-OPEN regression, no degraded
mode that quietly bypasses the safety gate. The ops procedure changes
required are already documented in the runbook — we're just making the
"emergency recovery action" the day-zero posture.

This does **not** address the **root-cause latency** of the sidecar itself
(four chained transformer scanners on a CPU-only VPS). Two larger follow-ups
remain open:

- **F1-follow-up-A: ONNX optimization** for the sidecar (cuts P95 latency
  ~2× per upstream benchmark; in-tree work, but its own validation cycle).
- **F1-follow-up-B: `gunicorn --preload --workers N`** for the sidecar
  process model (extracts ~3-4× throughput per replica via fork-shared
  model weights; cheaper than 4× the number of replicas).

Both are out of scope of the immediate scaling fix and should land
**after** Layer A is bedded in, since they change the per-replica perf
profile that Layer A's replica count was sized to.

---

## 8. Sources

### Code (in-repo, verified by `Read`)

- `museum-backend/src/modules/chat/adapters/secondary/guardrails/llm-guard.adapter.ts:240-336` — scan/scanOverHttp + fail-CLOSED paths
- `museum-backend/src/modules/chat/adapters/secondary/guardrails/guardrail-circuit-breaker.ts:60-227` — three-state FSM
- `museum-backend/src/modules/chat/adapters/secondary/guardrails/scan-inflight-semaphore.ts:44-107` — semaphore + overflow error
- `museum-backend/src/config/env.ts:389-430` — guardrails env config
- `museum-backend/src/modules/chat/chat-module.ts:402-478` — composition root (breaker + semaphore wiring)
- `museum-backend/ops/llm-guard-sidecar/app.py:107-171` — sidecar FastAPI + lifespan
- `museum-backend/ops/llm-guard-sidecar/Dockerfile:81` — Uvicorn single-worker CMD
- `museum-backend/docker-compose.guardrails.yml:21-83` — sidecar service def + scale-up comment

### Docs (in-repo)

- `docs/adr/ADR-047-llm-guard-circuit-breaker-fail-closed.md` — fail-CLOSED contract
- `docs/adr/ADR-048-guardrail-strategy-interface.md` — port contract
- `docs/OPS_INCIDENT_LLM_GUARD.md` — runbook (S1: sidecar down, scale-up command)

### Web

- [protectai/llm-guard GitHub](https://github.com/protectai/llm-guard)
- [LLM Guard API deployment docs](https://protectai.github.io/llm-guard/api/deployment/) — gunicorn `--preload`, 16 GB RAM requirement
- [LLM Guard PromptInjection scanner docs](https://github.com/protectai/llm-guard/blob/main/docs/input_scanners/prompt_injection.md) — latency benchmarks
- [LLM Guard optimization tutorial](https://github.com/protectai/llm-guard/blob/main/docs/tutorials/optimization.md) — ONNX, low_cpu_mem_usage, quantization
- [nodeshift/opossum](https://github.com/nodeshift/opossum) — circuit breaker, `capacity` option
- [Opossum docs](https://nodeshift.dev/opossum/) — v8.1.3 API
- [sindresorhus/p-queue](https://github.com/sindresorhus/p-queue) — priority queue, abort signal, concurrency
- [Implementing Bulkhead Pattern in Node.js (dev.to)](https://dev.to/silentwatcher_95/implementing-the-bulkhead-pattern-in-nodejs-14ao) — semaphore + queue overflow pattern
- [Circuit Breaker & Retry Patterns in Node.js (2026)](https://1xapi.com/blog/resilient-api-circuit-breaker-bulkhead-retry-nodejs-2026) — combined bulkhead + breaker
- [Node.js Circuit Breaker Pattern in Production: Opossum (dev.to)](https://dev.to/axiom_agent/nodejs-circuit-breaker-pattern-in-production-opossum-fallbacks-and-resilience-engineering-1mj4) — 2026 config recommendations
- [Sharing NLP Models among Gunicorn Workers (Trendyol)](https://medium.com/trendyol-tech/sharing-large-language-models-among-gunicorn-workers-reducing-memory-usage-and-boosting-18c0efd8e942) — `--preload` for ML
- [The Concurrency Mistake Hiding in Every FastAPI AI Service](https://jamwithai.substack.com/p/the-concurrency-mistake-hiding-in) — Uvicorn worker sizing for CPU-bound ML
- [k6 ramping-arrival-rate docs](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/ramping-arrival-rate/) — burst test executor
- [express-rate-limit npm](https://www.npmjs.com/package/express-rate-limit) — middleware + Redis store
- [undici docs](https://undici.nodejs.org/) — DNS interceptor for connection re-resolution
- [Docker Compose horizontal scaling guide](https://www.dolpa.me/scaling-services-using-docker-compose-a-detailed-guide/) — `--scale` + DNS round-robin
- [Fail Open vs Fail Closed (AuthZed)](https://authzed.com/blog/fail-open) — operational doctrine
- [Microservices Bulkhead Pattern (Medium 2026)](https://medium.com/@abhi.strike/microservices-patterns-bulkhead-pattern-01b7c5d03e19) — semaphore + thread pool variants
- [Building Fault-Tolerant Architecture with Bulkhead (AWS)](https://aws.amazon.com/blogs/containers/building-a-fault-tolerant-architecture-with-a-bulkhead-pattern-on-aws-app-mesh/) — combined CB + bulkhead at infra layer
