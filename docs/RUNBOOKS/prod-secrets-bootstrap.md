# Production Secrets Bootstrap

The 2026-04-27 deploy of `a05f34c1` failed at migration time because the
prod VPS `.env` was missing `MFA_ENCRYPTION_KEY` (introduced by the R16
MFA-admin commit `ab3917d3` and never propagated to the operator config).
Auto-rollback fired, prod stayed on the previous image. This runbook is
the one-shot procedure to align the VPS `.env` with the validator
contract enforced by `museum-backend/src/config/env.production-validation.ts`.

## When to use this

- First deploy after a new validator clause lands (`MFA_*`, `REDIS_PASSWORD`
  strength, future additions).
- Operator handover — confirm the VPS env still satisfies every assertion.
- Post-incident, when auto-rollback fires with `Missing required environment
  variable: …` or `… must be >= 32 chars in production`.

## Required secrets (post-2026-04-27)

Every entry below is asserted in `validateProductionEnv`. Order matches
the validator's failure-fast sequence — fix the first missing one and
the next deploy will surface the next one if any.

| Var | Length | Distinct-from | Reason |
|---|---|---|---|
| `JWT_ACCESS_SECRET` | ≥32 | `JWT_REFRESH_SECRET` | Access-token HMAC |
| `JWT_REFRESH_SECRET` | ≥32 | `JWT_ACCESS_SECRET` | Refresh-token HMAC |
| `PGDATABASE` | — | — | Postgres database name |
| `CORS_ORIGINS` | — | — | Comma-separated allow-list of origins |
| `MEDIA_SIGNING_SECRET` | ≥32 | both JWT secrets | S3 URL signing |
| `MFA_ENCRYPTION_KEY` | ≥32 | JWTs + media + `MFA_SESSION_TOKEN_SECRET` | AES-256-GCM key for TOTP secrets at rest |
| `MFA_SESSION_TOKEN_SECRET` | ≥32 | JWTs + `MFA_ENCRYPTION_KEY` | HMAC for the MFA-challenge JWT |
| `OPENAI_API_KEY` | — | — | LLM provider (or `DEEPSEEK_API_KEY` / `GOOGLE_API_KEY` per `LLM_PROVIDER`) |
| S3 quintet | — | — | Required when `OBJECT_STORAGE_DRIVER=s3`: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` |
| `REDIS_PASSWORD` | ≥32 | JWTs + media | Required when `CACHE_ENABLED=true`. Must match `--requirepass` in `docker-compose.prod.yml` |
| `REDIS_URL` or `REDIS_HOST` | — | — | Pick one; URL form recommended in compose |

Soft-warns (not blocking, but log a warning):
- `BREVO_API_KEY` — password-reset emails are silently dropped if unset.

## One-shot fix script (paste on the VPS)

```bash
ssh deploy@prod.musaium.com
cd /srv/museum
sudo cp .env .env.bak.$(date -u +%Y%m%d-%H%M%S)

# Generate any missing secret. Run only the lines for vars that are
# missing or shorter than 32 chars — `grep` them in .env first.
generate() { openssl rand -hex 32; }

# 1. Quick audit of the current state.
for V in JWT_ACCESS_SECRET JWT_REFRESH_SECRET MEDIA_SIGNING_SECRET \
         MFA_ENCRYPTION_KEY MFA_SESSION_TOKEN_SECRET REDIS_PASSWORD; do
  if ! grep -qE "^${V}=." .env; then
    echo "[missing]   ${V}"
  else
    LEN=$(grep -E "^${V}=" .env | head -1 | sed 's/^[A-Z_]*=//' | tr -d '"' | wc -c)
    LEN=$((LEN - 1))
    if [ "$LEN" -lt 32 ]; then
      echo "[too short] ${V} (current ${LEN} chars)"
    fi
  fi
done

# 2. Append the missing ones (skip vars that already exist + are 32+ chars).
#    Edit the array below to match the audit output.
TO_ADD=(MFA_ENCRYPTION_KEY MFA_SESSION_TOKEN_SECRET)
for V in "${TO_ADD[@]}"; do
  echo "${V}=$(generate)" | sudo tee -a .env >/dev/null
done

# 3. Verify env.ts will accept the file.
sudo docker compose -f docker-compose.yml run --rm --no-deps -T backend \
  node -e "require('./dist/src/config/env')" \
  && echo "[validate] env file is consistent" \
  || echo "[validate] FAIL — re-check missing/short/duplicate values"
```

## After the fix

1. Update GitHub Actions repo secrets so the next CI build can supply
   them to fresh containers (Settings → Secrets and variables → Actions):
   `MFA_ENCRYPTION_KEY`, `MFA_SESSION_TOKEN_SECRET` (and any others the
   audit flagged).
2. Re-trigger the deploy:
   ```bash
   git commit --allow-empty -m "redeploy: secrets aligned post-R16/P3"
   git push origin main
   ```
3. Watch the run:
   ```bash
   gh run watch $(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')
   ```
4. Confirm `/api/health` returns 200 with `database: "up"`:
   ```bash
   curl -fsS https://api.musaium.com/api/health | jq .
   ```
5. Sentry should be quiet for 30 min after the new image is live.

## Future-proofing

- `museum-backend/.env.production.example` was updated in the same
  commit as this runbook so future operators see every required secret
  in the template before they hit `cp .env.production.example .env`.
- Whenever a new clause lands in `env.production-validation.ts`, mirror
  it into the example file in the SAME pull request to prevent the same
  drift recurring.
- Consider gating CI on `node -e "require('./dist/src/config/env')"`
  with the prod env wired in (no secrets leaked — only failure mode
  visible) to catch a missing var BEFORE the deploy step.
