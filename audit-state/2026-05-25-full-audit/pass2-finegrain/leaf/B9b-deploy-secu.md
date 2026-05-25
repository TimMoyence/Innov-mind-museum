# B9b — Deploy & dev-stack cluster: SECURITY / ROBUSTNESS / ZERO-BYPASS angle

Reviewer: senior devops/sécu, read-only, fresh-context (UFR-022).
Branch `dev` @ HEAD `1fb32f5ba`. Cluster commits: `3dd831fd4 4f3fe4018 294467c2a 8c003fee2 fc5c0e1bc 7e3b8b629 bd43a52d8 f2130b328`.
Method (UFR-013): every claim cites path:line and was Read/grepped, not recalled.

**Verdict: 7.5/10.** No prod-data-destruction, no active prod RCE/account-takeover. One genuine correctness/honesty defect (a security defense that is a silent no-op), and a count-ratchet weaker than its prose admits. The CI coverage removal is legitimate, the volume reclaim is safe, the bake-key is dev-only and harmless if forged.

---

## 1. Smoke deploy — seed-smoke-account.ts

### 1.1 FINDING (MEDIUM, correctness/honesty) — `verification_token: undefined` is a silent no-op; the "anti-poison" comment is false

`museum-backend/scripts/seed-smoke-account.ts:155-160`:

```ts
await repo.update(existing.id, {
  ...
  // Clear stale verification state so the smoke account cannot be poisoned
  // by leftover tokens from earlier deploys.
  verification_token: undefined,
  verification_token_expires: undefined,
  reset_token: undefined,
  reset_token_expires: undefined,
});
```

This is the exact documented gotcha. `repo.update(criteria, partialEntity)` forwards to `UpdateQueryBuilder.set()`, which **filters out `undefined` keys before emitting SQL** → no `SET verification_token = NULL` is generated. The columns are NOT cleared. The comment claims a poisoning defense that does not exist.

Proof of the canonical correct pattern, 4 dirs away, for the SAME columns:
- `museum-backend/src/modules/auth/adapters/secondary/pg/user.repository.pg.ts:73-79` (`updatePassword`) uses `reset_token: () => 'NULL'`.
- `…/user.repository.pg.ts:116-118` (`verifyEmail`) — comment: *"`verification_token: undefined` would leave consumed token intact, enabling infinite replays. `() => 'NULL'` forces clear."*
- CLAUDE.md § Pièges connus documents this verbatim (bug `9d1e971a5`).
- TypeORM `0.3.28` confirmed installed (`museum-backend/node_modules/typeorm/package.json:3`) — the filtering behavior is current.

**Why the ESLint guard did NOT catch it:** `tools/eslint-plugin-musaium-test-discipline/src/rules/no-typeorm-set-undefined.ts:13` — `DEFAULT_FILE_PATTERNS = ['.repository.', '.repo.']`. The rule (line 73-75) early-returns unless the filename contains one of those. `scripts/seed-smoke-account.ts` matches neither → rule never runs. The rule's own message (line 66) literally warns *"leading to replayable one-time tokens"* — the precise risk class here.

**Exploitability assessment: LOW (but the defect is real).**
- `verification_token` is realistically never set on this account: it is seeded `email_verified: true` (line 152/172) and never re-enters the verification flow.
- `reset_token` CAN be populated if anyone hits `/forgot-password` for the smoke email — `user.repository.pg.ts:65` sets `reset_token: token`. BUT (a) the prod smoke email is a GitHub secret (`secrets.PROD_SMOKE_TEST_EMAIL`, ci-cd-backend.yml:1190), not guessable; (b) the reset token is a hashed random secret emailed out — a third party triggering forgot-password cannot read it.
- Net: the failed-to-clear columns are unlikely to ever hold a value, and even the one reachable column (`reset_token`) is itself a secret. So no practical account-takeover. It is a misleading/ineffective defense + a documented-gotcha violation that is uncaught by tooling — fix by switching to `() => 'NULL'` (matching `updatePassword`) and widen the ESLint rule's `filePatterns` to include `scripts/`.

**Regression coverage gap:** `tests/integration/scripts/seed-smoke-account.consents.spec.ts` (R1-R4) covers ONLY consents. There is NO test asserting the token columns are cleared, so the no-op shipped green and would stay green even after a correct fix. Add an assertion: set `reset_token` on the existing row, re-seed, assert it is NULL.

### 1.2 Smoke account privileges in prod — least-privilege OK, residue is bounded

