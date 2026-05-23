# Changelog — museum-backend

All notable changes to the Musaium backend (+ cross-app legal/mobile changes shipped in the same run) are documented in this file.

Format loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The Musaium repo is a monorepo (`museum-backend/` + `museum-frontend/` + `museum-web/`) ; this changelog captures cross-app GDPR / compliance / launch-blocking changes when they are coordinated by a single run.

## [Unreleased] — 2026-05-23 — PR-13 `ThreeStateCircuit<TTripStrategy>` primitive + 3 CircuitBreaker wrappers (DRY-refactor, byte-identical surface + onStateChange parity)

Run `2026-05-23-pr-13-threeStateCircuit` — treizième incremental refactor de l'audit `2026-05-23-audit-kiss-dry-backend` (finding B6 #1 : 3-state CB duplication across 3 in-house wrappers — `LLMCircuitBreaker` 116 LOC, `LlmCostCircuitBreaker` 260 LOC, `GuardrailCircuitBreaker` 182 LOC, common-ground 7-element FSM shape dupliqué 100%). Pipeline : UFR-022 fresh-context 5-phase / reviewer (combined verify+security+review) **APPROVED** loop-1 terminal, zero CHANGES_REQUESTED, zero blocking finding, 3 nonBlockingObservations documentés (LOC STRETCH-MISS amortization, `onStateChange` opt-in coverage, `parsePositiveNumber` deferred extraction). Refactor structurel : nouveau cluster `museum-backend/src/shared/circuit-breaker/` (3 fichiers, 342 LOC d'infrastructure partagée) absorbe le FSM 3-state dupliqué. Les 3 wrappers passent de 116+260+182 = **558 LOC** à 110+175+144 = **429 LOC** (**−129 LOC, −23%** côté wrapper-only) et deviennent de thin delegates qui composent `ThreeStateCircuit<TStrategy>` + une stratégie de trip pluggable (`SlidingWindowFailureStrategy` partagée par LLM + Guardrail, `CostTripStrategy` cost-only). Public API des 3 wrappers préservée byte-identical au niveau des 5 consumers (`langchain.orchestrator.ts` + `llm-guard.adapter.ts` + `chat-module.ts` composition root + `/api/health` route + tests) ; seul delta ADDITIF = `LLMCircuitBreaker.onStateChange` option (parity avec les 2 autres wrappers — was logger-only outlier pre-refactor). **9 log event names préservés byte-identical** (Loki queries / runbooks / on-call dashboards scrape these — NFR-3 observability invariance). Zéro migration DB applicative, zéro lib bump, zéro nouveau `eslint-disable`, zéro hook bypass, zéro OpenAPI delta, zéro FE follow-up, zéro env-var rename. `pnpm jest --testPathPattern='(unit/chat/(llm|llm-cost|guardrail)-circuit-breaker|unit/shared/circuit-breaker|unit/architecture/pr13-circuit-breaker-purity-sentinel)'` → **7 suites pass, 54/54 tests pass** (33 existing + 20 new primitive/strategies + 1 sentinel). Chaos e2e (`tests/e2e/chaos-circuit-breaker.e2e.test.ts`) untouched, still green per R3 call-graph invariants. Reversibility : `git revert <sha>` restaure les 3 wrappers legacy + retire le shared cluster + retire les 4 new test files ; pas de DB migration ni de schema delta à revert.

### Added

- **Nouveau cluster `museum-backend/src/shared/circuit-breaker/`** (3 fichiers, 342 LOC, domain-agnostic) :
  - **`three-state-circuit.ts`** (189 LOC) — Primitive FSM générique `class ThreeStateCircuit<TStrategy extends CircuitTripStrategy>`. Exports : `type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'`, `interface CircuitTripStrategy { shouldTrip(now); pruneExpired(now); reset(); }`, `interface ThreeStateCircuitOptions<TStrategy>` (`strategy`, `openDurationMs`, `halfOpenMaxProbes?`, `onStateChange?`, `now?`), `interface ThreeStateCircuitCommonSnapshot` (`state`, `openedAt: Date | null`, `lastTripAt: Date | null`). Surface mutator concentrée sur 3 méthodes : `recordOutcome('success' | 'failure')`, `trip(from)`, `reset()`. Lazy `OPEN → HALF_OPEN` cooldown transition dans le `state` getter (O(1), no I/O). `canAttempt()` decrement probe slot synchronously (race-safe). `onStateChange` fires EXACTLY ONCE per real transition (invariant). NO logging, NO I/O — wrappers own observability via callback. `now()` injection threaded everywhere (NFR-2 determinism).
  - **`strategies/sliding-window-failure-strategy.ts`** (60 LOC) — `class SlidingWindowFailureStrategy implements CircuitTripStrategy`. `failures: number[]` pruned lazily by `windowMs`. `recordFailure()` appends `now()`. `shouldTrip(now)` returns `failures.length >= threshold`. `reset()` clears array. Accessors `getFailureCount()` + `getLastFailureAt()` pour les wrapper snapshots. Partagée par `LLMCircuitBreaker` + `GuardrailCircuitBreaker`.
  - **`strategies/cost-trip-strategy.ts`** (93 LOC) — `class CostTripStrategy implements CircuitTripStrategy`. Dual condition : sliding 1h `hourlyWindow: CostEntry[]` ORed avec UTC day counter `dailySpend = { day: string, cents: number }`. `recordCharge(cents)` rejects non-finite / ≤0 cents at strategy level (defense-in-depth). `shouldTrip(now)` returns `hourly > threshold OR daily > budget`. UTC day rollover via `.toISOString().slice(0,10)`. `reset()` clears hourly window AND daily counter. Accessors `getHourlySpendCents(now)` + `getDailySpendCents(now)` pour le wrapper snapshot. Utilisée uniquement par `LlmCostCircuitBreaker`.
- **Test sentinel architecture `museum-backend/tests/unit/architecture/pr13-circuit-breaker-purity-sentinel.test.ts`** (NEW, sha256 `0537a195b2c4df69c5cf64ddae97415f2fe98a26ee57f5411dc397516237ddcd`, FROZEN) — UFR-016 dead-code-burial guard. Filesystem-based assertions (`readFileSync` line-by-line scan) ; pour chaque wrapper file :
  - **Block A — forbidden patterns** (4 patterns × 3 files = 12 assertions, ligne-par-ligne) : `this.currentState = '...'` (FSM mutation belongs to primitive), `private currentState: ...CircuitState = 'CLOSED'` (field declaration belongs to primitive), `private trip(...)` / `private transitionTo(...)` (helpers moved to primitive), `private failures: number[]` / `private hourlyCharges: ` / `private dailySpend = ` (state moved to strategies).
  - **Block B — required imports** (3 assertions) : each wrapper file MUST import `ThreeStateCircuit` from `@shared/circuit-breaker/three-state-circuit`.
  - Chaque assertion surface un hint `file:line` au reviewer sur failure. Frozen sha256 lock contre éditor self-modification.
- **20 nouveaux test cases unit (3 fichiers, FROZEN au RED phase)** :
  - `museum-backend/tests/unit/shared/circuit-breaker/three-state-circuit.test.ts` (sha256 `462f613c3ce86d6de2d6fc955db7df4a788703bd6b1404178c0d53c4649f357f`) — **9 cases** : CLOSED→OPEN via strategy.shouldTrip, OPEN→HALF_OPEN lazy cooldown, HALF_OPEN+success→CLOSED (strategy.reset called once, onStateChange fired), HALF_OPEN+failure→OPEN re-trip (`from: 'HALF_OPEN'`), `canAttempt()` HALF_OPEN avec `halfOpenMaxProbes=2`, deterministic `now()` injection, `reset()` from OPEN fires onStateChange→CLOSED, public `trip(from)` drives OPEN from CLOSED, `getCommonSnapshot()` accuracy. Local mock strategy avec `tripFlag`/`resetCount`/`pruneCount` (zero external imports).
  - `museum-backend/tests/unit/shared/circuit-breaker/strategies/sliding-window-failure-strategy.test.ts` (sha256 `449aeb1fc3e5cf95f1103589a3bb905c3043027d32664caff93911d58c137268`) — **5 cases** : `recordFailure()` appends, `shouldTrip()` false<threshold / true=threshold, `pruneExpired()` drops old, `reset()` clears, `getLastFailureAt()` returns most recent.
  - `museum-backend/tests/unit/shared/circuit-breaker/strategies/cost-trip-strategy.test.ts` (sha256 `9525f237cebf237bc49f92cf7f9e7e27a1bfe1114843eba5f57f781075be73df`) — **6 cases** : `recordCharge(≤0|NaN|Infinity)` no-op, hourly threshold breach trips, daily budget breach trips even when hourly<threshold, hourly window prunes after 1h, UTC day rollover resets daily counter, accessors reflect mutation.

### Changed

**Wrapper refactor — 3 fichiers passent de FSM inline à thin delegate sur `ThreeStateCircuit<TStrategy>`** :

| Wrapper | Fichier | LOC (avant → après) | Strategy | Note |
|---|---|---|---|---|
| LLM latency CB | `museum-backend/src/modules/chat/adapters/secondary/llm/llm-circuit-breaker.ts` | 116 → 110 (**−6**) | `SlidingWindowFailureStrategy` | **+ `onStateChange` callback uniformisé** (was logger-only outlier) |
| LLM cost CB | `museum-backend/src/modules/chat/adapters/secondary/llm/llm-cost-circuit-breaker.ts` | 260 → 175 (**−85**) | `CostTripStrategy` | R3.2 path preserved (stateBefore capture → strategy.recordCharge → shouldTrip → trip-or-recover) |
| Guardrail CB | `museum-backend/src/modules/chat/adapters/secondary/guardrails/guardrail-circuit-breaker.ts` | 182 → 144 (**−38**) | `SlidingWindowFailureStrategy` | `parsePositiveNumber` helper retained inline (deferred extraction) |

- **`LLMCircuitBreaker` — `onStateChange` callback uniformisé** (was logger-only direct outlier pre-refactor). Avant PR-13 : seul wrapper sans `onStateChange` option ; logger calls (`llm_circuit_breaker_half_open` / `_closed` / `_open`) wired inline via direct FSM mutation. Après PR-13 : `CircuitBreakerOptions` accepte un `onStateChange?: (next: CircuitState, prev: CircuitState) => void` (additif, non-breaking — call sites existants continuent sans le supplier). Le constructeur compose `ThreeStateCircuit<SlidingWindowFailureStrategy>` ; le handler `onStateChange` interne au wrapper fait les 3 logger calls (event names byte-identical `llm_circuit_breaker_half_open` / `llm_circuit_breaker_closed` / `llm_circuit_breaker_open` avec payload `{failureCount, windowMs}`) PUIS invoque le user-supplied callback. Parity now achieved avec `LlmCostCircuitBreaker.onStateChange` + `GuardrailCircuitBreaker.onStateChange`. Composition root `chat-module.ts` peut désormais wirer un 3e Prometheus gauge `llm_circuit_breaker_state` dans un follow-up PR sans toucher au wrapper. `CircuitOpenError` re-exportée depuis `llm-circuit-breaker.ts:6` (backward-compat consumer import path).
- **`LlmCostCircuitBreaker` — délégation byte-identical sur `CostTripStrategy`**. `recordCharge(cents)` preserve la R3.2 path : (1) guard non-positive/non-finite, (2) capture `stateBefore = circuit.state` (triggers lazy OPEN→HALF_OPEN), (3) `strategy.recordCharge(cents)`, (4) si `strategy.shouldTrip(now())` → `circuit.trip(stateBefore)` (HALF_OPEN→OPEN ou CLOSED→OPEN — cap breach honoured on probe call), (5) sinon si `stateBefore === 'HALF_OPEN'` → `circuit.recordOutcome('success')` (probe success path). `recordFailure()` only HALF_OPEN re-OPEN. `getState()` shape `{state, hourlySpendCents, dailySpendCents, lastTripAt: Date|null, openedAt: Date|null}` byte-identical. Re-exported type alias `LlmCostCircuitState = CircuitState` (consumer imports preserved).
- **`GuardrailCircuitBreaker` — délégation sur `SlidingWindowFailureStrategy`**, primitive composée avec `halfOpenMaxProbes` config (was the only wrapper exposing this knob ; env var `LLM_GUARD_CB_HALF_OPEN_MAX_PROBES` honoured byte-identical). Local `parsePositiveNumber(raw, fallback)` helper retained inline (NaN / ≤0 / non-finite → fallback, défense contre operator typo) — extraction to `@shared/env/parse-positive-number.ts` DEFERRED pour limiter le PR blast radius (recommended follow-up). `getState()` shape `{state, failureCount, lastFailureAt: Date|null, openedAt: Date|null}` byte-identical.
- **9 log event names préservés byte-identical** (NFR-3 observability invariance) :

| Event | Wrapper | Payload keys |
|---|---|---|
| `llm_circuit_breaker_half_open` | LLM latency | (none) |
| `llm_circuit_breaker_closed` | LLM latency | (none) |
| `llm_circuit_breaker_open` | LLM latency | `{failureCount, windowMs}` |
| `llm_cost_circuit_breaker_half_open` | LLM cost | `{hourlySpendCents, dailySpendCents}` |
| `llm_cost_circuit_breaker_close` | LLM cost | `{hourlySpendCents, dailySpendCents}` |
| `llm_cost_circuit_breaker_open` | LLM cost | `{hourlySpendCents, dailySpendCents, hourlyThresholdCents, dailyBudgetCents, from: 'half_open'\|'closed'}` |
| `llm_guard_circuit_breaker_half_open` | Guardrail | `{openedAt: ISO\|null, windowMs}` |
| `llm_guard_circuit_breaker_close` | Guardrail | `{probeDurationMs}` |
| `llm_guard_circuit_breaker_open` | Guardrail | `{failureCount, windowMs, from: 'half_open'\|'closed'}` |

  `from` payload casing **lowercase** (`'half_open'` / `'closed'`) byte-identical pre/post-refactor — verified at T0 inventory phase before any write. Loki queries / runbooks / on-call dashboards continue à scraper byte-identical.
- **`museum-backend/tests/unit/chat/llm-circuit-breaker.test.ts` étendu (10 → 11 cases, FROZEN at green, sha256 `d0e6f0a1964617ee626dd2e1eaba3b5852c0ba7a40e18ffe08ac668eb9717634`)** — 1 nouvelle case ADDITIVE appendée (lignes 130+, purement additif, +34 / −0 LOC) : `it('fires onStateChange callback on every real FSM transition when supplied', ...)` vérifie CLOSED→OPEN, OPEN→HALF_OPEN (lazy via `jest.advanceTimersByTime`), HALF_OPEN→CLOSED — toutes fire le callback avec `(next, prev)` payload. Les 10 cases existantes UNTOUCHED byte-identical (spec §6.2 surgical update only).

### Security

- **Fail-CLOSED path préservé byte-identical** — `llm-circuit-breaker.ts:73-75` continue à `throw new CircuitOpenError()` quand `circuit.state === 'OPEN'`. Upstream `langchain.orchestrator.ts` catches via global error middleware → 503 au client. ADR-047 fail-CLOSED policy pour V2 LLM Guard preserved at wrapper level. `CircuitOpenError` re-exportée depuis le wrapper file (consumer import path byte-identical).
- **Sliding-window strategy fail-CLOSED sur threshold overflow** — `SlidingWindowFailureStrategy.shouldTrip(now)` prunes puis évalue `failures.length >= threshold` (≥, pas `>`). No off-by-one allowing one extra failure through. Vérifié par `sliding-window-failure-strategy.test.ts` case 2.
- **Cost-trip strategy day rollover atomique** — `CostTripStrategy.accumulateDaily(now, cents)` checks `dayKey !== current` et reset `{day, cents: 0}` AVANT increment. UTC `.toISOString().slice(0,10)` canonical day key (matches pre-refactor behaviour à `llm-cost-circuit-breaker.ts:189-195` byte-identical). Defense-in-depth : pas de double-counting on day boundary crossings.
- **Probe-slot accountant race-safe** — `ThreeStateCircuit.canAttempt()` decrement `availableProbes` SYNCHRONOUSLY dans le même getter call avant return true — concurrent probes ne peuvent pas tous passer (matches pre-refactor `GuardrailCircuitBreaker` invariant). Validé par `three-state-circuit.test.ts` case 5 avec `halfOpenMaxProbes=2` (admits 2 then returns false on 3rd call).
- **Cost predicate ORed conditions preserved** — `CostTripStrategy.shouldTrip(now)` returns `hourly > threshold OR daily > budget`. Defense-in-depth dual : hourly burst (DDoS amplification, scraping) AND daily cap (budget breach, wider than guardrail-budget LLM-judge cap per `llm-cost-circuit-breaker.ts:32-34` doc). Validé par `cost-trip-strategy.test.ts` cases 2-3.
- **No PII / no secret dans aucun new log payload** — `llm_circuit_breaker_open` payload `{failureCount, windowMs}` = counters seulement, no user data. `llm_cost_circuit_breaker_open` payload `{hourlySpendCents, dailySpendCents, hourlyThresholdCents, dailyBudgetCents, from}` = cents counters + thresholds seulement, no userId, no prompt content. `llm_guard_circuit_breaker_open` payload `{failureCount, windowMs, from}` = counters seulement. GDPR Art. 5(1)(c) data minimisation maintenue.
- **Primitive layer NO I/O, NO logging** — `three-state-circuit.ts` est domain-agnostic, ne logge JAMAIS, ne fait JAMAIS d'I/O. Wrappers possèdent toute l'observability via `onStateChange` callback. Encapsulation NFR-4 verified. Tested via 9 primitive cases (mock strategy with `resetCount`/`pruneCount` to prove no hidden side-channel).
- **Sentinel architecture frozen sha256 lock** — `0537a195b2c4df69c5cf64ddae97415f2fe98a26ee57f5411dc397516237ddcd` byte-identical verified pre-RED + post-RED + post-GREEN + post-VERIFY (UFR-022 frozen-test contract honoured, zéro editor self-modification across the cycle). Toute future réintroduction de `this.currentState = ...` mutation, private `trip(...)`/`transitionTo(...)` helpers, ou inline `failures: number[]` / `hourlyCharges` / `dailySpend` fields dans les 3 wrapper files, OU toute future suppression de l'import `ThreeStateCircuit` → fail CI sur PR avec hint `file:line`.
- **Zéro nouvelle dépendance** — `museum-backend/package.json` diff vide. Primitive + strategies utilisent stdlib uniquement (`Array.prototype.filter/push/reduce`, `Date.now`, `new Date().toISOString()`). `pnpm audit --prod` drift = 0.

### Migration notes

- **No migration required.** Wire format / HTTP behaviour des 5 consumers (`langchain.orchestrator.ts` + `llm-guard.adapter.ts` + `chat-module.ts` composition root + `/api/health` route + tests) est préservé byte-identical. Public API des 3 wrappers byte-identical au niveau call-graph (7 invariants vérifiés AC6 — `.execute(...)`, `.state`, `.recordSuccess()`, `.recordFailure()`, `.recordCharge(...)`, `.canAttempt()`, `.getState()`). Le seul delta ADDITIF est `LLMCircuitBreaker.onStateChange` option (non-breaking).
- **No FE follow-up.** Pas d'OpenAPI delta. Pas de FE/web touched. `/api/health` snapshot shapes byte-identical (`getLlmCircuitBreakerState()`, `getLlmGuardCircuitBreakerState()`, `getLlmCostCircuitBreaker().getState()`).
- **No env-var rename.** Tous les env vars `LLM_CB_*` / `LLM_GUARD_CB_*` continuent à fonctionner byte-identical (failureThreshold / windowMs / openDurationMs / halfOpenMaxProbes overrides).
- **No DB / Redis change.** Storage primitive in-process (rolling 1h window + UTC daily counter pour cost CB ; sliding-window failure count pour LLM + guard). V1 single-instance KISS — phase 3 horizontal scale promotes to Redis (out of scope per `llm-cost-circuit-breaker.ts:38-39` ADR comment).
- **Reversibility** : `git revert <sha>` restaure les 3 wrappers legacy à leur LOC pre-refactor (116 + 260 + 182 = 558 LOC) + retire le shared cluster `museum-backend/src/shared/circuit-breaker/` (3 files, 342 LOC) + retire les 3 nouveaux test files unit + retire le sentinel test architecture + revert l'extension du `llm-circuit-breaker.test.ts` (11 → 10 cases). Pas de DB migration ni de schema delta à revert. Le 5 sentinel sha256s frozen disparaissent proprement avec le revert.
- **Follow-up PRs recommended** (non-blocking, hors-scope) :
  - Wire `LLMCircuitBreaker.onStateChange` à un Prometheus gauge `llm_circuit_breaker_state` dans `chat-module.ts` composition root + `prometheus-metrics.ts` (parity avec `llm_cost_circuit_breaker_state` + `llm_guard_circuit_breaker_state`). ADR-047 amendment.
  - Extract `parsePositiveNumber` from `guardrail-circuit-breaker.ts` vers `@shared/env/parse-positive-number.ts` + reuse cross-modules (auth/chat/cache parseInt-with-fallback call sites).
  - Future 4th breaker (HTTP retry budget, token-bucket rate limit, etc.) ne pays que le delegate cost (~110 LOC) — l'amortization rationale validée par cette PR.

