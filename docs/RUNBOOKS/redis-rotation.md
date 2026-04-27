# Redis Password Rotation Runbook

**Cadence** : every 90 days (SOC2 CC6.3)
**Last rotation** : tracked in the auto-opened GitHub issue (`security/redis-rotation` label)
**Estimated downtime** : 0 (rolling reconnect; ioredis handles AUTH retries)

## Trigger

- Auto-opened issue from `.github/workflows/redis-rotation-reminder.yml` (every 90 days)
- Confirmed credential exposure (rotate immediately, skip the wait)
- Operator handover (rotate to invalidate the leaving operator's local copies)

## Pre-flight

1. Confirm staging Redis instance is reachable and you can SSH to the prod VPS.
2. Confirm `REDIS_PASSWORD` is the **only** secret on this rotation (do not bundle with other rotations — easier to revert).
3. Generate the new password locally:

   ```bash
   openssl rand -base64 48 | tr -d '+/=' | head -c 48
   ```

   The 48-char floor matches `assertSecretLength` in `env.production-validation.ts` (P3.1) which refuses to boot below 32 chars.

## Procedure

### 1. Stage the new password

```bash
# On your laptop — never on the VPS shell history
NEW_PW="$(openssl rand -base64 48 | tr -d '+/=' | head -c 48)"
```

### 2. Update GitHub Actions secrets

Update both:
- Repository secret `REDIS_PASSWORD` (used by deploy workflow)
- VPS env file `/srv/museum/.env` line `REDIS_PASSWORD=...`

The VPS `.env` is the source of truth at runtime; GitHub secret is the source of truth for re-deploys.

### 3. Apply on staging first

```bash
ssh deploy@staging.musaium.com
cd /srv/museum
sed -i.bak "s/^REDIS_PASSWORD=.*/REDIS_PASSWORD=${NEW_PW}/" .env
docker compose -f docker-compose.prod.yml up -d --force-recreate redis backend-staging
```

Watch the backend logs for `[redis] connected` for ~60 s. If you see `NOAUTH Authentication required` or `WRONGPASS`, the env was not picked up — fall back via `git checkout -- .env.bak`.

### 4. Validate staging

- Hit `/api/health` — expect `database: 'up'`
- Make a test login → ensure session creation works (uses Redis rate-limit bucket)
- Watch Sentry for spikes in `RedisError` over the next 10 min

### 5. Apply on prod

Same steps as staging, on `prod.musaium.com`. Do this during an off-peak window (UTC 02:00–05:00 typical).

### 6. Verify and close

- `/api/health` PASS
- Sentry quiet for 30 min
- Close the rotation reminder issue with a comment:
  ```
  Rotated <date> by <operator>. Next rotation due <date + 90 days>.
  ```

## Rollback

If the new password is rejected (typo, encoding artifact):

```bash
ssh deploy@<host>
cd /srv/museum
mv .env.bak .env
docker compose -f docker-compose.prod.yml up -d --force-recreate redis backend
```

Then regenerate and retry from step 3.

## Notes

- `env.production-validation.ts` rejects passwords < 32 chars or matching any signing secret (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `MEDIA_SIGNING_SECRET`). The container will fail to boot rather than start with a weak Redis credential.
- Redis data volume (`redis_data`) survives the restart; rate-limit buckets and LLM cache are preserved across the rotation.
- If you need to invalidate all sessions intentionally (e.g. after an incident), pair the rotation with a `JWT_ACCESS_SECRET` rotation in the same window.
