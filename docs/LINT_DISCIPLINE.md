# ESLint Discipline

> `eslint-disable` policy + decision tree + justified categories. Originally inline in `CLAUDE.md`, extracted 2026-05-07.

**`eslint-disable` = last resort, not first reflex.** If ESLint flags code, rule exists for reason — find proper fix before reaching for disable comment.

## Decision tree

1. **Understand rule** — read ESLint docs for rule. What problem does it prevent?
2. **Fix code** — refactor to satisfy rule. Correct path 90% of time.
3. **Only disable if ALL true:**
   - Rule = false positive for this specific context (e.g., `require()` for RN image assets, `||` for intentional empty-string-as-falsy)
   - No alternative code structure satisfies both rule + intent
   - `-- reason` comment explains WHY disable necessary

## Common anti-patterns to avoid

| Don't do this | Do this instead |
|---|---|
| `eslint-disable complexity` on a 60-line function | Extract helper functions to reduce cyclomatic complexity |
| `eslint-disable max-lines-per-function` repeatedly | Split the function or extract sub-routines |
| `eslint-disable max-params` with 7+ params | Use an options object: `fn(id, options: { ... })` |
| `eslint-disable react/display-name` on `memo()` | `memo(function ComponentName() { ... })` |
| `eslint-disable @typescript-eslint/no-misused-promises` | `onPress={() => { void handleAsync() }}` |
| `eslint-disable @typescript-eslint/no-explicit-any` | Use `unknown` and narrow with type guards |
| `eslint-disable max-lines` at file level | Split the file into focused modules |
| `eslint-disable @typescript-eslint/prefer-optional-chain` | Use `foo?.bar` instead of `foo && foo.bar` |

## Justified disable patterns (reference)

ONLY categories where `eslint-disable` acceptable in this project:
- `prefer-nullish-coalescing` when intentionally treating empty string as falsy (`||` vs `??`)
- `no-unnecessary-condition` at trust boundaries (JWT payloads, raw DB rows, external API data)
- `require-await` on no-op implementations of async interfaces (null-object pattern)
- `no-unnecessary-type-parameters` on generic interface APIs where `T` constrains input
- `no-require-imports` for React Native `require()` asset pattern + OpenTelemetry conditional loading
- `no-control-regex` in input sanitization code
- `sonarjs/hashing` for non-cryptographic checksums (S3 Content-MD5)
- `sonarjs/pseudo-random` for jitter/backoff, not security
- `react-hooks/refs` for React Native `Animated.Value` / `PanResponder` refs read once at creation (e.g. `useRef(new Animated.Value(0)).current`)
- `no-namespace` for Express `declare global { namespace Express }` Request augmentation — standard pattern required by `@types/express`
- `max-lines-per-function` on TypeORM migration files — single atomic `up()` can't be split

## `eslint-disable` PR-validation hard rule (Phase 0)

Any new `eslint-disable` (line, block, or file-level) added to a PR must include BOTH a `Justification:` paragraph (≥20 chars) AND an `Approved-by:` paragraph (reviewer username or commit SHA) in the same comment body, e.g.:

```ts
// eslint-disable-next-line some-rule -- Justification: trust-boundary unmarshalling, narrowed via type guard at L42. Approved-by: tim@2026-04-30
```

The custom rule `musaium-test-discipline/no-undisabled-test-discipline-disable` machine-enforces this for the test-discipline rules specifically. Reviewers MUST reject PRs that add an undocumented disable to any rule, even rules outside the test-discipline namespace. Pre-approved categories listed earlier in this section remain the only ones that don't require a per-PR justification — anything outside them is treated as a one-off exception requiring explicit reviewer agreement before merge.