### Verification

```bash
cd museum-backend

# 1. Lint + typecheck
pnpm lint
# → eslint src/ --max-warnings=0 + lint:test-discipline + tsc --noEmit, exit 0

# 2. Unit tests — primitive + strategies + 3 wrappers + sentinel
pnpm test --testPathPattern="(unit/chat/(llm|llm-cost|guardrail)-circuit-breaker|unit/shared/circuit-breaker|unit/architecture/pr13-circuit-breaker-purity-sentinel)"
# → 7 suites pass, 54/54 tests pass (33 existing + 20 new primitive/strategies + 1 sentinel)

# 3. Chaos e2e (untouched, validates R3 call-graph invariants end-to-end)
pnpm test:e2e --testPathPattern="chaos-circuit-breaker"
# → green

# 4. LOC budget
wc -l src/modules/chat/adapters/secondary/llm/llm-circuit-breaker.ts \
      src/modules/chat/adapters/secondary/llm/llm-cost-circuit-breaker.ts \
      src/modules/chat/adapters/secondary/guardrails/guardrail-circuit-breaker.ts \
      src/shared/circuit-breaker/three-state-circuit.ts \
      src/shared/circuit-breaker/strategies/sliding-window-failure-strategy.ts \
      src/shared/circuit-breaker/strategies/cost-trip-strategy.ts
# → 110 / 175 / 144 / 189 / 60 / 93 = 771 LOC total (wrapper-only = 429, −129 vs pre-refactor)

# 5. Log event-name preservation
grep -nE "llm_(cost_)?(guard_)?circuit_breaker_(open|close|closed|half_open)" \
  src/modules/chat/adapters/secondary
# → 9 distinct event names preserved byte-identical (3 LLM latency + 3 cost + 3 guardrail)

# 6. Sentinel sha256 frozen
shasum -a 256 tests/unit/architecture/pr13-circuit-breaker-purity-sentinel.test.ts \
              tests/unit/shared/circuit-breaker/three-state-circuit.test.ts \
              tests/unit/shared/circuit-breaker/strategies/sliding-window-failure-strategy.test.ts \
              tests/unit/shared/circuit-breaker/strategies/cost-trip-strategy.test.ts \
              tests/unit/chat/llm-circuit-breaker.test.ts
# → all 5 sha256s match .claude/skills/team/team-state/2026-05-23-pr-13-threeStateCircuit/red-test-manifest.json
```

### Honesty

- **LOC budget STRETCH-MISS flagged honestly** (AC2 + AC11). Primitive 189 LOC vs ≤160 target (+29 LOC), combined 771 LOC vs ≤474 target (+297 LOC). Justifications documentées en spec §6.6 + design.md §2 + STORY.md green-phase notes : doc-comment blocks §3.5 invariants + `getCommonSnapshot` accessor + env-var override blocks + UFR-013 preamble doc on cost CB. Reviewer accepts STRETCH-MISS avec amortization rationale : duplication ratio drops from 100% (3 FSM copies) to 1 primitive + 3 thin delegates ; future 4th breaker ne pays que ~110 LOC. Pas de buried sous "minor overshoot" — flagged au niveau acceptance criteria binary check.
- **`LLMCircuitBreaker.onStateChange` opt-in seulement** (non-blocking observation reviewer §1). Composition root `chat-module.ts` ne wire pas encore le 3e Prometheus gauge `llm_circuit_breaker_state` (out of scope per spec §3.1 line 21). Parity callback contract achieved at the wrapper level ; metrics gauge wiring laissé pour follow-up PR (ADR-047 amendment).
- **`parsePositiveNumber` helper inline dans `guardrail-circuit-breaker.ts`** (lignes 42-47, non-blocking observation reviewer §3). Design.md §9 defers extraction to `@shared/env/parse-positive-number.ts` ; inline retention limite le PR blast radius. Recommended follow-up PR pour reuse cross-modules (auth/chat/cache).
- **Spec §6.2 byte-identity claim relaxed** during spec authoring : "33 unit cases byte-for-byte identical" was NOT achievable for `LLMCircuitBreaker.test.ts` because the additive `onStateChange` test case is mandated by R2.1. Spec explicitly relaxed to "surgical updates ONLY for the new `onStateChange` signal on `LLMCircuitBreaker` (additive)" — les 10 cases existantes stay byte-identical, la 11e est appendée. Honesty correction au spec phase, pas retrofit post-hoc.
- **Frozen-test contract honoured** — 5 sentinel sha256s byte-identical verified twice (post-green + post-verify). Aucun `BLOCK-TEST-WRONG` émis pendant le green phase — tous les RED tests genuine, aucune réécriture nécessaire.

## [Unreleased] — 2026-05-23 — PR-12 `extractEmailDomain` codemod sur 5 leads sites (multi-`@` adversarial `a@b@c.com` corner case fixed)

Run `2026-05-23-pr-12-extractEmailDomain` — douzième incremental refactor de l'audit `2026-05-23-audit-kiss-dry-backend` (finding B8 MED #2 : `extractEmailDomain` canonical helper bypassed in 5 leads sites). Pipeline : UFR-022 fresh-context 5-phase / reviewer (combined verify+security+review) **APPROVED** loop-1 terminal, zero CHANGES_REQUESTED, zero blocking finding. Codemod mécanique : 5 ad-hoc occurrences de `<expr>.split('@')[1] ?? 'unknown'` (4 dans `brevo-beta-signup.notifier.ts` lignes 62/99/120/128, 1 dans `submitPaywallInterest.useCase.ts` ligne 65) remplacées par un appel au helper canonique `extractEmailDomain(<expr>)` documenté GDPR Art. 5(1)(c) (A1 doctrine). Sentinel Jest frozen ajouté (`tests/unit/shared/pii/pr12-no-raw-email-domain-split.sentinel.test.ts`, sha256 `6ec4e58687aae08c0cf59d9d26dcf758efa56ca03329c217f8f7f8bf9d0ae833`) — bloque toute future réintroduction de `email.split('@')[1]` ou variant chaîné `.trim().split('@')[1]` dans les 2 fichiers leads, surface un hint `file:line` au reviewer sur failure. Net source LOC : `brevo-beta-signup.notifier.ts +1` + `submitPaywallInterest.useCase.ts +1` = **+2 LOC**. Wire format / HTTP behaviour : préservés byte-identical au niveau log (3 intended deltas seuls — last-`@`, trim, lower-case, tous des log-aggregation quality wins). Zéro migration DB applicative, zéro lib bump, zéro nouveau `eslint-disable`, zéro hook bypass, zéro OpenAPI delta, zéro FE follow-up. `pnpm --filter museum-backend test -- --testPathPattern='tests/unit/(leads|shared/pii|auth/a1-email-pii-sinks)'` → **9 suites pass, 62/62 tests pass, 0.760s**. Coverage helper `extractEmailDomain` = **100% all 4 metrics** (13/13 stmts, 4/4 branches, 2/2 fns, 11/11 lines). Reversibility : `git revert <sha>` restaure les 5 sites legacy + retire les 2 imports + retire le sentinel ; pas de DB migration ni de schema delta à revert.

### Changed

**Codemod 5 sites — `<expr>.split('@')[1] ?? 'unknown'` → `extractEmailDomain(<expr>)`** :

| Site | Fichier | Ligne (post-codemod) | Event log | Path |
|---|---|---|---|---|
| S1 | `museum-backend/src/modules/leads/adapters/secondary/notifier/brevo-beta-signup.notifier.ts` | 63 | `beta_signup_already_subscribed` | R16 idempotent duplicate |
| S2 | same file | 100 | `beta_signup_remove_contact_not_found` | R5 idempotent 404 erasure |
| S3 | same file | 121 | `beta_signup_notifier_noop` | R14 no-creds subscribe |
| S4 | same file | 129 | `beta_signup_remove_contact_noop` | B2 no-creds erasure |
| S5 | `museum-backend/src/modules/leads/useCase/submitPaywallInterest.useCase.ts` | 66 | `paywall_email_captured` | R21 paywall capture |

- **`museum-backend/src/modules/leads/adapters/secondary/notifier/brevo-beta-signup.notifier.ts`** (+5 / −4 LOC) — ajouté `import { extractEmailDomain } from '@shared/pii/extractEmailDomain';` (ligne 2, alphabetical relative to existing `@shared/logger/logger` import). 4 sites S1–S4 substitués byte-identique au champ `emailDomain:` (R1.3 préservé). Le `encodeURIComponent(email)` ligne 83 (Brevo `DELETE /v3/contacts/{email}` GDPR erasure API call, R4–R6) est un legitimate non-log sink — laissé untouched, sentinel ne match pas ce pattern.
- **`museum-backend/src/modules/leads/useCase/submitPaywallInterest.useCase.ts`** (+2 / −1 LOC) — ajouté `import { extractEmailDomain } from '@shared/pii/extractEmailDomain';` (ligne 3, alphabetical entre `@shared/logger/logger` et `@shared/validation/email`). Site S5 substitué, intermediate `const emailDomain = ...` form préservée (R1.5).
- **`museum-backend/tests/unit/shared/pii/extractEmailDomain.test.ts`** étendu (5 → 16 cases, FROZEN at green). Nouvelles assertions :
  - **Multi-`@` adversarial** (ligne 29) — `extractEmailDomain('a@b@c.com')` → `'c.com'`. Documented intended-bug-fix (vs old `.split('@')[1]` qui retourne `'b'`).
  - **Local-part isolation** (lignes 53-58) — `'secret.local-part@example.com'` → `'example.com'` ; output asserted NOT to contain `'secret'` nor `'@'`. Sentinel-level proof helper cannot leak the local part.
  - **Trim + lower-case** — `'  Alice@Example.COM  '` → `'example.com'`.
  - **Fallback `'unknown'`** (lignes 32-51) — `''` / `'   '` / `'no-at-sign'` / `'x@'` → `'unknown'`.
  - **Helper purity** (lignes 64-74) — reads helper source via `readFileSync`, asserts no `@shared/logger`, no `node:fs`, no `console.` smuggling.

### Added

- **Architecture sentinel `museum-backend/tests/unit/shared/pii/pr12-no-raw-email-domain-split.sentinel.test.ts`** (NEW, sha256 `6ec4e58687aae08c0cf59d9d26dcf758efa56ca03329c217f8f7f8bf9d0ae833`, FROZEN) — garde régression permanente. Tourne dans le `pnpm test` gate existant (zéro nouveau `package.json` `scripts:` entry, zéro CI workflow change). Assertions filesystem-based (`readFileSync` + `expect(content).not.toContain(...)`) :
  - **Block A** (3 forbidden patterns × 2 files = 6 assertions) — `brevo-beta-signup.notifier.ts` et `submitPaywallInterest.useCase.ts` MUST NOT contain `email.split('@')[1]`, MUST NOT contain `.split('@')[1]` (catches chained `.trim().split('@')[1]` variant), MUST import `extractEmailDomain` depuis `@shared/pii/extractEmailDomain`. Chaque assertion surface un hint `file:line` au reviewer sur failure.

### Security

- **GDPR Art. 5(1)(c) data minimisation reinforced** (A1 doctrine). Tous les 5 log sinks émettent maintenant un `emailDomain` dérivé via le helper canonique — pas de `email`, pas de `payload.email`, jamais le local-part ne touche le log sink. Aligned avec la discipline auth A1 déjà en place (`tests/unit/auth/a1-email-pii-sinks.test.ts`).
- **Multi-`@` adversarial `a@b@c.com` corner case FIXED — defense-in-depth security win.** L'ancien pattern `<expr>.split('@')[1] ?? 'unknown'` retournait `'b'` (substring entre le PREMIER et le DEUXIÈME `@`) — i.e. un fragment du LOCAL-PART, pas le domaine. Le helper `extractEmailDomain` utilise `String.prototype.lastIndexOf('@')` puis `.slice(lastAt + 1)` → retourne `'c.com'` (substring après le DERNIER `@`). `validateEmail` rejette multi-`@` upstream dans S5 (`submitPaywallInterest`), MAIS S2/S4 (`removeContact`) reçoivent un `email` arg raw sans `validateEmail` upstream — le fix au niveau helper est **load-bearing pour ces 2 paths**. Asserted explicitement à `extractEmailDomain.test.ts:29`. Sentinel test prevent regression going forward.
- **Local-part leak elimination.** Pour multi-`@` input (`'a@b@c.com'`), l'ancien `.split('@')[1]` exposait `'b'` (fragment du local-part) dans le log sink. Le nouveau helper guarantee le substring après le DERNIER `@` — jamais le local-part, même pour des inputs adversariaux. `extractEmailDomain.test.ts:53-58` asserte que `'secret.local-part@example.com'` → `'example.com'` et que l'output ne contient ni `'secret'` ni `'@'`.
- **Helper purity proven** — `extractEmailDomain.test.ts:64-74` lit le helper source via `readFileSync` et asserte zéro import `@shared/logger`, zéro import `node:fs`, zéro `console.` statement. Le helper ne peut PAS smuggler un side-channel (logger, IO, framework). Pure synchronous string ops uniquement (`trim`, `lastIndexOf`, `slice`, `toLowerCase`).
- **Fallback `'unknown'` byte-identique au legacy** — empty / whitespace-only / no-`@` / `'x@'` inputs retournent le literal `'unknown'`, identique au précédent `?? 'unknown'`. No PII leak even on malformed input. Wire format byte-identique pour ces inputs.
- **3 intended deltas seuls** (log-aggregation quality wins, non breaking) — (a) lower-casing (`'Alice@Example.COM'` → `'example.com'` ; S5 lower-case déjà upstream, no observable delta pour paywall capture), (b) trim (`'bob@x.com  '` → `'x.com'`), (c) last-`@` semantic (`'a@b@c.com'` → `'c.com'` not `'b'`). Verified §2.3 spec : aucune Grafana / log alert rule key sur la case du champ `emailDomain` — fix-on-bake acceptable si découverte.
- **Sentinel frozen sha256 lock** — `6ec4e58687aae08c0cf59d9d26dcf758efa56ca03329c217f8f7f8bf9d0ae833` byte-identical verified pre-RED + post-RED + post-GREEN + post-VERIFY (UFR-022 frozen-test contract honoured, zéro editor self-modification across the cycle).
- **DELETE URL on `brevo-beta-signup.notifier.ts:83` untouched** — `encodeURIComponent(email)` est le legitimate Brevo `DELETE /v3/contacts/{email}` GDPR erasure API call (R4–R6), pas un log sink. Correctement left untouched. Sentinel pattern `email.split('@')[1]` ne match pas `encodeURIComponent(email)` → pas de false positive.
- **Zéro nouvelle dépendance** — `museum-backend/package.json` diff vide. Helper utilise stdlib uniquement. `pnpm audit --prod` drift = 0.

### Migration notes

- **No migration required.** Wire format / HTTP behaviour de tous les 5 sites est préservé byte-identical au niveau des consumers (le champ `emailDomain` reste un string, le `'unknown'` fallback est byte-identique, le surrounding event name et autres log payload keys préservés byte-identical per R1.4). Les 3 intended deltas (lower-case, trim, last-`@`) sont des log-aggregation quality wins observables uniquement sur du traffic adversarial ou mixed-case — pas de break de dashboard prod (verified §2.3).
- **No FE follow-up.** Pas d'OpenAPI delta. Pas de FE/web touched (codemod scoped à `museum-backend/src/modules/leads/` uniquement par R6.3). Wire/HTTP behaviour des routes leads inchangé (logs only changes per R6.4).
- **Reversibility** : `git revert <sha>` restaure les 5 sites legacy + retire les 2 `import { extractEmailDomain }` + retire le sentinel test + revert l'extension du helper test (5 → 16 cases). Pas de DB migration ni de schema delta à revert. Le sentinel sha256 frozen disparaît proprement avec le revert.

### Verification

```bash
cd museum-backend

# Codemod scope verified — zero residual ad-hoc split pattern
grep -rnE "split\(['\"]@['\"]\)\[1\]" src/
# → 0 hits across the whole src tree

# Helper imported at the 2 touched files
grep -rn "extractEmailDomain" src/modules/leads
# → 6 hits (2 imports + 4 calls in notifier, 1 import + 1 call in useCase)

# Scoped test gate
pnpm jest --no-coverage --testPathPattern='tests/unit/(leads|shared/pii|auth/a1-email-pii-sinks)'
# → 9 suites pass, 62/62 tests pass, 0.760s

# Helper coverage 100%
pnpm jest --testPathPattern='tests/unit/shared/pii/extractEmailDomain.test' --coverage
# → 13/13 stmts, 4/4 branches, 2/2 fns, 11/11 lines

# Lint + typecheck clean
pnpm lint
# → eslint src/ --max-warnings=0 + lint:test-discipline + tsc --noEmit, exit 0

# Sentinel sha256 frozen
shasum -a 256 tests/unit/shared/pii/pr12-no-raw-email-domain-split.sentinel.test.ts
# → 6ec4e58687aae08c0cf59d9d26dcf758efa56ca03329c217f8f7f8bf9d0ae833 (matches red-test-manifest.json)
```

### Honesty

- **Brief mentionned `findings/findings-B8.md`** : ce fichier N'EXISTE PAS dans le working tree au moment du spec (`ls findings/` → no such directory). Le bug claim a été re-vérifié indépendamment contre le contrat documenté du helper canonique (`extractEmailDomain.ts:17-26`) ; le spec a explicitement noté l'absence du finding doc plutôt que de fabriquer une citation.
- **Brief mentionned a B8 #2 row in `docs/TECH_DEBT.md`** : verified the file does not list a B8-#2 row by that anchor → R7.2 (doc closure) shrunk au PR description anchor only ; TECH_DEBT update skipped honestly rather than fabricated.
- **Spec R5.1 wanted a call-site test asserting `emailDomain: 'c.com'` sur `payload.email = 'a@b@c.com'` pour les 5 leads sites.** `validateEmail` upstream rejette multi-`@` pour le validated entry point (S5), donc le call-site test gap sur les leads suites RESTE — only assertion = helper-level proof à `extractEmailDomain.test.ts:29`. Acknowledged dans spec §2.5 comme acceptable. Flagged pour future hardening si un non-validated entry point est ajouté.
- **A1 PII-sinks audit (`tests/unit/auth/a1-email-pii-sinks.test.ts`) does not yet enumerate leads sinks.** Out of scope pour cette PR ; future doctrine proposal pour rendre l'audit A1 module-agnostic. La sentinel test `pr12-no-raw-email-domain-split.sentinel.test.ts` étend implicitement la discipline A1 aux leads sites via filesystem assertions, en attendant l'extension formelle.

## [Unreleased] — 2026-05-23 — PR-11 `dailyChatLimit` → atomic `createRateLimitMiddleware` (multi-device burst race ELIMINATED)

