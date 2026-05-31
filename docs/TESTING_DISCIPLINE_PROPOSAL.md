# Testing Discipline Proposal — UFR-021 (post-feature test-coverage gate)

**Status :** ACCEPTED — Phase 1 shipped 2026-05-17 (commit `70f5ce2f9`), **Phase 2 (enforcement wiring) shipped 2026-05-31** (run `2026-05-31-ufr021-phase2-wire`). §§3.4/8/9 (baseline burn-down) remain as living reference.
**Author :** /team architect agent
**Scope :** `museum-frontend/` (RN + Expo Router screens) — extensible to web later
**Trigger incident :** signup DOB regex mismatch silently disabled the submit button. No Maestro / Jest test exercised the `DD/MM/YYYY` typing path. Bug shipped to TestFlight before manual QA caught it.

> **Implementation status (audit 2026-05-19, verified against repo):**
> - ✅ **§1 prose** — UFR-021 block live in `CLAUDE.md` (§ Post-feature test coverage). DONE.
> - ✅ **§2 JSON** — UFR-021 entry live in `.claude/agents/shared/user-feedback-rules.json` (line 203). DONE.
> - ✅ **§3 sentinel** — `scripts/sentinels/screen-test-coverage.mjs` (repo root) shipped + wired as `pnpm sentinel:screen-test-coverage` (root `package.json:22`); `museum-frontend/.maestro/coverage-baseline.json` bootstrapped (option B, §8). DONE.
> - ✅ **§4 pre-push gate** — WIRED 2026-05-31 (run `2026-05-31-ufr021-phase2-wire`) as **Gate 22** (NOT 19 — the hook now has 21 pre-existing gates; the proposal number was stale). Fail-fast `node scripts/sentinels/screen-test-coverage.mjs || exit 1`, before summary + Git-LFS chain. DONE.
> - ✅ **§5 PR template checkbox** — ALREADY PRESENT (`PULL_REQUEST_TEMPLATE.md` line 51, `## Test plan`). No dedicated section added to avoid duplication. DONE.
> - ✅ **§6 ci-cd-mobile.yml step + §6.1 sentinel-mirror.yml mirror** — WIRED 2026-05-31. `ci-cd-mobile.yml` quality job runs the sentinel (`node ../scripts/...`) before the shard-manifest step; `sentinel-mirror.yml` mirrors it server-side (UFR-020 anti-bypass). DONE. Wiring guarded by regression test `museum-frontend/__tests__/sentinels/screen-coverage-wiring.test.ts`.
>
> This file is NOT yet superseded: canonical rule lives in CLAUDE.md UFR-021, but the CI/hook enforcement (§4/§5/§6) is still pending. DELETE this file only once those wire. The design sections below remain the spec of record for the Phase 2 wiring.

> **Note gitignore (see CLAUDE.md § Pièges connus) :** `docs/` is whitelisted file-by-file. To track this proposal, add `!docs/TESTING_DISCIPLINE_PROPOSAL.md` to `.gitignore` before staging. Same for `docs/TESTING_DISCIPLINE.md` once the proposal is accepted.

---

## 0. Problem statement

A regression slipped because :

1. The component-level Jest test for `RegisterForm.tsx` mocked the date input and never exercised the actual regex.
2. No Maestro flow filled the DOB field with realistic user input.
3. Pre-push hook ran `--findRelatedTests` on the changed file — but the test was green (it tested the mock, not the regex), so the gate passed.

Defense-in-depth requires **route-level e2e contract** : every screen that ships to a user has at least one Maestro flow exercising its critical happy path. At proposal time (2026-05-17) the Maestro suite covered ~10 of the ~30 in-scope screens — a coverage hole that grows silently every sprint. (As of the 2026-05-19 audit the suite has grown to 27 active `.maestro/*.yaml` flows.)