- Role pinned `'visitor'` on both insert (line 167) and update (line 151) — least privilege, hits public endpoints only. Confirmed against `smoke-api.cjs` flow (login → consent → create/list/delete session → chat POST → TTS) — no admin path.
- Consents granted = exactly `third_party_ai_text_openai` + `third_party_ai_audio_openai` (line 66-69), compile-time pinned to `ConsentScope` + runtime sanity check (line 193-199). No over-grant.
- **Persistent test account in PROD:** ci-cd-backend.yml:1014-1021 runs `seed-smoke-account.js` against the **production DB** every deploy and never deletes the account. The smoke then POSTs a chat message; session DELETE returns `{deleted:false}` because the session has messages (smoke-api.cjs:606-628) → the row is NOT hard-deleted, only reaped after 6 months by the chat-purge job. So prod accumulates one smoke user + a slow trickle of chat sessions. This is acceptable (visitor-scoped, secret creds, bounded by purge) but should be acknowledged: it is a real, login-able account in the production users table guarded only by a secret password (bcrypt cost 12, `BCRYPT_ROUNDS` floor-asserted at `src/shared/security/bcrypt.ts:36`). If `PROD_SMOKE_TEST_PASSWORD` ever leaks, it is a usable visitor login. Recommend rotating it like any prod credential and (optionally) a post-smoke teardown step.
- CI crons use `@musaium.test` (non-deliverable TLD) + run-id-scoped creds (llm-promptfoo-smoke.yml:127, llm-security-promptfoo.yml:143) — ephemeral testcontainer/CI DB, no prod residue. Good.

### 1.3 seed-museums idempotency (8c003fee2) — correct, no security surface

`.orUpdate(['wikidata_qid'], ['slug'])` array form → `ON CONFLICT ("slug")`. Overwrite list = `wikidata_qid` only, so admin-edited name/description/coords/config are preserved (verified by spec R3, seed-museums.idempotent.spec.ts:283-291). No injection surface (static seed list). `require.main === module` guard correct.

---

## 2. dev-stack bake-key + anon-volume reclaim (7e3b8b629, fc5c0e1bc)

### 2.1 Volume reclaim — SAFE, no prod-data destruction risk

`scripts/dev-stack.sh:129-151`:
- Inspects **only** `dev-backend` (line 129) — a local dev container by fixed name. Prod runs on the VPS (different host); this script cannot reach prod volumes.
- Filters `grep -E '^[a-f0-9]{64}$'` (line 131) — only Docker anon volumes (SHA-derived). Named volumes carry the project prefix.
- The dev Postgres data volume is `pgdata_dev` → `museum-backend_pgdata_dev` (docker-compose.dev.yml:59,111-112) — has the prefix, fails the 64-hex filter, AND is mounted on `dev-postgres` not `dev-backend`. **Doubly protected.**
- IDs captured BEFORE `--force-recreate --renew-anon-volumes` (line 129 precedes line 134), so the freshly-created new anon volumes are never in the delete set.
- `docker volume rm` refuses in-use volumes; `xargs -n 1` isolates per-volume failures; the warn branch (line 147) reports leftovers. Robust.
- Only contents at risk = `/app/museum-backend/node_modules` + `/app/packages/musaium-shared/node_modules` (compose lines 42-43) — disposable, rebuilt by image. No data loss.

### 2.2 Bake-key — NOT a security boundary; forging it only self-harms a dev box

`dev-stack.sh:100-103`: `git ls-files | git hash-object | sha256sum | cut -c1-16`. 16 hex = 64-bit cache key.
- Dockerfile.dev is **dev-only**; prod uses `museum-backend/deploy/Dockerfile.prod` (confirmed in commit 7e3b8b629 message + Dockerfile.dev:401 LABEL comment). No prod path consumes this key.
- A dev could `docker build --build-arg BAKE_KEY=<forged>` to fake a match and skip a rebuild — but that is self-inflicted on their own machine, no prod/CI impact. There is no adversary in this threat model; it is a freshness cache key, not an integrity attestation.
- 64-bit truncation collision risk is irrelevant: a collision would mean a missed rebuild (a dev annoyance), never a security event.
- Robustness nit: `IMAGE_TAG="museum-backend-backend"` (line 107) is hardcoded to the compose project name = parent dir. If the repo dir is renamed, the inspect silently returns empty → always rebuilds (safe-fail, just slower). Acceptable.

---

## 3. Hooks — Gate 4 repair (bd43a52d8)

### 3.1 No bypass reintroduced

`.claude/hooks/pre-commit-gate.sh:48` now:
`pnpm exec jest --watchman=false --runInBand --selectProjects unit-integration --changedSince=HEAD --coverage=false --passWithNoTests --bail`.

- This is a **Claude Code PreToolUse hook** (file header line 1-2), intercepting only git-commits issued via the Bash tool — NOT the all-commits husky hook.
- Pre-repair (`pnpm test -- <flags>`, introduced `b3497b127`) was a deterministic **false-positive that BLOCKED every commit** ("No tests found", exit 1). A gate stuck in fail-closed is the safe failure mode — it never let bad code through; it was unusable, not insecure.
- `--passWithNoTests` only short-circuits the changed-tests-only pass when zero backend tests are affected. It does NOT weaken the safety net because: (a) the full coverage gate (Gate 5, lines 84-101) runs `pnpm run test:coverage` — the FULL suite, not `--changedSince` — whenever BE source is staged; (b) `.husky/pre-push` Gate 16 (line 190-207) independently runs `jest --findRelatedTests --passWithNoTests` on affected BE tests; (c) CI mirror enforces unconditionally. The repaired invocation is byte-aligned with the proven husky Gate 16 (`.husky/pre-push:207`). Good convergence.

### 3.2 Pre-existing local escape hatch (note, NOT introduced here)

