# V2 Pending — Features Deferred from V1 Launch

**Created**: 2026-04-26
**Owner**: @TimKraken (solo)
**Trigger to revisit**: V1.5 / V2 milestone (multi-tenant museums, paid tier, second admin onboarded, OR >100 active users, OR first regulatory inquiry)

This document tracks security / ops features whose code shipped during the 2026-04 audit remediation cycle but whose **operator setup, secret provisioning, or activation is deferred to V2** because the operational cost outweighs V1 risk.

The code is **on `main`**, the workflows are **committed**, the migrations are **revertible**. Activating any item below = register the listed secrets and (optionally) `gh workflow enable <name>`.

## Tracking

Cross-references audit `team-reports/2026-04-26-security-compliance-full-audit.md` and remediation plan `team-reports/2026-04-26-security-remediation-plan.md`.

---

## R13 — DB backup + monthly restore drill (W2.T2)

**Status**: workflows committed, **secrets unset → workflows fail at validate step**.
**Files**: `.github/workflows/db-backup-daily.yml`, `.github/workflows/db-backup-monthly-restore-drill.yml`, `museum-backend/deploy/scripts/pg-backup-local.sh`, `docs/DB_BACKUP_RESTORE.md`.

**V1 fallback**: `pg_dump` cron on the VPS (or operator laptop) → encrypted folder synced to dropbox / iCloud / external drive. RTO/RPO informal.

**V2 trigger**: paying users → SLA enforceable → enterprise restore drill expected.

**Activation steps**:
1. SSH VPS, create RO Postgres role: `CREATE ROLE backup_ro LOGIN PASSWORD '...' ; GRANT pg_read_all_data TO backup_ro;`
2. Export GPG public key from operator keychain (existing dev key).
3. Provision Better Stack heartbeat URL.
4. Register secrets: `DATABASE_URL_RO`, `BACKUP_GPG_PUBLIC_KEY`, `BACKUP_GPG_RECIPIENT`, `BACKUP_GPG_PRIVATE_KEY` (drill-only), `BACKUP_HEARTBEAT_URL`.
5. Test once via `gh workflow run db-backup-daily`.
6. Configure S3 lifecycle (30d daily prefix / 365d monthly prefix).

---

## R17 — TLS Let's Encrypt automation + cert monitor (W2.T5)

**Status**: workflows committed, **secrets unset → workflows fail at validate step**.
**Files**: `.github/workflows/tls-renewal.yml`, `.github/workflows/tls-cert-monitor.yml`, `docs/OPS_DEPLOYMENT.md` § 12.1.

**V1 fallback**: Let's Encrypt + certbot on VPS already auto-renews via the default `certbot.timer` systemd unit installed by the Debian/Ubuntu package. Confirm with `systemctl status certbot.timer`. No additional action needed for renewal itself; the GHA layer is for centralised alerting.

**V2 trigger**: multi-domain TLS (B2B custom domains per museum) OR a single missed renewal in operator history.

**Activation steps**:
1. SSH VPS as root, create restricted deploy user: `useradd -m -s /bin/bash deploy`.
2. Generate dedicated SSH keypair for the GHA renewal job (NOT reusing `SERVER_KEY`).
3. Install the public key into `~deploy/.ssh/authorized_keys` with prefix `restrict,command="sudo /usr/bin/certbot renew --quiet --deploy-hook '/usr/sbin/nginx -s reload'"`.
4. Add sudoers fragment: `deploy ALL=(root) NOPASSWD: /usr/bin/certbot renew, /usr/bin/certbot certificates`.
5. Provision Better Stack heartbeats (renewal + generic alerts).
6. Register secrets: `VPS_HOST`, `VPS_USER=deploy`, `VPS_DEPLOY_SSH_KEY` (private key), `CERT_RENEWAL_HEARTBEAT_URL`, `BETTER_STACK_HEARTBEAT_URL`, `TLS_MONITOR_DOMAINS` (CSV).

---

## R16 — MFA TOTP admin enrollment (W2.T4)

**Status**: backend + frontend code committed, **MFA secrets registered**, **migration auto-runs at next deploy**.
**Files**: `museum-backend/src/modules/auth/useCase/totp/**`, `museum-backend/src/data/db/migrations/1777300000000-AddTotpSecretAndMfaDeadline.ts`, `museum-frontend/features/auth/screens/Mfa*.tsx`, `museum-web/src/app/[locale]/admin/mfa/page.tsx`.

**V1 fallback**: solo admin = single point of failure. Forced enrollment + lost recovery codes = bricked admin. Soft policy (warning 30d) leaves grace period; you can defer enrollment until a second admin (cofounder, support agent) is onboarded so there's a recovery path.

