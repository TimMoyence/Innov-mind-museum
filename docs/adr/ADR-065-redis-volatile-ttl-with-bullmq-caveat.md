# ADR-065 — Redis prod eviction policy = `volatile-ttl` (with BullMQ no-TTL caveat accepted V1)

> Renumbered from ADR-063 → ADR-065 on 2026-05-22 (chain re-numbering after
> PR #294 occupied 061/062 with unrelated ADRs). Related ADR-062 (denylist
> fail-OPEN) was concurrently renamed to ADR-064; all in-file references
> updated. Filename, content and decision are otherwise unchanged.

> **Status:** Accepted · **Date:** 2026-05-21 · **Deciders:** Tech Lead
> **Run:** `team-state/2026-05-21-p0-c4-infra/`
> **Closes:** I-SEC1 (P0 security sweep, `docs/ROADMAP_PRODUCT.md` ligne 200) ; spec R5/R7, design D5.
> **Related:** ADR-064 (denylist fail-OPEN, same Redis instance), spec §4.D + §8.Q3 (deferred split-instance alternative).

---

## Context

Before this run, the prod Redis service (`museum-backend/deploy/docker-compose.prod.yml:358-379`) ran with **no `maxmemory` directive and no `maxmemory-policy`**. Upstream Redis 7 defaults apply : memory grows unbounded until the kernel/Docker cgroup OOM-kills the container, and the eviction policy is `noeviction` — once the (implicit) limit is hit, every write (`SET`, `INCRBYFLOAT`, `LPUSH`, …) returns `OOM command not allowed when used memory > 'maxmemory'`. The cluster C4 triage (`team-state/2026-05-21-p0-security/triage.md`) flagged this as P0 because :

1. The same Redis instance is **shared by three independent use cases** (`museum-backend/src/index.ts:84-127`) :
   - **LLM response cache** (`RedisCacheService`, key shape `llm:v1:…`, TTL = `env.cache.sessionTtlSeconds` default 3600 s = 1 h ; `museum-backend/src/shared/cache/redis-cache.service.ts:64` `SET EX ttl` always).
   - **LLM cost counter** (`RedisLlmCostCounter`, key shape `llm_cost:user:{userId}:{day}`, TTL 90 000 s = 25 h ; `museum-backend/src/shared/llm-cost-guard/redis-llm-cost-counter.ts:16`). **Fail-CLOSED on Redis throws** (`:9-17, :48`) : a Redis error makes `LlmCostGuard` propagate `LLM_COST_GUARD_REDIS_UNAVAILABLE` → blocks the chat request.
   - **BullMQ job queues** (`museum-enrichment` queue + workers, `museum-backend/src/index.ts:84-127`). Persistent state per BullMQ semantics : `bull:<queue>:wait`, `bull:<queue>:active`, `bull:<queue>:completed`, `bull:<queue>:failed`, `bull:<queue>:meta` etc. **Most of these keys have no TTL** — they are durable queue state, cleaned via `removeOnComplete`/`removeOnFail` job options, not via key expiry.
   - (Plus: `nonce:*` and `social-otc:*` short-TTL keys, `denylist:access:<jti>` from ADR-064 with TTL = remaining access-token lifetime.)

2. Default `noeviction` on a memory-pressured shared Redis means : **any growth above `maxmemory` blocks ALL writes**. That includes BullMQ `LPUSH`/`SADD`, denylist `SET`, cost-counter `INCRBYFLOAT`. Because the cost counter is fail-CLOSED, the **entire chat pipeline goes down** the moment Redis hits `maxmemory`. This is a financial-DoS-amplifier : a single user hammering the cache (or any other writer) can starve the cost counter and convert "I am over quota" into "global chat outage".

3. The denylist (ADR-064) sits on the same Redis but is **fail-OPEN** — Redis-down ≠ outage for the denylist read path, but Redis-OOM (`noeviction`) does block `denylist.add(jti, ttlSec)` on logout (silently, per ADR-064 `Consequences`). The denylist's fail-OPEN posture only mitigates **`has(jti)` errors** ; write blockage during memory pressure remains a real degradation.

