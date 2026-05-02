# V12 W6 — Mutation extension + fast-check property + openapi-diff plan

**Status:** fast-check property tests shipped (P1–P6 on `sanitizePromptInput`). openapi-diff CI gate shipped. Stryker hot-files extension deferred until verified against `stryker.config.mjs mutate:` list (UFR-005 verify-before-validate).

---

## 1. What's already in place

- Stryker mutation: 7 banking-grade hot files in `museum-backend/.stryker-hot-files.json` with `killRatioMin: 80%` per-file. Gate script `museum-backend/scripts/stryker-hot-files-gate.mjs`. Pre-commit hook (`.claude/hooks/pre-commit-gate.sh`) + CI (`mutation` job in `ci-cd-backend.yml`) + nightly cron 03:17 UTC + actions cache for incremental.
- Mutate list in `stryker.config.mjs` covers ~40 files across 3 phases (guardrail, validation, security, middleware).
- Property tests: previously absent.
- OpenAPI diff: previously absent.

---

## 2. What W6 ships now (this commit)

### 2.1 fast-check property tests on `sanitizePromptInput`

`museum-backend/tests/unit/shared/validation/sanitize-prompt-input.property.test.ts` — 6 properties × 200 random inputs each = 1200 input combinations per CI run. Catches edge cases the example tests miss:

| Property | Asserts |
|---|---|
| P1 — idempotent | `sanitize(sanitize(x)) === sanitize(x)` for all unicode |
| P2 — bounded | `sanitize(x).length <= maxLength` for any maxLength 1..500 |
| P3 — no zero-width | output excludes U+200B-D, U+FEFF, U+2060, U+00AD |
| P4 — no control char | output excludes \x00-\x08, \x0B, \x0C, \x0E-\x1F, \x7F |
| P5 — NFC-normalized | `sanitize(x) === sanitize(x).normalize('NFC')` |
| P6 — preserves printable | sanitize on alphanumeric strings is identity |

Adds `fast-check@^3.23.2` to `museum-backend/package.json` devDependencies. Run `pnpm install` after pulling.

### 2.2 openapi-diff CI gate

`.github/workflows/ci-cd-openapi-diff.yml` — runs oasdiff on PRs that touch `museum-backend/openapi/openapi.json`. Posts a comment with the breaking-change report + full changelog. Fails the PR if `oasdiff breaking --fail-on ERR` returns non-zero.

Catches: removed endpoints, removed required fields, type narrowings, status code removals, security requirement additions on existing endpoints. Allows: pure additions (new endpoints, new optional fields), description changes.

---

## 3. Deferred items

### 3.1 Stryker hot-files extension

V12 §6 wants extension to chat-orchestrator + auth modules. Both BE source modules currently active in another session — race risk. Defer.

When session is quiet, candidate additions to `.stryker-hot-files.json` (each MUST also be in `stryker.config.mjs mutate:` list):

```json
{
  "path": "src/modules/chat/adapters/secondary/pii-sanitizer.regex.ts",
  "killRatioMin": 80,
  "rationale": "Output PII regex sanitizer (email + phone). Mutation = silent PII leak."
},
{
  "path": "src/modules/chat/useCase/llm-prompt-builder.ts",
  "killRatioMin": 75,
  "rationale": "Prompt template assembly + section ordering + boundary marker injection. Mutation = jailbreak surface."
}
```

`llm-prompt-builder.ts` already in mutate list per `stryker.config.mjs`. `pii-sanitizer.regex.ts` needs a confirmation read of the full mutate list (truncated in current session) before adding.

### 3.2 Property tests on guardrail + rate-limit

After `pnpm install` adds fast-check, write:

- `tests/unit/chat/art-topic-guardrail.property.test.ts` — properties: deny-set monotonic (adding a banned word never reduces blocks); art-only random vocab returns allow.
- `tests/unit/auth/login-rate-limiter.property.test.ts` — properties: bucket fills monotonically up to capacity; window-passage restores capacity exactly; concurrent decrements never exceed capacity.
- `tests/unit/shared/validation/email.property.test.ts` — already partially covered by `email-fuzz.test.ts`; add idempotence under repeated normalization.

Same fast-check package, no new install.

---

## 4. Acceptance gate (W6 done)

- [x] `sanitizePromptInput` property tests live (6 properties × 200 runs).
- [x] openapi-diff CI gate live + posts PR comment + fails on breaking.
- [ ] `pnpm install` run by user to materialize fast-check (manual step).
- [ ] Stryker hot-files extension (§3.1) — deferred to quiet session.
- [ ] Additional property tests on guardrail + rate-limit (§3.2) — deferred until fast-check installed.

CI signals to add (post-install): mutation job already runs nightly; property tests join the standard `pnpm test` run automatically (they live under `tests/unit/`).