**V2 trigger**: 2nd person with admin role OR sensitive action requiring SOC2 CC6.1 evidence (audit, partner due diligence).

**Activation when ready** (5 minutes):
1. Login as admin → frontend banner shows "MFA required in 30 days" (or "today" if past deadline).
2. Tap "Enroll now" → scan QR with Google Authenticator / 1Password / Bitwarden.
3. **Print or save the 10 recovery codes IMMEDIATELY** — they appear once.
4. Verify the 6-digit code → enrolled.

**Hard rule**: do NOT activate until you have at least one trusted recovery path (paper recovery codes locked safe + a 2nd admin if possible).

---

## R1 — LLM cache scoping Option C hybrid (W1.T1)

**Status**: code shipped, **active in production** since W1 deploy. Currently behaves like single-tenant (most queries land in the `chat:llm:global:*` namespace because Musaium V1 has 1 demo museum).

**V2 trigger**: 2+ museum tenants with active visitors. The user-scoped namespace `chat:llm:user:{userId}:*` becomes load-bearing.

**Action V2**: nothing — it auto-engages the moment a 2nd-tenant flow ships. Track cache hit-rate (Redis INFO) to confirm the global / user split stays close to the modelled 80/20.

---

## Branch protection on `main` (W0.2)

**Status**: protection rules active but **`enforce_admins=false`** (relaxed for solo dev push direct).

**V2 trigger**: 2+ contributors. Re-enable `enforce_admins` + tighten approval count.

**Activation**: `gh api -X PATCH repos/TimMoyence/Innov-mind-museum/branches/main/protection -f enforce_admins=true -f required_pull_request_reviews.required_approving_review_count=1`.

---

## Wave 3 items (per remediation plan, NOT yet executed)

| Tag | Item | V1 verdict | V2 trigger |
|-----|------|------------|------------|
| R9 | Guardrail V2 LLM-Guard staging | Defer — observe-only mode requires sidecar Docker on staging, ops cost > V1 value | Real prompt-injection attempts in chat logs |
| R10 | RN cert pinning POC | Defer — rotation overhead, ATS+HSTS already mitigate | Hostile-WiFi user reports / regulator ask |
| R12 | Log aggregation Better Stack Logs | Defer — Sentry breadcrumbs sufficient V1 | >5 errors/min sustained or forensic gap during incident |
| V3 | RN WebView origin whitelist tighten | Defer — `MuseumMapView` is dev-test variant only V1 | Ship to App Store / Google Play production track |
| V11 | Web admin `/me` revalidation on AdminShell mount | Defer — backend RBAC enforces every endpoint, client bypass = no-op | 2+ admins (paranoia threshold) |
| V13 | Guardrail audit logging | Worth doing V1 — cheap, retro-analysis on attack patterns | Always; do it next free slot |
| R18 | Image digest pinning (pgbouncer / postgres / redis) | Defer — `:latest` is on operator ops trust | Supply-chain incident in Docker Hub history |
| R19 | Vendor risk assessments + 6 vendors | Defer — sub-processors map already covers regulator basics | First B2B partner due diligence |
| R11 | Tabletop exercises (3 scenarios) | Worth doing V1 — written scripts only, no infra cost | Always; do it next free slot |

**Pertinence V1 lean**:
- **Do NOW (cheap + valuable)**: V13 guardrail audit logging, R11 tabletop scripts.
- **Defer**: every other W3 item until V2 trigger fires.

---

## Continuous routines (deferred V1 → start V2)

- **Quarterly access review** (admin grants) — N/A solo.
- **Quarterly secret rotation** — keep manual + ad-hoc; document last rotation in `CI_CD_SECRETS.md`.
- **Quarterly dep audit** — Dependabot weekly already covers.
- **Semi-annual ROPA review** — when you become Data Controller for a B2B museum customer.
- **Annual privacy policy review** — V1 sufficient until first material change.

---

## How to "wake up" a V2-pending item

1. Read this file's section for the item.
2. Run the listed activation steps.
3. Move the section into a new doc `docs/V2_ACTIVE.md` (or delete + git history is enough trace).
4. Update `team-reports/2026-04-26-security-remediation-plan.md` with the activation date.

## How to actively disable a workflow that you DON'T want firing

```bash
gh workflow disable db-backup-daily
gh workflow disable db-backup-monthly-restore-drill
gh workflow disable tls-renewal
gh workflow disable tls-cert-monitor
gh workflow disable breach-72h-timer
```

This stops the cron from firing entirely (the workflow stays in the file tree, just no executions). To re-enable: `gh workflow enable <name>`.

---

**Last reviewed**: 2026-04-26 (W2 close).