Run `2026-05-23-pr-11-dailyChatLimit` — onzième incremental refactor de l'audit `2026-05-23-audit-kiss-dry-backend/findings/findings-B2.md` (finding D2 : race-prone read-then-write GET/SET sur freemium daily cap). Pipeline : UFR-022 fresh-context 5-phase / reviewer **APPROVED** weightedMean **9.05/10** (loop-1 terminal, zero CHANGES_REQUESTED). Migration de `dailyChatLimit` (169 LOC hand-rolled `CacheService` get→compare→set non-atomic) vers une instance unique de `createRateLimitMiddleware` (66 LOC, **−61 %**) qui délègue à `RedisRateLimitStore.increment` via le script atomique Lua `INCR_EXPIRE_LUA`. Extension du factory `createRateLimitMiddleware` avec 5 nouveaux knobs optionnels (`errorCode` / `errorMessage` / `statusCode` / nullable `keyGenerator` / function-form `windowMs` / empty-string `bucketName` opt-out) — extensions purement additives, zéro changement aux 6+ call sites existants. **Bonus TOCTOU fix** sur `BucketContext.failClosed` (snapshot synchrone à l'entrée du handler) défense-en-profondeur héritée par tous les futurs consommateurs du factory. Zéro migration DB applicative, zéro lib bump, zéro nouveau `eslint-disable`, zéro hook bypass. `pnpm jest --no-coverage --testPathPattern='(middleware/rate-limit\.test|middleware/daily-chat-limit\.test|architecture/pr11-dailyChatLimit-sentinel)'` → **3 suites pass, 50/50 tests pass, 0.779s**. Reversibility : `git revert <sha>` restaure le module legacy + le boot wiring + les 3 test files frozen.

### Added

