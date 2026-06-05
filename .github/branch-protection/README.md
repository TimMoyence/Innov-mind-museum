# Branch protection as code

`main.json` is the **source of truth** for `main`'s required status checks. It is
reconciled onto the live GitHub branch protection by
[`branch-protection-reconcile.yml`](../workflows/branch-protection-reconcile.yml)
on **every push to `main`** (and via `workflow_dispatch`). This is what makes
pinning *automatic and unforgettable*: change a required check by editing
`main.json`, and it self-applies the moment the change reaches `main`.

> Do **not** edit required checks in the GitHub UI — live drift is overwritten
> on the next push to `main`.

## How a context gets pinned

The reconcile script ([`../scripts/reconcile-branch-protection.sh`](../scripts/reconcile-branch-protection.sh))
rebuilds the full `contexts` array from the manifest (the REST endpoint replaces
the whole array, so partial edits would silently drop checks):

- **`always[]`** — pinned unconditionally. Their workflows already report on
  every PR.
- **`guarded[]`** — pinned **only** when `workflow` uses a job-level gate
  (`pull_request: {}`). If the workflow regresses to a workflow-level path
  filter (`pull_request:\n  paths:`), the script **drops** that context from
  required (and warns) rather than leaving an `Expected`-forever check that
  would freeze every merge under `enforce_admins: true`.

`promptfoo` and `promptfoo systemprompt-leak corpus` are `guarded` because they
incur real LLM cost and only run on chat/guardrail PRs (skipped = success on
others, via the `changes` job in each workflow).

## Why the freeze-guard matters

`enforce_admins: true` means a required check that is red **or never reported**
freezes *all* merges — admins included. A workflow-level path filter never
*starts* the workflow on an unrelated PR, so the context stays `Expected`
forever. Job-level gating (`changes` job + `if:`) always starts the workflow and
reports `success` on skip. The guard enforces that invariant before pinning.

## Credential

The reconcile step needs `administration: write` on this repo.

> The default **`GITHUB_TOKEN` cannot do this** — the Actions token has no
> `administration` permission scope (verified by actionlint; the scope simply
> does not exist), so branch-protection edits are out of its reach. The workflow
> therefore reads a dedicated secret **`BRANCH_PROTECTION_TOKEN`** and is
> **inert (skips with a warning) until that secret exists** — merging this before
> provisioning never produces a red job or freezes anything.

Put **either** of these in `BRANCH_PROTECTION_TOKEN`:

- **Fine-grained PAT (quickest):** repository-scoped to this repo only,
  permission `Administration: Read and write`. One token, one secret. Downside:
  long-lived admin token readable by CI.
- **GitHub App (hardening, preferred long-term):** App with repository
  permission `Administration: Read and write`, installed on this repo. Mint a
  short-lived installation token at runtime with `actions/create-github-app-token`
  and feed it to `BRANCH_PROTECTION_TOKEN`. No standing admin token in CI.

The **first run with the secret present is the live test**: if the credential
lacks the permission the script fails with a clear 403 message and leaves the
live protection untouched.

## Running it manually

```bash
# dry run (prints intended PATCH, applies nothing) — safe from any branch:
DRY_RUN=1 bash .github/scripts/reconcile-branch-protection.sh

# apply (requires admin gh login; run with a checkout of main):
bash .github/scripts/reconcile-branch-protection.sh
```
