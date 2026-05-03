# Phase 7 — Factory Migration + Rule Tightening (Design Spec)

- **Status**: Proposed (2026-05-01)
- **Owner**: QA/SDET
- **Scope**: museum-backend + museum-frontend + `tools/eslint-plugin-musaium-test-discipline/`
- **Pre-req for**: nothing (independent of Phase 8)
- **Estimated effort**: 1 working week
- **Spec lineage**: Phase 0 ESLint rule + grandfather baseline + factory adoption guard

## 1. Problem Statement

Phase 0's audit estimated 175 grandfathered FE files. Reality (verified 2026-05-01):
- Baseline = **1 file** (`museum-backend/tests/unit/support/support-repository.test.ts`).
- FE = 0 violations.
- The Phase 0 rule is strict: only catches `as Entity` cast OR `const x: Entity = {3+ props}` annotation.

Three loose patterns slip past the rule today:
- **Shape-only**: `const u = { id: 1, email: 'x', passwordHash: 'h' };` (3+ entity-shape props, no type annotation, no cast)
- **Partial type**: `const u: Partial<User> = { id: 1, email: 'x' };` (Partial wrapper)
- **Pick type**: `const u: Pick<User, 'id' | 'email'> = { id: 1, email: 'x' };`

These are real test-data anti-patterns: the test author mentally types the object as a User without going through a factory. Phase 7 closes the loose-pattern gap, migrates the 1 baselined file, and audits factory coverage.

## 2. Goals

1. Migrate `support-repository.test.ts` factories (`makeTicket`, `makeTicketMessage`) out to `tests/helpers/support/ticket.fixtures.ts`. Remove from baseline. Tighten cap to 0.
2. Extend `no-inline-test-entities` rule with a `detectShapeMatch` option:
   - Per-entity signature: minimum prop set that uniquely identifies the entity (e.g., User = `{id, email, passwordHash}`).
   - Rule fires when an `ObjectExpression` contains ALL signature props (regardless of cast / annotation).
   - Default for known entities (User, ChatMessage, ChatSession, Review, SupportTicket, MuseumEntity, AuditEvent).
   - Helper paths still exempt.
3. Audit FE + BE: any entity used in tests without a corresponding factory? Add missing factories.
4. CLAUDE.md: short Phase 7 subsection documenting factory locations + how-to-add-new-entity + shape-match rule.

## 3. Non-Goals

- Replacing the existing rule's 3 detection paths (TSAsExpression, TSTypeAssertion, VariableDeclarator). Shape-match is additive.
- Changing the ESLint plugin's package name or breaking config compat.
- Mutation testing on factories themselves (Phase 4 covers production code only).
- Coverage uplift (Phase 8).

## 4. Architecture

### 4.1 Commit A — Migrate baselined file

**Files:**
- Create: `museum-backend/tests/helpers/support/ticket.fixtures.ts`
- Modify: `museum-backend/tests/unit/support/support-repository.test.ts`
- Modify: `tools/eslint-plugin-musaium-test-discipline/baselines/no-inline-test-entities.json` (remove the path)
- Modify: `museum-backend/tests/integration/_smoke/integration-tier-baseline-cap.test.ts` — wait, that's the tier-signature cap. The factory baseline cap is enforced via the eslint-plugin-musaium-test-discipline's `baseline-cap.test.ts`. Confirm at plan time.

The new helper file:

```ts
// museum-backend/tests/helpers/support/ticket.fixtures.ts
import { SupportTicket } from '@modules/support/domain/supportTicket.entity';
import { TicketMessage } from '@modules/support/domain/ticketMessage.entity';

export function makeTicket(overrides: Partial<SupportTicket> = {}): SupportTicket {
  return {
    id: 'ticket-001',
    userId: 1,
    subject: 'Help needed',
    description: 'I have a problem',
    status: 'open',
    priority: 'medium',
    category: null,
    assignedTo: null,
    createdAt: new Date('2025-06-01'),
    updatedAt: new Date('2025-06-01'),
    ...overrides,
  } as SupportTicket;
}

export function makeTicketMessage(overrides: Partial<TicketMessage> = {}): TicketMessage {
  return {
    id: 'msg-001',
    ticketId: 'ticket-001',
    senderId: 1,
    senderRole: 'visitor',
    text: 'Hello',
    createdAt: new Date('2025-06-01'),
    ...overrides,
  } as TicketMessage;
}
```

The cast `} as SupportTicket;` lives in a helper file → exempt from the rule.

The test file imports:

```ts
import { makeTicket, makeTicketMessage } from 'tests/helpers/support/ticket.fixtures';
```

Cap test tightens:

```ts
const PHASE_0_CAP = 0;
```

(was 1). Any future `as Entity` outside helpers → instant gate fail.

### 4.2 Commit B — Shape-match detection

Extend `no-inline-test-entities` rule with a new option:

```ts
type Options = [{
  // ... existing fields ...
  /** Per-entity signature (minimum prop set that triggers shape-match detection). */
  shapeSignatures?: Record<string, string[]>;
  /** Enable shape-match detection (default: false for back-compat). */
  detectShapeMatch?: boolean;
}];
```

Default signatures (when `detectShapeMatch: true`):

```ts
{
  User: ['id', 'email', 'passwordHash'],
  ChatMessage: ['id', 'sessionId', 'role', 'text'],
  ChatSession: ['id', 'userId', 'locale', 'museumMode'],
  Review: ['id', 'rating', 'comment'],
  SupportTicket: ['id', 'userId', 'subject', 'description', 'status'],
  MuseumEntity: ['id', 'name', 'city', 'country'],
  AuditEvent: ['id', 'actorId', 'action', 'targetId'],
}
```

