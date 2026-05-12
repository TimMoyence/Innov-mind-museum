# `tests/mutation-killers/`

Reserved for **pure mutation-defense tests** — tests that only exist to kill a
specific Stryker mutation without specifying a meaningful behavior.

## When to put a file here

A test belongs in this directory if and only if:

1. Removing it would not regress any behavior contract.
2. Its sole purpose is asserting an implementation detail that Stryker mutates.
3. It is not co-located with a `describe(...)` that specifies real behavior.

## When NOT to put a file here

A test that simultaneously specifies a behavior AND kills a mutation belongs
under `tests/unit/<module>/` — that's the healthy pattern (good test names
naturally kill mutations).

Examples of healthy patterns that SHOULD stay in `tests/unit/`:

```ts
// tests/unit/audit/audit-chain.test.ts
it('verifyAuditChain loop respects strict bounds (kills `<` -> `<=` mutation at L86)', () => { ... })
```

This test describes a real behavior contract (`loop respects strict bounds`)
AND defends against a mutation. Keep it in `tests/unit/`.

## D.1 audit (sprint audit-cleanup-2026-05-12)

The cleanup sprint scanned all `tests/unit/**` candidates flagged as
"stryker-survivor cosmetic." The 14 candidate files all turned out to be
healthy patterns (behavior spec + mutation-defense combined). **Zero files
were moved here in this sprint.**

This directory is kept empty as a forward-compatible slot — if a future audit
finds a pure mutation-defense test (no behavior contract), it can be moved
here without re-discussing the naming convention.

## Jest config

If/when files land here, update `museum-backend/jest.config.ts` `testMatch`
to include them in the regular run, with a separate coverage threshold
(typically lower) since by construction they only assert internal details.
