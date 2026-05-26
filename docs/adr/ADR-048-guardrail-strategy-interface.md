# ADR-048: Guardrail strategy interface — `GuardrailProvider` as the perennial port

> **Status:** Accepted — implemented (`guardrail-provider.port.ts`)
> **Date:** 2026-05-12
> **Decider:** Tim (founder/tech lead)
> **Supersedes (partial):** ADR-015 (LLM-Judge Guardrail V2) — narrows its `AdvancedGuardrail` port to a single-provider abstraction; ADR-048 generalises to a strategy pattern
> **Builds on:** ADR-047 (LLM-Guard circuit breaker + fail-CLOSED)
> **Related:** ADR-009 (mobile OTA disabled — informs why we cannot defer this rename)

---

## Context

The 2026-05-12 production incident (`/scan/prompt` sidecar timeouts → 100% fail-CLOSED → chat unusable) was patched by ADR-047 with a circuit breaker, inflight semaphore, replicas, and a `service_unavailable` mapping. That patch is surgical and correct at its scope.

However, the patched port is named `AdvancedGuardrail` — a 2025-era abstraction tied to one provider (the LLM-Guard Python sidecar) and one binary verdict (`allow / reason`). Three forces in the 12–24 month horizon make this name and shape brittle:

1. **Provider lock-in risk.** ADR-015 flagged `laiyer-ai/llm-guard`'s upstream as hobbyist-grade. A swap to NeMo Guardrails, Llama Guard 3/4, Lakera, or an in-house fine-tune becomes plausible by Q3 2026. The current port has no `version` field, no `health()` probe semantics, no `metrics()` snapshot — three primitives required by any sane shadow-mode promotion gate. A swap forces interface churn that propagates through chat, voice, future walk-tours.
2. **Mobile OTA-disabled (ADR-009).** Interface changes that reach the mobile client through generated OpenAPI types require a full app release and store review. The longer we wait to add `version` + `health()` + `metrics()` (perennial fields that mobile may eventually surface), the more coordinated the migration becomes — mobile dev + mobile release schedule + backend deploy + store review align under release-pressure conditions. That's the kind of work that ships at 2am with regrets.
3. **Multi-tenant policy (Phase 2, B2B onset).** Per-tenant guardrail policies require a `PolicyResolver` that returns a set of active providers and aggregation strategy. A single `AdvancedGuardrail` doesn't compose. Rename now → policy lifts in cleanly later.

The 2026-05-12 perennial design run codified these forces (`team-state/2026-05-12-llm-guard-perennial-10y-design/`). Phase 0 of that design is this ADR.

## Decision

Rename and extend the port:

```
AdvancedGuardrail            →  GuardrailProvider
AdvancedGuardrailDecision    →  GuardrailVerdict  (additive `version: 'v1'` field)
AdvancedGuardrailInput       →  GuardrailInput
AdvancedGuardrailOutput      →  GuardrailOutput
AdvancedGuardrailBlockReason →  GuardrailBlockReason
noopAdvancedGuardrail        →  noopGuardrailProvider
```

Add three methods to the port:

```ts
export interface GuardrailProvider {
  readonly name: string;
  /**
   * Stable identifier for this provider's *behavioural* version. Bump on any
   * change that may shift decisions (model swap, threshold change, prompt
   * template). Used by shadow-mode promotion gates + audit log + bias
   * monitoring snapshots. Free-form but conventionally semver-ish
   * (e.g. 'llm-guard-0.3.16', 'llama-guard-3-8b').
   */
  readonly version: string;

  checkInput(input: GuardrailInput): Promise<GuardrailVerdict>;
  checkOutput(output: GuardrailOutput): Promise<GuardrailVerdict>;

  /**
   * Deep health probe. Distinct from a TCP-up healthcheck: exercises the
   * provider's actual decision path with a known-benign payload. Implementations
   * SHOULD return within 2× their typical timeout.
   *
   *   status: 'up' if last attempt succeeded with allow:true
   *           'degraded' if responding but slow / partial
   *           'down' if unreachable / consistently failing
   *   latencyMs: round-trip of the probe call
   *   lastCheckedAt: ISO 8601
   *   detail: optional free-form string (e.g. circuit breaker state)
   */
  health(): Promise<ProviderHealth>;

  /**
   * Lightweight metrics snapshot for /api/health/deep + dashboards.
   * Counters are cumulative-since-process-start; gauges are point-in-time.
   *
   *   requests: total checkInput + checkOutput calls
   *   blocks: total verdicts with allow=false
   *   errors: total fail-CLOSED returns due to provider error (timeout, 5xx, parse)
   *   skipsBreaker: blocked attempts when circuit breaker was OPEN
   *   skipsOverflow: rejected attempts due to inflight-semaphore overflow
   */
  metrics(): ProviderMetricsSnapshot;
}

export interface ProviderHealth {
  status: 'up' | 'degraded' | 'down';
  latencyMs: number;
  lastCheckedAt: string;
  detail?: string;
}

export interface ProviderMetricsSnapshot {
  requests: number;
  blocks: number;
  errors: number;
  skipsBreaker?: number;
  skipsOverflow?: number;
}

export interface GuardrailVerdict {
  /** Schema version. Always 'v1' at Phase 0; bump on breaking changes only. */
  version: 'v1';
  allow: boolean;
  reason?: GuardrailBlockReason;
  confidence?: number;
  redactedText?: string;
  /** Optional provider name + version stamped on the verdict for audit log. */
  providedBy?: { name: string; version: string };
}
```

