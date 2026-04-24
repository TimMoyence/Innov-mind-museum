# GitHub Actions — SHA Pins Registry

> Source of truth for the SHA pins applied to every third-party GitHub Action
> used by Musaium workflows. Any action that runs with access to a secret OR
> ships with `GITHUB_TOKEN` write scopes MUST be pinned by 40-char commit SHA.

## Why SHA pins?

- **Supply-chain defense** — tag pins (`@v4`) are mutable. An attacker who
  compromises an action maintainer's account can re-point the tag to a
  malicious commit and push it silently to every workflow. SHA pins are
  immutable.
- **Reproducibility** — a CI run from 6 months ago that pinned `@v4` may
  resolve to completely different code today. SHA pins freeze the audit trail.
- **GitHub's own recommendation** — see <https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#using-third-party-actions>.

## Bump policy

Each `uses:` line carries an inline comment with the original semver tag so
Dependabot / Renovate can recognise and auto-bump the pin. When a new release
lands:

1. Dependabot opens a PR updating both the SHA AND the inline `# <tag>` comment.
2. The CODEOWNERS reviewer confirms the SHA matches the tag (`gh api repos/<owner>/<repo>/git/ref/tags/<tag> --jq .object.sha`).
3. Merge once CI is green.

## Registry (pinned 2026-04-24)

| Action | Pinned tag | SHA |
|---|---|---|
| `actions/checkout` | `v6` | `de0fac2e4500dabe0009e67214ff5f5447ce83dd` |
| `actions/setup-node` | `v6` | `48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e` |
| `actions/upload-artifact` | `v7` | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` |
| `actions/upload-pages-artifact` | `v5` | `fc324d3547104276b827a68afc52ff2a11cc49c9` |
| `actions/deploy-pages` | `v5` | `cd2ce8fcbc39b97be8ca5fce6e763baed58fa128` |
| `pnpm/action-setup` | `v5` | `fc06bc1257f339d1d5d8b3a19a8cae5388b55320` |
| `docker/setup-buildx-action` | `v4` | `4d04d5d9486b7bd6fa91e7baf45bbb4f8b9deedd` |
| `docker/login-action` | `v4` | `4907a6ddec9925e35a0a9e82d7399ccc52663121` |
| `docker/build-push-action` | `v7` | `bcafcacb16a39f128d818304e6c9c0c18556b85f` |
| `appleboy/ssh-action` | `v1.2.5` | `0ff4204d59e8e51228ff73bce53f80d53301dee2` |
| `appleboy/scp-action` | `v1.0.0` | `ff85246acaad7bdce478db94a363cd2bf7c90345` |
| `aquasecurity/trivy-action` | `0.35.0` | `57a97c7e7821a5776cebc9bb87c984fa69cba8f1` |
| `treosh/lighthouse-ci-action` | `v12` | `3e7e23fb74242897f95c0ba9cabad3d0227b9b18` |
| `mobile-dev-inc/action-maestro-cloud` | `v2` | `34906065ba3e85fd57ed533b178187eefb042aed` |
| `github/codeql-action/init` | `v4` | `95e58e9a2cdfd71adc6e0353d5c52f41a045d225` |
| `github/codeql-action/analyze` | `v4` | `95e58e9a2cdfd71adc6e0353d5c52f41a045d225` |
| `github/codeql-action/upload-sarif` | `v4` | `95e58e9a2cdfd71adc6e0353d5c52f41a045d225` |

Notes:

- `pnpm/action-setup@v5`, `treosh/lighthouse-ci-action@v12`, `mobile-dev-inc/action-maestro-cloud@v2`, and `github/codeql-action@v4` publish **annotated** tags; the SHA above is the dereferenced commit (via `gh api repos/<owner>/<repo>/git/tags/<annotated-sha>`), not the annotated-tag SHA.
- `github/codeql-action` sub-paths (`init`, `analyze`, `upload-sarif`) share the same repository and therefore the same release commit.

## How to resolve a SHA manually

```bash
# Lightweight tag → commit SHA in one step
gh api repos/actions/checkout/git/ref/tags/v6 --jq '.object.sha'

# Annotated tag (first call returns a tag object, second deref to commit)
SHA="$(gh api repos/pnpm/action-setup/git/ref/tags/v5 --jq '.object.sha')"
gh api repos/pnpm/action-setup/git/tags/"$SHA" --jq '.object.sha'
```

## What to do when adding a new action

1. Resolve its commit SHA using the command above.
2. Write the `uses:` line as `uses: owner/repo@<sha>  # <tag>`.
3. Add an entry to the table above.
4. If the action receives a secret, verify it is passed via `env:` + `envs:` rather than interpolated directly into a shell `script:` heredoc (see `ci-cd-backend.yml` `Deploy on VPS` step for the canonical pattern).
