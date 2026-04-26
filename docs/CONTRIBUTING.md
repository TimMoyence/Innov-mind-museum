# Contributing to Musaium

This document describes the contribution workflow for the Musaium monorepo (`museum-backend`, `museum-frontend`, `museum-web`, `design-system`). It is the authoritative reference for the **Pull Request review flow** and the **branch protection settings** that GitHub administrators must enable.

> **Why this matters** — Reference: SOC2 **CC5** (Control Activities) and **CC8** (Change Management).
> Audit finding 2026-04-26 (P1/P2): code changes to security-critical paths must be reviewed by an accountable owner before merge. Without enforced CODEOWNERS + branch protection, the change-management control is informal and unevidenced. The rules below close that gap.

---

## 1. Repository layout (recap)

| App / area | Stack | Package manager |
|---|---|---|
| `museum-backend/` | Node.js 22 + Express 5 + TypeORM + PostgreSQL 16 | pnpm |
| `museum-frontend/` | React Native 0.83 + Expo 55 + Expo Router | npm |
| `museum-web/` | Next.js 15 + React 19 + Tailwind 4 | pnpm |
| `design-system/` | Design tokens → generated TS + CSS | pnpm |

See `CLAUDE.md` for full architecture, common commands, and migration governance.

---

## 2. PR review flow (mandatory — effective 2026-04-26)

Every change to `main` or `staging` MUST go through a Pull Request. Direct pushes are blocked by branch protection.

### 2.1 Authoring a PR

1. Create a feature branch from `main` (or `staging` for hotfixes).
2. Keep commits focused; prefer small PRs over large ones.
3. Update tests, OpenAPI spec, migrations, and docs in the same PR as the code change.
4. Open the PR with a clear title and description. Reference the related issue / roadmap item.

### 2.2 Review requirements

1. **At least 1 approving review** is required from a CODEOWNER for every path touched by the PR (see `.github/CODEOWNERS`). If a PR touches both `museum-backend/src/modules/auth/**` and `museum-backend/src/data/db/migrations/**`, both `@backend-leads @security-leads` AND `@backend-leads @dba` must approve.
2. **Stale approvals are dismissed** when new commits are pushed — re-review is required.
3. **All required CI checks must be green** before merge (see § 3).
4. **Branch must be up to date** with the base branch before merge (linear history).
5. **No bypass** — administrators are subject to the same rules.

### 2.3 Merge strategy

- Use **"Squash and merge"** for feature branches into `main` / `staging`.
- Use **"Rebase and merge"** only when preserving granular commit history is intentional and reviewed.
- **Do NOT use "Create a merge commit"** — branch protection requires linear history.

---

## 3. Required CI status checks

The following job names (extracted from `.github/workflows/`) must be marked as **required status checks** in branch protection. Names appear in GitHub Checks UI as `<workflow>/<job>`.

| Workflow file | Required job(s) | Purpose |
|---|---|---|
| `ci-cd-backend.yml` | `quality`, `ai-tests` | typecheck, lint, unit + integration tests, OpenAPI validate, contract tests, Trivy fs scan, SBOM |
| `ci-cd-mobile.yml` | `quality` | Expo Doctor, OpenAPI sync check, audit, i18n check, lint, tests |
| `ci-cd-web.yml` | `quality` | Next.js lint + typecheck + build + Vitest + audit |
| `ci-cd-llm-guard.yml` | `build` | LLM guardrail sidecar build + tests |
| `codeql.yml` | `analyze` | CodeQL SAST (security-extended + security-and-quality) |
| `semgrep.yml` | `semgrep` | Semgrep SAST static analysis |

Build / deploy jobs (`build-preview-*`, `deploy-prod`, `deploy-staging`, `lighthouse`, `submit-production-*`) are **conditional** (run on dispatch, push to main, or tags) and MUST NOT be marked required — they would block PR merges.

> **When adding a new workflow or renaming a job**, update this table AND update the branch protection rules in GitHub Settings, otherwise the new check will not gate merges.

---

## 4. GitHub branch protection rules to enable (manual action)

These settings are NOT in code. A repository admin must enable them via:
**Settings → Branches → Branch protection rules → Add rule**

Apply the **same configuration to both `main` and `staging`** branches.

### Required settings