**Forces at play :**

- **Determinism over heuristics for security-critical keys.** The cost counter's correctness is a financial invariant (LLM API spend cap per user/day). Any eviction policy that *could* evict a counter before its 25-h TTL window completes converts a hard quota into a soft quota with stochastic bypass : the user hits the cap, the counter is evicted, the next request re-increments from 0 → silent quota-bypass financial blow-by. **Eviction must be deterministic and counter-preserving.**
- **Cache pressure is the dominant memory consumer.** Steady-state inventory shows the LLM response cache (TTL 1 h) is at least one order of magnitude larger than counters (5 keys/active user × tens of bytes) and short-lived denylist/nonce entries. Evicting cache first absorbs ~all memory pressure spikes without touching the financial-correctness keys.
- **BullMQ persistent state has no TTL by design.** `bull:<queue>:wait`/`:active`/`:completed` lists and hashes carry queue state across worker restarts and are sized via `removeOnComplete: { count, age }`/`removeOnFail` job-level limits, not via Redis TTL. Any `volatile-*` policy (which only evicts keys *with* TTL) cannot touch them. Any `allkeys-*` policy could evict them mid-job, dropping payment-bearing work.
- **Pre-launch V1 doctrine `feedback_no_feature_flags_prelaunch` (UFR-015).** No "policy toggle" via runtime flag. Policy is set in compose YAML, overridable via env var (`${REDIS_MAXMEMORY_POLICY:-volatile-ttl}`) for ops tuning without redeploy of the image, **but the default is fixed in code-as-config** and reviewed in this ADR.
- **Single-Redis V1.** The cluster triage explicitly out-scopes a split-instance topology (cache evictable / counters never-evict) for V1 — added infra cost (2nd container, 2nd monitoring, 2nd backup, 2nd failure mode) without commensurate V1 benefit. Reserved as Alternative #2 below for V1.x if eviction telemetry proves insufficient.

---

## Decision

**The prod Redis service shall declare `--maxmemory ${REDIS_MAXMEMORY:-512mb}` and `--maxmemory-policy ${REDIS_MAXMEMORY_POLICY:-volatile-ttl}` in `museum-backend/deploy/docker-compose.prod.yml`.** The dev compose (`museum-backend/docker-compose.dev.yml`) shall mirror the **policy** (`--maxmemory-policy ${REDIS_MAXMEMORY_POLICY:-volatile-ttl}`) so dev reproduces the prod eviction semantics ; the **cap value** may differ in dev (left implicit or set higher). Parity is enforced by `scripts/sentinels/compose-parity.mjs` with two new `CRITICAL_FLAGS` entries : `{ flag: '--maxmemory-policy', severity: 'critical', services: ['redis'] }` (drift blocks PR) and `{ flag: '--maxmemory', severity: 'warn', services: ['redis'] }` (drift warns but does not block, since the cap value is legitimately different dev↔prod).

The policy choice `volatile-ttl` is selected on the explicit invariant : **cache TTL (3600 s) is strictly shorter than counter TTL (90 000 s)**, so under memory pressure Redis evicts cache keys (shortest TTL first) before touching counters. This invariant is documented as a code-level contract in `museum-backend/tests/unit/shared/llm-cost-guard/redis-volatile-ttl-policy.test.ts` + helper `tests/helpers/shared/llm-cost-guard/volatile-ttl-sim.ts` — if a future sprint bumps the cache TTL beyond the counter TTL, the test fails and the reviewer revisits the policy (cf. design D5).

**The BullMQ no-TTL caveat is explicitly accepted for V1.** Under extreme sustained memory pressure where all TTL-bearing keys have been evicted and memory continues to grow, Redis returns to the `noeviction` failure mode for the remaining (TTL-less) BullMQ keys — `LPUSH bull:<queue>:wait` will OOM-reject, the cost counter (which uses TTL keys) will continue to function until its own TTL set is exhausted, then will fail-CLOSED. **This is strictly better than the pre-ADR state** (which OOM-rejected on first byte over cap, no eviction window) and aligns with the V1 launch SLO (≤ 1 % chat 5xx, dominated by cache miss not by Redis pressure).

