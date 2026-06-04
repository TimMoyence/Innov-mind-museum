/**
 * RED fixture (run 2026-06-04-hexagonal-boundaries-enforcement, T1.1).
 *
 * A *domain-shaped* source that deliberately imports a SECONDARY ADAPTER
 * (infrastructure layer). When this content is linted by the boundaries-rule
 * fixture-guard (`tests/unit/architecture/boundaries-rule-bites.test.ts`) at the
 * virtual path `src/modules/_fixture/domain/<file>.ts`, the real
 * `boundaries/dependencies` rule MUST flag a forbidden `domain → infrastructure`
 * import — proving the rule actually *bites* (R2).
 *
 * Today (RED) the boundaries block in `eslint.config.mjs` has NO `import/resolver`,
 * so `@modules/*` aliases resolve as `external` → the rule classifies nothing →
 * 0 errors → the test's `expect(violatingErrors).toBeGreaterThanOrEqual(1)`
 * assertion FAILS. After T1.3 wires the resolver, this same import yields exactly
 * one `boundaries/dependencies` error and the test turns GREEN.
 *
 * The import is TYPE-ONLY so this fixture file itself stays a clean, compilable
 * TypeScript module (no runtime side effects, no unused-value lint). The fixture
 * lives under `tests/fixtures/**` — OUTSIDE the `src/**` production lint glob and
 * the build — so it never pollutes `pnpm lint` (design.md §8). NO `eslint-disable`
 * is used anywhere: the violation is real and is meant to be reported.
 *
 * Frozen-test discipline (UFR-022): this fixture is sha256-hashed in
 * red-test-manifest.json. The green phase MUST NOT modify it byte-for-byte.
 */

// Forbidden cross-layer import: a `domain/**` file reaching into a secondary
// adapter (`adapters/secondary/**` → boundaries element type `infrastructure`).
import type { LangChainChatOrchestrator } from '@modules/chat/adapters/secondary/llm/langchain.orchestrator';

export type ViolatingDomainAlias = LangChainChatOrchestrator;