New rule trigger path: visits every `ObjectExpression` in test files (not in helper paths). For each, computes the set of shorthand-resolved property names. If that set is a superset of any entity's signature, reports.

False-positive guard: if the object is the argument of a known factory call (`makeUser(...)`), exempt. Same heuristic as TSAsExpression path.

Configuration in BE + FE eslint configs:

```js
'musaium-test-discipline/no-inline-test-entities': ['error', {
  detectShapeMatch: true,  // Phase 7 — opt-in for now to avoid surprise
}]
```

### 4.3 Commit C — Factory audit

Walk `museum-backend/src/**/*.entity.ts` + `museum-frontend/shared/api/generated/openapi.ts` types. For each entity used in test code:
- Check if a `tests/helpers/<area>/<entity>.fixtures.ts` exports `make<Entity>()`.
- If missing AND tests reference the entity ≥ 3 times → add factory.
- If missing AND used 0–2 times → leave unaddressed (YAGNI).

Likely missing factories (verified at plan time):
- `Museum` (or `MuseumEntity`)
- `KnowledgeArtifact`
- `AuditEvent`
- (Audit identifies which)

For each new factory: file location follows existing pattern, exports `make<Entity>` + `make<EntityList>` (helper for arrays of N).

### 4.4 Commit D — CLAUDE.md docs

Phase 7 subsection under existing `## Test Discipline` section:

```markdown
### Factory locations + how to add a new entity (Phase 7)

Test factories live in:
- BE: `museum-backend/tests/helpers/<module>/<entity>.fixtures.ts` (e.g., `tests/helpers/auth/user.fixtures.ts`).
- FE: `museum-frontend/__tests__/helpers/factories/<entity>.factories.ts` (e.g., `__tests__/helpers/factories/auth.factories.ts`).

To add a new entity:
1. Create the file at the convention path.
2. Export `make<Entity>(overrides?: Partial<E>): E` returning a complete entity with sensible defaults.
3. If the entity has a domain-typed cast required (`} as Entity`), the cast lives ONLY in this file. Test files import the factory.
4. Update `tools/eslint-plugin-musaium-test-discipline/src/utils/entity-shapes.ts` to add the entity's `signature: string[]` so the shape-match rule catches future inline anti-patterns.

Shape-match detection (Phase 7):
- The `no-inline-test-entities` rule has a `detectShapeMatch: true` option enabled in BE + FE configs.
- Fires on object literals matching ANY entity's signature prop set, even without a cast or annotation.
```

## 5. Risks & Mitigations

### Risk: Shape-match false positives on legitimate test DTOs

E.g., a test DTO that happens to have `id`, `email`, `passwordHash` props but is unrelated to User.

**Mitigation:** factory-call exemption + helper-path exemption. If a real false positive lands, add it to the per-rule `// eslint-disable-next-line` (with the Phase 0 mandatory `Justification:` + `Approved-by:` paragraphs).

### Risk: Phase 7 expands the eslint plugin's surface area before Phase 8 needs it

Scope creep risk.

**Mitigation:** all Phase 7 changes are additive + opt-in. `detectShapeMatch: false` is the default; BE + FE configs explicitly enable. Reverting Phase 7 = removing the option from configs.

### Risk: Cap = 0 + new entity-shape false-positive blocks unrelated PRs

If shape-match starts firing on legitimate DTOs in a parallel PR.

**Mitigation:** the cap is for the no-inline-test-entities rule ONLY. False positives use the documented `eslint-disable` escape with mandatory `Justification:` + `Approved-by:`. Phase 0 §7.6 already codifies this.

## 6. Acceptance Criteria

Phase 7 is **done** when ALL hold:

- [ ] `museum-backend/tests/helpers/support/ticket.fixtures.ts` exists, exports `makeTicket` + `makeTicketMessage`.
- [ ] `museum-backend/tests/unit/support/support-repository.test.ts` imports them; no inline factories remain.
- [ ] Baseline JSON has empty `baseline` array.
- [ ] Cap test `PHASE_0_CAP = 0`; passes.
- [ ] `no-inline-test-entities` rule has `detectShapeMatch` option with default per-entity signatures.
- [ ] RuleTester self-tests cover ≥3 valid + ≥3 invalid shape-match cases.
- [ ] BE + FE eslint configs enable `detectShapeMatch: true`.
- [ ] Audit identifies missing factories (output committed in commit body); any factories with ≥3 test references are added.
- [ ] CLAUDE.md Phase 7 subsection added.
- [ ] All BE + FE tests still pass.
- [ ] `pnpm lint` (BE) + `npx eslint __tests__` (FE) both exit 0.

## 7. Phase 7 Commit Decomposition

1. **Commit A** — migrate `support-repository.test.ts` to use `tests/helpers/support/ticket.fixtures.ts`; baseline → empty; cap → 0.
2. **Commit B** — `no-inline-test-entities` rule: `detectShapeMatch` option + RuleTester cases + enable in BE + FE configs.
3. **Commit C** — factory audit + add missing factories where tests reference an entity ≥3 times.
4. **Commit D** — CLAUDE.md Phase 7 subsection.

## 8. Resolved decisions (2026-05-01)

- **Q1 = C** (broad scope: rule tightening + audit + migration).
- **Q2 = i** (cap = 0 hard).
- **Q3 = x** (CLAUDE.md doc subsection).

No remaining open questions.