**The fix is in compose YAML + sentinel `CRITICAL_FLAGS`. No application code changes.** Reversal requires a new ADR per the section below.

---

## Consequences

**Positive :**

- Cost-counter `llm_cost:user:*` keys (TTL 25 h) survive **any** cache-driven memory pressure spike. Financial-DoS via quota bypass is closed deterministically (not statistically as with LRU/LFU).
- Default `noeviction` global write-blockage is replaced by graceful cache eviction. The chat pipeline's primary failure mode under Redis memory pressure shifts from "global outage" to "cache miss rate ↑ → recompute cost ↑" — a degradation, not an outage. Aligns with the C2 cluster's fail-CLOSED breaker doctrine (which now has a longer runway before tripping under memory pressure).
- Denylist write path (ADR-064) `denylist.add(jti, ttlSec)` continues to succeed under cache-driven pressure (it has a TTL but is in the same eviction-ASC bucket as cache keys ; under realistic pressure the cache dominates eviction since it has both shorter mean TTL **and** larger absolute count).
- The 512 MB default cap is "right-sized" for V1 single-VM OVH topology (16 GB RAM with PG ~8 GB + Node + workers ~4 GB consumed steady-state, ~4 GB headroom of which 512 MB is the Redis ceiling). Tunable per-env via `REDIS_MAXMEMORY` without redeploy.
- Sentinel parity (`compose-parity.mjs` `--maxmemory-policy` = critical) ensures dev cannot silently drift to a different policy semantic — if eviction order matters, dev must reproduce it.
- Both env vars are documented in `museum-backend/.env.example` (under the `REDIS_*` block, cf. design D6) with default + cross-ref to this ADR.
- Rollback = revert the compose lines + redeploy. AOF replays BullMQ jobs ; cache is recomputed on demand ; counters are lost only if the restart spans the 25-h TTL window (worst case : one user re-acquires their daily quota, acceptable financial blast).

**Negative :**

- **Explicit BullMQ caveat : under sustained extreme pressure, BullMQ keys (no TTL by design) cannot be evicted, and Redis returns to `noeviction` behavior for those keys.** Symptom : `LPUSH bull:museum-enrichment:wait` will OOM-reject ; new enrichment jobs cannot be enqueued. Existing in-flight jobs continue (already in `:active`). Workers continue to process. The user-visible effect is **enrichment jobs silently dropped at enqueue time** rather than global chat outage. This is documented in code comments on the compose redis service line + spec §4.D + this ADR. **It is a real degradation under extreme pressure that the policy cannot fully solve at the V1 single-Redis topology.** Mitigation = monitor `evicted_keys` / `used_memory` / BullMQ enqueue success rate post-launch (bake §11 design.md) and bump `REDIS_MAXMEMORY` env or activate Alternative #2 (split instance) if telemetry shows recurring pressure.
- **`volatile-ttl` guarantee is conditional on cache TTL < counter TTL.** If a future sprint bumps the LLM cache TTL to 24 h (close to counters 25 h), the eviction-ASC ordering becomes non-deterministic between cache and counters → quota bypass risk re-emerges. **Test contract `redis-volatile-ttl-policy.test.ts` asserts the inequality** as a code invariant — any TTL bump that breaks it fails CI and forces the reviewer to revisit the policy (or move counters to a different TTL or instance). Documented spec §8 Q3.
- The sentinel `compose-parity` now blocks PRs if dev/prod policy values diverge. Adds a (small) maintenance surface : ops changing the policy must touch both compose files atomically. Acceptable cost.
- Cache miss rate is expected to **increase** under memory pressure (vs. the steady-state where the cache happily holds 1-h-old entries). User-visible : slightly slower LLM responses under load, and slightly higher LLM API spend per chat request (recompute). Counter-balance : the cost counter is preserved, so the **per-user/day** spend is still capped.

