# ast-grep rules — V12 W7

AST-aware lint rules that catch patterns ESLint can't (or where ESLint plugins don't exist for Musaium-specific conventions).

## Install

```bash
brew install ast-grep             # macOS
# or
npm install -g @ast-grep/cli      # cross-platform
```

## Run

```bash
# Scan with all rules in tools/ast-grep-rules/
ast-grep scan

# Single rule
ast-grep scan --rule tools/ast-grep-rules/no-raw-throw-error.yml

# JSON output for CI
ast-grep scan --json > ast-grep-report.json
```

## Rules shipped (W7 — 3 starter)

| Rule | Severity | Scope | Catches |
|---|---|---|---|
| `no-raw-throw-error` | error | `museum-backend/src/**` | `throw new Error(...)` outside domain entities and migrations — use `AppError` factories |
| `no-dangerously-set-inner-html-without-purify` | error | `museum-web/src/**/*.tsx` | `dangerouslySetInnerHTML` without DOMPurify import — V12 §8 OWASP LLM02 |
| `no-unicode-emoji-in-screen` | warning | `museum-frontend/app/**` + `museum-web/src/app/**` | unicode emojis in JSX — use PNG `require` or Ionicons (`feedback_no_unicode_emoji`) |

## Adding a rule

1. Create `tools/ast-grep-rules/<slug>.yml` with `id`, `language`, `severity`, `message`, `note`, `rule`, `files`, optional `ignores`.
2. Test interactively: `ast-grep scan --rule tools/ast-grep-rules/<slug>.yml museum-backend/src/...`
3. Add a fixture pair under `tools/ast-grep-rules/__tests__/<slug>/` (good.ts + bad.ts) — `ast-grep test` validates.
4. Update this README's table.

## Adding to CI

Future workflow `.github/workflows/ci-cd-ast-grep.yml` (deferred):

```yaml
jobs:
  ast-grep:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g @ast-grep/cli
      - run: ast-grep scan --json > report.json
      - uses: actions/upload-artifact@v4
        with: { name: ast-grep, path: report.json }
      - run: |
          jq -e '.[] | select(.severity == "error")' report.json && exit 1 || exit 0
```

## When to use ast-grep vs ESLint vs musaium-test-discipline plugin

| Tool | Use for |
|---|---|
| ast-grep | One-off codemods, project-specific patterns no plugin covers |
| ESLint | Standard JS/TS rules, type-aware analysis (`@typescript-eslint`) |
| `eslint-plugin-musaium-test-discipline` | Test-entity shape-match (Phase 7) — already plugged into BE+FE eslintrc |

ast-grep is for the long tail. Don't migrate working ESLint rules to ast-grep.
