# ADR-071 — Re-arming hexagonal boundaries: ESLint resolver wiring, sequenced per-wave arming, and an ESLint-independent purity sentinel

**Status:** Accepted — W1 implemented (working tree at ADR authoring time), W2/W3 sequenced post-launch
**Date:** 2026-06-04
**Deciders:** /team run `2026-06-04-hexagonal-boundaries-enforcement` (architect + editor + reviewer fresh-context UFR-022). Reviewer APPROVED W1, weightedMean **91.9**.
**Implemented in (W1):** working tree — `museum-backend/eslint.config.mjs:113-120` (resolver + corrected comment), `museum-backend/scripts/sentinels/hexagonal-domain-purity.mjs` (new), `museum-backend/tests/unit/architecture/{boundaries-rule-bites,hexagonal-domain-purity-sentinel}.test.ts` (new), `museum-backend/tests/fixtures/architecture/{violating-domain,clean-domain}.fixture.ts` + `lint-fixture-runner.mjs` (new), `museum-backend/src/modules/chat/domain/knowledge/knowledge-router.types.ts` + 5 other new domain ports/type modules, `.husky/pre-push:426-434` (Gate 32), `.github/workflows/ci-cd-backend.yml:160`, `.github/workflows/sentinel-mirror.yml:183-184`
**Related spec/design:** [`spec.md`](../../.claude/skills/team/team-state/2026-06-04-hexagonal-boundaries-enforcement/spec.md) · [`design.md`](../../.claude/skills/team/team-state/2026-06-04-hexagonal-boundaries-enforcement/design.md) · [`tasks.md`](../../.claude/skills/team/team-state/2026-06-04-hexagonal-boundaries-enforcement/tasks.md)
**Reviewer JSON (APPROVED 91.9):** [`code-review.json`](../../.claude/skills/team/team-reports/2026-06-04-hexagonal-boundaries-enforcement/code-review.json)
**Partially closes:** TD-62 (audit 360 ARCH-01 + ARCH-02) — W1 delivered; full close at W3 (TW3.4)

---

## Context

The backend hexagonal-architecture guard (`eslint-plugin-boundaries@^6.0.1`) was a **proven no-op**. The boundaries config block (`museum-backend/eslint.config.mjs:64-160`) declared `settings['boundaries/elements']`, `settings['boundaries/dependency-nodes']`, and a `boundaries/dependencies` rule (v6 object-selector syntax) — but its `settings` carried **no `import/resolver`**. The boundaries v6 plugin resolves each import specifier through `eslint-module-utils`, which reads `settings['import/resolver']`. With no resolver in this block, every path-alias import (`@modules/*`, `@shared/*`, `@data/*`) resolved as `external` (path `null`), so no file was classified into an element type, so every `from/to` rule (including `from: { type: 'domain' }`) matched nothing and the rule **never fired** — 0 errors regardless of any violation. The `import-x/resolver` (`eslint.config.mjs:165-173`) is in a *separate* block scoped to the `import-x` plugin and did not help the boundaries plugin.

The inline comment at `eslint.config.mjs:115-118` (asserting the "v6 migration restored enforcement") was therefore **false** — a months-long silent disarmament. The design phase **empirically re-measured** the gap: temporarily inserting the resolver and running `npx eslint src/ --rule '{"boundaries/dependencies":"error"}' -f json` surfaced **62 errors across 20 files** (then restored the config byte-exact, `git status` clean), in 5 categories (design §1): Cat A `domain → application` (**1** — ARCH-02), B1 `application → infrastructure/data` DI composition roots (**34**), B2 mis-located ports/consts/data (**7**), C1/C2 `infrastructure → application` adapter→useCase edges (~20).

The one real, undetected layering violation was **ARCH-02**: `museum-backend/src/modules/chat/domain/ports/chat-orchestrator.port.ts` imported `KnowledgeRouterSource` from the **use-case** layer — a forbidden `domain → useCase` dependency. The guard meant to catch exactly this class of regression had been silently disarmed since the v6 migration.

This is **theme #1 of the audit 360** ("guard-rail silently disarmed"). A single mechanism that can be silently re-disarmed (e.g. a future edit removing the resolver again) is insufficient. The fix must be **defense-in-depth**: re-arm the ESLint rule **and** add a second, ESLint-config-independent backstop.

Forces at play: (i) re-arm the guard so future `domain → adapter`/`domain → useCase` regressions are caught at lint/pre-push, not in a later audit; (ii) **J-3 to launch** (2026-06-07) — the re-arm must not ship a red `pnpm lint` into the launch gate; (iii) the full close-all is a **genuine 3.5-5-day multi-module refactor across 8 modules** (design §11, UFR-019), and the deepest piece (chat-orchestrator untangle, Cat C) touches the **launch-critical conversational hot path** — rushing it at J-3 risks the core feature; (iv) the user's STRICT mandate forbids any rule weakening: **no allow-rule** that tolerates an existing coupling, **no baseline-ratchet** of real violations, **no new escape-hatch element type**, **no `eslint-disable boundaries/*`** (design header, D2).

