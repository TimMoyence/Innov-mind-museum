# Runbook — Backend Auto-Rollback

**Scope:** `ci-cd-backend.yml` — prod + staging deploys.
**Trigger:** deploy step or post-deploy smoke test fails.
**Outcome:** service is automatically restored to the previous image + migration state within ~3 minutes. The CI job still reports as failed so on-call is paged.

---

## How it works

Each deploy step is wrapped by two companion steps:

1. **`Upload rollback helper`** (SCP) — ships `museum-backend/deploy/rollback.sh` to `/srv/museum/rollback.sh` on the VPS.
2. **`Capture pre-deploy rollback state`** — on the VPS, retags the currently-running image `:latest` → `:previous` (no-op on first deploy) and snapshots the pre-run migration count into `/srv/museum/.rollback/<service>/pre-count.txt`.
3. **`Deploy on VPS`** — pulls `:latest`, runs migrations, restarts, health-checks. After `migration:run` it computes the delta (`post_count - pre_count`) and writes it to `/srv/museum/.rollback/<service>/applied-count.txt`.
4. **`Post-deploy smoke test`** — runs `scripts/smoke-api.cjs`.
5. **`Auto-rollback on deploy or smoke failure`** (only when step 3 or 4 fails) — SSH-invokes `rollback.sh <compose-file> <service> <image-ref>`, which:
   - runs `migration:revert` exactly `applied-count.txt` times,
   - retags `:previous` → `:latest`,
   - `docker compose up -d --force-recreate <service>`,
   - runs the same 20-try health loop as the deploy step.
6. **`Notify Sentry of rollback`** — emits a `deploys new --name rollback-<sha>` event so the release timeline shows the incident.
7. **`Fail job after successful rollback`** — deliberately fails the workflow so GitHub/Sentry/Slack alerts fire even though the service is restored.

Exit codes from `rollback.sh` let you triage fast:

| Code | Meaning | Action |
|---:|---|---|
| `0` | Rollback succeeded end-to-end | Read the workflow logs, diagnose root cause, re-deploy a fix |
| `42` | `migration:revert` failed mid-loop | **DB is in an intermediate state** — follow the "Partial migration revert" section below |
| `43` | Image retag or `docker compose up` failed | SSH manually, inspect `docker images`, ensure `:previous` still exists |
| `44` | Rolled-back container failed its healthcheck | SSH manually, inspect `docker compose logs <service>`, the old image itself is broken |

---

## What the rollback does NOT do

- **It will not resurrect dropped data.** If a migration's `up()` drops a column or truncates a table, its `down()` can only recreate the schema — not the rows. The `scripts/check-migration-down.cjs` CI gate prevents *empty* `down()` bodies, but it cannot detect destructive-but-reversible-schema migrations. Review destructive migrations manually before merging.
- **It does not touch Redis cache contents.** If a bad deploy poisoned the cache (e.g., wrong serialization), flush manually: `docker compose exec redis redis-cli -a "$REDIS_PASSWORD" FLUSHDB`.
- **It does not roll back the uploaded Docker image in GHCR.** `:latest` in the registry still points at the broken build. Either retag in GHCR or push a fix commit — do not rely on GHCR rollback to save you on a subsequent deploy.
- **It does not notify PagerDuty/Slack directly.** Only Sentry is wired. Add a webhook step to this workflow if you need richer notifications.

---

## Partial migration revert (exit code 42)

The database is in an intermediate state: some of the new migrations ran but the revert loop failed. You need to decide:

1. **Can the failing `down()` be patched safely?**
   - If yes: push a hotfix migration (a new one with a real `up()` that matches the partial state), then re-deploy. Do not try to re-run `migration:revert`.
2. **Is the remaining partial state compatible with the rolled-back code?**
   - Check the app — `docker compose up -d backend` with `:previous`. If it boots and `/api/health` is green, you bought time to investigate.
3. **Is the old code incompatible with the partial schema?**
   - Re-run `migration:run` to finish applying the new schema, then revert to the **new** image (undo the rollback). Now debug the smoke-test failure on the new release without blocking ops.

Never delete rows from the `migrations` table by hand unless you are mirroring that against a `pnpm migration:revert` command — TypeORM's idempotency assumes the table is authoritative.

---

## Manual rollback (when CI cannot)

When you need to roll back without the CI workflow (e.g., the workflow itself is broken):

```bash
ssh deploy@vps
cd /srv/museum

# 1. Inspect the state the last CI run left behind
cat .rollback/backend/applied-count.txt   # how many migrations the last deploy applied
docker image inspect ghcr.io/.../museum-backend:previous >/dev/null && echo "OK" || echo "MISSING"

# 2. Roll back migrations
for i in $(seq 1 $(cat .rollback/backend/applied-count.txt)); do
  docker compose run --rm --no-deps -T backend \
    node ./node_modules/typeorm/cli.js migration:revert -d dist/src/data/db/data-source.js
done

# 3. Retag and restart
docker tag ghcr.io/.../museum-backend:previous ghcr.io/.../museum-backend:latest
docker compose up -d --force-recreate --no-deps --timeout 30 backend

# 4. Verify
curl -sf https://api.musaium.com/api/health | jq .
```

Or simply re-run the helper directly:

```bash
chmod +x rollback.sh
./rollback.sh docker-compose.yml backend "ghcr.io/timmoyence/museum-backend"
```

---

## Testing the rollback

On staging only — never on prod:

1. Push a commit with a deliberately broken smoke test (e.g., bad `SMOKE_TEST_PASSWORD` secret temporarily set to a wrong value).
2. Observe the workflow: deploy green, smoke red, rollback fires, Sentry records a `rollback-<sha>` deploy, workflow ends red.
3. `ssh vps && docker compose ps backend-staging` — the running container's image label should match the previous SHA.
4. Restore the correct smoke secret.

Run this drill once per quarter to make sure the flow still works after workflow or compose-file edits.

---

## Related files

- `.github/workflows/ci-cd-backend.yml` — deploy + rollback orchestration
- `museum-backend/deploy/rollback.sh` — rollback shell invoked on the VPS
- `museum-backend/scripts/count-applied-migrations.cjs` — migration delta helper
- `museum-backend/scripts/check-migration-down.cjs` — CI gate blocking irreversible migrations
- `docs/CI_CD_SECRETS.md` — secrets consumed by the deploy/rollback steps
- `docs/DEPLOYMENT_STEP_BY_STEP.md` — full deploy procedure (non-emergency path)