- [x] **Require a pull request before merging**
  - [x] Require approvals: **1**
  - [x] Dismiss stale pull request approvals when new commits are pushed
  - [x] Require review from **CODEOWNERS**
  - [ ] Restrict who can dismiss pull request reviews (optional — set if multiple maintainers)
  - [ ] Allow specified actors to bypass required pull requests — **leave OFF**
- [x] **Require status checks to pass before merging**
  - [x] Require branches to be up to date before merging
  - **Required status checks** (search and add each by name):
    - `quality` (from `backend` workflow)
    - `ai-tests` (from `backend` workflow)
    - `quality` (from `mobile` workflow)
    - `quality` (from `web` workflow)
    - `build` (from `llm-guard sidecar` workflow)
    - `analyze` (from `codeql` workflow)
    - `semgrep` (from `semgrep` workflow)
  > Tip: GitHub disambiguates jobs with the same name by workflow. After the first PR runs, all 7 checks above will appear in the search dropdown.
- [x] **Require conversation resolution before merging**
- [x] **Require linear history**
- [x] **Require signed commits** (recommended; can be enabled in a second phase if contributors need GPG/SSH key onboarding first)
- [x] **Require deployments to succeed before merging** — leave OFF (deploys are post-merge)
- [x] **Lock branch** — leave OFF
- [x] **Do not allow bypassing the above settings** (apply to administrators)
- [ ] **Allow force pushes** — **leave OFF**
- [ ] **Allow deletions** — **leave OFF**

### Verification after enabling

1. Open a test PR that touches a CODEOWNERS-protected path (e.g. `museum-backend/src/modules/auth/`).
2. Confirm GitHub UI shows: *"Review required from code owners"*.
3. Confirm all 7 required checks appear under the merge box and that "Merge" is disabled until they pass + an owner approves.
4. Attempt a force push to `main` from a test branch — must be rejected by GitHub.

---

## 5. CODEOWNERS maintenance

- File: `.github/CODEOWNERS`
- Syntax: one `pattern @owner1 @owner2` rule per line. **No trailing comments on rule lines** (GitHub will treat the comment as part of the path).
- Last-matching-pattern wins — keep the default (`* @tech-leads`) at the top, specific overrides at the bottom.
- **Solo-maintainer mode (current state, 2026-04-26)**: every rule resolves to `@TimKraken`. Branch protection should still require "Review from CODEOWNERS" so the rule is enforced if a contributor is added later, but a single approving review covers all paths today.
- If the project grows, replace `@TimKraken` with team handles (`@backend-leads`, `@security-leads`, `@dba`, etc.) before adding contributors — keep one commit dedicated to that rename for audit traceability.
- Validate syntax by opening the PR view in GitHub: invalid lines are flagged with a yellow warning under the "Code owners" UI in `.github/CODEOWNERS`.

---

## 6. Secrets and sensitive files

- Never commit `.env*` files (already in `.gitignore`).
- Never commit credentials, private keys, API tokens, or service-account JSONs.
- Use GitHub Actions secrets (documented in `docs/CI_CD_SECRETS.md`) for CI-time values.
- If a secret is accidentally committed: rotate the secret first, then purge from git history (BFG / `git filter-repo`) and force-push with admin coordination.

---

## 7. Compliance traceability

| Control | How it is satisfied |
|---|---|
| SOC2 **CC5.1** (control activities supporting risk mitigation) | CODEOWNERS enforces accountable reviewers per security-critical path |
| SOC2 **CC5.2** (general controls over technology) | Required CI checks (CodeQL, Semgrep, Trivy, contract tests, lint, typecheck) run on every PR |
| SOC2 **CC8.1** (change management with authorization, design, testing, approval) | PR approval + linear history + signed commits + auditable merge log |
| ISO 27001 **A.8.32** (change management) | Same as CC8.1 |
| ISO 27001 **A.5.15** (access control) | CODEOWNERS team mapping + repo team permissions |

Audit evidence: GitHub PR history, branch protection settings export (`gh api repos/:org/:repo/branches/main/protection`), CODEOWNERS file in repo.

---

## 8. References

- `.github/CODEOWNERS` — owner-to-path mapping
- `team-reports/2026-04-26-security-remediation-plan.md` § W0.2 — original mandate
- `docs/CI_CD_SECRETS.md` — CI secret catalogue
- `CLAUDE.md` — architecture + common commands + migration governance
- GitHub docs: <https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-rules/about-rulesets>