- **`RateLimitOptions` extensions** (`museum-backend/src/shared/middleware/rate-limit.middleware.ts:31-61`). 5 knobs optionnels, tous documentés TSDoc, tous orthogonaux, tous purement additifs :
  - `windowMs: number | ((req: Request) => number)` — widened (was `number`). Function form re-évaluée per request → tracks calendar-day rollover ms-jusqu'au-midnight UTC. PR-11 R7.2. Numeric form unchanged for the 6+ existing call sites.
  - `keyGenerator: (req: Request) => string | null` — widened (was `(req) => string`). Returning `null` → middleware appelle `next()` **sans argument** (skip propre — pas de counter read/write, pas d'erreur émise). PR-11 R2.1. `byIp`/`bySession`/`byUserId` continuent à retourner `string` par covariance (R2.3, zéro call-site change).
  - `bucketName?: string` (shape inchangée mais semantics étendue) — empty string `''` opts OUT du namespace prefix entirely (`usePrefix = namespace !== ''` à `rate-limit.middleware.ts:176`). La sortie brute du `keyGenerator` devient la clé Redis. PR-11 R8.1. Préserve les keys shape legacy lors d'une migration. `undefined` → anon prefix (legacy behaviour).
  - `errorCode?: string` — quand fourni, remplace le code AppError par défaut `TOO_MANY_REQUESTS`. PR-11 R1.1.
  - `errorMessage?: string` — quand fourni, remplace le message par défaut `'Too many requests. Please retry later.'`. PR-11 R1.2.
  - `statusCode?: 429 | 402` — quand fourni, fixe le HTTP status code sur cap (default 429). Union littérale enforced à compile time. `402` réservé pour une future migration `monthlySessionQuota` (non incluse PR-11). PR-11 R1.3.
- **Helper `buildCapError(limit, capError): AppError`** (`rate-limit.middleware.ts:96-107`) extrait pour unifier la construction du `AppError` à travers (a) le in-memory cap path, (b) le Redis cap path. Default branch (`capError.code === null`) appelle `tooManyRequests(...)` byte-for-byte → zéro régression pour les 6+ call sites pré-existants qui ne set pas les nouveaux knobs. Custom branch retourne `new AppError({ statusCode: capError.statusCode ?? 429, code: capError.code, message: capError.message ?? '…', details: { limit } })`.
- **`BucketContext.failClosed: boolean`** (`rate-limit.middleware.ts:79-94`) — snapshot synchrone de `env.rateLimit.failClosed` capturé à l'entrée du handler (line 199). Le deferred `.catch(...)` microtask lit `ctx.failClosed`, pas `env.rateLimit.failClosed`. Closes un TOCTOU latent où un test/operator togglant l'env entre l'entrée du handler et la résolution du catch observerait la valeur post-toggle. `handleRedisFailure` lit `ctx.failClosed` exclusivement (line 137-138). Sentry alerting path intact.
- **Unit test `museum-backend/tests/unit/middleware/rate-limit.test.ts`** (826 LOC total, étendu à 34 cases, sha256 `c0131e8af7da4d7f6c2055b601e27b9e2e54329d5bbc9ea2dab1668decdd4808`, FROZEN). Couvre les 5 surfaces d'extension R1+R2+R7+R8 :
  - **R1** : `tooManyRequests(...)` default path byte-for-byte quand les 3 knobs omis ; emission custom `AppError({ statusCode, code, message, details: { limit } })` quand n'importe lequel set ; status union enforced.
  - **R2** : `keyGenerator → null` → `next()` zéro argument, Redis `.increment` NOT called (spy call count assertion), in-memory store NOT touched (`getBucketCountForKey === undefined`).
  - **R7** : `windowMs: () => 5000` → `redisStore.increment(key, 5000)` (mock spy on increment args), function called fresh each request.
  - **R8** : `bucketName: ''` → raw `keyGenerator(req)` output as final key (pas de leading `:`) ; `bucketName: undefined` → anon prefix (legacy) ; `bucketName: 'foo'` → `'foo:rawKey'` (legacy).
  - **TOCTOU snapshot** : env toggled mid-flight → handler observes snapshot, not live value.
- **Unit test `museum-backend/tests/unit/middleware/daily-chat-limit.test.ts`** (415 LOC, 12 cases, sha256 `68fdf554e975bd847a983ca33fad6ac9ed05ee0d43f02dd65d2d2a0087be06c4`, FROZEN). Rewrite complet exerçant le nouveau module via la shared API :
  - In-memory cap path : 1st→200, Nth=limit→200, (N+1)th→429 + `code: 'DAILY_LIMIT_REACHED'` + `message: 'Daily chat limit reached'` + `details: { limit }` + `Retry-After` header.
  - Redis distributed path (`setRedisRateLimitStore(mockedStore)`) : atomic increment via mock call args, key shape `daily-chat:<userId>:<UTC-date>` bit-identical, wire format identical.
  - Day-boundary rollover (`jest.useFakeTimers()` + `jest.setSystemTime('2026-05-23T23:59:59Z')` → next call at `'2026-05-24T00:00:00Z'` reset counter to 1).
  - Anonymous skip (`req.user` undefined → `next()` clean, zéro Redis call) + empty-id skip (`req.user = { id: '' }` → null path).
  - Concurrent burst sous cap (`Promise.all` 10 requests, `limit: 3`, atomic mock) → exactement 3 allowed + 7 blocked (validates R4.3).
- **Architecture sentinel `museum-backend/tests/unit/architecture/pr11-dailyChatLimit-sentinel.test.ts`** (118 LOC, sha256 `bd4fd6c340c94ec6cbefa0d1d0c6e2e456d18f42f4f6c09fbeb28ffe8676770f`, FROZEN) — garde régression permanent. Tourne dans le `pnpm test` gate existant. Assertions filesystem-based :
  - **Block 1** (3 forbidden patterns sur `daily-chat-limit.middleware.ts`) : MUST NOT contain `cache.get(` (race-prone read), MUST NOT contain `cache.set(` (race-prone write), MUST NOT contain `setDailyChatLimitCacheService` (résidu boot wiring). Chaque assertion surface `file:line` remediation hint sur failure.
  - **Block 2** (1 required import) : MUST import `createRateLimitMiddleware` depuis `@shared/middleware/rate-limit.middleware`. Catches future drift où quelqu'un ré-implémenterait daily-chat à la main.

### Changed

**Migration `dailyChatLimit` (`museum-backend/src/shared/middleware/daily-chat-limit.middleware.ts`)** :

| Aspect | Pre-PR-11 (169 LOC) | Post-PR-11 (66 LOC, **−61 %**) |
|---|---|---|
| Surface | `InMemoryBucketStore` instance + `setDailyChatLimitCacheService` + `_resetDailyChatLimitCacheService` + `clearDailyChatLimitBuckets` + `checkInMemory` + `dailyChatLimit` `RequestHandler` hand-rolled (lines 91-113) | 2 helpers (`utcDateString`, `msUntilMidnightUtc`) + 1 const (`DAILY_CHAT_LIMIT = Math.max(1, env.freeTierDailyChatLimit)`) + 1 single `createRateLimitMiddleware({ … })` call exporté comme `dailyChatLimit` |
| Counter shape | `cache.get<number>(key)` → comparison → `cache.set(key, count+1, ttl)` (**2 round-trips, race-prone**) | `RedisRateLimitStore.increment(key, windowMs)` → single `EVAL` `INCR_EXPIRE_LUA` (**1 round-trip, atomic**) |
| Failure mode | Fail-OPEN (in-memory fallback toujours) | `env.rateLimit.failClosed` policy — prod 503 + Sentry, dev memory fallback (R6 + spec §8 D2) |
| Wire format | 429 + `AppError { code: 'DAILY_LIMIT_REACHED', message: 'Daily chat limit reached', details: { limit } }` ; **PAS de Retry-After** | 429 + `AppError { code: 'DAILY_LIMIT_REACHED', message: 'Daily chat limit reached', details: { limit } }` **byte-for-byte** + **`Retry-After: <seconds>` ajouté** (additive, non-breaking — FE interceptor key sur `error.code`) |
| Anonymous skip | `if (!req.user?.id) return next()` ligne 75-78 | `keyGenerator` retourne `null` → factory call `next()` clean (R2.1). Defense-en-profondeur sur `isAuthenticated` upstream |
| Test surface | `setDailyChatLimitCacheService(cache)` + `clearDailyChatLimitBuckets()` + `_resetDailyChatLimitCacheService()` | `setRedisRateLimitStore(mockedStore)` + `clearRateLimitBuckets()` partagés depuis `rate-limit.middleware.ts` |

**Boot wiring (`museum-backend/src/index.ts`, −5 LOC)** :
- Retiré : `import { setDailyChatLimitCacheService } from '@shared/middleware/daily-chat-limit.middleware'` (line 42, old).
- Retiré : appel `setDailyChatLimitCacheService(redisCacheService)` (line 120, old).
- `setRedisRateLimitStore(redisRateLimitStore)` wiring (line 119) suffit — le `dailyChatLimit` migré hérite du store partagé.

**Sites callers (`grep -rn dailyChatLimit src/`) — 3 fichiers, INCHANGÉS** :
- `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-message.route.ts:14, 186`
- `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-media.route.ts:26, 244`
- `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-compare.route.ts:25, 218`
- Honnêteté : le brief mentionnait "7 sites callers" — verified count = 3 source files (le test file est rewritten, pas unchanged). Cf. spec AC6.

Net source LOC delta : `rate-limit.middleware.ts +100` + `daily-chat-limit.middleware.ts −103` + `index.ts −5` = **−8 LOC net**. La duplication race-prone (`cache.get → compare → cache.set` triplet) existe maintenant dans zéro site.

### Security

- **Race condition burst multi-device ELIMINATED — majeur freemium V1 security win.** Le pattern legacy non-atomique 2-round-trip permettait, sous burst load d'un user authentifié sur plusieurs devices, à deux requêtes interleavées de lire `N`, calculer `N+1`, et écrire `N+1` toutes les deux — over-grant du quota free-tier jusqu'à `N` requêtes concurrentes. Le pattern migré exécute un seul `EVAL` Lua `INCR + PEXPIRE` côté Redis server (`redis-rate-limit-store.ts:16-24`) : zéro fenêtre pour des increments interleavés. **Sentinel test prevent regression** (`tests/unit/architecture/pr11-dailyChatLimit-sentinel.test.ts` lock `cache.get` / `cache.set` / `setDailyChatLimitCacheService` ABSENT going forward).
- **Bonus TOCTOU fix sur `failClosed` snapshot** — `env.rateLimit.failClosed` capturé synchroniquement à l'entrée du handler dans `ctx.failClosed`. Le deferred `.catch(...)` microtask (après le Redis round-trip) lit `ctx.failClosed`, jamais `env.rateLimit.failClosed`. Closes un TOCTOU latent où un test ou operator togglant l'env entre l'entrée handler et la résolution du catch observerait la valeur post-toggle au lieu de la valeur à l'entrée. Tests qui pin l'env via `withFailClosed(...)` voient maintenant la valeur pinnée déterministiquement. Sentry alerting path préservé (line 143-146). Pas strictement requis par la migration, mais hérité par tous les consommateurs futurs du factory.
- **Wire format byte-for-byte préservé** — clients FE qui branch sur `error.code === 'DAILY_LIMIT_REACHED'` continuent à fonctionner. `Retry-After` ajouté est strictement additive (FE interceptor ne dépend pas de son absence). Aucun OpenAPI delta. Aucune migration FE/web requise.
- **Anonymous skip semantics préservé** — counter UNTOUCHED pour `req.user` undefined ou empty-id. Pas de pollution counter anonyme. Pas de DoS sur `daily-chat:undefined:*`. Defense-en-profondeur sur `isAuthenticated` upstream (chat-message.route.ts:185-186).
- **Zéro nouvelle dépendance** — `museum-backend/package.json` diff vide. `pnpm audit --prod` drift = 0 (1 moderate `qs` DoS pré-existant, non introduit par PR-11).

### Migration notes

- **Redis keyspace rename (one-time at-deploy quota reset)** : `RedisRateLimitStore` (`redis-rate-limit-store.ts:34`) préfixe ses propres clés avec `ratelimit:`. La key shape Redis pour daily-chat passe donc de `daily-chat:<userId>:<UTC-date>` (legacy `CacheService` no-prefix) à `ratelimit:daily-chat:<userId>:<UTC-date>` (new `RedisRateLimitStore`). Effet at-deploy = chaque utilisateur authentifié reçoit un quota fresh free-tier la seconde après deploy. **Pré-launch (zero live users, zero contracted B2B per `project_roadmap_b2b_claims_false`), c'est un non-événement.** Documenté ici explicitement pour qu'un futur lecteur ne prenne pas le rename pour un bug.
- **Failure mode behavioural change** : daily-chat fail-OPEN (legacy) → fail-CLOSED en prod / memory fallback en dev (aligne sur la policy partagée `env.rateLimit.failClosed`, R6.3). Décision spec §8 D2 — single policy, no special case. Si une panne Redis en prod blank le daily cap, le coût d'abuse > le coût de 503.
- **Reversibility** : `git revert <sha>` restaure `daily-chat-limit.middleware.ts` legacy + le boot wiring `setDailyChatLimitCacheService` dans `index.ts` + les 3 test files frozen. Pas de DB migration ni de schema delta à revert.

### Verification

```bash
cd museum-backend && pnpm jest --no-coverage --testPathPattern='(middleware/rate-limit\.test|middleware/daily-chat-limit\.test|architecture/pr11-dailyChatLimit-sentinel)'
# → 3 suites passed, 50/50 tests passed, 0.779s

cd museum-backend && pnpm lint
# → exit 0 (eslint src/ + lint:test-discipline + tsc --noEmit)

shasum -a 256 \
  museum-backend/tests/unit/middleware/rate-limit.test.ts \
  museum-backend/tests/unit/middleware/daily-chat-limit.test.ts \
  museum-backend/tests/unit/architecture/pr11-dailyChatLimit-sentinel.test.ts
# → c0131e8af7da4d7f6c2055b601e27b9e2e54329d5bbc9ea2dab1668decdd4808  …/rate-limit.test.ts
#   68fdf554e975bd847a983ca33fad6ac9ed05ee0d43f02dd65d2d2a0087be06c4  …/daily-chat-limit.test.ts
#   bd4fd6c340c94ec6cbefa0d1d0c6e2e456d18f42f4f6c09fbeb28ffe8676770f  …/pr11-dailyChatLimit-sentinel.test.ts
# (byte-identical avec red-test-manifest.json — frozen-test contract honoré)
```

---

## [Unreleased] — 2026-05-23 — PR-10 `shared/cache/probabilistic-refresh.ts` helper + sweep Overpass/Nominatim

Run `2026-05-23-pr-10-probabilistic-refresh` — dixième incremental refactor de l'audit `2026-05-23-audit-kiss-dry-backend/findings/findings-B5.md` HIGH #1 (refresh-helper duplication Overpass ↔ Nominatim). Pipeline : UFR-022 fresh-context 5-phase / reviewer **APPROVED** weightedMean **8.85/10** (loop-1 terminal, zero CHANGES_REQUESTED). Extraction du primitive probabiliste sous `museum-backend/src/shared/cache/` + sweep mécanique des 2 sites HTTP-cached qui dupliquaient le triplet (`Math.random()` jitter formula, `function shouldEarlyRefresh`, `function fireBackgroundRefresh`). Zéro migration DB, zéro lib bump, zéro nouveau `eslint-disable`, zéro hook bypass. `pnpm jest --testPathPattern='(probabilistic-refresh|pr10-probabilistic-refresh-sentinel|overpass-cache|nominatim)' --no-coverage` → **8 suites pass, 105/105 tests pass**. Reversibility : `git revert <sha>` restaure helper + 2 sweep sites + 2 red files.

### Added

- **Helper module `museum-backend/src/shared/cache/probabilistic-refresh.ts`** (143 LOC). 3 named exports + 1 const + 1 narrow interface :
  - `export const EARLY_REFRESH_THRESHOLD_DEFAULT = 0.9` — single source of truth for the late-window jitter threshold. Exposed so callers can reason about the window without reaching into internals.
  - `export interface RefreshableEntry<T> { value: T; storedAtMs: number; ttlSeconds: number }` — minimal cache-entry shape. Generic over `T` so callers can union with `null` (e.g. `T = NominatimReverseResult | null`) without a runtime guard.
  - `export function shouldEarlyRefresh<T>(entry, nowMs, threshold?): boolean` — pure predicate. Short-circuits `false` (NO `Math.random` call) when `ttlSeconds <= 0` (incl. negative for clock skew) OR `elapsedRatio < threshold`. Otherwise returns `Math.random() < (elapsedRatio - threshold) / (1 - threshold)`. Strict-`<` boundary preserved (mutation killer R5(c') in red tests). Single `// eslint-disable-next-line sonarjs/pseudo-random -- non-security: TTL jitter` lives here — single source of truth for the lint exception.
  - `export interface RefreshLogger { warn(message, context?): void }` — structural-typing narrow interface so the factory accepts `@shared/logger/logger` without dragging the full module's typing.
  - `export function createBackgroundRefresh<T>(deps): (args) => void` — factory. `deps = { cache, logger, opName, failureMessage, isEmpty }` baked at client construction. Returned trigger takes `{ cacheKey, refresh, positiveTtlSeconds, negativeTtlSeconds }` per call. Synchronous `void` return (callers MUST NOT await). Internal `void (async IIFE)()` wraps `refresh() → isEmpty?neg:pos TTL bucket → cache.set(key, entry, ttl)`. On throw: `logger.warn(failureMessage, { op, cacheKey, error })` with `error: error instanceof Error ? error.message : String(error)` (homogeneous log shape — downstream dashboards rely on `error: string`).

- **Unit test `museum-backend/tests/unit/shared/cache/probabilistic-refresh.test.ts`** (380 LOC, sha256 `5dd9df3709e9dfe26a2a92d164ae7d1a1c174be96d845f2a63a0ad34d359bc05`, FROZEN). Covers R5 cases (a)–(h) directly on the shared module via `jest.spyOn(Math, 'random')` + `afterEach(() => jest.restoreAllMocks())` :
  1. `elapsedRatio < threshold` → `false`, `Math.random` call count == 0 (short-circuit asserted via mock).
  2. `ttlSeconds <= 0` → `false`, `Math.random` call count == 0.
  3. `ttlSeconds < 0` (clock-skew negative) → `false`, `Math.random` call count == 0.
  4. `ttlSeconds > 0 && elapsedRatio >= threshold && Math.random < adjustedRatio` → `true`.
  5. **Strict-`<` boundary** (`Math.random === adjustedRatio` → `false`) — mutation killer for `<` → `<=` flip.
  6. Factory trigger calls `cache.set` with positive TTL when `isEmpty(value) === false`.
  7. Factory trigger calls `cache.set` with negative TTL when `isEmpty(value) === true`.
  8. Factory trigger handles `T = X | null` union (Nominatim shape) without runtime guard.
  9. Factory trigger calls `logger.warn(failureMessage, { op, cacheKey, error })` on caught `refresh()` error, **never throws** (`expect(() => trigger(args)).not.toThrow()` + microtask flush).
  10. Factory trigger calls `logger.warn` when `cache.set` itself throws.
  11. Non-Error rejection values stringified via `String(error)` (homogeneous log shape).

- **Architecture sentinel `museum-backend/tests/unit/architecture/pr10-probabilistic-refresh-sentinel.test.ts`** (135 LOC, sha256 `999083115f60411f4c4098bf89e3547620f2e7de5b0f8e15f1e2a9293c12ec86`, FROZEN) — permanent regression guard. Tourne dans le `pnpm test` gate existant. Assertions filesystem-based (regex scan, aucun import runtime des sites swept) :
  - **Block 1** (3 forbidden-pattern × 2 sweep targets = 6 assertions) : `museum-backend/src/shared/http/overpass-cache.ts` + `museum-backend/src/shared/http/nominatim.client.ts` MUST NOT contain inline `Math.random\(\)\s*<\s*\(.*EARLY_REFRESH_THRESHOLD.*\)\s*\/\s*\(1\s*-\s*EARLY_REFRESH_THRESHOLD\)` formula, MUST NOT redeclare a local `function shouldEarlyRefresh` body, MUST NOT redeclare a local `function fireBackgroundRefresh` body.
  - **Block 2** (2 import-check assertions) : both sweep targets MUST import `createBackgroundRefresh` + `shouldEarlyRefresh` + `type RefreshableEntry` from `@shared/cache/probabilistic-refresh`.
  - **Frozen-test contract** : `red-test-manifest.json` FLAT `{path: sha256}` shape (per `feedback_team_frozen_manifest_flat.md`).

### Changed

**Sweep 2 HTTP-cached client sites — inline `(Math.random < adjustedRatio)` formula + private `shouldEarlyRefresh` + private `fireBackgroundRefresh` → delegate to `@shared/cache/probabilistic-refresh`** :

| # | Site | Pre-PR-10 local symbols | Post-PR-10 surface | LOC delta |
|---|------|-------------------------|--------------------|-----------|
| 1 | `museum-backend/src/shared/http/overpass-cache.ts` | `interface OverpassCacheEntry` (5 LOC) + `const EARLY_REFRESH_THRESHOLD` (1 LOC) + `interface OverpassBackgroundRefreshArgs` (8 LOC) + `function fireOverpassBackgroundRefresh` body (20 LOC) + `function shouldOverpassEarlyRefresh` body (11 LOC) + Stryker disable + eslint-disable | `type OverpassCacheEntry = RefreshableEntry<OverpassMuseumResult[]>` alias (1 LOC) + `fireOverpassBackgroundRefresh(args)` thin shim delegating to `createBackgroundRefresh<OverpassMuseumResult[]>({ cache, logger, opName: 'overpass.background-refresh', failureMessage: 'Overpass background refresh failed', isEmpty: (v) => v.length === 0 })` (16 LOC incl. JSDoc) + `shouldOverpassEarlyRefresh = shouldEarlyRefresh<OverpassMuseumResult[]>` const-alias (1 LOC). `buildOverpassCacheKey` body unchanged. **Compat shims retained** so the frozen `tests/unit/shared/overpass-cache.test.ts` (4 cases on `shouldOverpassEarlyRefresh` + 4 on `fireOverpassBackgroundRefresh`) passes byte-identical | `−9` |
| 2 | `museum-backend/src/shared/http/nominatim.client.ts` | `const EARLY_REFRESH_THRESHOLD = 0.9` (1 LOC) + `interface ReverseGeocodeCacheEntry` (5 LOC) + `interface BackgroundRefreshArgs` (8 LOC) + `function fireBackgroundRefresh` body (19 LOC) + `function shouldEarlyRefresh` body (10 LOC) + Stryker textual-confession comment `'Same pattern as shared/http/overpass-cache.ts:113'` + eslint-disable | `import { createBackgroundRefresh, shouldEarlyRefresh, type RefreshableEntry } from '@shared/cache/probabilistic-refresh'` + `type ReverseGeocodeCacheEntry = RefreshableEntry<NominatimReverseResult \| null>` local alias (1 LOC) + `function buildNominatimBackgroundRefresh(cache)` extracted helper (8 LOC, keeps `createCachedNominatimClient` under `max-lines-per-function`). `createCachedNominatimClient` now calls `const triggerBackgroundRefresh = buildNominatimBackgroundRefresh(cache)` once at construction, then `triggerBackgroundRefresh({ cacheKey, refresh: () => reverseGeocodeWithNominatim(lat, lng), positiveTtlSeconds, negativeTtlSeconds })` per cache-hit early-refresh decision. **Frozen `tests/unit/shared/nominatim-cached-client.test.ts`** (474 LOC) passes byte-identical — public surface `createCachedNominatimClient(cache)` unchanged, internal sweep invisible to test surface | `−30` |

Net source LOC `+143 (new helper) − 9 (overpass-cache.ts) − 30 (nominatim.client.ts) = +104 cumulative`. Outside the spec A7 band `−50` to `−90` (reviewer non-blocking ⚠️) because of (a) Option A compat wrappers in `overpass-cache.ts` retained to honour UFR-022 frozen-test contract on `overpass-cache.test.ts`, (b) generous JSDoc on the shared helper (single source of truth doc), (c) `RefreshLogger` + `BackgroundRefreshDeps<T>` + `BackgroundRefreshTriggerArgs<T>` type-interface surface. Reviewer accepted the trade-off — the algorithm fingerprint duplication is gone, single `eslint-disable sonarjs/pseudo-random` site, single Stryker-relevant `Math.random` line.

**Stryker textual-confession comment dropped at `nominatim.client.ts:336`** — per spec A8. The legacy comment `'Same pattern as shared/http/overpass-cache.ts:113'` is REMOVED because the duplication it confessed no longer exists. The functional Stryker disable rationale (`ConditionalExpression,EqualityOperator` — `'observationally equivalent — both paths yield false when the probabilistic adjustment is ≤ 0 (Math.random < non-positive always false)'`) is preserved at the single shared site, with R5(c') strict-`<` boundary test as the active mutation killer.

**Additive `op` field in `logger.warn` context** — `{ op: 'overpass.background-refresh' | 'nominatim.background-refresh', cacheKey, error }`. Replaces the implicit-by-message-string discrimination (pre-PR-10 the 2 sites emitted 2 distinct message strings — `'Overpass background refresh failed'` / `'Nominatim background refresh failed'` — which remain unchanged via the `failureMessage` factory dep). **Non-breaking** : frozen tests use `expect.objectContaining({ cacheKey, error })` so the additional field passes through. Dashboards/Loki queries that filter by `op:` gain a structured discriminator without parsing the message string.

### Observable behavior preserved (byte-equivalent)

| Behavior | Pre-PR-10 | Post-PR-10 |
|---|---|---|
| `Math.random()` calls per `should*Refresh()` invocation | exactly 1 | exactly 1 |
| `Math.random` short-circuited when `elapsedRatio < threshold` | yes | yes (R5(a) asserted via spy call count) |
| `Math.random` short-circuited when `ttlSeconds <= 0` (incl. negative) | yes | yes (R5(b)(b') asserted) |
| Strict-`<` boundary on the random roll | yes | yes (R5(c') asserted — mutation killer) |
| `cache.set` w/ positive TTL when payload non-empty | yes | yes |
| `cache.set` w/ negative TTL when payload empty/null | yes | yes |
| `logger.warn` message string Overpass | `'Overpass background refresh failed'` | unchanged (via `failureMessage` factory dep) |
| `logger.warn` message string Nominatim | `'Nominatim background refresh failed'` | unchanged (via `failureMessage` factory dep) |
| `logger.warn` context fields | `{ error, cacheKey }` | `{ op, cacheKey, error }` — additive `op` |
| `OverpassCacheEntry` type identity | nominal interface | structural type alias to `RefreshableEntry<OverpassMuseumResult[]>` — TS shape identical |
| Synchronous `void` trigger return | yes | yes (IIFE wrapper preserves fire-and-forget) |
| Fail-soft on refresh + cache.set throw | yes | yes (try/catch wraps both) |

### Verification

```bash
cd museum-backend && pnpm jest --testPathPattern='(probabilistic-refresh|pr10-probabilistic-refresh-sentinel|overpass-cache|nominatim)' --no-coverage
# → 8 suites passed, 105/105 tests passed, 16.7s

cd museum-backend && pnpm lint
# → exit 0 (eslint src/ + lint:test-discipline + tsc --noEmit)

shasum -a 256 \
  museum-backend/tests/unit/shared/cache/probabilistic-refresh.test.ts \
  museum-backend/tests/unit/architecture/pr10-probabilistic-refresh-sentinel.test.ts
# → 5dd9df3709e9dfe26a2a92d164ae7d1a1c174be96d845f2a63a0ad34d359bc05  …/probabilistic-refresh.test.ts
# → 999083115f60411f4c4098bf89e3547620f2e7de5b0f8e15f1e2a9293c12ec86  …/pr10-probabilistic-refresh-sentinel.test.ts
# matches red-test-manifest.json — FROZEN-TEST contract honored
```

### Cross-app impact

None. Pure internal backend refactor :
- No API surface change → no OpenAPI delta, no FE follow-up.
- No DB migration, no env var, no env.example delta.
- No new runtime dependency (`museum-backend/package.json` diff empty — only root `package.json` gained an unrelated `packageManager: pnpm@11.2.2` pin, **out of PR-10 scope** per reviewer).
- Dashboards/Loki gain optional structured discriminator via additive `op` field (no existing query breaks).

### Process — single reviewer loop

Loop-1 terminal **APPROVED 8.85/10**. Zero `CHANGES_REQUESTED`. Reviewer non-blocking notes: (a) source LOC delta overshoots spec A7 band `−50` to `−90` by ~+170 LOC due to Option A compat wrappers + generous JSDoc + type-interface surface — accepted ; (b) 4 eslint-test-file warnings inside frozen red files (`@typescript-eslint/no-confusing-void-expression`) — non-blocking because `pnpm lint` exits 0 (project `lint:test-discipline` config doesn't flag them), tightening tracked as tooling debt out of PR-10 scope ; (c) `CLAUDE.md` gitnexus stats line + root `package.json` `packageManager` pin in working tree are auto-injected drift, **out of PR-10 scope** — commit boundary should include only the 5 PR-10 files.

---

## [Unreleased] — 2026-05-23 — PR-9 `assertPasswordReauth()` helper + sweep 3 useCases

Run `2026-05-23-pr-9-assertPasswordReauth` — neuvième incremental refactor de l'audit `2026-05-23-audit-kiss-dry-backend/findings/findings-B4.md` § Duplications HIGH (volet auth re-authentication). Pipeline : UFR-022 fresh-context 5-phase / reviewer **APPROVED** weightedMean **8.6/5** (loop-2 terminal, trajectory loop-1 7.5 CHANGES_REQUESTED → loop-2 8.6 APPROVED). Helper extraction sous `useCase/shared/` + sweep mécanique des 3 sites qui dupliquaient le triplet `getUserById → password-less guard → bcrypt.compare(currentPassword, …)`. **Security win** : statusCode wrong-password normalisé uniforme `401 INVALID_CREDENTIALS` sur les 3 sites (pré-PR-9 : `changePassword` + `changeEmail` retournaient `400 badRequest('Current password is incorrect')`, `disableMfa` retournait déjà `401 INVALID_CREDENTIALS`). Zéro migration DB, zéro lib bump, zéro nouveau `eslint-disable`, zéro hook bypass. Helper coverage 100% (statements/branches/functions/lines). `pnpm jest --testPathPattern='tests/unit/auth/(pr3-notFound|assertPasswordReauth|change-password|changeEmail.useCase|mfa-flow)|tests/unit/architecture/pr9-'` → **49/49 PASS**. Reversibility : `git revert <sha>` restaure les 3 sites + helper + 4 red files + PR-3 sentinel TARGETS.

### Added

- **Helper `assertPasswordReauth(userRepository, userId, currentPassword): Promise<ReauthenticatedUser>`** — `museum-backend/src/modules/auth/useCase/shared/assertPasswordReauth.ts:30-55` (25 LOC body + 15 LOC JSDoc, 56 LOC total). Signature :
  - Strict ordering invariant (FR-6, sentinel-tested) : `getUserById → null-guard → password-null-guard → bcrypt.compare`. Each guard `throw`-terminates avant la next step (no fallthrough, no log).
  - **Fast-fail before `bcrypt.compare`** (FR-2 / NFR-2) : social-only accounts (user.password=null) trigger `400 SOCIAL_ONLY_ACCOUNT` AVANT toute crypto computation. Économise ~50ms CPU wasted + uniform timing post-load. Sentinel-tested via mock-call-count (T-U2 asserts `bcrypt.compare` was NOT invoked).
  - Error matrix locked spec §6.2 + JSDoc :
    - `user not found` → `404 NOT_FOUND ('User not found')` via `notFound()` factory.
    - `user.password is null` → `400 SOCIAL_ONLY_ACCOUNT ('Cannot perform this action on a social-only account')` via direct `AppError` instantiation (single-site, no factory per design D-PLAN-2).
    - `bcrypt.compare → false` → `401 INVALID_CREDENTIALS ('Invalid credentials')` via `unauthorized(message, code?)` (extended in PR-1).
    - `bcrypt.compare throws` → propagated verbatim (no wrap, no message mutation, no leak — FR-5).
  - No `logger` import in helper (NFR-3 verified). No `userId` in `error.details` (PII leak avoidance, NFR-3 verified).
  - Single named export, no overloads, no options bag, no barrel (`useCase/shared/index.ts` does not exist — NFR-4 minimal-barrel honored).

- **`ReauthenticatedUser` branded-type alias** — `museum-backend/src/modules/auth/useCase/shared/assertPasswordReauth.ts:13` (`User & { password: string }`). Narrowing-rationale documented JSDoc lines 9-12 : "After the password-less branch, `password` is provably non-null. Consumers that need the hash (e.g. `changePassword`'s `isSame` check) can skip the `!` non-null assertion thanks to this return type." Quiet KISS win not contemplated in spec §6.1 (which declared `Promise<User>`) — reviewer OBS-2 informational note, accepted. `changePassword:35` now reads `bcrypt.compare(newPassword, user.password)` with no `!` non-null assertion (TS-correct without the lie).

- **New `SOCIAL_ONLY_ACCOUNT` error code** — unified phrasing `'Cannot perform this action on a social-only account'` ; statusCode `400` (input invariant violation, not auth failure). Replaces 3 divergent pre-PR-9 phrasings (`'Cannot change password for social-only accounts'`, `'Cannot change email for social-only accounts'`, `'Cannot disable MFA on a social-only account.'`). Discoverability + i18n future via single code (FE follow-up TD-FE-SOCIAL-ONLY-CODE opened post-merge).

- **Unit test `museum-backend/tests/unit/auth/assertPasswordReauth.test.ts`** (5 cases T-U1..T-U5, sha256 `e8ba4a73a3b462e2…0afd480`, FROZEN) — exercises helper contract end-to-end :
  1. **T-U1** `getUserById` returns null → 404 NOT_FOUND ; `bcrypt.compare` MUST NOT be called (FR-2 fast-fail asserted via mock-call-count).
  2. **T-U2** user.password is null → 400 SOCIAL_ONLY_ACCOUNT ; `bcrypt.compare` MUST NOT be called.
  3. **T-U3** `bcrypt.compare` resolves false → 401 INVALID_CREDENTIALS (asserts the 401 not legacy 400 — D1 normalization security win).
  4. **T-U4** `bcrypt.compare` throws → propagated verbatim (helper does NOT wrap, MUST NOT mutate message).
  5. **T-U5** happy path → returns `user` typed `ReauthenticatedUser` (compile-time narrowing assertion).
  + helper coverage 100% (statements/branches/functions/lines).

- **Architecture sentinel `museum-backend/tests/unit/architecture/pr9-assertPasswordReauth-helper-adoption.test.ts`** (9 assertions ×3 sites, sha256 `4f648302f2f08328…2352e9b85`, FROZEN) — **permanent regression guard**. Tourne dans le `pnpm test` gate existant. Assertions filesystem-based (regex scan, aucun import runtime des sites swept) :
  - **Block 1** (3 assertions) : no `bcrypt.compare(currentPassword, …)` regex match in any of 3 swept files. `isSame` check in changePassword (`bcrypt.compare(newPassword, user.password)`) intentionally NOT matched (regex word-boundary anchored on `currentPassword`).
  - **Block 2** (3 assertions) : literal `social-only` (case-insensitive) absent in any of 3 swept files — helper is single source of truth for that message.
  - **Block 3** (3 assertions) : `import { assertPasswordReauth } from '@modules/auth/useCase/shared/assertPasswordReauth'` present in each swept file.
  - **Frozen-test contract** : `red-test-manifest.json` FLAT `{path: sha256}` shape (per `feedback_team_frozen_manifest_flat.md`). Reviewer OBS-1 noted sentinel placed under `tests/unit/architecture/` instead of design §4.3 `tests/unit/auth/` — pragmatic alignment with PR-6/7/8 convention, accepted.

### Changed

**Sweep 3 useCase sites — inline `getUserById → password-null-guard → bcrypt.compare(currentPassword, …) → 4xx` triplet (3 throw branches inline) → `await assertPasswordReauth(this.userRepository, userId, currentPassword)`** :

| # | Site                                                                                              | Pre-PR-9 inline triplet (LOC) | Post-PR-9 (LOC) | Imports dropped                                       |
|---|---------------------------------------------------------------------------------------------------|-------------------------------|-----------------|--------------------------------------------------------|
| 1 | `museum-backend/src/modules/auth/useCase/password/changePassword.useCase.ts:22-40`                | 15                            | 1               | `notFound` (kept `bcrypt` for `isSame` newPassword check) |
| 2 | `museum-backend/src/modules/auth/useCase/email/changeEmail.useCase.ts:28-43`                      | 15                            | 1               | `bcrypt`, `notFound`                                  |
| 3 | `museum-backend/src/modules/auth/useCase/totp/disableMfa.useCase.ts:18-38`                        | 20                            | 1               | `bcrypt`, `AppError`, `badRequest`, `notFound`        |

Net source LOC ~−6 across the helper (+35) + the 3 swept sites (−41).

**PR-3 sentinel TARGETS shrunk** (cross-PR sentinel collision fix loop-2 CR-1) :
- `museum-backend/tests/unit/auth/pr3-notFound-helper-adoption.test.ts` — TARGETS array shrunk from 4 entries to 1 (`enrollMfa.useCase.ts` only). 9-line scope-reduction docblock prepended documenting : (a) PR-9 hoisted the password-reauth + user-lookup + 404 throw into shared helper, so 3 sites no longer directly import `notFound` (the helper does), (b) `enrollMfa` is the only remaining site with a direct `notFound()` call after user lookup (no password-reauth precondition, so PR-9 did not sweep it), (c) TARGETS narrowed to keep the sentinel scoped to the actual post-PR-9 surface. UFR-016 anti-magic doctrine honored — future readers find the WHY inline. **This edit is allowed because the PR-3 sentinel is NOT in PR-9 `red-test-manifest.json`** — frozen-test discipline does not gate the file.

**2 existing-test updates** (sha256-locked in red-test-manifest, byte-identical pre/post-green) :
- `museum-backend/tests/unit/auth/change-password.test.ts` L16-26 + L54-63 — wrong-password assertion bascule `statusCode:400, message:'Current password is incorrect'` → `statusCode:401, code:'INVALID_CREDENTIALS', message:'Invalid credentials'` ; social-only assertion bascule `message:'Cannot change password for social-only accounts'` → `message:'Cannot perform this action on a social-only account', code:'SOCIAL_ONLY_ACCOUNT'`.
- `museum-backend/tests/unit/auth/changeEmail.useCase.test.ts` L75-85 + L87-96 — même bascule (wrong-password 400→401 + social-only unified phrasing).

### Security note — statusCode 400 → 401 normalization

**Wrong-password response code normalisé uniforme `401 INVALID_CREDENTIALS` sur les 3 sites swept.** État pré-PR-9 : matrix divergente.

| Site                  | Pre-PR-9 wrong-password response                                       | Post-PR-9 wrong-password response                  |
|-----------------------|-----------------------------------------------------------------------|----------------------------------------------------|
| `changePassword`      | `400 badRequest('Current password is incorrect')` (NO code)           | `401 INVALID_CREDENTIALS ('Invalid credentials')`  |
| `changeEmail`         | `400 badRequest('Current password is incorrect')` (NO code)           | `401 INVALID_CREDENTIALS ('Invalid credentials')`  |
| `disableMfa`          | `401 INVALID_CREDENTIALS ('Invalid credentials')` (already correct)   | `401 INVALID_CREDENTIALS ('Invalid credentials')` (unchanged) |

**Pourquoi 401 et pas 400 sur wrong-creds** : OWASP semantics — `400 Bad Request` = invariant violation on the request payload (e.g. malformed JSON, missing field), `401 Unauthorized` = identity proof failed. Wrong password IS identity-proof failure, not payload malformation. Aligns with `museum-backend/src/modules/auth/service/authSession.service.ts:100,105` (login unauthenticated paths already return 401) — the JWT-authenticated re-auth paths now match the unauthenticated-login path. Consistent across the entire auth surface.

**API consumer impact** :
- `museum-frontend/shared/lib/errors.ts` `authCodeMessage` switch DOIT handler `INVALID_CREDENTIALS` (déjà géré côté login) sur les endpoints `PATCH /auth/me/password` + `PATCH /auth/me/email` + `POST /auth/mfa/disable`. Pré-PR-9 le FE traitait probablement le 400 generic-message en fallback (cf. `feedback_check_configs_before_assuming.md` — verify, don't assume). FE follow-up `TD-FE-SOCIAL-ONLY-CODE` ouvert post-merge couvre aussi cette adoption.
- `museum-frontend/shared/lib/errors.ts` `authCodeMessage` switch DOIT ajouter une arm `SOCIAL_ONLY_ACCOUNT` (i18n key + 7 locales) pour les social-only branches. Pré-PR-9 le FE recevait 3 phrasings divergents en `message` ; post-PR-9 le `code` discriminator est stable, i18n possible.
- Smoke tests + e2e qui asserte `expect(status).toBe(400)` sur wrong-password sur ces 3 endpoints DOIVENT bumper à `401`. `pnpm smoke:api` à vérifier post-deploy.
- OpenAPI spec `docs/openapi/auth.yaml` (responses table) — TD ouverte pour bumper la `4xx` table de ces 3 endpoints en cohérence avec le nouveau matrix. Cf. § Tech debt opened.

### Process — 2 reviewer loops (CR-1 cross-PR sentinel collision)

**Reviewer rejection loop UFR-022 = ILLIMITÉ**, cap-free, fresh re-spawn à la phase pointée.

**Trajectory 2 loops** :
- **Loop-1 (CHANGES_REQUESTED, weightedMean 7.5/5)** — 1 BLOCKER CR-1 (cross-PR sentinel collision : PR-3 sentinel pins `notFound` import on 3 sites PR-9 sweeps, 3/8 assertions FAIL). 3 informational observations (OBS-1 sentinel placement, OBS-2 `ReauthenticatedUser` not in spec, OBS-3 FE follow-up tracking). AC-19 violated.
- **Loop-2 (APPROVED terminal, weightedMean 8.6/5)** — CR-1 RESOLVED via TARGETS shrink + scope-reduction docblock on `pr3-notFound-helper-adoption.test.ts`. Zero CR remaining. Honesty penalty -0.2 self-applied by reviewer for loop-1 architect oversight (cross-PR sentinel collision not enumerated in spec §8 risks).

**Cross-PR sentinel collision (lesson learned)** :
- Architect spec.md §8 risks did NOT enumerate the possibility that a swept site is pinned by a pre-existing sentinel from a sibling PR in the same series. PR-3 had already shipped (commit `5e93b82c5` upstream) and its sentinel was running in the global `pnpm test` gate. PR-9 spec enumerated `R4 (test files MUST-NOT-modify)` but listed only the PR-9-specific frozen tests, not the cross-PR ones.
- Editor green-loop-1 ran `pnpm jest --testPathPattern='assertPasswordReauth|change-password|changeEmail|mfa-flow|pr9-'` — scoped pattern excluded `pr3-*`, so the regression was not caught.
- Loop-2 fix : TARGETS shrink + 9-line scope-reduction docblock referencing PR-9 RUN_ID inline. Editor authorized because `pr3-notFound-helper-adoption.test.ts` is NOT in PR-9 `red-test-manifest.json` (FLAT 4 entries verified) — frozen-test discipline does not gate the edit.
- **Lesson UFR-017** : when a sweep mechanically removes a primitive that was pinned by a sibling sentinel, the editor should grep `tests/unit/architecture/pr*-sentinel*.test.ts` + `tests/unit/auth/pr*-helper-adoption*.test.ts` for any sentinel TARGETING the swept files BEFORE declaring green. Add to spec checklist for PR-10..PR-16.
- **Lesson UFR-022** : the `pnpm test` scope at green-phase MUST be unscoped (`pnpm test` full suite OR `pnpm jest --testPathPattern='auth/'` for an entire module) — narrow `--testPathPattern` patterns hide cross-PR regressions. AC-19 (`pnpm test` sans régression) is a project-wide assertion, not a scoped one.

### Tech debt opened

- **TD-FE-SOCIAL-ONLY-CODE** (V1, museum-frontend) — `museum-frontend/shared/lib/errors.ts` `authCodeMessage` switch ajouter arm `SOCIAL_ONLY_ACCOUNT` (i18n key `auth.errors.socialOnlyAccount` + 7 locales : FR/EN minimum, ar/de/es/it/ja/zh via translator-of-record post-launch). 1-line PR. Cf. design.md D-PLAN-3.
- **TD-FE-INVALID-CREDENTIALS-CODE** (V1, museum-frontend) — `authCodeMessage` switch DOIT vérifier que `INVALID_CREDENTIALS` est handlé sur les 3 endpoints re-auth (probablement déjà via login fallback, mais à verify cf. `feedback_check_configs_before_assuming.md`). Grep `museum-frontend/features/auth` + `museum-frontend/features/settings` pour les call sites de ces 3 endpoints, assert chacun map `INVALID_CREDENTIALS` → user-friendly i18n message.
- **TD-OPENAPI-AUTH-4XX-MATRIX** (V1, museum-backend) — `docs/openapi/auth.yaml` (ou équivalent) responses table pour `PATCH /auth/me/password`, `PATCH /auth/me/email`, `POST /auth/mfa/disable` — bumper `400 (Current password is incorrect)` → `401 INVALID_CREDENTIALS` + ajouter `400 SOCIAL_ONLY_ACCOUNT` arm. Run `pnpm openapi:validate` + `pnpm test:contract:openapi` après.
- **TD-CROSS-PR-SENTINEL-CHECKLIST** (post-launch, doctrine) — extend `/team` editor green-phase checklist : "grep `tests/unit/architecture/pr*-sentinel*.test.ts` + `tests/unit/auth/pr*-helper-adoption*.test.ts` for any TARGETING the swept files. If found, either shrink TARGETS or re-scope describe block in same commit." Add to `.claude/agents/editor.md` system prompt.

---

## [Unreleased] — 2026-05-23 — PR-8 `paginate(qb, params, mapper?)` helper + sweep 4 repos

Run `2026-05-23-pr-8-paginate` — huitième incremental refactor de l'audit `2026-05-23-audit-kiss-dry-backend/findings/findings-B4.md` § Duplications HIGH (volet offset-pagination). Pipeline : UFR-022 fresh-context 5-phase / reviewer **APPROVED** weightedMean **7.8/5** (loop-3 terminal, trajectory 6.5 → 7.4 → 7.8). Pure TypeScript helper extraction + sweep mécanique, `PaginatedResult<T>` field order `{data, total, page, limit, totalPages}` **byte-for-byte préservé**. Zéro changement de comportement runtime observable côté consommateurs (OpenAPI 200 contract identique, FE/web typed shape inchangée), zéro migration DB, zéro lib bump, zéro nouveau `eslint-disable`, zéro hook bypass. Helper coverage 100% (statements/branches/functions/lines). `pnpm jest tests/unit/shared/pagination + tests/unit/architecture/pr8-paginate-sentinel.test.ts + tests/unit/review/review-repository.test.ts` → **38/38 PASS**. Reversibility : `git revert <sha>` restaure les 4 sweep sites + helper + marker support + mock fixtures.

### Added

- **Helper `paginate<TEntity, TDTO>(qb, params, mapper?): Promise<PaginatedResult<TDTO>>`** — `museum-backend/src/shared/pagination/offset-paginate.ts:23-34` (34 LOC total, body ≤30 LOC, JSDoc inclus). Signature :
  - Generic `<TEntity extends ObjectLiteral, TDTO = TEntity>` — default `TDTO = TEntity` rend l'identity branch sûre.
  - `params: PaginationParams` — type partagé `import type { PaginatedResult, PaginationParams } from '@shared/types/pagination'` (canonique single-source-of-truth, partagé avec PR-5 `assertPagination`). Future extensions (sortBy/sortDir) flow structurellement sans helper churn (NFR-9 honored).
  - `mapper?: (entity: TEntity) => TDTO` — optionnel ; quand omis, identity branch `entities as unknown as TDTO[]` (single isolated `as unknown` cast §12-allowed, no per-element allocation).
  - Comportement : `await qb.skip((page-1)*limit).take(limit).getManyAndCount()` single round-trip TypeORM, `totalPages = total === 0 ? 0 : Math.ceil(total/limit)` (ternary explicite vs design listing bare `Math.ceil(total/limit)` — équivalence comportementale, ternary documente l'edge case).
  - Caller responsable de `qb.orderBy(...)` AVANT l'appel (R1.4) — helper applique uniquement `skip`/`take`.
  - JSDoc référence PR-5 companion `assertPagination` (DL-4 English-only honored).
  - Pas de barrel `src/shared/pagination/index.ts` — single named export `paginate` (NFR-4 minimal-barrel honored).

- **Unit test `museum-backend/tests/unit/shared/pagination/offset-paginate.test.ts`** (19 cases, sha256 `571b43f6cf...`, FROZEN) — exercise helper contract end-to-end :
  1. `getManyAndCount` invoked exactly once with correct skip/take math.
  2. `data = entities.map(mapper)` quand mapper fourni.
  3. Identity branch quand mapper omis (cast `entities as unknown as TDTO[]`).
  4. Field order `{data, total, page, limit, totalPages}` canonical (locked).
  5. `totalPages = 0` quand `total = 0` (C4 edge case, ternary branch).
  6. `totalPages = Math.ceil(total/limit)` quand `total > 0` (avec multiples cases : exact division, partial, single overflow page).
  7. Skip math `(page-1)*limit` validated page=1/2/N.
  + helper coverage 100% (statements/branches/functions/lines).

- **Architecture sentinel `museum-backend/tests/unit/architecture/pr8-paginate-sentinel.test.ts`** (6 cases, sha256 `371c96c970...`, FROZEN) — **permanent regression guard**. Tourne dans le `pnpm test` gate existant. Assertions filesystem-based (grep + regex, aucun import runtime des sites swept) :
  1. Absence `.getManyAndCount(` direct dans `admin.repository.pg.ts` + `review.repository.pg.ts` (helper devient le seul caller sur les sweep sites).
  2. Absence du 2-round-trip chain `.skip(...).take(...).getMany()` sur les 4 swept sites.
  3. Présence `import { paginate } from '@shared/pagination/offset-paginate'` (ou équivalent path-aliased) sur chacun des 4 swept files.

  **Frozen-test contract** : `red-test-manifest.json` FLAT `{path: sha256}` shape (per `feedback_team_frozen_manifest_flat.md`). sha256 des 2 red files byte-identical pre/post-green via `shasum -a 256` :
  - `museum-backend/tests/unit/shared/pagination/offset-paginate.test.ts` → `571b43f6cf...`
  - `museum-backend/tests/unit/architecture/pr8-paginate-sentinel.test.ts` → `371c96c970...`

  Reviewer O-1 -1 minor noté : sentinel placé `tests/unit/architecture/` (au lieu du design §4.2 `tests/unit/shared/pagination/offset-paginate-sentinel.test.ts`) pour cohérence avec `pr6-dead-code-burial.test.ts` et `pr7-logActorAction-sentinel.test.ts` (architecture sentinels colocalisés). Manifest red↔green aligned, directory-grep readers searching `shared/pagination` will miss it.

### Changed

**Sweep 4 repo sites — `.skip(...).take(...).getMany() + .getCount()` (2 round-trips) OU `.skip(...).take(...).getManyAndCount()` inline → `return await paginate(qb, filters.pagination, mapper)`** :

| # | Site                                                                                                  | Mapper                                  | Convergence                            |
|---|-------------------------------------------------------------------------------------------------------|-----------------------------------------|----------------------------------------|
| 1 | `museum-backend/src/modules/admin/adapters/secondary/pg/admin.repository.pg.ts:118` (`listUsers`)     | `mapUser`                               | inline → helper                        |
| 2 | `museum-backend/src/modules/admin/adapters/secondary/pg/admin.repository.pg.ts:210` (`listAuditLogs`) | `mapAuditLog`                           | inline → helper                        |
| 3 | `museum-backend/src/modules/admin/adapters/secondary/pg/admin.repository.pg.ts:283` (`listReports`)   | inline `(r) => mapReport(r, r.message)` | inline → helper                        |
| 4 | `museum-backend/src/modules/review/adapters/secondary/pg/review.repository.pg.ts:63` (`listReviews`)  | `toDTO`                                 | 2 round-trips (getCount+getMany) → 1 round-trip (getManyAndCount) |

**Pattern `return await paginate(...)` × 4 sites est PROJECT-DOCTRINAL** — `museum-backend/eslint.config.mjs:350` enforce `'@typescript-eslint/return-await': ['error', 'always']`. `return await` preserve les async stack traces V8 dans les error paths (sans `await`, le stack trace ne capture pas le frame de la fonction caller). Cf. § Process ci-dessous (CR-5 withdrawn).

**1 opt-out documented marker** :
- `museum-backend/src/modules/support/adapters/secondary/pg/support.repository.pg.ts:71` — ajout marker `// paginate-skip: subquery-required (COUNT(m.id) + getRawAndEntities)` au-dessus du `getRawAndEntities()` call. S5 (`listTickets`) utilise `COUNT(m.id) + getRawAndEntities()` pour les message-count aggregates → incompatible avec la signature helper (`getManyAndCount` ≠ `getRawAndEntities`). Discoverable signal per UFR-016 anti-magic doctrine + spec T7 + DL-1 + §A3. Tout futur lecteur qui se demande "pourquoi pas `paginate` ici ?" trouve la réponse inline.

**1 mock-fixture-only test refresh (CR-2 user-deferred, behavior-preserving)** :
- `museum-backend/tests/unit/review/review-repository.test.ts` — 11 lignes modifiées, 3 mock-pair swaps (`getMany`+`getCount` → `getManyAndCount`). Cascade quand SUT bascule sur `getManyAndCount` — mocks pré-existants doivent matcher la nouvelle shape. Spec §R4 enumère ce fichier comme MUST-NOT-modify, **violation en lettre, behavior-preserving en réalité**. Cf. § Process ci-dessous (CR-2 user-deferred follow-up).

### Process — 3 reviewer loops + CR-5 withdrawn (UFR-018 case study) + CR-2/CR-4 user-deferred

**Reviewer rejection loop UFR-022 = ILLIMITÉ**, cap-free, fresh re-spawn à la phase pointée. Cap 2 corrective loops applicable UNIQUEMENT aux fails de hooks intra-phase (lint/tsc/test dans la même phase éditeur), JAMAIS aux verdicts reviewer.

**Trajectory 3 loops** :
- **Loop-1 (CHANGES_REQUESTED, weightedMean 6.5/5)** — 5 CRs émis : CR-1 (paginate-skip marker absent), CR-2 (review-repository.test.ts modifié violant spec §R4), CR-3 (helper signature inline literal vs `PaginationParams` shared), CR-4 (lib-docs/typeorm/PATTERNS.md `getManyAndCount` content-stale), CR-5 (`return await paginate(...)` flagged comme divergence de design §2.2).
- **Loop-2 (CHANGES_REQUESTED, weightedMean 7.4/5)** — CR-1 + CR-3 RESOLVED ; CR-5 PERSISTENT (reviewer maintien malgré green BLOCK signal). -0.2 honesty penalty appliquée brief↔reality drift.
- **Loop-3 (APPROVED terminal, weightedMean 7.8/5)** — **CR-5 retroactively WITHDRAWN** comme reviewer-error après vérification `museum-backend/eslint.config.mjs:350`.

**CR-5 withdrawn detail (UFR-018 case study)** :
- Reviewer first+second pass flaggé `return await paginate(...)` × 4 sites comme divergence du design §2.2 caller listing (qui montrait `return paginate(...)` sans `await`).
- **Green re-spawn loop-2 + loop-3 ont REFUSÉ d'appliquer le patch CR-5** — discipline signal explicite :
  - UFR-013 (honesty) : refus de mentir sur la posture ESLint projet vérifiable.
  - UFR-020 (zero bypass) : refus d'introduire du code que le linter projet rejette.
  - UFR-018 (check configs before assuming) : grep `eslint.config.mjs` AVANT de modifier toward un état que le project linter rejette.
- **Loop-3 reviewer a vérifié `museum-backend/eslint.config.mjs:350`** : `'@typescript-eslint/return-await': ['error', 'always']`. `return await` EST le pattern project-doctrinal (preserves V8 async stack traces in error paths).
- **Conclusion** : design §2.2 listing diverged from project rule ; le code under review est project-correct. CR-5 withdrawn pour les 4 call sites (`admin.repository.pg.ts:118, 210, 283 + review.repository.pg.ts:63`).
- **Lesson UFR-018** : quand `design.md` et project ESLint config conflict sur un stylistic pattern, le project config est la source de truth. Reviewer should grep `eslint.config.mjs` for any rule governing the cited pattern AVANT de flagger comme CR. Cas d'école pour `feedback_check_configs_before_assuming.md`.

**CR-2 + CR-4 user-deferred (HIGH severity, non-blocking by explicit user authority)** :
- **CR-2 (mock-fixture leak)** : `review-repository.test.ts` 11 lignes modifiées violent spec §R4 en lettre. User defer "review-repository.test.ts est mock fixture non-frozen" — operationally pragmatic (freeze hook protège uniquement les manifest-listed files, pas les mock fixtures pré-existants). Cf. MEMORY `feedback_bundled_red_green_frozen_test_gap.md` qui documente exactement ce gap : bundled red+green mini-cycles défont le frozen-test contract quand un SUT-internal change cascade dans une mock-layer pré-existante. **Reco follow-up** : filer TD-PR8-MOCK-LEAK entry dans `docs/TECH_DEBT.md` pointant à cette MEMORY. Next architect cycle décide si spec §R4 doit drop mock-fixture files de l'enumeration OR si red-test-manifest schema doit grow un `cascading-mock` annex.
- **CR-4 (lib-docs/typeorm content-stale)** : `grep -c 'getManyAndCount' lib-docs/typeorm/PATTERNS.md` retourne 0. mtime 2026-05-20 19:36 — 3 days fresh par UFR-022 staleness window (14j cap), **mais content-stale** pour le pattern S4 convergence (getCount+getMany → getManyAndCount headline behavioral change de cette PR). User defer "lib-docs current par mtime" — mtime-freshness ≠ content-freshness. **Reco follow-up** : bundle 3-entry backfill (`getManyAndCount` semantics + `getCount`+`getMany` 2-round-trip pattern + `skip-vs-offset` clarification) au PR-16 `confidenceUpsert<T>` (next TypeORM-touching PR ; doc-fetcher + doc-curator naturally scheduled).

### Doctrine adherence

- **UFR-013** (honesty, verify-before-claim) ✅ — green re-spawn refused to lie about project ESLint posture (CR-5 BLOCK), reviewer loop-3 honest reclassification "reviewer-error" plutôt que silently rubber-stamp.
- **UFR-016** (clean replace, anti-magic) ✅ — helper REPLACE inline pagination chain, ne wrappe pas. `paginate-skip` marker sur support.repository.pg.ts:71 = discoverable signal (UFR-016 anti-magic doctrine).
- **UFR-018** (check configs before assuming) ✅ — case study majeur de cette PR. Reviewer grep `eslint.config.mjs:350` AVANT de finaliser verdict, withdrew CR-5. Lesson ajoutée pour futurs reviewers.
- **UFR-020** (zero bypass) ✅ — green re-spawn refused d'introduire code que project linter rejette. Pas de `eslint-disable` ajouté, pas de `--no-verify`, pas de hook bypass.
- **UFR-022** (fresh-context 5-phase + frozen-test) ✅ — sha256 des 2 red files match manifest byte-for-byte (`571b43f6cf...` + `371c96c970...`) verified `shasum -a 256`, fresh-context end-to-end (each phase = new Agent invocation, zero memory leak across loops), reviewer rejection loop cap-free déclenché 3× sans pression artificielle de cap.

### Canonical preservation (verified post-sweep)

`grep` `.getManyAndCount(` post-green sur `museum-backend/src/modules/{admin,review}/adapters/secondary/pg/` :
- 0 hits sur les 4 swept sites (sentinel inv 1).
- Support `getRawAndEntities` untouched (S5 documented opt-out).

`PaginatedResult<T>` consumers (OpenAPI 200 contract + FE/web typed shape) : zero diff — helper retourne exactement le même shape `{data, total, page, limit, totalPages}` field-by-field.

Wire-format `total === 0 ? 0 : Math.ceil(total/limit)` ternary : équivalent comportemental à `Math.ceil(total/limit)` pour `limit ≥ 1` (contract), ternary documente l'edge case explicitement.

### Out-of-scope (deferred follow-ups)

- **CR-2 follow-up** : filer TD-PR8-MOCK-LEAK dans `docs/TECH_DEBT.md` pointant `feedback_bundled_red_green_frozen_test_gap.md`. Next architect cycle décide schema evolution spec §R4 ou red-test-manifest.
- **CR-4 follow-up** : bundle 3-entry backfill `lib-docs/typeorm/PATTERNS.md` (`getManyAndCount`/`getCount`+`getMany`/`skip-vs-offset`) au PR-16 `confidenceUpsert<T>` next TypeORM-touching PR.
- **No `paginate` variant for raw-SQL/aggregate queries** (spec §9). Subquery cases (`COUNT(m.id) + getRawAndEntities`) restent inline avec opt-out marker. Helper variant déduplication = refactor distinct, deferred.
- **No barrel `src/shared/pagination/index.ts`** (NFR-4). `cursor-codec.ts` et `offset-paginate.ts` exportent directement leurs symbols ; consommateurs importent via path `@shared/pagination/<file>`. Minimal-barrel policy respectée.



## [Unreleased] — 2026-05-23 — PR-7 `logActorAction` helper + sweep 12 useCases

Run `2026-05-23-pr-7-logActorAction` — seventh incremental refactor de l'audit `2026-05-23-audit-kiss-dry-backend/findings/findings-B9.md` HIGH #2 (12 sites dupliquant inline `actorType:'user'` + `ip ?? null` + `requestId ?? null` autour de `auditService.log(...)`). Pipeline : UFR-022 fresh-context 5-phase / reviewer **APPROVED** weightedMean **4.71/5** (raw 4.78, -0.07 process haircut pour mechanical first-pass lapse F-1). Pure TypeScript helper extraction + sweep mécanique, wire-format **byte-for-byte identique** (R3 proven structurally par `computeRowHash` payload exclusion). Zéro changement de comportement runtime observable, zéro migration DB, zéro lib bump, zéro nouveau `eslint-disable`, zéro hook bypass. Net diff `+152 / -103` (helper +45 LOC + 8 unit + 60 sentinel + 11 test refresh − 12 sweep targets en net negative). Reversibility : `git revert <sha>` restaure les 12 sites + helper (pure code refacto, no migration, no consumer-visible API surface change).

### Added

- **Helper `AuditService.logActorAction(input: LogActorActionInput): Promise<void>`** — `museum-backend/src/shared/audit/audit.service.ts:157-168` (18 LOC code, cap NFR-2 respected). Signature : `LogActorActionInput` (lignes 31-39) **omits `actorType`** au TYPE level → compile-time TS2353 si caller tente `{actorType:'system'}` (AC4 locked par `@ts-expect-error` dans `logActorAction.test.ts:209`). Comportement :
  - Force `actorType` au littéral `'user'` (jamais dérivé de l'input — value proposition du helper).
  - Null-coerce `ip` (`input.ip ?? null`) et `requestId` (`input.requestId ?? null`) au boundary du helper.
  - Pass-through verbatim `action`, `actorId` (required, jamais optionnel — actor-action par définition), `targetType?`, `targetId?`, `metadata?`.
  - Délègue à `this.log(...)` — donc hérite du `BREACH_EVENT_SET` guard (`audit.service.ts:81-88` : si `action.startsWith('breach_')`, redirige vers `auditCriticalSecurityEvent`, ne `repository.insert` PAS).
  - Hérite du repo-error swallow pattern (`logger.error('audit_log_failed', …)` — ne throw jamais).
  - JSDoc concise + référence `{@link AuditService.log}`.

- **Type-only barrel export `LogActorActionInput`** — `museum-backend/src/shared/audit/index.ts:21`. Aucun runtime export nouveau (NFR-7 minimal-barrel respected) — `AuditService` classe déjà exportée, méthode dispo via instance.

- **Unit test `museum-backend/tests/unit/shared/audit/logActorAction.test.ts`** (8 cases, sha256 `0a70685011a6ea3244d3c0be44b0e9566ad87fd9303aeaeb1637142667024cf9`, FROZEN) — exercise helper contract end-to-end :
  1. Forces `actorType:'user'` regardless of caller hint.
  2. Null-coerce `ip` si `undefined`.
  3. Null-coerce `requestId` si `undefined`.
  4. Pass-through `ip` string verbatim.
  5. Pass-through `requestId` string verbatim.
  6. Pass-through `targetType`/`targetId`/`metadata` verbatim.
  7. BREACH guard inherited (`action:'breach_unauthorized_access'` → `repository.insert` NOT called, logger warn fires).
  8. Repo error swallowed (`logActorAction` resolves, ne reject pas).
  + ligne 209 : `@ts-expect-error` + `audit.logActorAction({ ...base, actorType: 'system' } as never)` — locked compile-time exclusion (AC4).

- **Architecture sentinel `museum-backend/tests/unit/architecture/pr7-logActorAction-sentinel.test.ts`** (60 cases via `it.each` × 5 invariants × 12 sites, sha256 `d3f38c6129d63bc845e616adfcd8385cd11b7f22630741ef41e51a5b6c296d89`, FROZEN) — **permanent regression guard**. Tourne dans le `pnpm test` gate existant. Assertions filesystem-based (grep + regex, aucun import runtime des sites swept) :
  1. Absence `actorType:\s*'user'` inline sur chacun des 12 sites.
  2. Absence `ip:\s*input\.ip\s*\?\?\s*null` inline sur chacun des 12 sites.
  3. Absence `requestId:\s*input\.requestId\s*\?\?\s*null` inline sur chacun des 12 sites.
  4. Absence `\b(auditService|this\.audit)\.log\(` audit-call literal sur chacun des 12 sites (regex écarte délibérément les interface declarations).
  5. Présence `.logActorAction(` appel sur chacun des 12 sites.

  **Frozen-test contract** : `red-test-manifest.json` FLAT `{path: sha256}` shape (per `feedback_team_frozen_manifest_flat.md`). sha256 des 2 red files byte-identical pre/post-green via `shasum -a 256`.

### Changed

**Sweep 12 useCases — `auditService.log({actorType:'user', ..., ip: input.ip ?? null, requestId: input.requestId ?? null})` → `auditService.logActorAction({...})`** :

| # | Site                                                                                                  | Variant                                                       |
|---|-------------------------------------------------------------------------------------------------------|---------------------------------------------------------------|
| 1 | `museum-backend/src/modules/admin/useCase/users/suspendUser.useCase.ts`                               | direct `auditService.log`                                     |
| 2 | `museum-backend/src/modules/admin/useCase/users/unsuspendUser.useCase.ts`                             | direct `auditService.log`                                     |
| 3 | `museum-backend/src/modules/admin/useCase/users/changeUserRole.useCase.ts`                            | direct `auditService.log`                                     |
| 4 | `museum-backend/src/modules/admin/useCase/users/changeUserTier.useCase.ts`                            | direct `auditService.log`                                     |
| 5 | `museum-backend/src/modules/admin/useCase/users/deleteUser.useCase.ts`                                | direct `auditService.log`                                     |
| 6 | `museum-backend/src/modules/admin/useCase/reports/resolveReport.useCase.ts`                           | direct `auditService.log`                                     |
| 7 | `museum-backend/src/modules/admin/useCase/export/exportReviews.useCase.ts`                            | DI `ExportAuditService` (widening `logActorAction`)            |
| 8 | `museum-backend/src/modules/admin/useCase/export/exportSupportTickets.useCase.ts`                     | DI `ExportAuditService` (widening `logActorAction`)            |
| 9 | `museum-backend/src/modules/admin/useCase/export/exportChatSessions.useCase.ts`                       | DI `ExportAuditService` (widening `logActorAction`)            |
| 10| `museum-backend/src/modules/support/useCase/ticket-user/createTicket.useCase.ts`                      | direct `auditService.log`                                     |
| 11| `museum-backend/src/modules/support/useCase/ticket-admin/updateTicketStatus.useCase.ts`               | direct `auditService.log`                                     |
| 12| `museum-backend/src/modules/review/useCase/moderation/moderateReview.useCase.ts`                      | DI `Pick<AuditService,'log'>` → `Pick<AuditService,'log'\|'logActorAction'>` widening |

**DI narrowed interfaces widened en lockstep** :
- `ExportAuditService` interface (3 export use cases) : kept `log()` AND added `logActorAction(input: LogActorActionInput): Promise<void>` (design §2.6.1).
- `moderateReview.useCase.ts:32` : `Pick<AuditService, 'log'>` → `Pick<AuditService, 'log' | 'logActorAction'>` (design §2.6.2).

**11 fichiers test refresh** — DI fakes `{ log: jest.fn() }` → `{ log: jest.fn(), logActorAction: jest.fn() }` + assertions retargetées `audit.log` → `audit.logActorAction` (sites swept) :
- `museum-backend/tests/unit/admin/changeUserRole.useCase.test.ts`
- `museum-backend/tests/unit/admin/changeUserTier.useCase.test.ts`
- `museum-backend/tests/unit/admin/user-lifecycle.useCase.test.ts` (suspend/unsuspend/delete)
- `museum-backend/tests/unit/admin/resolveReport.useCase.test.ts`
- `museum-backend/tests/unit/admin/export/exportReviewsTickets.useCase.test.ts`
- `museum-backend/tests/unit/admin/export/exportSessions.useCase.test.ts`
- `museum-backend/tests/unit/support/createTicket.useCase.test.ts`
- `museum-backend/tests/unit/support/updateTicketStatus.useCase.test.ts`
- `museum-backend/tests/unit/support/updateTicketStatus.useCase.mutation.test.ts`
- `museum-backend/tests/unit/review/review.useCase.test.ts` (6/6 sites retargeted including le F-1 patch ligne 348)
- `museum-backend/tests/unit/review/moderateReview.mutants.test.ts`

### Process — BLOCK-TEST-WRONG re-spawn + reviewer rejection loop (UFR-022 textbook)

Le **first green pass** a missed l'assertion `review.useCase.test.ts:348` (`expect(audit.log).toHaveBeenCalledTimes(1)` non-retargeted — 5/6 sites du fichier corrects, ligne 348 oubliée). Mécanique lapse, pas structural defect.

Le **reviewer first-pass** a flaggé **F-1 BLOCKING** (verdict CHANGES_REQUESTED) — l'assertion compile et passe (`audit.log` est toujours `jest.fn()` dans le fake), mais elle teste un appel-fantôme inexistant (la prod call est devenue `auditService.logActorAction(...)`).

**Nuance UFR-022 BLOCK-TEST-WRONG** : le test n'était PAS buggé par construction, il était devenu **stale** après le sweep. Le reviewer a correctement classé F-1 comme BLOCKING et déclenché **fresh green re-spawn** (pas red — car `review.useCase.test.ts` n'est PAS dans `red-test-manifest.json`, c'est un existing test refresh hors scope frozen).

Le **fresh green re-spawn** a appliqué un **patch byte-minimal d'1 ligne** :
- ligne 348 avant : `expect(audit.log).toHaveBeenCalledTimes(1);`
- ligne 348 après : `expect(audit.logActorAction).toHaveBeenCalledTimes(1);`

Net diff F-1 patch : -1 ligne / +1 ligne. Aucun scope drift, aucun collateral edit. Frozen-test contract intact (les 2 red files sha256 byte-identical au manifest).

**Reviewer second pass : APPROVED weightedMean 4.71/5** (raw 4.78, -0.07 process haircut pour le first-pass F-1 lapse).

**Reviewer rejection loop UFR-022 = ILLIMITÉ**, cap-free, fresh re-spawn à la phase pointée — fonctionnement-as-designed. Cap 2 corrective loops applicable UNIQUEMENT aux fails de hooks intra-phase (lint/tsc/test dans la même phase éditeur), JAMAIS aux verdicts reviewer.

### Wire-format proof (SOC2/GDPR audit trail)

R3 (chain hash identity) trivially holds par **inspection structurelle** :
- `museum-backend/src/shared/audit/audit-chain.ts:48-57` `computeRowHash()` payload tuple = `[id, actorId, action, targetType, targetId, metadataJson, createdAt, prevHash]`.
- **NE contient PAS** `actorType`, `ip`, ni `requestId`.
- Forcing `actorType:'user'` literal + null-coercing `undefined → null` sur `ip`/`requestId` au boundary helper sont **provably hash-invariant by construction**.
- `museum-backend/src/data/db/postgres/audit.repository.pg.ts:99,104-105` null-normalise déjà au DB-row boundary (defense-in-depth confirmed — helper-level coercion est redondant mais self-documenting).

`tests/unit/audit/audit-chain.test.ts` green post-sweep → zéro régression chain integrity. Pas de migration DB. Pas d'altération du wire format. Tous les `audit_logs` post-PR-7 ont byte-identical `actorType='user'`/`ip`/`request_id` columns vs pré-PR-7.

### Doctrine adherence

- **UFR-013** (honesty, verify-before-claim) ✅ — wire-format proof structurel cité ligne par ligne (`computeRowHash` payload tuple inspection), AC11 sentinel exhaustif sur 12 sites × 5 invariants = 60 cases, F-1 first-pass lapse documenté ouvertement (pas silent skip), 27 autres `actorType:'user'` literals scope-out documentés en `design.md §3` au lieu d'être enterrés silencieusement.
- **UFR-016** (helper extraction propre, pas `@deprecated` wrapper) ✅ — le helper REPLACE `log()` au site swept, ne wrappe pas. `log()` reste seul point d'entrée pour `system`/`anonymous` actors (R6).
- **UFR-022** (fresh-context 5-phase + frozen-test) ✅ — sha256 des 2 red files match manifest byte-for-byte (`0a706850…` + `d3f38c61…`), fresh-context end-to-end (each phase = new Agent invocation, zero memory leak), libDocsConsulted vide explicitement justifié design §4 (pas de nouvelle dep, pas de surface lib étrangère consultée), reviewer rejection loop cap-free déclenché F-1 → green re-spawn → APPROVED 4.71/5.

### Canonical preservation (verified post-sweep)

`grep` `auditService.log\|this.audit.log` post-green sur `museum-backend/src/modules/{admin,support,review}/useCase/` :
- 0 hits sur les 12 swept sites (AC2 verified).
- Tous les autres callers de `log()` (`audit-ip-anonymizer.job.ts`, breach-event callers, `system`/`anonymous` paths R6) untouched.

`grep` `verifyAuditChain` post-green :
- `museum-backend/src/shared/audit/audit-chain.ts:75` (canonical `verifyAuditChain` returning `AuditChainVerifyResult`) — **untouched**.
- `museum-backend/src/shared/audit/index.ts:24` (barrel re-export canonique) — **untouched**.

API publique `AuditService` post-PR-7 : `log()` (untouched, R6), `logBatch()` (untouched), `auditCriticalSecurityEvent()` (untouched, R6), `+logActorAction()` (new).

### Out-of-scope (deferred follow-ups)

- **27 autres `actorType:'user'` literals repo-wide** (`auth/**`, `museum/**`, `admin-routes/**`) hors des 12 swept sites. Design §3 explicitly defers. Reco reviewer O-3 : filer TECH_DEBT entry ou PR-7b ticket avant closing du run. Sentinel actuel ne couvre QUE les 12 sites enumerated — extension future requise pour catch repo-wide.
- **No `logActorActionBatch` helper** (spec §9). Audit-batch flows restent sur `logBatch()` — pas d'overlap avec les 12 actor-action sites.
- **No `auditCriticalSecurityEvent` refactor** (spec §11 Q3). Breach events ont leur own dual-path Sentry tagging, scope séparé.
- **No `ExportAuditService` dedup across 3 export files** (spec §11 Q4). 3 sites need only one new method on the narrowed interface — dedup est un refactor distinct, deferred.
- **Integration smoke e2e `pnpm test:e2e -- admin/suspendUser`** (spec §8.3) pas exécuté. Wire-format identity structurellement prouvée (R3 via `computeRowHash` payload exclusion) + `audit-chain.test.ts` green → low risk. Reviewer O-2 : reco optionnelle pour belt-and-braces pré-merge.



## [Unreleased] — 2026-05-23 — PR-6 dead code burial (UFR-016)

Run `2026-05-23-pr-6-dead-code-burial` — sixth incremental refactor de l'audit `2026-05-23-audit-kiss-dry-backend` (volet burial). Pipeline : UFR-022 fresh-context 5-phase / reviewer **APPROVED** weightedMean **4.65/5**. Pure deletion PR (UFR-016 "il est mort on l'enterre" — pas de `@deprecated`, pas de comment-out). Net diff `-276 LOC` (4 fichiers supprimés) + `+130 LOC` sentinel architecture test = `-146 LOC net`. Zéro changement de comportement runtime observable, zéro modification du canonique préservé, zéro migration DB, zéro lib bump, zéro nouveau `eslint-disable`, zéro hook bypass. Reversibility : `git revert <sha>` restaure les 4 fichiers exactement.

### Removed

- **`museum-backend/src/shared/http/http-cache-headers.ts`** (31 LOC) — middleware `httpCacheHeaders(asset: AssetCacheClass): RequestHandler` jamais wired sur le router prod (audit finding B5, confirmed orphan via `grep -rn 'httpCacheHeaders|http-cache-headers'` zero hits hors du fichier + son test). Le middleware setait `Cache-Control` selon 4 asset classes (`static-immutable` / `index-html` / `openapi-json` / `landing`) — design prématuré pré-Cloudflare. **ADR-024 (HTTP cache headers via Cloudflare) reste ACCEPTED decision-only** ; statut inchangé. Si Cloudflare provisionné post-V1, ré-implémenter `httpCacheHeaders` selon setup réel — la décision architecturale tient toujours, seule l'impl prématurée est enterrée.

- **`museum-backend/tests/unit/helpers/http-cache-headers.test.ts`** (61 LOC) — n'était importateur que du middleware supprimé ci-dessus, plus de raison d'exister.

- **`museum-backend/src/shared/audit/audit-chain-verifier.ts`** (88 LOC) — **shadow duplicate** du canonique `museum-backend/src/shared/audit/audit-chain.ts:75` `verifyAuditChain` (audit finding B8). Le shadow exposait `verifyAuditChain` + `AuditChainVerificationResult` (shape distincte du canonique `AuditChainVerifyResult`) — name-collision risk sur une surface security-critical (audit tamper-evidence). Barrel `museum-backend/src/shared/audit/index.ts:24` re-exporte **uniquement** le canonique (`export { AUDIT_CHAIN_GENESIS_HASH, computeRowHash, verifyAuditChain } from './audit-chain';`) — le shadow n'a jamais été consommé en prod. Tous les 8 consommateurs canoniques (`audit-chain-cli-core.ts:1,22` + barrel + 4 fichiers de test canoniques) sont préservés byte-for-byte. Si besoin futur d'une break-shape enrichie, étendre `AuditChainVerifyResult` proprement, **JAMAIS via fichier shadow**.

- **`museum-backend/tests/unit/shared/audit/audit-chain-verifier.test.ts`** (96 LOC) — n'était importateur que du shadow supprimé ci-dessus.

### Added

- **Architecture sentinel `museum-backend/tests/unit/architecture/pr6-dead-code-burial.test.ts`** (130 LOC, 6 it cases via `describe.each` × 4 `DEAD_FILES` + 2 `FORBIDDEN_IMPORT_SLUGS`) — **permanent regression guard**. Pivot délibéré du bash sentinel proposé au design phase 2 (`tools/sentinels/pr6-dead-code-burial.sh`) vers un Jest architecture test : tourne dans le `pnpm test` gate existant (pas d'invocation séparée), devient guard permanent pour toute future re-introduction des 2 slugs sous `src/`, pas d'étape cleanup post-green. Assertions (toutes grep-based / fs-based, **aucun import runtime des modules morts** — un import recréerait un consommateur) :
  1. `src/shared/http/http-cache-headers.ts` absent (`existsSync` false).
  2. `src/shared/audit/audit-chain-verifier.ts` absent.
  3. `tests/unit/helpers/http-cache-headers.test.ts` absent.
  4. `tests/unit/shared/audit/audit-chain-verifier.test.ts` absent.
  5. `grep -rn` sous `src/` retourne 0 match pour les 2 slugs `http-cache-headers` ET `audit-chain-verifier`.

  **Frozen-test contract** : `red-test-manifest.json` FLAT `{path: sha256}` shape (per `feedback_team_frozen_manifest_flat.md`). sha256 verified byte-identical pre/post-green via `shasum -a 256` :
  - `museum-backend/tests/unit/architecture/pr6-dead-code-burial.test.ts` → `588f3341aff1ae4e7d0d21fc332624dfe7548fd355d2e72540d888ce83974960`

### Scope-out — `isSentryEnabled` (audit finding B7 grep-incomplete)

**Note d'honnêteté UFR-013 pour les futurs cycles d'audit** : l'audit B7 originel listait `isSentryEnabled` (`museum-backend/src/shared/observability/sentry.ts:30`) comme dead code "0 consommateur dans `src/`". L'affirmation est **factuellement correcte pour `src/`** mais **grep-incomplète** — re-grep `tests/**` révèle 6+ consommateurs test légitimes :

- `museum-backend/tests/unit/shared/sentry.test.ts:28,38,54,66,81` — import + assert direct (`expect(isSentryEnabled()).toBe(false)`).
- `museum-backend/tests/unit/shared/sentry-wrapper.test.ts:107,114` — assert post-`initSentry()` (`expect(isSentryEnabled()).toBe(true)`).
- `museum-backend/tests/unit/observability/sentry-capture-exception-with-context.test.ts:63,77` — assert état initialisé.
- `museum-backend/tests/unit/middleware/rate-limit-fail-closed.test.ts:20` — mock du module (`jest.mock('@shared/observability/sentry', () => ({ ..., isSentryEnabled: () => true }))`).
- `museum-backend/tests/unit/auth/password-breach-check.test.ts:29` — idem mock.

`isSentryEnabled()` est un **test-only public observable** légitime : permet d'asserter l'état d'initialisation Sentry post-`initSentry()` sans tester `initialized` (private du module). Pattern bien établi ; supprimer l'export régresserait les 6+ tests sans bénéfice. Le SUT lui-même utilise `initialized` directement (lignes 73, 85, 93, 122, 127) — il N'appelle PAS `isSentryEnabled()`, donc l'export EST purement un accessor externe pour observabilité de tests.

**T1 scope-out** documenté `spec.md §4.1 + §5 + §6 R1` + sentinel header (lignes 26-27) + ce CHANGELOG. **Règle pour les prochains audits** : avant de classer un export "dead", grep `tests/**` ET `src/**` (et idéalement `scripts/**`/`tools/**`). Cas d'école UFR-013 verify-before-claim — toute future re-listing de B7 doit re-grep d'abord et lire ce scope-out.

### Doctrine adherence

- **UFR-016** (burial net, "il est mort on l'enterre") ✅ — 4 deletions clean, pas de `@deprecated` wrapper, pas de commented-out code.
- **UFR-013** (honesty, verify-before-claim) ✅ — T1 scope-out documenté end-to-end après honest re-grep, pas de silent skip. L'audit B7 a été reclassé "grep-incomplete" publiquement plutôt que d'enterrer un export consommé par 6+ tests.
- **UFR-022** (fresh-context 5-phase + frozen-test) ✅ — sha256 sentinel `588f3341…` match manifest byte-for-byte, fresh-context end-to-end, lib-docs consultés (express + node:crypto stdlib).

### Canonical preservation (verified post-burial)

`grep -rn 'verifyAuditChain' museum-backend/src/` post-green :

- `museum-backend/src/shared/audit/audit-chain.ts:75` — canonical `verifyAuditChain` returning `AuditChainVerifyResult` — **untouched**.
- `museum-backend/src/shared/audit/index.ts:24` — barrel re-export du canonique uniquement — **untouched**.
- `museum-backend/src/shared/audit/audit-chain-cli-core.ts:1,22` — consumer via barrel — **untouched**.
- `museum-backend/src/data/db/migrations/1777100000000-AddAuditLogHashChain.ts:33` — doc-comment référençant le canonique — **untouched**.

Tests canoniques (83/83 PASS post-burial) : `tests/unit/audit/audit-chain.test.ts` (~57 specs) + `tests/unit/audit/audit-chain-migration-parity.test.ts` + `tests/unit/shared/audit/audit-chain-cli-core.test.ts` + `tests/unit/admin/audit-breach.test.ts:23,232,288,308`. Sentry regression (T1 scope-out validation runtime) : PASS sur `sentry.test.ts` + `sentry-wrapper.test.ts` + `sentry-capture-exception-with-context.test.ts` — `isSentryEnabled` toujours exporté et fonctionnel.



## [Unreleased] — 2026-05-23 — PR-5 `assertPagination` helper + sweep 7 useCases

Run `2026-05-23-pr-5-assertPagination` — fifth KISS/DRY refactor de l'audit `2026-05-23-audit-kiss-dry-backend/findings/findings-B4.md` § Duplications HIGH (volet pagination guard inline). Pipeline : UFR-022 fresh-context 5-phase / reviewer **APPROVED** weightedMean **5.00/5**. Pure TypeScript refacto interne, wire-format 400 `error.message` **byte-for-byte identique** (`'page must be a positive integer'` + `'limit must be between 1 and 100'` préservés string-pour-string vs legacy inline). Zéro changement de comportement runtime observable côté consommateurs, zéro migration DB, zéro lib bump, zéro nouveau `eslint-disable`. Net diff `+59 / -56` sur 8 fichiers source + 2 nouveaux tests red.

### Added

- **Helper `assertPagination(params, opts?)`** — `museum-backend/src/shared/types/pagination.ts:38-53` (+41 LOC append-only au fichier canonique des types pagination déjà colocalisé avec `PaginationParams` + `PaginatedResult<T>` — NFR-3 single-source-of-truth, no new file proliferation). Signature `(params: PaginationParams, opts?: { maxLimit?: number }) => PaginationParams`. Comportement :
  - Throw `badRequest('page must be a positive integer')` si `!Number.isInteger(page) || page < 1` (page-first check ordering — R5).
  - Throw `badRequest(`limit must be between 1 and ${maxLimit}`)` si `!Number.isInteger(limit) || limit < 1 || limit > maxLimit` (default `maxLimit = 100`, template-collapse byte-identique au legacy `'limit must be between 1 and 100'`).
  - Returns fresh literal `{ page, limit }` (pas la ref d'entrée — purity R7, locked par test `'returns a new object'`).
  - Opts-object signature `{ maxLimit?: number }` choisie pour extensibilité future (`minLimit`/`minPage` non-breaking ; R6).
  - Pure function : no I/O, no mutation, no logging. Safe en hot path.
  - JSDoc concise + 3 exemples couvrant les 3 caller flavors (destructure `filters.pagination`, expression-statement, opts override).
  - Defensive `${String(maxLimit)}` (L49) contre `@typescript-eslint/restrict-template-expressions` (NFR-5).
  - Imports `badRequest` from `@shared/errors/app.error` — `app.error.ts` n'importe PAS depuis `@shared/types/*` (cycle risk vérifié zero).

- **Test sentinel `museum-backend/tests/unit/shared/types/assertPagination-sentinel.test.ts`** (121 lignes, 4 it.each cases × 7 site rows = 32 case-rows + 2 global greps) — empêche la régression du pattern inline pagination guard à l'avenir. Couvre par site (7 useCases) : (a) `assertPagination` est référencé dans le fichier, (b) import depuis le module canonique `@shared/types/pagination` (alias ou relatif), (c) absence du pattern inline regex `Number.isInteger(...) || ... < 1`, (d) absence des strings wire-format `'page must be a positive integer'` / `'limit must be between 1 and 100'`. Sentinel global : grep récursif `readdirSync` depuis `src/` racine (exclut `node_modules/dist` par construction, wall ~200ms) → **les 2 wire-format strings DOIVENT apparaître exactement 1 fois, dans le fichier helper UNIQUEMENT** (`.toEqual([HELPER_FILE])` — pas juste `length === 1`, pin la file location exacte). Tout nouveau useCase qui copy-paste l'inline pattern avec wire-format strings → fail CI immédiat sur PR.

- **Test unitaire `museum-backend/tests/unit/shared/types/assertPagination.test.ts`** (195 lignes, 20 it cases groupés en describe) — valide le helper : page invalide x5 (zero, negative, fractional, NaN, Infinity, undefined), limit invalide x6 (zero, negative, fractional, overflow default 100, NaN, undefined), happy path x3 ({1,1}, {1,100}, {999,50} → unchanged), ordering R5 x2 (page-first throw locked), opts.maxLimit override x4 ({1,200,{200}} happy, {1,201,{200}} throws with overridden bound, undefined opts → default 100, opts.maxLimit undefined → default 100 via nullish coalescing), purity x2 ('returns a new object' — fresh literal, pas la ref d'entrée).

  **Frozen-test contract** : `red-test-manifest.json` FLAT `{path: sha256}` shape (per `feedback_team_frozen_manifest_flat.md`). sha256 verified byte-identical pre/post-green via `shasum -a 256` :
  - `museum-backend/tests/unit/shared/types/assertPagination.test.ts` → `4adeddd059b73e5b30803ff45318ee66eddd74a187582ac0a346c31df4589fe7`
  - `museum-backend/tests/unit/shared/types/assertPagination-sentinel.test.ts` → `f6a66aa94fe96f402d23fafe5ffd19f9c095fe5ee586229fc0314015d0862eff`

  Anti-bypass UFR-022 honoré : éditeur green n'a pas self-modifié les tests manifestés (hook `post-edit-green-test-freeze.sh` exit 0). Total tests : 38 (20 helper + 18 sentinel — comptage inclut le `describe` group multiplication). Tests RED (helper absent au HEAD pre-codemod) → 38/38 FAIL ; Tests GREEN (post-codemod) → 38/38 PASS.

### Changed

- **7 useCases migrés sur `assertPagination`** — pattern inline `if (!Number.isInteger(page) || page < 1) { throw badRequest('page must be a positive integer'); } if (!Number.isInteger(limit) || limit < 1 || limit > 100) { throw badRequest('limit must be between 1 and 100'); }` (7 lignes par site) remplacé par 1 ligne d'appel au helper canonique. Deux flavors documentés (cf. `design.md` §2) :

  **Flavor-A — `filters.pagination` whole passed to repo (3 sites admin)** :
  - `museum-backend/src/modules/admin/useCase/users/listUsers.useCase.ts:11` — `ListUsersUseCase.execute` : `const { page, limit } = assertPagination(filters.pagination);` (destructure pour bypass d'un downstream qui n'a pas besoin de réécrire `filters.pagination`).
  - `museum-backend/src/modules/admin/useCase/reports/listReports.useCase.ts:11` — `ListReportsUseCase.execute` : `assertPagination(filters.pagination);` (expression-statement, pas de re-destructure car `filters` passé whole au repo).
  - `museum-backend/src/modules/admin/useCase/audit/listAuditLogs.useCase.ts:14` — `ListAuditLogsUseCase.execute` : `assertPagination(filters.pagination);` (idem).

  **Flavor-B — fresh `filters` object built from `input.page`/`input.limit` (4 sites support+review)** :
  - `museum-backend/src/modules/review/useCase/admin/listAllReviews.useCase.ts:24` — `ListAllReviewsUseCase.execute` : `const { page, limit } = assertPagination({ page: input.page, limit: input.limit });`, puis `pagination: { page, limit }` réutilisé dans `filters`.
  - `museum-backend/src/modules/review/useCase/public/listApprovedReviews.useCase.ts:17` — `ListApprovedReviewsUseCase.execute` : idem.
  - `museum-backend/src/modules/support/useCase/ticket-admin/listAllTickets.useCase.ts:26` — `ListAllTicketsUseCase.execute` : idem.
  - `museum-backend/src/modules/support/useCase/ticket-user/listUserTickets.useCase.ts:26` — `ListUserTicketsUseCase.execute` : idem.

  **Imports `badRequest` audit** : retirés des 4 sites où aucun autre usage résiduel (`listUsers`, `listReports`, `listAuditLogs`, `listApprovedReviews`) ; conservés sur 3 sites où encore utilisés pour des validations non-pagination (`listAllReviews` L24 → `status` enum check via `REVIEW_STATUSES.includes(...)` ; `listAllTickets` L28-32 → `status`+`priority` enum checks via `TICKET_STATUSES`/`TICKET_PRIORITIES.includes(...)` ; `listUserTickets` L28-32 → idem). Imports `assertPagination` ajoutés en tête de chaque fichier en ordre alphabétique (alias `@shared/types/pagination`). Verifier diff par site → useCase signatures unchanged (R12), non-pagination validations préservées byte-for-byte (R13).

  **Wire-format 400 `error.message` byte-for-byte preserved** : helper émet exactement les mêmes 2 strings que le legacy inline (`'page must be a positive integer'` + `'limit must be between 1 and 100'` pour `maxLimit=100` default). Tests existants régression : `pnpm test --testPathPattern='admin/useCase/users/listUsers|admin/useCase/reports/listReports|admin/useCase/audit/listAuditLogs|support/listUserTickets|support/listAllTickets|review/useCase/listAllReviews|review/useCase/listApprovedReviews'` → **50/50 PASS** (5 suites incluant mutation-testing variants) ; `pnpm test --testPathPattern='modules/admin/listUsers|modules/admin/listReports|modules/admin/listAuditLogs'` → **20/20 PASS** (3 suites). Wire-format consumer impact : zéro test snapshot à updater (les tests existants asserting le wire-format passaient déjà ; le helper produit le même string). FE/web consumers : non-breaking (OpenAPI 400 `error.message: string` reste free-form, contract inchangé). Sentry/observability breadcrumbs : aucun changement de payload.

  Net diff par fichier source (post-codemod) : `+8 / -10` (flavor-A destructure), `+5 / -10` (flavor-A expression-statement, 2x), `+3 / -6` (flavor-B destructure, 4x — keep `badRequest` import pour enum checks). Helper file `pagination.ts` : `+41 / 0` (append-only). Total source net `+18 / -56` ; tests +316 lignes (2 nouveaux fichiers).



Run `2026-05-23-pr-4-formatZodIssues` — fourth KISS/DRY refactor de l'audit `2026-05-23-audit-kiss-dry-backend/findings/findings-B2.md` D1 (HIGH). Pipeline : UFR-022 fresh-context 5-phase / standard / reviewer APPROVED weightedMean **4.8/5**. Pure TypeScript refacto interne, wire-format 400 `error.message` aligné sur la canonique single-source-of-truth déjà utilisée par `validateBody` + chat contract wrappers. Public OpenAPI 400 contract préservé (`error.message: string` générique, non-contractually-fixed). Zéro migration DB, zéro lib bump, zéro nouveau `eslint-disable`.

### Changed

- **PR-4** — `validate-query.middleware.ts` utilise désormais le formatteur canonique `formatZodIssues` (`museum-backend/src/shared/validation/zod-issue.formatter.ts:13-26`, signature `(issues: readonly z.core.$ZodIssue[]) => string`) au lieu de réinventer le pattern inline `issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')`. Single call-site : `museum-backend/src/shared/middleware/validate-query.middleware.ts:17` — `throw badRequest(formatZodIssues(result.error.issues));`. Import canonique ajouté L2 : `import { formatZodIssues } from '@shared/validation/zod-issue.formatter';`. JSDoc aligné sur `validate-body.middleware.ts:10` (`@throws AppError 400 BAD_REQUEST on validation failure.`). Pragma `eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters` L12 préservé verbatim (NFR-5).

  **Wire-format 400 `error.message` change documenté NFR-3** — observable mais non-breaking sur OpenAPI contract (`error.message: string` reste un free-form string). Différences canonique (post-PR-4) vs legacy inline (pre-PR-4) :

  - **Séparateur path/message** : `<path> <message>` (espace) au lieu de `<path>: <message>` (colon-space).
  - **Dedup double-prefix** : message dont le texte commence déjà par `<path> ` ou `<path>.` n'est plus double-préfixé (ex `'q must be set'` reste `'q must be set'`, plus `'q: q must be set'`).
  - **Empty issues défensif** : fallback `'Invalid payload'` au lieu de string vide `''`.
  - **Root error (empty path)** : `<message>` brut au lieu de `: <message>` (préfixe colon vide).

  Source-of-truth réaffirmée : `zod-issue.formatter.ts` JSDoc L6 ("Single source of truth for Zod issue → flat error string. Wire-format change MUST happen here") matche désormais le code. Validate-body + validate-query sont byte-identiques sur leur branche d'erreur post-PR-4 ; seuls leur source (`req.body` vs `req.query`) et leur sink (`req.body = result.data` vs `res.locals.validatedQuery = result.data`) diffèrent (Express 5 `req.query` read-only).

  Consumer impact NFR-2 empiriquement vérifié : `rg -n "split\(': '\)" museum-frontend museum-web` → **empty** (0 call-site FE/web ne parse `error.message` via `split(': ')` sur routes query-validated). Tests pré-existants asserting le legacy colon-form : `rg -n "expect.*toContain.*': '" museum-backend/tests/` + `rg -n "toContain\(': " museum-backend/tests/contract museum-backend/tests/e2e` → **empty** (aucun snapshot legacy à updater). Logs Sentry / observability breadcrumbs basculent `field: msg` → `field msg` post-merge — non-breaking (payload reste string). `validate-body.middleware.ts` byte-identical pré/post (R4 strict, `git diff` empty). `zod-issue.formatter.ts` byte-identical (canonique inchangée).

### Added

- 5 nouveaux cas de test (`C1`-`C5`) appendés à `museum-backend/tests/unit/middleware/validate-query.test.ts` dans un nouveau `describe('validateQuery — wire-format parity with validateBody', …)` (+109 lignes, append-only) — sentinel codemod permanent empêchant la régression du colon-form `<field>: <message>` à l'avenir :
  - **C1** (R2/R3) : single-field, `z.object({ q: z.string().min(1) })` rejette `{ q: '' }` via `validateQuery` ET `validateBody` → `expect(queryMessage).toBe(bodyMessage)` + `not.toContain(': ')` + `toMatch(/^q /)`.
  - **C2** (AC2.3) : root error empty path, `z.object({ q: z.string() })` reçoit `'not-an-object'` → branche `formatZodIssue` empty-path → `'Invalid input: expected object, received string'` (PAS `': Invalid input: …'`).
  - **C3** (AC2.4) : dedup, `.refine((v) => v.length > 0, { message: 'q must be set' })` → canonique dedup branch → `'q must be set'` (PAS `'q: q must be set'` double-prefix).
  - **C4** (AC2 défensif) : empty issues — `fakeSchema` mock retourne `{success:false, error:{issues:[]}}` → branche défensive `formatZodIssues` → `'Invalid payload'` (PAS `''`).
  - **C5** (R3 negative sentinel) : `expect(msg).not.toMatch(/^\w+: /)` — regex `/^\w+: /` (préfixe colon-form en début de string seulement). Deviation honnêtement disclosée red-report.json notes[0] : architect proposait `/.*:.*$/` over-matchant (messages zod légitimes contiennent `:`, ex `'Too small: expected string to have >=1 characters'`), editor a appliqué la version stricte qui catche le legacy colon-form en début sans faux positif. Intent architect anti-colon-form préservé.

  Tests RED verbatim (5/5 FAIL pre-fix) : evidence Jest output dans `red-report.json` cases[].evidence (ex C1 : `Expected: "q Too small: …" Received: "q: Too small: …"`). Tests GREEN (5/5 PASS post-fix) : `pnpm jest --testPathPattern=validate-query.test.ts` → 14/14 PASS (9 legacy + 5 nouveaux). Scope élargi `tests/unit/(middleware|shared)` : 77 suites / 1155 tests all PASS, 0 régression. `pnpm lint` exit 0.

  Frozen-test contract : `red-test-manifest.json` sha256 (`aef671177a3e39fea690fdf3a87b05e6500e37a28064327a3535b4a293f60838`) **UNCHANGED** entre phases red et green — éditeur green n'a pas self-modifié le test manifesté (vérifié `shasum -a 256` ≡ manifest). Anti-bypass UFR-022 honoré.

## [Unreleased] — 2026-05-23 — PR-3 codemod `notFound()` sur 4 sites auth/useCase

Run `2026-05-23-pr-3-notFound-codemod` — third KISS/DRY refactor de l'audit `2026-05-23-audit-kiss-dry-backend/findings/findings-B4.md` § Duplications HIGH (volet `notFound`). Pipeline : UFR-022 fresh-context 5-phase / reviewer APPROVED weightedMean **4.5/5**. Pure TypeScript refacto, wire-format 404 **byte-for-byte identique** (statusCode + `code:'NOT_FOUND'` + `message:'User not found'` + `details:undefined` + instance class `AppError` tous préservés). Zéro changement de comportement runtime observable côté consommateurs, zéro migration DB, zéro lib bump.

### Changed

- **PR-3** — 4 use cases du module `auth/` utilisent désormais le helper canonique `notFound(message, details?)` (`museum-backend/src/shared/errors/app.error.ts:45-52`, signature `(message: string, details?: unknown) => AppError`, force `statusCode=404` + `code='NOT_FOUND'`) au lieu de réinventer le pattern inline `throw new AppError({ message: 'User not found', statusCode: 404, code: 'NOT_FOUND' });`. Sites codemodés :
  - `museum-backend/src/modules/auth/useCase/email/changeEmail.useCase.ts:30` — `ChangeEmailUseCase.execute` (user-not-found pré-bcrypt reauth).
  - `museum-backend/src/modules/auth/useCase/password/changePassword.useCase.ts:24` — `ChangePasswordUseCase.execute` (idem).
  - `museum-backend/src/modules/auth/useCase/totp/disableMfa.useCase.ts:22` — `DisableMfaUseCase.execute` (idem, pré-vérif `INVALID_CREDENTIALS`).
  - `museum-backend/src/modules/auth/useCase/totp/enrollMfa.useCase.ts:34` — `EnrollMfaUseCase.execute` (idem, pré-vérif `MFA_ALREADY_ENROLLED`).

  Imports `AppError` retirés de 2 fichiers (`changeEmail.useCase.ts`, `changePassword.useCase.ts` — plus aucun usage résiduel), conservés sur 2 fichiers (`disableMfa.useCase.ts` L32 `INVALID_CREDENTIALS` 401 ; `enrollMfa.useCase.ts` L39 `MFA_ALREADY_ENROLLED` 409). Helpers nommés `badRequest`/`notFound` ajoutés en ordre alphabétique dans la named-import body. Diff `+8 / -8` lignes sur 4 fichiers source, exactement au budget NFR-5 annoncé.

  Wire-format 404 mathématiquement et empiriquement préservé : helper single-arg `notFound('User not found')` construit `new AppError({ message:'User not found', details:undefined, statusCode:404, code:'NOT_FOUND' })` — byte-for-byte équivalent à l'inline (où `details` était également `undefined`). Tests existants `change-password.test.ts`, `changeEmail.useCase.test.ts`, `mfa-flow.e2e.test.ts` PASS unmodifiés (NFR-1 vérifié empiriquement). Auth unit suite `tests/unit/auth` : **72 suites, 735 tests, all PASS** post-codemod. `pnpm lint` exit 0.

### Added

- Nouveau test sentinel `museum-backend/tests/unit/auth/pr3-notFound-helper-adoption.test.ts` (86 lignes, 8 assertions structurelles) — empêche la régression du pattern inline 404 "User not found" à l'avenir. Couvre par fichier : (a) absence du pattern `new AppError({ ..., code:'NOT_FOUND', ... })` inline (regex `INLINE_NOT_FOUND_PATTERN`, tolère single/double quotes + clés réordonnées), (b) présence de l'import `notFound` from `@shared/errors/app.error` (parsing named-import body pour éviter faux-positifs commentaires). Test FAIL au HEAD pre-codemod (pattern présent), PASS post-codemod (0 inline restant). Frozen-test contract : `red-test-manifest.json` sha256 (`546c7fe6923f0d21df39c10ea38b8f3d9b5bb8ed71a1fe5f526709ebf0791caf`) UNCHANGED entre phases red et green — éditeur n'a pas self-modifié le test manifesté. Sanity-check repo-wide : `rg "new AppError\(\s*\{[^}]*code:\s*['\"]NOT_FOUND['\"]" museum-backend/src` → **0 hits** post-codemod (clean repo-wide, aucun site `NOT_FOUND` inline résiduel hors scope).

## [Unreleased] — 2026-05-23 — PR-2 codemod `requireUser(req)` sur 7 sites chat/

Run `2026-05-23-pr-2-requireUser-codemod` — second KISS/DRY refactor de l'audit `2026-05-23-audit-kiss-dry-backend/findings/findings-B4.md` § Duplications HIGH #3. Pipeline : UFR-022 fresh-context 5-phase / reviewer APPROVED. Pure TypeScript refacto, wire-format 401 strict equivalent (statusCode + `code:'UNAUTHORIZED'` inchangés, seul le `message` text passe `'Token required'` → `'Authentication required'` — discrimination FE/web se fait sur `code` machine-lisible). Zéro changement de comportement runtime observable côté consommateurs, zéro migration DB, zéro lib bump.

### Changed

- **PR-2** — 7 sites du module `chat/` HTTP layer utilisent désormais le helper canonique `requireUser(req)` (`museum-backend/src/shared/http/requireUser.ts:11`, signature `(req: Request) => UserJwtPayload`, throw `unauthorized('Authentication required')` si `req.user?.id` falsy) au lieu de réinventer le pattern inline `const currentUser = getRequestUser(req); if (!currentUser?.id) { throw new AppError({message:'Token required', statusCode:401, code:'UNAUTHORIZED'}) }`. Sites codemodés :
  - `museum-backend/src/modules/chat/adapters/primary/http/explanation.controller.ts:19-22` — `createExplanationHandler` (GET `/api/chat/messages/:id/explanation`).
  - `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-session.route.ts:70-77` — `buildUpdateSessionContextHandler` (PATCH `/sessions/:id/context`).
  - `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-session.route.ts:129-132` — inline GET `/sessions` list handler.
  - `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-media.route.ts:152-155` — `createReportHandler` (POST `/messages/:messageId/report`).
  - `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-media.route.ts:173-176` — `createFeedbackHandler` (POST `/messages/:messageId/feedback`).
  - `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-memory.route.ts:19-22` — GET `/memory/preference`.
  - `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-memory.route.ts:33-36` — PATCH `/memory/preference`.

  Imports `AppError` retirés des 4 fichiers (helpers nommés `badRequest`/`notFound` conservés là où encore utilisés). Imports `getRequestUser` conservés sur `chat-session.route.ts` (sites no-throw L34 GET single, L115 POST create, L142 DELETE — useCase tolère `userId=undefined`) et `chat-media.route.ts` (sites no-throw L43 audio, L189 imageUrl, L209 tts) ; retirés sur `explanation.controller.ts` et `chat-memory.route.ts` (plus aucun usage résiduel). Diff `+18 / -47` lignes sur 4 fichiers source + 1 test sentinel.

### Added

- Nouveau test sentinel `museum-backend/tests/unit/chat/route-discipline-requireUser-codemod.test.ts` (156 lignes, 13 assertions) — empêche la régression du pattern inline à l'avenir. Couvre par fichier : (a) absence du pattern `if (!\w+\?\.id) { throw new AppError({...UNAUTHORIZED...}) }`, (b) absence du literal `throw new AppError({ ... code:'UNAUTHORIZED' ... })` inline (helper-wrapped `unauthorized(...)` reste autorisé), (c) présence de l'import `requireUser` from `@shared/http/requireUser`. Sanity-check global : total inline-pattern ≤ 7 (au HEAD pre-codemod = 7, post-codemod = 0).

## [Unreleased] — 2026-05-23 — PR-1 unauthorized factory extension + 6-locale sweep

Run `2026-05-23-pr-1-unauthorized-extend` — first KISS/DRY refactor of the audit `2026-05-23-audit-kiss-dry-backend/findings/findings-B4.md` § Duplications HIGH #1. Pipeline : UFR-022 fresh-context 5-phase / reviewer APPROVED. Pure TypeScript refacto, zéro changement de comportement runtime observable, zéro migration DB, zéro lib bump.

### Changed

- **PR-1** — `unauthorized` factory canonique étendue à signature `(message: string, code?: string): AppError` (default-arg positional, `code = 'UNAUTHORIZED'`). Surface additive : les ~14 call-sites externes mono-arg continuent de compiler sans annotation. Pattern aligné avec les ex-locales L4/L5/L6 (`token-jwt.service`, `authSession.service`, `session-issuer.service`). Source : `museum-backend/src/shared/errors/app.error.ts:109-115`. Symétrie volontairement gardée mono-arg-compatible (vs options-object) pour préserver les 16 call-sites 2-arg littéraux existants et la cohérence avec `forbidden(message)` / `conflict(message)`. AC1+AC2 couverts par nouveau test unit `tests/unit/shared/app-error.test.ts` (assertion `'unauthorized accepts an optional code override'`). AC4+AC8 couverts par nouveau test `tests/unit/auth/unauthorized-codemod.test.ts` (3 paths d'erreur `verifyMfaSessionToken` + sentinel codes machine-lisibles préservés bit-à-bit).

### Removed (UFR-016 burial — 6 factories locales)

- `museum-backend/src/shared/middleware/authenticated.middleware.ts:10-11` — `const unauthorized = (message: string)` (mono-arg, default `'UNAUTHORIZED'`). 5 call-sites mono-arg conservés inchangés (default canonique ≡ default locale).
- `museum-backend/src/shared/middleware/apiKey.middleware.ts:28-29` — `const unauthorized = (message: string)` (mono-arg, default `'UNAUTHORIZED'`). 6 call-sites mono-arg conservés inchangés.
- `museum-backend/src/modules/auth/useCase/totp/mfaSessionToken.ts:41-42` — `const unauthorized = (message: string, code = 'INVALID_MFA_SESSION')` (default divergent). **3 call-sites mono-arg promus en 2-arg explicit** `(msg, 'INVALID_MFA_SESSION')` aux lignes 53, 60, 65 post-refactor pour préserver le code machine-lisible (sans cette promotion, FE MFA challenge UX cassée car code dégradait silencieusement à `'UNAUTHORIZED'`).
- `museum-backend/src/modules/auth/useCase/session/token-jwt.service.ts:30-36` — `const unauthorized = (message: string, code = 'UNAUTHORIZED')`. 6 call-sites 2-arg littéraux (`'INVALID_ACCESS_TOKEN'`, `'INVALID_REFRESH_TOKEN'`) conservés inchangés.
- `museum-backend/src/modules/auth/useCase/session/authSession.service.ts:30-36` — `const unauthorized = (message: string, code = 'UNAUTHORIZED')`. 7 call-sites 2-arg littéraux (`'INVALID_CREDENTIALS'`, `'INVALID_REFRESH_TOKEN'`, `'ACCOUNT_DELETED'`, `'ACCOUNT_SUSPENDED'`) conservés inchangés.
- `museum-backend/src/modules/auth/useCase/session/session-issuer.service.ts:39-45` — `const unauthorized = (message: string, code = 'UNAUTHORIZED')`. 4 call-sites 2-arg littéraux (`'REFRESH_TOKEN_REUSE_DETECTED'`, `'REFRESH_TOKEN_EXPIRED'`, `'SESSION_IDLE_TIMEOUT'`) conservés inchangés.

Total diff : `+46 / -44` lignes sur 8 fichiers (6 source + 2 tests). Aucune ADR (refacto réversible). Aucune entrée TECH_DEBT (zéro dette ajoutée).

## [Unreleased] — 2026-05-23 — PR-P0-1 fix feedback LLM cache invalidation

Run `2026-05-23-pr-p0-1-fix-llm-cache-feedback` — single P0 launch-blocker closed (V1 2026-06-07, J-15). Pipeline : UFR-022 fresh-context 5-phase / enterprise / reviewer APPROVED weightedMean **92.4**.

### Fixed

- **PR-P0-1** — Negative feedback on a chat answer now actually purges the cached LLM response. Previously `buildFeedbackInvalidationKeys` (in `museum-backend/src/modules/chat/useCase/audio/chat-media.service.ts`) produced a cartesian product of keys in an orphan namespace `chat:llm:*` while the real cache writer `LlmCacheServiceImpl` stores under `llm:v2:*` (ADR-036). Result : `cache.del(...)` purged non-existent keys, 0 entries invalidated, stale answer served back for the remainder of the TTL window (24 h museum-mode / 7 d generic). Fix : the exact cache key produced by `LlmCacheServiceImpl.store()` is now captured at WRITE time and persisted on the `ChatMessage` row as `cache_key` (additive nullable migration `1779536483274-AddCacheKeyToChatMessages`). Feedback path reads the row by `messageId`, retrieves `cacheKey`, and purges the exact key. Closes the I-FIX1 sweep (admin "purge museum" path fixed 2026-05-21 ; feedback path was missed in the same sweep). Fail-open semantics preserved (Redis down → HTTP 200 + WARN log). New dedicated suite `tests/unit/chat/feedback-cache-invalidation.test.ts` (8 cases, non-tautological — assertions on the actual key written, not via the function under test). Executes ADR-036 ; no new ADR.

### Removed (UFR-016 burial — ~589 LOC)

- `museum-backend/src/modules/chat/useCase/message/chat-cache-key.util.ts` (148 LOC) — produced the orphan `chat:llm:*` namespace, no writers in prod (exhaustive grep), parity contract FE↔BE was stale (FE `computeLocalCacheKey` is device-local AsyncStorage, never imported the BE helper).
- `museum-backend/tests/contract/cache-key-parity.test.ts` (66 LOC) — defended the stale parity contract.
- `museum-backend/tests/fixtures/cache-key-vectors.json` (119 LOC) — fixture for the removed parity test.
- `museum-backend/tests/helpers/chat/cache-fixtures.ts` (23 LOC) — helper for the removed parity test.
- `museum-backend/tests/unit/chat/chat-cache-key.test.ts` (233 LOC) — tested the orphan helper.

## [Unreleased] — 2026-05-21 — P0 GDPR closure lot

Run `2026-05-21-p0-gdpr` — eight P0 items shipped to verrouiller V1 launch (2026-06-01) against pre-launch GDPR + App Store + ePrivacy audit findings. Pipeline : UFR-022 fresh-context 5-phase / standard-enterprise / reviewer APPROVED weightedMean 89.45.

### Security (GDPR Art. 7 enforcement)

- **B6** — `third_party_ai_{text,image,audio}_{openai,google}` consent enforcement at the LLM dispatch site (chat pipeline) and the audio route. New `ThirdPartyAiConsentChecker` port mirroring the existing `LocationConsentChecker` pattern ; wired into `prepare-message.pipeline.ts` and `chat-media.route.ts` ; refusal returns a structured `kind: 'refused'` bubble (pipeline) or HTTP 403 + `AppError({code: 'CONSENT_REQUIRED', scope})` (audio route). Anonymous sessions = fail-CLOSED (D3 default). Multi-provider intersection-AND semantics (D2).
- **B7** — `POST /sessions/:id/audio` consent gate. Audio scope (`third_party_ai_audio_<provider>`) is now verified at route entry before any STT invocation ; previously the FE collected the toggle but the backend dispatched audio to OpenAI Whisper without checking.
- **I-SEC9** — `searchTerm` (user-typed chat text) dropped from `ExtractionJobPayload` in the BullMQ extraction queue. The field was enqueued by `enqueueForExtraction()` but ignored downstream (`processUrl(url, _searchTerm, locale)` discarded it) — dead PII retained in Redis for the BullMQ retention window. Now removed at the port boundary ; worker tolerant-destructures legacy jobs (R10 backward-compat).

### Compliance (GDPR Art. 13(1)(e) recipient disclosure)

- **B15** — Subprocessor list reconciled across the three public surfaces : 19 recipients (13 missing + DeepSeek-HTML-only added). New `/subprocessors` route on `museum-web` enumerates them with role, jurisdiction, contractual basis (DPA / SCC / adequacy).
- **B16** — Single canonical legal content source at `museum-backend/src/shared/legal/{privacy,terms}-content.canonical.json`. Three derivation pathways : `museum-web` imports directly, `museum-frontend` regenerated via `scripts/codegen-legal-content.mjs` (run by husky on canonical-touched commits), `docs/privacy-policy.html` maintained manually and verified by sentinel. New CI sentinel `museum-backend/scripts/sentinels/privacy-content-drift.mjs` with comment-stripping pre-pass blocks any PR where a surface diverges. Corrected CNIL Délibération 2021-018 minor-age value (15 years, replacing the prior incorrect "16 ans" in HTML/FE). Architecture rationale recorded in ADR-062.
- **B18** — `museum-web` `/terms` route added + `/cookies` notice page (ePrivacy notice-only, no consent banner). The cookie-audit performed in-spec confirmed `museum-web` sets only strictly-necessary first-party cookies (`admin-authz`, `csrf_token`) and that the embedded Sentry SDK is configured without `replaysSessionSampleRate` / `profilesSampleRate` — no non-essential tracking cookies, banner not required. New CI sentinel `museum-backend/scripts/sentinels/web-cookies-audit.mjs` scans `museum-web/` for forbidden tracking SDK identifiers to preserve this stance.

### App Store

- **B10** — `museum-frontend/ios/Musaium/Info.plist` : `NSLocationAlwaysAndWhenInUseUsageDescription` and `NSLocationAlwaysUsageDescription` removed (when-in-use only matches `app.config.ts` declared scope). Sentinel added to prevent regression at build time.

### Internationalisation

- **I-CMP2** — 10 `consent.*` translation keys backfilled across 6 missing locales (`de`, `es`, `it`, `ja`, `zh`, `ar`) in `museum-frontend/locales/`. Brings 60 missing keys to zero ; consent UI now renders in the full locale matrix.

### Reclassified

- **I-SEC8** — Originally framed by the audit as a cross-tenant `museum_id` scoping leak in `artwork_knowledge`. Verification (2026-05-21) proved `artwork_knowledge` is a global scraped catalogue keyed by `(title, artist, locale)` with no tenant column ; the residual risk is self-inflicted only (client surfacing an irrelevant title in their own session prompt) and `sanitizePromptInput()` already mitigates the prompt-injection vector. Reclassified LOW, no code, no migration. Rationale + future V2 trigger conditions recorded in ADR-061.

### Architectural Decision Records

- ADR-061 — I-SEC8 reclassification (`artwork_knowledge` is not multi-tenant).
- ADR-062 — Canonical legal content source + drift sentinel.