**Neutral :**

- The choice is reversible by a single-line YAML change + Redis container recreate. No data migration. AOF replays BullMQ ; cache reconstructed on demand.
- `volatile-ttl` is a Redis 7 upstream-tested policy (Redis Labs test suite, RESP3 spec). We do not test the policy semantics ourselves — only our invariant (cache TTL < counter TTL). This is documented design D5 as a deliberate scope choice (no testcontainers run added for this cluster).
- The 512 MB cap interacts with the AOF buffer (BullMQ requires durable jobs : `--appendonly yes` was already present in the compose file). AOF rewrite triggers around 100 MB by default ; under the 512 MB cap there is sufficient headroom.

---

## Alternatives considered

1. **`noeviction` (Redis 7 default).**
   - **Rejected** : the pre-ADR state. OOM blocks all writes including cost-counter `INCRBYFLOAT` → fail-CLOSED → global chat outage. V1 launch-blocker. The whole reason for this ADR.

2. **Split Redis into two instances (cache-evictable + counters-never-evict).**
   - **Rejected for V1, deferred V1.x.** Eliminates the BullMQ caveat (counter instance can stay `noeviction` since it only holds short, fast-rotating keys ; cache instance can run `allkeys-lru` since nothing on it is financial-critical). Adds infra cost (second Redis container in compose, second `REDIS_*_URL` env, second monitoring channel, second backup), second AOF management, second failure mode (which-Redis-is-down branching in code). Pre-launch V1 doctrine is single-Redis. Listed as the **first** mitigation if post-launch bake reveals BullMQ enqueue failures under pressure or if cache TTL is bumped to ≥ 24 h (breaking the `volatile-ttl` invariant). Spec §8 Q3 + design D5 cross-reference.

3. **`allkeys-lru` / `allkeys-lfu`.**
   - **Rejected** : evicts based on access recency/frequency, can touch any key including counters and BullMQ persistent state. A long user-inactivity window (overnight, low chat QPS) could drop a counter's LRU/LFU score below an active user's cache → counter evicted → financial blow-by on next active user request. Worse, evicting BullMQ `bull:*:wait` mid-job drops payment-bearing work silently. Both failure modes are non-deterministic — un-auditable.

4. **`allkeys-random`.**
   - **Rejected** : strictly dominated by 3 (no guarantee on counters, no guarantee on BullMQ, plus no recency signal so the cache hit rate degrades for no reason).

5. **`volatile-lru` / `volatile-lfu`.**
   - **Rejected** : only evicts keys with TTL (good — BullMQ persistent state untouched, denylist + cache + counters in scope). But LRU/LFU on the TTL-bearing set is still access-pattern dependent : a hot user's cache (high LRU score) could survive a cold user's counter (low LRU score during inactivity). Sémantique non-déterministe identique au point 3 mais réduit au sous-ensemble TTL-bearing.

6. **`volatile-random`.**
   - **Rejected** : random within the TTL-bearing set. No guarantee counters survive. Strictly dominated by `volatile-ttl` which provides the determinism we need.

7. **`volatile-ttl` (= the decision).**
   - **Selected.** Deterministic eviction order : shortest TTL first. By construction, cache (TTL 1 h) is evicted before counters (TTL 25 h) before nonces (TTL minutes — actually evicted first, but nonces are stateless retry-able so no security regression). BullMQ no-TTL keys never evicted under this policy → the caveat documented in `Consequences/Negative` is the residual price.

8. **Bump container memory limit instead of a Redis policy (let Redis grow, OOM-kill at Docker cgroup level).**
   - **Rejected** : moves the failure from "graceful eviction" to "container restart loop". BullMQ persistent state is recovered from AOF, cache is lost wholesale (worse than partial eviction), counters are lost wholesale (worse than preserved), and the chat pipeline goes through a cold-start window every memory spike. Plus the OOM-kill is unpredictable wrt. container orchestration. Worse on every axis vs. a bounded `maxmemory` + policy.