`pre-commit-gate.sh:84` `SKIP_COVERAGE_GATE=1` skips the coverage gate locally ("CI still enforces unconditionally"). This predates the cluster. It is a documented local-only skip backed by CI, but it is technically a bypass affordance for one gate. Worth flagging against the zero-bypass doctrine (UFR-020 / feedback_zero_bypass.md) — recommend confirming the CI mirror truly re-runs coverage on every PR so the escape hatch cannot reach main.

---

## 4. CI — ai-tests coverage removal + it()-count ratchet (f2130b328)

### 4.1 Coverage removal is LEGITIMATE, not a bypass — verified

- The ai-tests job runs `tests/ai/**` in isolation with real OpenAI calls; the global threshold (88/74/86/89) is unreachable from a 19-test LLM subset by construction.
- The **full-suite threshold remains enforced**: `coverage-merge` job runs `nyc check-coverage` against the union of the 4 sharded coverage jobs (ci-cd-backend.yml:222-270, `SHARDED_COVERAGE=1` on the shard runs at :205). Verified the merge + check-coverage steps exist and gate. So removing the misapplied per-job threshold left **no real coverage hole**.

### 4.2 it()-count ratchet is CONTOURNABLE (the script admits it) — LOW severity

`museum-backend/scripts/sentinels/ai-tests-count.mjs`:
- Floor `MIN_TOTAL_AI_TESTS = 19` (line 43). Regex `TEST_BLOCK_RE` (line 50) matches `it(`, `test(`, `it.skip(`, `it.only(`, `it.each(`, `fit(`, `xit(`.
- **`it.skip(` counts toward the floor.** A capability can be removed by converting a real `it(...)` to `it.skip(...)` (or to an empty `it('x', () => {})`) — the count stays ≥19, the sentinel passes, but the test no longer executes. Comments are stripped (line 76-77) so commented-out tests don't inflate, but skipped/empty live tests do.
- The script's own docstring (lines 30-37) honestly documents the capability-masking-by-duplicate limit and defers to PR review as the human gate. So this is a known, accepted weakness, not a hidden one. Severity LOW: it is a ratchet/floor, defense-in-depth on top of human review, and the actual LLM-contract execution still happens in the cron job. Optional hardening: exclude `.skip`/`.todo`/`xit` from the count, or move to per-file counts (the "Mid" option the script mentions) to also catch the relocation-masking case.

---

## Summary table

| Area | Finding | Severity | Path:line |
|---|---|---|---|
| seed-smoke | `verification_token/reset_token: undefined` no-op; false "anti-poison" comment; ESLint rule out-of-scope; untested | MEDIUM (correctness/honesty; LOW exploitability) | seed-smoke-account.ts:155-160 ; eslint rule src:13,73 |
| seed-smoke | Persistent visitor login in PROD users table, guarded only by a secret pw; never torn down | LOW (bounded by purge + least-priv) | ci-cd-backend.yml:1014-1021 ; smoke-api.cjs:606-628 |
| dev-stack | Volume reclaim — safe, prod unreachable, named/data volumes immune | OK | dev-stack.sh:129-151 ; docker-compose.dev.yml:59,111 |
| dev-stack | Bake-key dev-only; forging = self-harm; not a security boundary | OK | dev-stack.sh:100-107 |
| hooks | Gate 4 repair restores function, no bypass; aligned with husky Gate 16 | OK | pre-commit-gate.sh:48 ; .husky/pre-push:207 |
| hooks | Pre-existing `SKIP_COVERAGE_GATE=1` local escape (not introduced here) | LOW (CI-mirrored) | pre-commit-gate.sh:84 |
| CI | ai-tests coverage removal legitimate; full threshold intact via coverage-merge | OK | ci-cd-backend.yml:222-270 |
| CI | it()-count ratchet contournable via `it.skip`/empty/relocation (self-documented) | LOW | ai-tests-count.mjs:43,50 |

## Top-3 sécu/robustesse risks
1. **seed-smoke-account.ts:155-160** — security-claiming `undefined` token-clear is a silent no-op (documented gotcha; correct `() => 'NULL'` exists at user.repository.pg.ts:77,116). Misleading + ESLint-blind + untested. Fix the code, widen the ESLint `filePatterns` to `scripts/`, add a regression assertion.
2. **ci-cd-backend.yml:1014-1021** — a permanent, login-able visitor account in the **production** users table, guarded only by `PROD_SMOKE_TEST_PASSWORD`. Treat as a prod credential (rotation), consider post-smoke teardown.
3. **ai-tests-count.mjs:50** — count ratchet counts `it.skip(`/empty blocks → a capability can be silently dropped while the floor holds. Self-documented LOW; harden by excluding skip/todo or going per-file.

## No exploitable test account / bypass found that reaches main or prod
- No bypass path reintroduced by the hook repair; husky + CI mirror remain the real gates.
- The prod smoke account is least-privilege (visitor) and secret-guarded; the only "test account" risk is credential leakage, not a logic flaw.
- The `undefined` no-op does not yield account-takeover in practice (columns unlikely to be set; the one reachable column is itself a secret token).
