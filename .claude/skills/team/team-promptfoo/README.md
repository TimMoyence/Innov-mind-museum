# /team reviewer 5-axis quality regression

T1.5 ROADMAP_TEAM (KR3) — runs the reviewer agent against a 20-feature corpus and asserts axis-mean scores stay within ±5pts of the baseline.

## Files

| Path | Purpose |
|---|---|
| `promptfooconfig.yaml` | promptfoo eval config, points at `lib/reviewer-eval-shim.sh` |
| `corpus.json` | 20 synthetic feature samples (varied: backend/FE/migration/security/i18n/refactor/etc.) |
| `baseline-scores.json` | Per-feature + per-axis means from latest calibration run |
| `../lib/reviewer-eval-shim.sh` | Provider exec — invokes reviewer (real Anthropic API or mock) |
| `../lib/quality-regression.sh` | Comparator — fails if axis mean drops >5pts |

## Run locally

```bash
cd .claude/skills/team/team-promptfoo

# Mock mode (offline, deterministic, free):
REVIEWER_EVAL_MODE=mock npx promptfoo eval --output output.json
../lib/quality-regression.sh output.json baseline-scores.json | jq .

# Real mode (calibration / weekly cron):
ANTHROPIC_API_KEY=sk-ant-... npx promptfoo eval --output output.json
../lib/quality-regression.sh output.json baseline-scores.json
```

## Modes

- **mock** (default offline) — deterministic scores from feature_id hash. Catches harness drift, costs $0. Used in PR CI sanity check.
- **real** (set `ANTHROPIC_API_KEY` + `REVIEWER_EVAL_MODE=real`) — invokes Claude Opus 4.7 via the Anthropic Messages API with `reviewer.md` as system prompt. Cost ~$2-3 per full corpus run. Used in nightly cron + manual recalibration.

## Re-calibrating the baseline

After a confirmed-good /team change to reviewer.md or scoring rubric :

```bash
ANTHROPIC_API_KEY=sk-ant-... npx promptfoo eval --output new-output.json
# Inspect new-output.json — ensure scores are sane.
node -e "
const out = require('./new-output.json');
const tests = out.results.results;
// produce baseline-scores.json from the new run...
"
```

(A future `lib/quality-baseline-bake.sh` should automate this — see ROADMAP_TEAM T1.5b.)

## CI integration

Workflow `.github/workflows/team-quality-regression.yml` :
- **Cron weekly** (Mon 04:00 UTC, mode=real) — full Anthropic-API run, fails the workflow on >5pts drop. Posts a summary on the next /team weekly audit issue.
- **PR sanity** (any PR touching `.claude/skills/team/`) — mode=mock, catches harness/corpus regressions without burning API quota.

## Calibration note

The current `baseline-scores.json` is a **mock-bootstrap** — derived from the deterministic shim, not from a real Anthropic run. The first nightly cron in real mode will drift significantly from this baseline (intentional). Re-bake the baseline after the first real run lands and looks reasonable.
