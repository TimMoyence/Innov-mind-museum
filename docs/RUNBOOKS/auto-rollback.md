# Auto-Rollback Runbook

`museum-backend/deploy/rollback.sh` is invoked automatically by the CI deploy
workflow when post-deploy checks fail. This runbook explains:
- what it does,
- how to interpret the exit codes,
- when an operator must take over.

## When auto-rollback fires

The deploy workflow (`.github/workflows/ci-cd-backend.yml`) calls
`rollback.sh` after **either**:
- `appleboy/ssh-action` deploy step exits non-zero (image pull, migration
  apply, healthcheck loop), or
- `node ./scripts/smoke-api.cjs` exits non-zero (login + API call against the
  freshly-deployed container).

The workflow runs the rollback on the same VPS as the deploy, with the same
SSH key.

## What rollback.sh does

1. Reads `pre-count.txt` (migrations row count captured **before**
   `migration:run`) from `~/.museum-rollback/<service>/`.
2. Queries the live `migrations` table via
   `scripts/count-applied-migrations.cjs` to get the current row count.
3. Computes `applied = current − pre`. Reverts that many migrations newest
   first via `migration:revert`. Falls back to the legacy `applied-count.txt`
   only if the DB query is unavailable.
4. Retags `<image>:previous` → `<image>:latest` (the previous tag is set by
   the deploy step before the new image is pulled).
5. Recreates the service container with `docker compose up -d --force-recreate
   --timeout 30 <service>`.
6. Healthchecks the rolled-back container against `/api/health` for up to 60
   s (20 attempts × 3 s).
7. Clears the state files on success so the next deploy starts clean.

## Exit codes

| Code | Meaning | Operator action |
|---|---|---|
| 0 | Rollback succeeded — code + migrations restored, healthcheck green | None. Confirm Sentry quiet, post incident note in tracker. |
| 42 | A `migration:revert` call failed mid-loop. Database is in an intermediate state. | **DO NOT redeploy.** Inspect via `psql`, identify which migration failed (look at the Stryker / migration log line printed before the FATAL), apply the corresponding `down()` manually OR restore from backup (§2 of `V1_FALLBACKS.md`). |
| 43 | Image retag or `docker compose up` failed — likely the `:previous` tag was missing (first deploy on this host) or Docker is unhealthy. | Inspect `docker images | grep museum-backend` and `journalctl -u docker --since '10 min ago'`. If `:previous` is missing, manually pull the prior commit's image (`docker pull ghcr.io/<owner>/museum-backend:<sha>`) and retag. |
| 44 | The rolled-back container failed its healthcheck. Either the previous image is itself broken (rare) or `/api/health` is reporting `database: 'down'`. | Check `docker compose logs --tail=200 backend`. If DB connectivity is the issue, run `§2 Manual restore drill` mentally (the DB is the bottleneck, not the app). |

## Manual rollback

Sometimes you want to roll back even when the deploy succeeded — e.g. a
post-deploy regression visible only in user reports. Trigger manually:

```bash
ssh deploy@prod.musaium.com
cd /srv/museum
sudo chmod +x rollback.sh
./rollback.sh docker-compose.yml backend "ghcr.io/<owner>/museum-backend"
```

The deploy workflow (`ci-cd-backend.yml`) `sudo mv`s the script into
`/srv/museum/rollback.sh` and the compose file used at runtime is
`/srv/museum/docker-compose.yml` (no `.prod` suffix on the VPS — that's
the source-of-truth name `museum-backend/deploy/docker-compose.prod.yml` got
renamed to during the deploy step).

Note that the script only reverts the **most recent** deploy. To roll back
two deploys, you must run it once, redeploy *that* now-current image to
trigger a fresh `:previous` tag, and rollback again. (Yes, this is awkward —
multi-step rollback automation is a V2 feature.)

## Drill cadence

Run a deliberate rollback drill on staging every 90 days. Steps:

1. Deploy a known-bad commit to staging (e.g. one that intentionally throws
   in `/api/health`).
2. Confirm `rollback.sh` exits 0 within 90 s.
3. Confirm `/api/health` is back on the previous image.
4. Confirm `migrations` table row count matches `pre-count.txt`.
5. Log the drill date in the issue tracker with label `ops/drill-rollback`.
6. Restore staging to a known-good main commit.

This drill exercises the most fragile chain in the deploy pipeline (state
file I/O, DB query, image retag, healthcheck) and catches drift before prod
needs it.

## Known limitations

- **Single-host only** : the state directory is `~/.museum-rollback/` on the
  VPS. Multi-host (load-balanced) deploys would need shared state (DB row,
  Redis key) — track in V2 once the user count justifies it.
- **No automatic alerting beyond exit code** : the workflow surfaces the
  rollback exit code in CI output and a Sentry deploy event, but there is no
  pager. Set up Slack or PagerDuty alongside `gh` issue creation if you need
  out-of-band notification.
- **Migrations must have working `down()` blocks** : enforced at PR time by
  `scripts/check-migration-down.cjs`. If a migration ships a no-op `down()`,
  rollback will silently succeed without actually reverting — this is
  caught by the migration count delta check (current vs pre) but the
  database may end up in an unexpected schema state.
