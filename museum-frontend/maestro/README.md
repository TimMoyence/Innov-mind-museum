# `maestro/` — manual dev/release screenshot tooling (NOT CI coverage)

> **This directory is NOT read by CI.** The CI Maestro pipeline (`ci-cd-mobile.yml`)
> and the shard manifest (`scripts/sentinels/maestro-shard-manifest.mjs`) only walk
> **`museum-frontend/.maestro/`** (with the leading dot). Anything placed here is
> **never executed automatically** — putting a regression flow here is a silent
> no-op and a false sense of coverage (this is what TD-34 fixed).

## What lives here

Manual, on-demand screenshot generators — run by hand during release prep, not
regression tests (they use `takeScreenshot` and brittle point-taps, no assertions):

| File | Purpose |
|---|---|
| `screenshots.yaml` | App Store / release-notes screenshot capture (see `docs/STORE_SUBMISSION_GUIDE.md`). |
| `capture-screens.yaml` | Navigate the main screens and capture (app already logged in). |
| `login-and-capture.yaml` | Log in, then capture home / conversations / settings. |

Run manually, e.g.:

```bash
TEST_EMAIL=… TEST_PASSWORD=… maestro test museum-frontend/maestro/screenshots.yaml
```

## Where regression flows go

**Real e2e regression flows belong in `museum-frontend/.maestro/`** and MUST be
added to a shard in `.maestro/shards.json` (the shard-manifest sentinel fails
otherwise). Per-PR runs the `smoke` subset; the full 4-shard suite runs nightly +
on push to `main`.

## History (TD-34)

Three intent-coverage flows once lived here and were **silently skipped by CI**
(`paywall-quota-exhaustion.yaml`, `voice-record-and-tts.yaml`, `rtl-switch-ar.yaml`,
audit-360 S3 T3.5/T3.6/T3.7, 2026-05-17). They were removed 2026-06-05: paywall and
voice are superseded by `.maestro/modal-paywall-quota-upsell.yaml` and
`.maestro/audio-recording-flow.yaml`; the RTL/Arabic flow had **no `.maestro`
equivalent and is a genuine remaining e2e gap** — see `docs/TEST_COVERAGE_INVENTORY.md`.
They are recoverable from git history if revived (must be re-validated runtime-green
against the current UI before being sharded — they were text-matching flows from
before the late-May testID rework).