The fix is not "write more tests" (we're doing that tonight). The fix is a **mechanical sentinel** that prevents the hole from re-opening.

---

## 1. UFR-021 — prose for CLAUDE.md

Insert this section **after `## Hook bypass interdit (UFR-020)` and before `## Honesty + truth-telling (UFR-013)`** in `/Users/Tim/Desktop/all/dev/Pro/InnovMind/CLAUDE.md` (line ~258, between the existing UFR-020 block and the UFR-013 block) :

```markdown
## Post-feature test coverage (UFR-021)

**Every new or modified user-facing screen DOIT ship with at least one Maestro flow exercising its critical happy path.** Component-level Jest tests are NOT sufficient — they can mock away the very interaction that breaks (regex on text input, navigation guard, animated state transition).

**SCOPE.** `museum-frontend/app/**/*.tsx` (Expo Router routes, except `_*.tsx` / `+*.tsx`) + any `museum-frontend/features/**/ui/*Screen.tsx` mounted in a route. Out of scope : pure presentational sub-components, modals composed inside an already-covered screen, dev-only routes.

**WHAT COUNTS AS COVERAGE.** A `museum-frontend/.maestro/*.yaml` flow that references EITHER (a) a `testID` declared in the screen source, OR (b) the route path / a unique user-visible string from the screen. The `screen-test-coverage` sentinel (`scripts/sentinels/screen-test-coverage.mjs`) enforces this — pre-push gate + CI mirror.

**OPT-OUT.** Add a magic comment `// e2e-skip: <reason ≥ 30 chars>` at the top of the screen source. Valid reasons : "dev-only debug route", "covered transitively by parent flow X", "third-party native screen we cannot drive via Maestro". Invalid reasons : "TODO add test", "low priority", "P2 backlog". The reason is logged in CI and audited weekly via `pnpm sentinel:screen-test-coverage --report`.

**WHY.** Bug DOB-2026-05-17 (signup form locked because regex `^\d{2}/\d{2}/\d{4}$` rejected `DD/MM/YYYY` input). Jest unit test mocked the input, no Maestro flow typed a real date, regression shipped to TestFlight. Cost : 2h debug + 1 hotfix push. The component-test green-light created false confidence.

**HOW TO APPLY** when modifying / adding a screen :

1. If you add a route in `app/`, also add a `.maestro/<feature>-flow.yaml` (or extend an existing one in the same shard — see `museum-frontend/.maestro/shards.json`).
2. The flow MUST tap-through the critical happy path (form submit, primary CTA, navigation transition). Smoke "screen renders without crashing" does NOT count.
3. Add the new flow to `museum-frontend/.maestro/shards.json` (the existing `maestro-shard-manifest.mjs` sentinel enforces shard assignment — UFR-021 stacks on top).
4. Run `pnpm sentinel:screen-test-coverage` locally before push. If it fails, fix the coverage gap or add `// e2e-skip: …` with a justified reason.

**ENFORCEMENT CODE :**
- `scripts/sentinels/screen-test-coverage.mjs` — walker + matcher
- `.husky/pre-push` Gate 19 (new) — fails push if any uncovered screen
- `.github/workflows/ci-cd-mobile.yml` `quality` job step `Screen test-coverage sentinel` (BEFORE prebuild) — fails fast in CI
- `.github/workflows/sentinel-mirror.yml` — re-runs the gate so a hook bypass (forbidden by UFR-020) still fails the PR
- `.github/PULL_REQUEST_TEMPLATE.md` — new mandatory checkbox "Maestro flow added for new/modified screens"
```

**Severity :** BLOCK
**Family :** test-discipline

---

## 2. UFR-021 — machine-readable JSON entry

Append to `/Users/Tim/Desktop/all/dev/Pro/InnovMind/.claude/agents/shared/user-feedback-rules.json` inside the `rules[]` array (after UFR-020, before the closing `]` on line 191) :

```json
{
  "id": "UFR-021",
  "family": "test-discipline",
  "source": "incident_dob_regex_2026_05_17",
  "rule": "Toute nouvelle/modifiee screen user-facing (museum-frontend/app/**/*.tsx hors _*.tsx/+*.tsx + features/**/ui/*Screen.tsx monte en route) DOIT etre couverte par au moins un flow Maestro (museum-frontend/.maestro/*.yaml) qui reference soit un testID declare dans la source, soit le route path, soit une string user-visible unique. Tests unitaires Jest NE comptent PAS (peuvent mocker l'interaction qui casse). Opt-out via magic comment `// e2e-skip: <reason >=30 chars>` au top du fichier source — raison auditee. Enforcement : sentinel scripts/sentinels/screen-test-coverage.mjs (pre-push gate 19 + CI mirror via .github/workflows/sentinel-mirror.yml + step ci-cd-mobile.yml quality job AVANT prebuild). Bug declencheur : DOB regex 2026-05-17 (signup submit perma-disabled, regex mismatch DD/MM/YYYY non couverte ni par Jest ni par Maestro, shipped TestFlight, 2h debug + hotfix).",
  "severity": "BLOCK",
  "applyWhen": "Ajouter ou modifier un screen user-facing dans museum-frontend (app/ ou features/**/ui/*Screen.tsx)",
  "exceptions": [
    "Magic comment `// e2e-skip: <reason >=30 chars>` au top du fichier — raison validee revue weekly via `pnpm sentinel:screen-test-coverage --report`",
    "Modal/sheet sub-components composes dans un screen deja couvert (le sentinel ne walk pas features/**/ui/*.tsx generiques, seulement *Screen.tsx)",
    "Routes dev-only / debug (declarer explicitement avec e2e-skip)"
  ]
}
```

Update `changelog[]` at the bottom of the same file :

```json
{ "version": "2.1", "date": "2026-05-17", "changes": "Add UFR-021 (post-feature Maestro coverage gate). Trigger: incident DOB regex 2026-05-17. New sentinel scripts/sentinels/screen-test-coverage.mjs + pre-push gate 19 + CI mirror." }
```

---

## 3. Sentinel script spec — `scripts/sentinels/screen-test-coverage.mjs`

**Don't implement here — contract only. Another agent will write the code.**

### 3.1 Contract

| Item | Value |
|---|---|
| Path | `/Users/Tim/Desktop/all/dev/Pro/InnovMind/scripts/sentinels/screen-test-coverage.mjs` |
| Runtime | Node ≥ 20, ESM, `#!/usr/bin/env node` shebang, `chmod +x` |
| Dependencies | Standard lib only (`node:fs`, `node:path`, `node:url`) — match existing sentinels, no npm deps |
| Wall-time budget | < 2 s on the existing ~30-screen repo |
| Exit 0 | Every screen in scope has ≥1 matching Maestro flow OR a valid `e2e-skip` comment |
| Exit 1 | At least one screen has zero coverage and no opt-out (or opt-out reason < 30 chars) |
| Stdout | OK summary on success, structured per-screen diagnostic on failure (file path, missing-coverage reason, suggested fix) |
| Stderr | Only on hard error (cannot read directory) |

### 3.2 Inputs (file discovery)

**SCREEN FILES (in scope) :**
```
glob: museum-frontend/app/**/*.tsx
    EXCLUDE basename starting with `_` (Expo Router layouts: _layout.tsx, _styles/)
    EXCLUDE basename starting with `+` (Expo Router special: +not-found.tsx, +html.tsx)
    EXCLUDE any path containing `/_styles/`
glob: museum-frontend/features/**/ui/*Screen.tsx
    (suffix `Screen.tsx` is the convention — see BiometricLockScreen, MfaChallengeScreen, MfaEnrollScreen)
```

**MAESTRO FLOW FILES :**
```
glob: museum-frontend/.maestro/*.yaml
    EXCLUDE basename listed in museum-frontend/.maestro/shards.json `excluded[]` (currently `config.yaml`)
    EXCLUDE files under museum-frontend/.maestro/helpers/ (subflows, not entry points)
```

### 3.3 Coverage matching algorithm

For each screen file `S` :

1. **Derive identifiers :**
   - `route_path` — for files under `app/`, compute the Expo Router path :
     - strip prefix `museum-frontend/app/`, strip extension, strip `(group)` segments
     - `index.tsx` → `/`
     - `auth.tsx` → `/auth`
     - `(tabs)/conversations.tsx` → `/conversations`
     - `(stack)/chat/[sessionId].tsx` → `/chat/:sessionId` (param placeholder)
   - `testids[]` — regex over file contents : `/testID=["'`]([\w-]+)["'`]/g` (capture the literal value, ignore template-string IDs which can't be matched as fixed strings)
   - `screen_name` — for `*Screen.tsx`, the class/function name : regex `/export\s+(?:default\s+)?(?:function|const)\s+(\w+Screen)\b/`

2. **Check opt-out :**
   - Read first 20 lines of `S`
   - Match regex `/^\s*\/\/\s*e2e-skip:\s*(.{30,})$/m`
   - If match : log `[OK] <S>: opt-out reason="<reason>"`, continue
   - If `// e2e-skip:` present but reason < 30 chars : exit 1 with diagnostic "opt-out reason too short (got N chars, need ≥30)"

3. **Scan Maestro flows :**
   - Read each flow file contents (as plain string, no YAML parse needed — keep it dependency-free)
   - Coverage HIT if ANY of :
     - Any `testID` from `testids[]` appears verbatim in the flow file (e.g. `"auth-submit"`)
     - The screen's `route_path` is referenced in a `- tapOn:` / `- assertVisible:` / `runScript` (handled via simple substring search of the literal path)
     - The screen's `screen_name` matches a `# screen: <name>` magic comment in the flow header (future-proofing — see §3.5)

4. **Emit :**
   - HIT : `[OK] <S> covered by <flow1>, <flow2>`
   - MISS : `[MISS] <S> — no flow references testID(<list>) or route(<path>). Add a flow or `// e2e-skip: <reason>`.`
   - Track miss count; exit 1 if > 0

### 3.4 Special case — screens with zero `testID` AND non-unique copy

Some legacy screens have neither `testID` nor a unique route literal. The sentinel cannot prove coverage by string match. For these :

- The sentinel writes a `WARN` (not a fail) listing the screen and recommending : "Add `testID="<screen-slug>-root"` on the root container, or add `# screen: <ScreenName>` to the corresponding Maestro flow header."
- The fail-vs-warn boundary is enforced via `museum-frontend/.maestro/coverage-baseline.json` (new file, similar pattern to `tools/eslint-plugin-musaium-test-discipline/baselines/no-inline-test-entities.json`) :
  ```json
  {
    "schemaVersion": 1,
    "comment": "Screens grandfathered in 2026-05-17. New screens MUST NOT be added here. Removals only. Audited weekly.",
    "grandfathered": [
      "museum-frontend/app/(stack)/preferences.tsx",
      "museum-frontend/app/(stack)/offline-maps.tsx"
    ]
  }
  ```
- Adding to baseline requires the same justification format as `eslint-disable` (UFR-003) : `Justification: ≥20 chars` + `Approved-by: <reviewer/SHA>` in the PR description.

### 3.5 Optional magic header (future)

To let Maestro flows declare coverage explicitly (cleaner than substring matching), allow this in flow headers :

```yaml
appId: com.musaium.mobile.preview
# screen: RegisterForm
# screen: LoginForm
---
```

The sentinel parses `# screen: <Name>` from lines 1–10 of the flow and treats it as explicit coverage for the matching `*Screen.tsx` file. Not required day-1 — opportunistic enhancement.

### 3.6 Flags

```
node scripts/sentinels/screen-test-coverage.mjs           # default: fail on miss
node scripts/sentinels/screen-test-coverage.mjs --report  # warn-only mode, write /tmp/screen-coverage-report.json for audit
node scripts/sentinels/screen-test-coverage.mjs --staged  # check only screens in `git diff --cached --name-only` (fast path for pre-commit)
```

### 3.7 Wire into root package.json

Append to `/Users/Tim/Desktop/all/dev/Pro/InnovMind/package.json` `scripts` block (after `sentinel:workspace-links`) :

```json
"sentinel:screen-test-coverage": "node scripts/sentinels/screen-test-coverage.mjs"
```

---

## 4. Pre-push hook wiring

**Decision : pre-push, not pre-commit.** Rationale :

- pre-commit budget is < 5 s (per its own header comment). Screen sentinel = ~1-2 s — fits, but pre-commit already has 6 gates including lint-staged which is the heavy one. Adding a full-repo walker on every commit balloons the typical-commit budget.
- pre-push budget is < 2 min and already runs full-repo sentinels (gates 5-10). Screen coverage belongs there.
- Pre-commit `--staged` path can be a future optimization (§3.6 supports it) — for now, ship pre-push only.

### 4.1 Edit `/Users/Tim/Desktop/all/dev/Pro/InnovMind/.husky/pre-push`

Insert after Gate 18 (line 249) and before the final summary block :

```bash
# ─── Gate 19 — Screen test-coverage (mobile) ────────────────────────────────
# UFR-021 — every museum-frontend screen DOIT have a Maestro flow OR an
# `// e2e-skip: <reason>` justification. Blocks the post-feature coverage
# regression that bit signup DOB on 2026-05-17.
gate_start "Gate 19/19 screen test-coverage sentinel (mobile)"
node scripts/sentinels/screen-test-coverage.mjs || {
  echo "[pre-push] ✗ screen test-coverage sentinel failed — UFR-021"
  echo "[pre-push]   Either add a Maestro flow under museum-frontend/.maestro/"
  echo "[pre-push]   OR add `// e2e-skip: <reason ≥30 chars>` at top of the screen source."
  echo "[pre-push]   See docs/TESTING_DISCIPLINE.md for the full doctrine."
  exit 1
}
gate_end "Gate 19"
```

Also update the gate-count comment block at the top of `.husky/pre-push` (lines 11-29) — change `Gates (each fails fast via `set -e`):` list to include `19. Screen test-coverage sentinel (mobile UFR-021)`, and bump the final banner line 254 from `All 18 gates passed` to `All 19 gates passed`.

---

## 5. PR template addition

The template already exists at `/Users/Tim/Desktop/all/dev/Pro/InnovMind/.github/PULL_REQUEST_TEMPLATE.md` (NOT `.github/pull_request_template.md` — GitHub accepts both, the uppercase one wins). Insert a new section between `## Compliance checklist` and `## Test plan` (after line 42) :

```markdown
## Mobile screen coverage (UFR-021)

**MANDATORY if this PR adds or modifies a file matching `museum-frontend/app/**/*.tsx` (excluding `_*.tsx` / `+*.tsx`) or `museum-frontend/features/**/ui/*Screen.tsx`.**

- [ ] Maestro flow added or updated for every new/modified screen (`museum-frontend/.maestro/*.yaml`).
- [ ] New flow registered in the correct shard of `museum-frontend/.maestro/shards.json` (maestro-shard-manifest sentinel enforces).
- [ ] Critical happy path exercised (form submit, primary CTA, nav transition) — NOT just "renders without crashing".
- [ ] Local run : `pnpm sentinel:screen-test-coverage` exits 0.
- [ ] If opt-out via `// e2e-skip: <reason>` magic comment, the reason is justified above and ≥30 chars.
```

---

## 6. CI gate — `ci-cd-mobile.yml` `quality` job

Insert the sentinel BEFORE the `Maestro shard-manifest sentinel` step (existing line 110), so coverage misses fail-fast before the more expensive shard check :

Find this block (lines 109-114) :

```yaml
      - name: Maestro shard-manifest sentinel
        run: node ../scripts/sentinels/maestro-shard-manifest.mjs

      - name: Lint
        run: npm run lint
```

Replace with :

```yaml
      - name: Screen test-coverage sentinel (UFR-021)
        # Every museum-frontend screen MUST have a Maestro flow OR an
        # `// e2e-skip: <reason>` magic comment. Blocks the regression class
        # that shipped DOB-2026-05-17 (signup form perma-disabled, no e2e).
        run: node ../scripts/sentinels/screen-test-coverage.mjs

      - name: Maestro shard-manifest sentinel
        run: node ../scripts/sentinels/maestro-shard-manifest.mjs

      - name: Lint
        run: npm run lint
```

### 6.1 Also mirror in `sentinel-mirror.yml`

Per UFR-020 doctrine, every pre-push gate must have a server-side mirror so hook bypass (forbidden but theoretically possible) cannot land on main. Add this step to `/Users/Tim/Desktop/all/dev/Pro/InnovMind/.github/workflows/sentinel-mirror.yml` (one new step alongside existing sentinels) :

```yaml
      - name: screen-test-coverage (UFR-021)
        run: node scripts/sentinels/screen-test-coverage.mjs
```

The mirror workflow already runs on every PR (see existing `sentinel-mirror.yml` body) — this just extends the gate matrix.

---

## 7. Onboarding doc for new devs

### Option A (preferred) — add a section to CLAUDE.md

The prose UFR-021 section in §1 above IS the onboarding doc. CLAUDE.md is the canonical entry point for any new Claude agent or human contributor (cf. `## Common Commands`, `## Pièges connus`, `## Test Discipline — DRY Factories`). One-section deep, no link-chasing.

### Option B (additional, lighter) — append to `museum-frontend/.maestro/README.md`

The existing `.maestro/README.md` is the natural home for "how Maestro fits into our test pyramid". Append :

```markdown
## When to add a new flow (UFR-021)

Every screen under `museum-frontend/app/` (except `_*.tsx` / `+*.tsx`) and every `*Screen.tsx` under `features/**/ui/` MUST have at least one Maestro flow that exercises its critical happy path.

The `scripts/sentinels/screen-test-coverage.mjs` sentinel enforces this :
- pre-push gate 19 (local, < 2 s)
- `ci-cd-mobile.yml` `quality` job (server-side, fails the PR)
- `sentinel-mirror.yml` (catches any hook bypass — forbidden by UFR-020 anyway)

**Quick add a new flow :**
1. Create `museum-frontend/.maestro/<feature>-flow.yaml` mirroring an existing one (auth-flow.yaml is a good template).
2. Reference at least one `testID=` literal from the new screen OR the route path.
3. Register the flow in `museum-frontend/.maestro/shards.json` (which shard ? pick the closest feature area).
4. Run locally : `cd .. && pnpm sentinel:screen-test-coverage`.

**Opt out (rare) :**
Add `// e2e-skip: <reason ≥30 chars>` at the very top of the screen source. Valid reasons : "dev-only debug route", "covered by parent flow X", "third-party native screen Maestro cannot drive". Invalid : "TODO", "P2", "low prio". The reason is logged and audited weekly.
```

**Adopt both A and B — A is the canonical rule, B is the discoverability path for someone already inside `.maestro/`.**

---

## 8. Migration plan (one-shot at adoption)

The sentinel will initially fail on ~20 grandfathered screens (rough estimate from §3.3 walk : 30 in-scope screens × ~33% Maestro coverage today). Three options :

| Option | Cost | Trade-off |
|---|---|---|
| **A — write the missing flows first** | High (5-10 flows × 30 min = 2.5-5 h) | Clean slate, zero baseline, future-proof. Best long term. |
| **B — grandfather all current misses via baseline** | Low (auto-generate baseline once, commit) | Sentinel ships green day-1, debt visible in baseline file, no new screens can leak in. **Pragmatic for tonight.** |
| **C — opt-out comment in every uncovered screen** | Medium (mechanical sed across ~20 files) | Pollutes every grandfathered file with `// e2e-skip: …` , obscures intent. Worst option. |

**Recommendation : B for the bootstrap, then weekly burn-down (1-2 flows / week) to drain the baseline.** Track in `docs/ROADMAP_PRODUCT.md` as a recurring chore.

Bootstrap command (executed once after sentinel implementation lands) :

```bash
node scripts/sentinels/screen-test-coverage.mjs --emit-baseline > museum-frontend/.maestro/coverage-baseline.json
git add museum-frontend/.maestro/coverage-baseline.json
```

The `--emit-baseline` flag is the FOURTH supported flag (in addition to the three in §3.6), and it overwrites `coverage-baseline.json` with the current MISS list as the grandfather set. After that, the sentinel treats baseline entries as PASS but never auto-adds new entries — any new MISS still exits 1.

---

## 9. Acceptance criteria for the sentinel implementation

Whoever writes `screen-test-coverage.mjs` next must satisfy ALL of :

1. `pnpm sentinel:screen-test-coverage` exits 0 on a clean main (after baseline emit per §8).
2. Adding a new file `museum-frontend/app/(stack)/test-fixture.tsx` with no Maestro coverage and no opt-out → exit 1.
3. Adding `// e2e-skip: dev-only debug route for QA fixture validation` at top of that file → exit 0.
4. Adding `// e2e-skip: too short` (< 30 chars) → exit 1 with diagnostic.
5. Adding a Maestro flow referencing a `testID` declared in the new file → exit 0 even without opt-out.
6. Wall-time on a cold run < 2 s.
7. Zero npm dependencies (stdlib only, matching the other sentinels).
8. Unit test under `scripts/sentinels/__tests__/screen-test-coverage.test.mjs` covering the 5 cases above via temp directory fixtures.

---

## TL;DR — what changes if this proposal is adopted

- **UFR-021 prose section added to CLAUDE.md** + machine entry in `user-feedback-rules.json` (v2.1) — agents and humans treat post-feature Maestro coverage as a BLOCK-level rule, same tier as honesty (UFR-013) and no-bypass (UFR-020).
- **New sentinel `scripts/sentinels/screen-test-coverage.mjs`** — walks 30+ screen files, cross-checks against 14+ Maestro flows, fails if any screen has zero coverage and no `// e2e-skip: <reason ≥30 chars>` justification. Stdlib-only, < 2 s, four flags (`--report` / `--staged` / `--emit-baseline` / default).
- **Pre-push Gate 19** wires the sentinel into `.husky/pre-push` after Gate 18 — local feedback in < 2 s, blocks push if a new screen ships uncovered.
- **CI fail-fast** — new step in `ci-cd-mobile.yml` `quality` job (before the slow prebuild + Maestro shard matrix) + mirror in `sentinel-mirror.yml` so UFR-020 hook bypass can't land it.
- **PR template + onboarding doc** — mandatory checkbox in `PULL_REQUEST_TEMPLATE.md` + section in `museum-frontend/.maestro/README.md` make the rule self-discoverable for new contributors. Bootstrap via grandfather baseline (option B in §8), then drain weekly until the baseline file is empty.