---

## Decision

### 1. Wire the `import/resolver` into the boundaries block so the rule fires

Insert into the boundaries block `settings`, after `boundaries/dependency-nodes` (`eslint.config.mjs:117-120`):

```js
'import/resolver': {
  typescript: { alwaysTryTypes: true },
  node: true,
},
```

Identical to the working `import-x/resolver` (`eslint.config.mjs:169-172`); uses the installed `eslint-import-resolver-typescript@^4.4.4`. Empirically proven this run: adding exactly this fired 62 errors, removing it returned to 0. The false comment at `eslint.config.mjs:115-118` is corrected to state the resolver requirement and the prior disarmament (`eslint.config.mjs:113-117`, R7).

### 2. Sequenced per-wave arming (NOT a ratchet, NOT an allow-rule)

The full close-all cannot land safely before J-3 (design §11). The user's strict mandate forbids both a baseline-ratchet and an allow-rule, and forbids shipping a red launch lint gate. The strict-compatible resolution (design Q1, option **(a)** — user-decided) is to **sequence the *config arming itself*, by code, per wave**, so that each arm goes live **only when its layer's code is already clean** — never tolerating a coupling under an armed arm:

- **W1 (launch-blocking):** the `from: { type: 'domain' }` arm is armed **fully strict** (`eslint.config.mjs:135-153`). The `application` and `infrastructure` arms are temporarily **commented out** in the rule array with a dated TODO referencing W2/W3 (`eslint.config.mjs:154-175`). Because Cat A closes in W1 (ARCH-02 fixed), the domain arm has 0 violations → `pnpm lint` is **GREEN at launch**.
- **W2 (post-launch):** uncomment + arm the `application` arm, after the 34 B1 DI composition-root couplings are physically moved `useCase/index.ts` → `module-root index.ts` and the 2 residual B2 couplings descend to `domain/`.
- **W3 (post-launch):** uncomment + arm the `infrastructure` arm, after the ~16 C1/C2 chat-adapter→useCase edges + the orchestrator bidirectional untangle relocate their port-types/pure helpers to `domain/`. W3 also closes TD-62 fully (TW3.4).

This is explicitly **not** an allow-rule (no config sanctions any existing coupling) and **not** a ratchet (no grandfathered violation set; each armed arm is byte-strict with zero tolerated violations). It sequences *when* each strict arm goes live to match when its code is clean — keeping the launch gate green without a single bypass.

### 3. Close ARCH-02 + W1 low-risk relocations by real dependency inversion

`KnowledgeRouterSource` (`'wikidata' | 'web' | 'none'`, pure union) descends to a new domain module `chat/domain/knowledge/knowledge-router.types.ts`; the useCase `knowledge-router.service.ts` re-exports it (`export type { KnowledgeRouterSource } from …`) so `KnowledgeRouterResult.source` keeps type identity (R5), and the port (`chat-orchestrator.port.ts:7`) imports from domain. Five further W1 relocations descend mis-located ports/consts/types to `domain/` and make the consuming adapters/use-cases reference the domain port — a genuine dependency inversion (the C1 use-cases now `implements` the domain port, not the adapter importing a concrete class): `ImageProcessorPort`, the `ChatModel` alias (co-moved with its `UsageMetadata` signature dependency), `VISION_BYTES_EQUIVALENT`, the admin `Export{Sessions,Reviews,Tickets}Repository` port (`admin/domain/export/export-repositories.port.ts`), and the museum `Purge/RefreshStaleEnrichmentsUseCase` port (`museum/domain/ports/enrichment-usecases.port.ts`). All type-only; no runtime path changes.

### 4. Defense-in-depth — an ESLint-config-independent fs-based purity sentinel

`museum-backend/scripts/sentinels/hexagonal-domain-purity.mjs` (new) walks `src/modules/*/domain/**`, scans static + dynamic imports, and FAILs (exit 1, sorted `file:line → specifier` offender list to stderr) if any import resolves into `/adapters/`, `/useCase/`, `/application/`, `/infrastructure/`, `/data/` (alias OR relative). It loads **no ESLint config** (verified: `grep -ic eslint` on the script = 0) and runs in **0.04 s** (R8). It is wired into three independent gate surfaces: `package.json` script `sentinel:hexagonal-domain-purity` (`museum-backend/package.json:23`), pre-push **Gate 32/32** (`.husky/pre-push:432-434`, `|| exit 1`), the CI quality job (`.github/workflows/ci-cd-backend.yml:160`), and the anti-bypass mirror (`.github/workflows/sentinel-mirror.yml:183-184`, UFR-020).