9. **Disable BullMQ persistence (`removeOnComplete: 0` etc., let queue state evaporate on Redis pressure).**
   - **Rejected** : converts every Redis hiccup into "all in-flight enrichment work lost". Worse user-visible behavior than the V1 caveat (which only fails *new* enqueues under extreme pressure). BullMQ persistence is load-bearing for resumability.

---

## Reversal path

To reverse (e.g. switch to split-instance or different policy) :

1. New ADR superseding ADR-065 with the new policy + topology decision.
2. Update `museum-backend/deploy/docker-compose.prod.yml` redis service `command:` block.
3. Update `museum-backend/docker-compose.dev.yml` to match.
4. Update `scripts/sentinels/compose-parity.mjs` `CRITICAL_FLAGS` per the new policy.
5. Update `museum-backend/tests/unit/shared/llm-cost-guard/redis-volatile-ttl-policy.test.ts` invariant assertions (or replace with the new policy's invariant test).
6. Update `museum-backend/.env.example` defaults + this ADR's `Status` to `Superseded by ADR-NNN`.

Rollback to the pre-ADR state is **not** a reversal — it is a regression to the documented V1 launch-blocker. Any reversal must move *forward* (e.g. to alternative #2 split-instance).

---

## References

- **Spec §4.D** (decision matrix : 5 Redis policies evaluated against the cost-counter invariant) — `team-state/2026-05-21-p0-c4-infra/spec.md:76-91`.
- **Spec §8 Q3** (deferred risk : cache TTL ≥ counter TTL invalidates `volatile-ttl`) — `team-state/2026-05-21-p0-c4-infra/spec.md:140`.
- **Design D5** (test-as-contract over testcontainers run, justification) — `team-state/2026-05-21-p0-c4-infra/design.md:134`.
- **Design D6** (`.env.example` placement of `REDIS_MAXMEMORY` + `REDIS_MAXMEMORY_POLICY`) — `team-state/2026-05-21-p0-c4-infra/design.md:136`.
- **ADR-064** — Access-token denylist Redis adapter fail-OPEN. Same Redis instance ; ADR-065 protects the denylist write path under memory pressure (cache evicted first, denylist + counters preserved).
- **C3 design §10** — 3 Prometheus counters specified (`totp_replay_blocked_total`, `access_token_revoked_total`, `art_keywords_rate_limited_total`) deferred post-V1 (cf. **TD-OBS-DENYLIST** in `docs/TECH_DEBT.md`). Eviction rate (`evicted_keys`, `used_memory_human`) is monitored via existing `redis-exporter` Prometheus integration (cf. design §11 bake plan).
- **CLAUDE.md § "Pièges connus"** — `ADR-036 amendment` (`LlmCacheServiceImpl` is the single layer cache wrapper) ; this ADR documents the underlying Redis policy that backs that cache layer.
- **`lib-docs/ioredis/LESSONS.md:36`** — fail-soft pattern (cache get/set/del errors) used by `RedisCacheService` ; under `volatile-ttl` the cache write path remains fail-soft, so eviction-induced cache misses don't surface as user errors.
- **`lib-docs/ioredis/LESSONS.md:50, 55-67`** — TD-IO-03 (BullMQ `enableReadyCheck:false`) + F-IO-05 (shared client comment) — *out of scope C4* but documented because the BullMQ caveat in `Consequences/Negative` interacts with these.
- **BullMQ docs §"Removing jobs"** — `removeOnComplete`/`removeOnFail` are the only TTL-equivalent knobs for BullMQ state (no native key-TTL). Justifies the no-TTL caveat in `Consequences/Negative`.
- **Redis 7 docs `EVICTION`** — `volatile-ttl` is upstream-stable and the eviction ordering is documented as "key with the shortest TTL among the TTL-bearing key set is evicted first".

---

**End of ADR-065.**