`version` and `providedBy` are additive — existing callers compile unchanged because the fields are optional or have a literal default. `health()` and `metrics()` are mandatory because they cannot have a sensible default for adapters that lack instrumentation (the noop provider returns trivially).

### Audit log payload extension (1-line)

`chat-module.ts`'s `breaker_open` audit emission gains a `policyVersion: 'default-v0'` literal field. This anchors a stable string that Phase 2's database-backed policy resolver will populate with real per-tenant policy versions. Phase 0 ships the schema field with a literal; Phase 2 ships the lookup.

## Consequences

### Positive

- Provider swap (LLM-Guard → NeMo / Llama Guard / Lakera) becomes a Phase 1 task with no port refactor warmup.
- Shadow-mode promotion gate (Phase 1) can compare `version` strings and tag audit rows with `providedBy`.
- `/api/health/deep` (Phase 1) lights up automatically once any provider implements `health()`.
- Mobile-client-readable OpenAPI types stabilise with `version` field NOW — no future coordinated migration under OTA-disabled constraint.
- Per-tenant policy resolver (Phase 2) lifts cleanly: `PolicyResolver.resolve(tenantId): GuardrailProvider[]`.
- Code reads more honestly: `LLMGuardAdapter implements GuardrailProvider` is one provider among N future. The "advanced" prefix obscured this.

### Negative

- ~80 LOC churn across 7 files (port + 1 adapter + ~5 importers + tests).
- Existing ADRs 015 and 047 reference the old name `AdvancedGuardrail`; ADR-048 explicitly notes the rename — no edits to those ADRs (immutable historical record).
- `noopAdvancedGuardrail` is renamed too; one `eslint-disable` comment may need its rule re-evaluated.
- One additional method (`metrics()`) per adapter — the noop returns zeros; LLM-Guard returns its existing counters.

### Neutral

- The `env.features.guardrailsV2Candidate` env knob is NOT touched in this ADR. The perennial design proposes replacing it with `PolicyResolver` in Phase 2. Phase 0 leaves it as-is to keep the surgical-rename scope.

## Alternatives considered

### A. Defer to Phase 1 (post-launch)

Rejected. The post-launch backlog includes deep-health, shadow mode, and the GDPR Art. 22 endpoint — each of which assumes the new port shape. Doing the rename mid-Phase-1 adds a "warmup" PR week before any feature lift. Also: any sprint between Phase 0 and Phase 1 may add a third consumer of the `AdvancedGuardrail` name (i18n surfacing, walk-tour, voice-realtime ADR-042 eventually unblocked). Coordinated rename across more callers is strictly worse than the same rename today.

### B. Add `version`/`health()`/`metrics()` to `AdvancedGuardrail` without renaming

Tempting (smaller PR, less churn). Rejected because the name carries semantic baggage: "advanced" frames it as "the special / new guard" rather than "one provider among the strategy stack". Future readers will read it as a single-provider concept. Cheap rename + cheap insurance > cheap rename deferred.

### C. Skip the audit `policyVersion` field

Rejected. Phase 2's policy resolver requires this anchor. Adding the literal field now means audit log replay across Phase 0 → Phase 2 has a continuous schema. Cost: 1 line.

### D. Use union type `'v1' | 'v2'` on `GuardrailVerdict.version` immediately

Rejected. YAGNI. The literal `'v1'` lets us discriminate at the boundary later; no need to forecast `v2` shape today. ADR-049 (TBD) will codify the schema evolution policy when v2 is needed.

### E. Make `health()` synchronous

Rejected. Provider health probes hit the network / model. Async is correct. Aligning with the existing async pattern.

## Implementation outline

See `team-state/2026-05-12-llm-guard-perennial-10y-design/phase-0-draft/RENAME-PLAN.md` for the mechanical file-by-file plan + grep targets. The change is shipped as a single PR, same-day as the ADR-047 commit lands. Hooks run (lint, tsc, scoped tests). No production push without explicit user authorization (per `feedback_auto_commit_end_feature` — commit yes, push gated).

## Compliance touch-points

- **EU AI Act Art. 12 (record-keeping):** `policyVersion` + `providedBy.version` in audit log anchor provider/policy traceability per decision — foundation for high-risk conformity assessment (Phase 2 if Annex III applies).
- **GDPR Art. 22 (right to explanation):** `providedBy.version` + `version` enable forensic reconstruction of "which provider/policy denied this user's input" without storing the raw prompt. Phase 1 ships the `/api/chat/messages/:id/explanation` endpoint consuming this schema.
- **AI Act Art. 17 (post-market monitoring):** `metrics()` snapshot is the building block of the monthly PMM report (Phase 2).

## Rollout / rollback

- Single commit, ~80 LOC. Hooks pass or revert.
- Rollback path: `git revert <commit>`. Since no behaviour changes (rename + additive fields + new methods returning trivial values for the one impl), revert is risk-free.
- No DB migration. No infra change. No config change.
- Adapter callers compile-time-enforced by `tsc --noEmit`.

## Sign-off criteria for "Accepted"

- [x] `pnpm tsc --noEmit` passes (BE)
- [x] `pnpm test` scoped to `tests/unit/chat/llm-guard-adapter.test.ts` + `tests/unit/chat/guardrail-evaluation.service.test.ts` passes
- [x] `cd museum-frontend && npm run check:openapi-types` clean (no FE diff expected, port stays internal)
- [x] `docs/AI_SAFETY.md` ships in the same commit (anchor doctrine)
- [x] User explicit "go" on the diff
- [x] User explicit "go" on push (separate gate per `feedback_auto_commit_end_feature`)
