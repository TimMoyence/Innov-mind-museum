# Runbook — Secrets Rotation

**Owner**: Platform / SRE
**Date**: 2026-04-30 (initial)
**Audit ref**: banking-grade hardening design (deleted 2026-05-03 — see git commit history)

## Cadence

| Secret | Cadence | Driver |
|---|---|---|
| `JWT_ACCESS_SECRET` | every 90 days | OWASP / SOC2 CC6.1 — bound key for access tokens; access tokens have 15min TTL so a 90d rotation gives ample dual-key window |
| `JWT_REFRESH_SECRET` | every 90 days | refresh family revocation can purge in-flight tokens; absolute TTL is 14d (post-F8) so rotation soak is cheap |
| `JWT_MFA_SECRET` (`MFA_SESSION_TOKEN_SECRET`) | every 90 days | bound to the 5min MFA session window |
| `MFA_ENCRYPTION_KEY` | every 180 days | TOTP secrets at rest; rotation requires re-encrypt of `totp_secrets.secret_encrypted` (see "Re-encryption" below) |
| `MEDIA_SIGNING_SECRET` | every 180 days | signed S3 URLs — cap is 24h so leak window after rotation is bounded |
| `CSRF_SECRET` (post-F7) | every 90 days | HMAC binding for csrf_token cookie; rotation invalidates outstanding double-submit tokens (web users see one /refresh after rotation) |
| `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` / `GOOGLE_API_KEY` | every 180 days | OR on detection of leak. Vendor dashboards are the source of truth. |
| `SENTRY_DSN` | only on compromise | DSN is not a credential per se but rotate if exfiltration is suspected |
| `BREVO_API_KEY` | every 180 days | transactional email key |

## Procedure — Standard rotation

For any of the JWT_* / CSRF_SECRET / MEDIA_SIGNING_SECRET secrets:

1. **Generate** the new value:
   ```bash
   openssl rand -base64 48 | tr -d '\n'
   ```
   Store in 1Password / vault under the existing entry name as a NEW version (do not overwrite the old version).

2. **Dual-key window — deploy the new value as `<NAME>_NEW`** alongside the still-active `<NAME>` env var. Backend must be updated to accept BOTH (see "Dual-key acceptance" implementation note below). Soak: **72 hours**.

3. **Cut over** — promote `<NAME>_NEW` → `<NAME>`, remove the old value. The next deploy invalidates any tokens signed with the old secret. For JWT_REFRESH_SECRET, family revocation is automatic: refresh tokens minted under the old secret will be re-signed (rotation event) under the new secret.

4. **Verify** via:
   ```bash
   pnpm smoke:api          # backend smoke
   curl -X POST $BASE_URL/api/auth/login ...    # manual login → /me round-trip
   ```

5. **Document** in `docs/RUNBOOKS/secrets-rotation-log.md` (append-only ledger): date, secret name, operator, soak start, cut-over, validation result.

## Procedure — MFA_ENCRYPTION_KEY (re-encryption required)

This key encrypts TOTP secrets at rest in `totp_secrets.secret_encrypted`. Rotation requires decrypting with the old key and re-encrypting with the new key, atomically.

1. Schedule a maintenance window (no enrollment / verify traffic, or run during low-traffic hours).
2. Generate new key (32 raw bytes, base64-encoded — see existing format).
3. Set `MFA_ENCRYPTION_KEY_PREVIOUS=<old>` and `MFA_ENCRYPTION_KEY=<new>` in env. Backend reads both: encrypt with NEW, decrypt-fallback to PREVIOUS.
4. Run a one-shot script `scripts/rotate-mfa-encryption-key.cjs` (TODO — Phase 2 deliverable; for now, manual SQL+TS):
   - For each row in `totp_secrets`: decrypt with PREVIOUS, re-encrypt with NEW, UPDATE.
   - Verify zero rows still encrypted under PREVIOUS (compare ciphertext header byte).
5. Remove `MFA_ENCRYPTION_KEY_PREVIOUS` from env. Deploy.
6. Document.

## Procedure — LLM provider API keys

OPENAI_API_KEY and friends:

1. Generate a new key in the provider dashboard (e.g. platform.openai.com).
2. Set both `OPENAI_API_KEY=<new>` AND `OPENAI_API_KEY_LEGACY=<old>` in env. (Implementation note: backend currently reads only the canonical name; a follow-up PR can add fallback. Until then, the rotation is "atomic" — one deploy with the new key, accept brief in-flight failures.)
3. Disable the old key in the provider dashboard 24h after the deploy succeeds.
4. Monitor Sentry for `llm_api_key_invalid` events.

## Dual-key acceptance — implementation note

For JWT_*, the production code currently reads only the canonical env name (`JWT_ACCESS_SECRET`, etc). Adding "accept old + new" support is a Phase 2 deliverable and is REQUIRED before the first scheduled rotation. Tracked as a follow-up under the F-DiD scope.

Until the dual-key path ships, rotations are "hard cut-over": one deploy invalidates all in-flight tokens. For JWT_ACCESS_SECRET this is a 15-minute window. For JWT_REFRESH_SECRET this is up to 14 days (one re-login per user). Schedule rotations during low-traffic windows.

## Compromise (out-of-cycle rotation)

If a secret is suspected leaked:

1. **Immediately** rotate using the standard procedure but with **0-hour soak** — deploy the new value and invalidate the old in the same deploy.
2. **Force-revoke** all refresh tokens for the affected secret family:
   ```sql
   UPDATE refresh_tokens SET revoked_at = NOW(), reuse_detected_at = NOW() WHERE expires_at > NOW();
   ```
3. **Audit** the access logs for the leak window (Sentry breadcrumbs + Postgres audit log) — look for unusual requests using the leaked secret.
4. **Notify** users by email if the leak window includes any user-facing token issuance (regulatory obligation depends on the secret; defer to legal).
5. **Post-mortem** within 48h.

## Automation backlog

- [ ] Add `MFA_ENCRYPTION_KEY_PREVIOUS` env support + re-encrypt script.
- [ ] Add dual-key support for JWT_*: read `<NAME>` AND `<NAME>_PREVIOUS`, accept either at verify, sign with `<NAME>` only.
- [ ] GitHub `/schedule` recurring agent: 90-day cadence reminder for JWT_* secrets, 180-day for the rest.
- [ ] OpsGenie / PagerDuty integration: alert when a secret is >cadence + 14d without rotation.

## References

- [OWASP Cheat Sheet — Cryptographic Storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [SOC2 CC6.1](https://www.aicpa-cima.com/) — Logical access controls
- `museum-backend/src/config/env.production-validation.ts` — runtime checks on secret distinctness + length
- `museum-backend/scripts/migration-cli.cjs` — TypeORM migration tooling (precedent for one-shot DB scripts)
