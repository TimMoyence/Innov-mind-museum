# eslint-plugin-musaium-test-discipline

Workspace ESLint plugin enforcing Musaium banking-grade test discipline.

## Purpose

Prevents new test files from inlining domain entity construction and enforces documented justification for any disable comments targeting test-discipline rules.

## Rules

### `musaium-test-discipline/no-inline-test-entities`

Fires when a test file directly constructs a domain entity (`User`, `ChatMessage`, `ChatSession`, `Review`, `SupportTicket`, `MuseumEntity`, `AuditEvent`) via:

- `{ ... } as User` (TSAsExpression)
- `<User>{ ... }` (TSTypeAssertion)
- `const u: User = { ... }` with 3+ properties (VariableDeclarator with type annotation)

Use the factories in `tests/helpers/<module>/<entity>.fixtures.ts` (BE) or `__tests__/helpers/factories/` (FE) instead.

### `musaium-test-discipline/no-undisabled-test-discipline-disable`

Requires every `eslint-disable` comment targeting a `musaium-test-discipline` rule to include both:

- `Justification: <reason>` (what the exceptional circumstance is)
- `Approved-by: <reviewer>` (who authorized the exception)

## Spec

See git log (spec deleted 2026-05-03 — see commit history).

## Grandfather Baseline

Current violators are tracked in `baselines/no-inline-test-entities.json`. The baseline length is capped by a CI test — it can only shrink as Phase 7 migrates files to factories.

## Known limitations

- The rule resolves entity types by direct identifier name only. Aliases (`type U = User; const u: U = {...}`) bypass detection. Acceptable trade-off vs. the cost of a full type-checker integration; revisit when Phase 7 migration completes if needed.