Because the sentinel does not depend on `eslint.config.mjs`, **re-introducing the no-op** (removing the resolver from the ESLint block again) would STILL be caught by the sentinel on any domain leak — the two layers are genuinely independent. The sentinel covers the **domain** arm (the audit's named concern, highest value, KISS); the ESLint rule covers all 3 arms as they are armed.

### 5. A fixture-guard proving the rule *bites* (not just that it's configured)

`tests/unit/architecture/boundaries-rule-bites.test.ts` runs ESLint via the Node API + the **real** `eslint.config.mjs` against two fixtures under `tests/fixtures/architecture/` (outside the `src/**` lint glob + build): `violating-domain.fixture.ts` (domain-shaped, imports an adapter) must yield ≥1 `boundaries/dependencies` error; `clean-domain.fixture.ts` must yield 0. No `eslint-disable` fakes the violation. This is the ONE place ESLint is in the loop — distinct from §4's ESLint-independent sentinel. 158/158 architecture tests green.

---

## Consequences

### Positives
- **The domain hexagonal guard is real again + backstopped.** The ARCH-01/ARCH-02 audit finding is closed for the domain layer: the resolver fires the rule, ARCH-02 is gone (`grep` for `@modules/*/useCase/` in `chat-orchestrator.port.ts` = empty), the fixture-guard proves the rule bites, and the ESLint-independent sentinel survives a config re-regression.
- **Launch gate green at J-3.** Under the sequenced arming, the domain arm has 0 violations after ARCH-02 closes → `pnpm lint` (BE) exit 0, no bypass, no red gate slipped into launch.
- **Genuine dependency inversion, not papering-over.** Six ports/type modules now live in `domain/`; C1 use-cases `implements` them. DRY single-home consts (`VISION_*`). No speculative element-type or allow-rule.
- **Honesty fix.** The false "enforcement restored" comment is corrected; TD-62 carries a partial-close note pointing here.

### Negatives / costs
- **`pnpm lint` does NOT yet enforce the `application`/`infrastructure` arms.** 52 of the 62 measured couplings (34 B1 + 2 residual B2 + ~16 C1/C2) remain un-enforced by ESLint until W2/W3 land post-launch. This is a known, dated, sequenced gap (the commented arms carry the run id + wave) — not a silent hole. The independent sentinel covers the *domain* arm only, so a future `application → infrastructure` regression introduced before W2 would be caught by neither layer until W2 arms it.
- **W2/W3 are a real 3-day-class refactor each-wave-gated** (design §11): B1 is a broad 6-module composition-root migration (auth's 456-LOC root + 17 importers, lazy dynamic cross-module imports); W3's chat-orchestrator untangle is on the conversational hot path and gated on the full chat suite (447) + the real e2e guardrail matrix. Slipping or rushing these is the cost of not doing the unsafe single-shot at J-3.
- **Multi-cycle bookkeeping.** The feature is tracked as multi-cycle `hexagonal-boundaries-enforcement` (`tasks.md` `## Multi-cycle progress`, archived under `team-state/multi-cycle-features/`, exempt from 30-day pruning).

### Neutrals / unaffected
- **No DB / migration / OpenAPI / runtime-shape change.** Every W1 code move is a type/const relocation or an importer repoint preserving type identity (R5); `tsc --noEmit` exit 0, 196 chat consumer tests green.
- **No new attack surface.** Purity is a maintainability/supply-chain-of-logic guard; it indirectly hardens the chat domain prompt-isolation invariants (`[END OF SYSTEM INSTRUCTIONS]`, `sanitizePromptInput`) against adapter coupling. Security grep clean (0 eval/raw-sql/env-leak/secret in diff).
- **Lint runtime delta marginal.** The `import-x` block already resolves the same files; the boundaries resolver adds path resolution per import but reuses the installed TS resolver.

---

## Alternatives considered

| Option | Verdict |
|---|---|
| **Sequenced per-wave config arming (domain now, app/infra when clean)** | **Retained (design Q1(a), user-decided).** Each arm is byte-strict the moment it's live; sequences *when* each goes live to match when its code is clean. Ships the audit's named domain fix at launch, green gate, zero bypass. |
| **Allow-rule** sanctioning the 34 composition-root + ~20 adapter couplings as "legitimate" (e.g. a `module-composition` element type) | **Rejected** (user STRICT mandate, design header). An allow-rule *tolerates* an existing coupling in config — a `useCase/index.ts` DI assembler reaching into `infrastructure` is not sanctioned in the application layer; the wiring must physically move to `module-root`. This was the *prior* design's approach, explicitly reversed. |
| **Baseline-ratchet** grandfathering the 62 existing violations, failing only on additions | **Rejected** (user STRICT mandate). A ratchet tolerates the existing coupling set indefinitely; the mandate is to close ALL 62 by real code refactor, not freeze them. |
| **Arm all 3 arms immediately** + accept a red `pnpm lint` until the last wave lands (design Q1(b)) | **Rejected for launch.** Strictest single-shot reading, but ships a red launch gate (which would require a bypass to push — forbidden, UFR-020) or rushes the chat-orchestrator untangle at J-3 on the core feature. Sequenced arming achieves the same strictness per-arm without either hazard. |
| **`eslint-disable boundaries/*`** on the offenders or the fixture | **Rejected** (Phase 0 hard rule + R6). The deliberately-violating fixture is *isolated* from the prod lint scope (separate `tests/fixtures/` glob + Node-API invocation), never silenced. |
| **Sentinel-only** (drop `eslint-plugin-boundaries`) | **Rejected** (spec §2 out-of-scope). Both layers are wanted — the ESLint rule covers all 3 arms with rich element semantics; the sentinel is the config-independent backstop. Defense-in-depth needs both. |
| **`setMaxListeners`-style "just bump the config" tweak** without measuring the violation set | **Rejected.** The design empirically measured the 62 violations before arming, so the launch-gate impact was known, not guessed (UFR-013). |

---

## Verification

- **Spec ↔ impl (W1):** R1 PASS (resolver `eslint.config.mjs:117-120`, rule fires — proven by fixture) · R2 PASS (fixture-guard 158/158 green, violating→≥1 error, clean→0, no `eslint-disable`) · R3 PASS (sentinel exit0 clean / exit1 injected alias+relative leak, sorted file:line) · R4 PASS (`chat-orchestrator.port.ts:7` imports from domain; `grep` for useCase import empty) · R5 PASS (identity-preserving re-exports; `tsc --noEmit` exit0; 196 chat consumer tests green) · R6 PASS (0 `eslint-disable`/ratchet/allow-rule; Q1(a) sequencing) · **R7 PARTIAL-by-design** (false comment corrected in W1; TD-62 full-close scoped to W3/TW3.4) · R8 PASS (sentinel 0.04 s, no eslint import). Matrix in [`code-review.json`](../../.claude/skills/team/team-reports/2026-06-04-hexagonal-boundaries-enforcement/code-review.json) `specImplParity`.
- **Frozen-test:** PASS 6/6 byte-identical to `red-test-manifest.json` (`modifiedDuringGreen: []`).
- **Defense-in-depth proof:** removing the resolver (re-introducing the no-op) leaves the fs sentinel still failing on any domain leak — the two layers are genuinely independent (sentinel has 0 `eslint` references).
- **Launch gate:** boundaries domain arm = 0 errors on the real tree; `pnpm lint` (BE) exit 0 (J-3 launch gate green).

### W2/W3 remain OPEN (sequenced post-launch)
- **W2:** B1 DI composition-root → module-root migration (34, 6 modules) + residual B2 (2); arm the `application` arm; full per-module suites + boot smoke green; no `import-x/no-cycle` regression.
- **W3:** C1/C2 chat-adapter relocations + orchestrator bidirectional untangle (~16); arm the `infrastructure` arm; full chat suite (447) + real e2e guardrail matrix green; **close TD-62 fully** (TW3.4).

---

## References

- Spec — [`spec.md`](../../.claude/skills/team/team-state/2026-06-04-hexagonal-boundaries-enforcement/spec.md) §1–§9 (R1–R8, Q1–Q3)
- Design — [`design.md`](../../.claude/skills/team/team-state/2026-06-04-hexagonal-boundaries-enforcement/design.md) §1–§16 (D1–D7, Q1 option (a))
- Tasks — [`tasks.md`](../../.claude/skills/team/team-state/2026-06-04-hexagonal-boundaries-enforcement/tasks.md) (W1/W2/W3 + `## Multi-cycle progress`)
- Reviewer JSON (APPROVED 91.9) — [`code-review.json`](../../.claude/skills/team/team-reports/2026-06-04-hexagonal-boundaries-enforcement/code-review.json)
- STORY — [`STORY.md`](../../.claude/skills/team/team-state/2026-06-04-hexagonal-boundaries-enforcement/STORY.md)
- Tech debt — [TD-62](../TECH_DEBT.md) (audit 360 ARCH-01 + ARCH-02) — partial-close W1, full-close W3
- Related — [ADR-058](ADR-058-selective-hexagonal-ports-policy.md) (selective hexagonal ports policy), CLAUDE.md § Architecture (import discipline codemod 2026-05-05, `@modules/*`/`@shared/*`/`@data/*` aliases, minimal-barrel policy), [ADR-070](ADR-070-audit-chain-canonical-deep-serializer-hash-version.md) (previous ADR)
