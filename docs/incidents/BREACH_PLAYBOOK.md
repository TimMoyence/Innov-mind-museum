# Musaium — Personal Data Breach Notification Playbook

**Status**: ACTIVE — v1.0 (2026-04-26)
**Owner**: Tech Lead (responsible) + DPO (accountable)
**Audience**: On-call engineers, Tech Lead, DPO, Legal, Executive
**Review cadence**: Quarterly tabletop + after every real incident
**Cross-references**:
[`docs/CI_CD_SECRETS.md`](../CI_CD_SECRETS.md) §_Emergency Key Revocation_,
[`docs/incidents/POST_MORTEM_TEMPLATE.md`](./POST_MORTEM_TEMPLATE.md),
[`.github/ISSUE_TEMPLATE/security-incident.yml`](../../.github/ISSUE_TEMPLATE/security-incident.yml),
[`museum-backend/deploy/rollback.sh`](../../museum-backend/deploy/rollback.sh).

> This playbook is the single source of truth for a confirmed or suspected **personal data breach** under GDPR Art 4(12). It does **not** replace day-to-day operational runbooks. Use this when subject data confidentiality, integrity, or availability has been (or may have been) compromised.

---

## 1. Scope & legal context

### 1.1 Regulatory framework

Musaium processes personal data of EU residents (visitors, admins, support contacts) and is therefore subject to the EU General Data Protection Regulation (Regulation 2016/679 — "GDPR").

**Lead supervisory authority**: France — **CNIL** (Commission Nationale de l'Informatique et des Libertés).
- Notification portal: https://www.cnil.fr/fr/notifier-une-violation-de-donnees-personnelles
- Phone (general): +33 1 53 73 22 22
- Mailing address: 3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, France
- Designated point of contact for Musaium: **TBD — confirm DPO + filed declaration**

**Relevant articles**:
- **GDPR Art 4(12)** — definition of "personal data breach" (confidentiality / integrity / availability).
- **GDPR Art 33** — notification to the supervisory authority **within 72 hours** of becoming aware, *unless* the breach is unlikely to result in a risk to the rights and freedoms of natural persons.
- **GDPR Art 34** — communication to data subjects **without undue delay** when the breach is likely to result in a **high risk** to their rights and freedoms.
- **GDPR Art 32** — security of processing (referenced in the post-mortem to demonstrate appropriate measures).
- **GDPR Art 5(2)** — accountability principle: every step of this playbook must be evidenced.

**Other authorities to consider**:
- **ENISA** — guidance, not enforcement: https://www.enisa.europa.eu/topics/incident-response
- **Other EU DPAs** — only if Musaium establishes operations in another Member State; Art 56 lead-authority mechanism applies via CNIL.
- **Non-EU regulators** — if the breach involves data subjects outside the EU (US states with breach laws, UK ICO post-Brexit, Swiss FDPIC), Legal must assess parallel obligations on a case-by-case basis. Default assumption: EU-only.

### 1.2 Awareness threshold (when does the 72h timer start?)

The Art 33 timer begins when Musaium has a **reasonable degree of certainty** that a security incident has resulted in personal data being compromised. Mere suspicion (e.g., a Sentry spike with no confirmed exfiltration) does **not** start the timer; the on-call must investigate first.

**Decision rule**: as soon as the Tech Lead or DPO declares severity P0 or P1 (see § 3) **and** at least one personal-data category in § 1.3 is impacted, the timer starts. Record `T+0` in the incident issue.

### 1.3 Personal-data categories in scope

Per audit `team-reports/2026-04-26-security-compliance-full-audit.md` § 2 data flow map:

| Category | Source | Persisted | Sensitivity |
|----------|--------|-----------|-------------|
| Account credentials (email, bcrypt hash, role) | Frontend | DB `users` | HIGH |
| Chat text history | Frontend | DB `chat_messages` (180d cron) | HIGH (free-form, may contain personal narrative) |
| Voice audio (visitor questions) | Frontend | S3 + `chat_messages.audioUrl` | HIGH (biometric voice + content) |
| Uploaded images | Frontend | S3 + `chat_messages.imageRef` | MEDIUM-HIGH (may contain people, EXIF GPS) |
| Geolocation (coarse + fine) | Frontend (consent-gated) | DB (coarse persisted) | HIGH if precise |
| Audit logs (IP, UA) | Server | DB `audit_log` (13mo, IP anonymized after grace) | MEDIUM |
| Sentry breadcrumbs | Server | Sentry SaaS | LOW (PII scrubbed) |
| Support tickets | Frontend | DB `tickets` | MEDIUM |

---

## 2. Detection sources

A breach can be detected through any of these channels. On-call must triage **all** alerts even if the source is "low-fidelity".

| # | Source | Where it fires | First reflex |
|---|--------|---------------|--------------|
| 1 | **Sentry alerts** — error rate spike, new high-volume `error` event, performance regression | Sentry project `museum-backend` | Open Sentry issue, check stack trace, look for `unauthorized`, `IDOR`, `auth.*fail` patterns |
| 2 | **Better Stack uptime** — endpoint failure (60s prod / 5min staging) | Better Stack incidents → email/Slack TBD | Run `curl -sf https://api.musaium.com/api/health \| jq .` from a clean network; if down, follow ops runbook before assuming breach |
| 3 | **Audit log anomaly** — admin actions outside business hours, hash chain break (`audit_log.row_hash` mismatch on chain verification job), unusual IP geolocation on admin login | Manual SQL query on `audit_log`; future: alerting cron (TBD) | Snapshot the affected rows immediately (`pg_dump --table=audit_log --where=…`) before any cleanup |
| 4 | **Rate-limit / login lockout spike** — distributed brute-force, credential stuffing | Redis counters (`login-rate-limiter.ts`) + structured logs | Identify victim accounts, force-revoke their refresh families, verify they have not been compromised |
| 5 | **Third-party security disclosure** — researcher email, vendor breach notification (OpenAI / Brevo / Sentry / S3 provider), CERT-FR alert | Email to `security@musaium.com` (TBD — confirm address + monitoring) | Acknowledge within 24h; treat researcher reports under coordinated-disclosure principles |
| 6 | **User report via support ticket** — visitor reports seeing another user's data, account takeover, unknown login | `support` module → ticket triage | Convert ticket to security incident issue; do **not** reply to the user before Legal review of the message |
| 7 | **CI/CD finding** — Trivy CRITICAL gate trip, Gitleaks pre-commit catch, CodeQL/Semgrep nightly find | GitHub Actions logs, PR check failures | Determine whether the finding is **theoretical** (code-only) or **active** (already running in prod); only the latter is a breach |
| 8 | **Internal accidental disclosure** — engineer commits a secret, screenshot leak, misconfigured env file | Engineer self-reports OR detected post-hoc by Gitleaks | Treat all committed secrets as compromised — see § 5.a runbook |

**No alert fatigue allowed**: every detection source must be acknowledged within the SLA defined by the relevant runbook. If on-call is uncertain, escalate one level — over-escalation is preferred to silent delay.

---

## 3. Severity classification

Severity drives the entire response. Use the matrix below at `T+0` and revise as evidence emerges.

| Severity | Definition | Typical examples | Art 33 timer? | Art 34 likely? |
|----------|------------|------------------|---------------|----------------|
| **P0** — Critical | Confirmed mass exposure of personal data, prod credential compromise with active misuse, full DB compromise, or any breach forecast to affect ≥1 000 EU subjects | Production DB exfiltrated; JWT signing secret committed publicly; OpenAI key abused with confirmed prompt-injection campaign reading multiple users' chats | YES — start now | Likely YES |
| **P1** — High | Confirmed exposure of a single user / small cohort; compromise of a critical control with no evidence of mass abuse yet | One user's chat history readable by another via IDOR; OAuth bypass discovered with limited replay window; JWT signing secret leaked but tokens already rotated within minutes | YES — start now | Case-by-case; Legal review |
| **P2** — Medium | Active CVE in a dependency that is exploitable in our stack but not yet exploited; vendor breach affecting Musaium scope but limited data category | Axios SSRF CVE pre-patch with reachable code path; Sentry vendor incident impacting our project but with PII-scrubbing in place | NO unless escalated to P0/P1 | NO |
| **P3** — Low | Policy violation without data exposure; theoretical weakness; near-miss | Missing security header; debug log accidentally enabled in staging; gitleaks false-positive | NO | NO |

**Multipliers** (reuse the `/security-compliance` skill formula, base × multiplier):
- Internet-facing prod: × 2.0
- Sensitive personal data (audio, geo, biometric): × 1.5
- Active exploit ITW: × 2.0
- Compensating controls verified working: × 0.7

**Tie-breaker**: when in doubt, escalate one level. Downgrade is cheap (close the issue with a comment); upgrade is irreversible reputationally.

---

## 4. 72-hour timeline (Art 33 timer)

All times relative to `T+0` = moment severity P0/P1 is declared (see § 1.2). Times are **maxima**, not goals.

| T+ | Action | Owner | Evidence to capture |
|----|--------|-------|---------------------|
| **T+0** | Awareness declared. Open `[INCIDENT] …` GitHub issue using `.github/ISSUE_TEMPLATE/security-incident.yml`. Assign severity. | On-call engineer | Issue ID, detection source, declarer, timestamp UTC |
| **T+15 min** | War room opened (TBD — confirm channel: Slack #incident-prod / Signal / Google Meet bridge). On-call summarises in issue. | On-call → Tech Lead | War-room link in issue |
| **T+1 h** | Severity confirmed. DPO + Legal looped in for P0/P1. Stop-gap containment started. | Tech Lead → DPO | Containment plan link, current blast-radius estimate |
| **T+4 h** | Containment in progress: secrets rotated, sessions revoked, IPs blocked, accounts disabled, suspicious endpoints disabled at the load-balancer. | Backend + DevOps | Commands run + outputs (paste to issue, redact secrets) |
| **T+24 h** | **Preliminary assessment** complete: data classes affected, subject count estimate, geographic scope, regulatory likely (yes/no per § 3), public exposure window. | DPO + Tech Lead | Assessment doc committed to `docs/incidents/<date>-<slug>/preliminary-assessment.md` |
| **T+48 h** | Forensic snapshot: audit log export (pre-purge), S3 versioning check, Postgres PITR cutoff identified, Sentry events archived, attacker IOCs catalogued. | Backend + DevOps | Snapshot SHA-256 hashes recorded in issue |
| **T+72 h** | **CNIL notification submitted** (if Art 33 trigger applies). Use https://www.cnil.fr/fr/notifier-une-violation-de-donnees-personnelles. | DPO + Legal | CNIL receipt number archived in issue |
| **T+72 h ↦ T+7 d** | Subject notification (if Art 34 trigger applies) — coordinated email + in-app notice + privacy-policy update. | Comms + Legal | Mail-out logs, in-app banner deploy commit |
| **T+7 d** | Internal post-mortem published to `docs/incidents/<date>-<slug>/post-mortem.md` using the [POST_MORTEM_TEMPLATE](./POST_MORTEM_TEMPLATE.md). | Tech Lead | PR with template filled |
| **T+30 d** | Corrective action items verified closed (each with linked PR + test). Post-mortem reviewed by Process Auditor. | Tech Lead + Process Auditor | Closed action items with merge commits |

**Late notification (>72h)**: Art 33(1) allows late notification with a documented reason. The post-mortem MUST contain the reason. Do not silently miss the deadline.

---

## 5. Containment runbooks

Each runbook below is a self-contained checklist for one breach archetype. Run only the steps relevant to confirmed or strongly suspected scenario; do not perform destructive actions on a hunch.

> **Generic preamble (run for every scenario)**:
> 1. Open the incident issue (template). Note the source, declarer, severity.
> 2. Notify on-call channel (TBD — confirm tooling: PagerDuty? OpsGenie? Manual phone tree?).
> 3. Snapshot suspect resources **before** rotating: `pg_dump`, audit log export, S3 access-log archive. The point is to preserve forensic evidence.
> 4. Only then proceed to rotation/containment.

### 5.a — JWT signing secret leaked (e.g., committed to git)

**Symptoms**: secret found in a public branch, in a screenshot, in a CI log; or unexpected admin actions traced to a token signed days/weeks ago.

**Containment**:
1. Treat both `JWT_ACCESS_SECRET` **and** `JWT_REFRESH_SECRET` as compromised (defense in depth).
2. Generate new secrets:
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```
3. Rotate per `docs/CI_CD_SECRETS.md` § _Zero-Downtime JWT Rotation_, **Step 2 alternative is forbidden here** — we want immediate invalidation:
   - SSH to VPS, update `.env`, `docker compose -f /opt/museum/docker-compose.prod.yml restart backend`.
4. Force-revoke all refresh families:
   ```sql
   -- via psql on the VPS Postgres container
   UPDATE auth_session SET revoked_at = NOW() WHERE revoked_at IS NULL;
   ```
   Adjust column names if the schema differs; verify with `\d auth_session` first.
5. Force re-login: with both secrets rotated and refresh families revoked, all clients receive 401 on next request and must re-authenticate.
6. Audit GitHub Actions logs for any run that may have used the leaked secret to deploy malicious code.
7. Run `git log` + `gh secret-scanning alerts list` to assess git exposure window.
8. Audit `audit_log` for admin actions during the leak window:
   ```sql
   SELECT id, actor_user_id, action, ip, created_at
   FROM audit_log
   WHERE created_at >= '<leak-start-utc>'
     AND created_at <= NOW()
     AND actor_user_id IS NOT NULL
   ORDER BY created_at;
   ```
9. If the leak occurred via git: scrub history with BFG/git-filter-repo on a fresh clone, force-push **only after** branch protection is temporarily relaxed by an admin and re-applied immediately after.

**Files / scripts referenced**: `docs/CI_CD_SECRETS.md`, `museum-backend/deploy/rollback.sh` (if a malicious deploy rode the leak), `museum-backend/src/modules/auth/useCase/authSession.service.ts`.

### 5.b — Database compromise / SQL injection

**Symptoms**: unexpected DB rows, audit log hash chain break, suspicious queries in logs, hostile actor admits SQLi via support channel.

**Containment**:
1. Put backend in **read-only mode** if possible. Quick lever: stop write-routes via the load-balancer (TBD — confirm whether nginx config supports per-route disable; otherwise stop the backend container and serve a maintenance page).
2. Snapshot the database immediately, **before** any further writes:
   ```bash
   ssh vps 'docker compose -f /opt/museum/docker-compose.prod.yml exec -T postgres \
     pg_dump -U $POSTGRES_USER -Fc $POSTGRES_DB' > /tmp/musaium-incident-$(date +%Y%m%dT%H%M%SZ).dump
   sha256sum /tmp/musaium-incident-*.dump | tee -a /tmp/musaium-incident.sha256
   ```
   Move the dump to a secure storage location (TBD — confirm encrypted off-site bucket).
3. Rotate `DB_PASSWORD` in the VPS `.env`, then restart Postgres + backend. Verify `pg_isready` and `/api/health`.
4. Verify audit log integrity (hash chain) — see `museum-backend/src/shared/audit/audit-chain.ts`. If chain is broken, isolate the affected window and treat **everything** in that window as suspect.
5. Identify scope: which tables, which rows, which columns. Cross-check with the SQL injection vector if known.
6. Determine if PITR (point-in-time recovery) is required (`docs/DB_BACKUP_RESTORE.md` — note: minimal doc; TBD — confirm WAL archive availability).
7. If data was exfiltrated → P0, Art 33 + Art 34 likely.

### 5.c — S3 / object-storage leak

**Symptoms**: unexpected public URL listing, signed-URL TTL bypass detected, bucket misconfiguration revealed by a researcher, anomalous S3 cost spike.

**Containment**:
1. Rotate `MEDIA_SIGNING_SECRET` immediately — invalidates **all** outstanding signed URLs:
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```
   Update `.env` on VPS, restart backend.
2. Pull S3 access logs for the suspect window. List affected object keys:
   ```bash
   aws --endpoint-url=$S3_ENDPOINT s3api list-objects-v2 --bucket $S3_BUCKET --prefix "audio/" --query "Contents[?LastModified>='<window-start>'].Key" --output text
   ```
   (Substitute provider-specific CLI if not S3-API-compatible.)
3. Verify bucket public-access block is **enabled** (operator responsibility — known gap per audit § 5.3; TBD — confirm on prod bucket today).
4. For each affected user-replaceable object: if downstream impact (e.g., images in chat sessions): force re-upload by invalidating local references, OR delete and notify the user.
5. If audio/voice data leaked → biometric category → almost certainly Art 34 trigger.

### 5.d — OAuth bypass (Google / Apple JWKS misuse)

**Symptoms**: unauthorized account access via OAuth route, JWKS rotation lag exploited, missing nonce check abused (known gap, audit § 5.1).

**Containment**:
1. Invalidate **all** OAuth-issued JWTs by rotating `JWT_ACCESS_SECRET` + `JWT_REFRESH_SECRET` (see § 5.a).
2. Force re-authentication of all users.
3. Identify which provider — Google vs Apple — is implicated:
   ```bash
   # via psql
   SELECT provider, COUNT(*) FROM auth_oauth_account
   WHERE created_at >= '<window-start>' GROUP BY provider;
   ```
4. Contact the provider security team:
   - Google: https://www.google.com/appserve/security-bugs/m2/new
   - Apple: https://developer.apple.com/security-bounty/ + product-security@apple.com
5. Apply temporary mitigation: block the OAuth route at the load-balancer if active exploitation is in progress; visitors can still use email/password.
6. Patch the missing nonce / JWKS check (known backlog per audit) before re-enabling.

### 5.e — OpenAI / LLM API key abuse, cost spike, or prompt-injection campaign

**Symptoms**: OpenAI cost dashboard shows spike, OpenAI sends abuse notice, repeated guardrail blocks from identical user-agent or IP, sudden surge in chat sessions.

**Containment**:
1. Rotate `OPENAI_API_KEY` (and `DEEPSEEK_API_KEY`, `GOOGLE_API_KEY` if reused as a fallback) — see `docs/CI_CD_SECRETS.md` § _External API Key Rotation_.
2. Set a hard budget cap in the OpenAI dashboard (TBD — confirm current monthly cap and alarm thresholds).
3. Audit chat sessions for prompt-injection patterns:
   ```sql
   SELECT cs.user_id, cs.id AS session_id, COUNT(*) AS msg_count, MIN(cm.created_at), MAX(cm.created_at)
   FROM chat_messages cm JOIN chat_sessions cs ON cs.id = cm.session_id
   WHERE cm.created_at >= '<window-start>'
   GROUP BY cs.user_id, cs.id
   HAVING COUNT(*) > 50
   ORDER BY msg_count DESC LIMIT 20;
   ```
4. Cross-check guardrail logs (once V13 lands, per remediation plan; current: only Sentry breadcrumbs).
5. If the campaign exfiltrated other users' chats via the LLM cache leak (R1, audit § 4 / V4), this becomes a **personal data breach** — escalate to P1 minimum.
6. Disable specific abusing accounts via admin route. Block source IPs at the load-balancer.

### 5.f — Supply-chain compromise (npm package, container image)

**Symptoms**: Trivy nightly scan flags new CRITICAL in a dependency that just bumped; Socket.dev / npm advisory; unexpected outbound connections from CI or prod containers; Dependabot opens a high-severity PR.

**Containment**:
1. Lock the dependency tree where the change occurred. For backend: `museum-backend/pnpm-lock.yaml`. For frontend: `museum-frontend/package-lock.json`. For web: `museum-web/pnpm-lock.yaml`.
2. Pin the previous known-good version in `package.json`, regenerate the lock, push a hotfix branch.
3. Identify the affected version range and whether prod containers were ever built **with** the bad version:
   ```bash
   ssh vps 'docker compose -f /opt/museum/docker-compose.prod.yml images --quiet backend'
   # Then trace the SHA back to the GitHub Actions run that built it.
   ```
4. If yes: rebuild the image with the pinned (known-good) digest, force a redeploy. Run `museum-backend/deploy/rollback.sh` if the most recent deploy rode the bad version.
5. Audit prod container egress for the suspect window (TBD — confirm whether VPS egress logging is enabled at the docker-network or host level).
6. If a credential-stealing package was installed: treat **all** secrets the container had access to as compromised. Run § 5.a, § 5.c, § 5.e in parallel.

---

## 6. Escalation tree

```
                    (T+0)  Detection source / On-call engineer
                                       │
                            (T+15 min) │
                                       ▼
                    Tech Lead / CTO ◄──── ── war room opened
                                       │
                              (T+1 h)  │  (severity P0/P1 confirmed)
                                       ▼
                                     DPO ◄────── Data classes assessed
                                       │
                              (T+4 h)  │  (Art 33/34 trigger evaluated)
                                       ▼
                                     Legal ◄──── notification drafting
                                       │
                                       ▼
                              External Comms ◄── public-statement drafting
                                       │
                                       ▼
                                      CEO ◄───── final sign-off on
                                                 CNIL submission +
                                                 subject notification
```

**Roles** (confirm assignments before next quarterly review):
- **On-call engineer**: TBD — confirm rotation schedule (PagerDuty / OpsGenie / shared calendar).
- **Tech Lead / CTO**: TBD — confirm name + backup.
- **DPO** (Data Protection Officer): TBD — Musaium has not yet **designated** a DPO. GDPR Art 37 may not strictly require one for a V1 visitor app, but the role's responsibilities (Art 38–39) must be assigned to someone. Confirm with Legal.
- **Legal**: TBD — confirm external counsel + retainer, or in-house equivalent.
- **External Comms**: TBD.
- **CEO**: founder / equivalent.

**Contact methods** (all TBD — confirm tooling):
- Primary on-call: TBD — phone + Signal preferred, encrypted messaging mandatory for breach-related contents
- War-room channel: TBD — Slack / Teams / Signal group
- Out-of-band fallback: phone tree (printed copy off-network)
- CNIL contact: phone + portal (see § 1.1)

---

## 7. Communication templates

### 7.a — CNIL notification (FR)

Submit via https://www.cnil.fr/fr/notifier-une-violation-de-donnees-personnelles. The CNIL portal will request:

> **Notification de violation de données personnelles**
>
> **Identité du responsable de traitement**: Musaium SAS (TBD — confirm legal entity name + SIREN + RCS)
>
> **DPO / point de contact**: [Nom, fonction, email, téléphone — TBD]
>
> **Date et heure de la violation**: [début estimé UTC] — [détection UTC]
>
> **Date de prise de connaissance**: [T+0 UTC]
>
> **Nature de la violation**:
> - [ ] confidentialité (accès non autorisé)
> - [ ] intégrité (altération non autorisée)
> - [ ] disponibilité (perte / destruction)
>
> **Catégories de données concernées**: [cocher selon § 1.3 ci-dessus]
>
> **Catégories de personnes concernées**: [visiteurs / administrateurs / utilisateurs support]
>
> **Nombre approximatif de personnes**: [estimation à T+24h]
>
> **Nombre approximatif d'enregistrements**: [estimation]
>
> **Conséquences probables**: [reprendre l'évaluation Art 34]
>
> **Mesures prises ou proposées**: [containment runbook exécuté + actions correctives planifiées]
>
> **Communication aux personnes concernées**: [oui / non — si non, justifier (Art 34(3))]
>
> **Pièces jointes**: rapport préliminaire, post-mortem (si déjà publié)

### 7.b — Subject notification (EN)

> **Subject**: Important security notice regarding your Musaium account
>
> Dear [name or "Musaium user"],
>
> We are writing to inform you of a security incident that may have affected your personal data. We take this very seriously and want to be transparent about what happened, what we have done, and what you should do.
>
> **What happened**: On [DATE], we discovered [brief, factual description — no speculation, no minimisation]. We confirmed on [DATE] that the incident affected [data class(es) per § 1.3]. The total period of exposure was [start UTC] — [end UTC].
>
> **What data was involved**: [list the categories from § 1.3 — be specific]. We have **no evidence** that [things you can credibly rule out, e.g., passwords were exposed because they are stored only as bcrypt hashes].
>
> **What we have done**: [3-5 bullets of containment + corrective actions]. We have notified the French data-protection authority (CNIL) on [DATE], notification reference [REF].
>
> **What you should do**:
> 1. [Action 1 — e.g., reset your password if credentials were touched]
> 2. [Action 2 — e.g., review your account activity]
> 3. Be cautious of phishing attempts referring to this incident; we will never ask for your password by email.
>
> **Where to learn more**: [URL to public statement / privacy policy update].
>
> **Contact**: support@musaium.com (TBD — confirm). For data-protection questions: [DPO email — TBD].
>
> We are sorry for the concern this may cause. We are committed to learning from this incident and strengthening our protections.
>
> The Musaium team

### 7.c — Subject notification (FR)

> **Objet** : Information importante concernant la sécurité de votre compte Musaium
>
> Bonjour,
>
> Nous vous écrivons pour vous informer d'un incident de sécurité ayant pu affecter vos données personnelles. Nous prenons cette situation très au sérieux et souhaitons être transparents sur ce qui s'est passé, sur ce que nous avons fait et sur ce que vous devez faire.
>
> **Ce qui s'est passé** : le [DATE], nous avons détecté [description factuelle brève — pas de spéculation, pas de minimisation]. Nous avons confirmé le [DATE] que l'incident concernait [catégorie(s) de données § 1.3]. La période d'exposition était [début UTC] — [fin UTC].
>
> **Données concernées** : [lister les catégories — être précis]. Nous n'avons **aucune preuve** que [éléments crédiblement écartés, ex. les mots de passe ne sont pas exposés car stockés uniquement sous forme de hash bcrypt].
>
> **Actions entreprises** : [3 à 5 puces — endiguement + correctifs]. Nous avons notifié la CNIL le [DATE], référence [REF].
>
> **Ce que vous devez faire** :
> 1. [Action 1 — ex. réinitialiser votre mot de passe si des identifiants étaient concernés]
> 2. [Action 2 — ex. vérifier l'activité de votre compte]
> 3. Restez vigilant face aux tentatives de phishing faisant référence à cet incident ; nous ne vous demanderons jamais votre mot de passe par email.
>
> **Plus d'informations** : [URL de la déclaration publique / mise à jour de la politique de confidentialité].
>
> **Contact** : support@musaium.com (TBD — à confirmer). Pour les questions liées à la protection des données : [email DPO — TBD].
>
> Nous regrettons l'inquiétude que cet incident peut occasionner. Nous nous engageons à en tirer toutes les leçons et à renforcer nos protections.
>
> L'équipe Musaium

---

## 8. Cross-references

| Topic | Reference |
|-------|-----------|
| Secret rotation procedures | [`docs/CI_CD_SECRETS.md`](../CI_CD_SECRETS.md) § _Emergency Key Revocation_ |
| Auto-rollback on deploy failure | [`museum-backend/deploy/rollback.sh`](../../museum-backend/deploy/rollback.sh) |
| Audit log structure & hash chain | `museum-backend/src/shared/audit/audit-chain.ts`, `audit.service.ts` |
| Audit IP anonymization (13mo retention) | `museum-backend/src/shared/audit/audit-ip-anonymizer.job.ts` |
| Chat session purge cron (180d) | `museum-backend/src/modules/chat/jobs/chat-purge.job.ts` *(S3 orphan gap — see audit V5 / R4)* |
| Post-mortem template | [`docs/incidents/POST_MORTEM_TEMPLATE.md`](./POST_MORTEM_TEMPLATE.md) |
| Incident GitHub issue template | [`.github/ISSUE_TEMPLATE/security-incident.yml`](../../.github/ISSUE_TEMPLATE/security-incident.yml) |
| Audit findings driving this playbook | `team-reports/2026-04-26-security-compliance-full-audit.md` § 1 (RS function), § 2 (GDPR Art 33/34 gap), § 4 (V12) |
| Remediation plan context | `team-reports/2026-04-26-security-remediation-plan.md` § W0.3 + § W1.T5 |

---

## 9. Open items (confirm before first use in anger)

The placeholders below MUST be filled in before this playbook is relied upon for a real incident. Treat the list as the v1.1 backlog.

- [ ] DPO designated and recorded in privacy policy + this playbook (§ 6).
- [ ] Tech Lead / CTO + backup named (§ 6).
- [ ] On-call rotation tooling chosen and primary phone numbers stored off-network (§ 6).
- [ ] War-room channel chosen (Slack / Signal / Teams) — § 4 + § 6.
- [ ] `security@musaium.com` mailbox provisioned and monitored — § 2 row 5.
- [ ] CNIL declaration of legal entity filed (SIREN/RCS confirmed) — § 7.a.
- [ ] Off-site encrypted backup bucket for incident snapshots (§ 5.b step 2).
- [ ] WAL archive / PITR availability verified — § 5.b step 6.
- [ ] Public-access block on prod S3 bucket verified (audit § 5.3 gap) — § 5.c step 3.
- [ ] OpenAI hard budget cap + alarm thresholds confirmed — § 5.e step 2.
- [ ] VPS egress logging strategy confirmed — § 5.f step 5.
- [ ] First tabletop exercise scheduled within 90 days using one of the § 5 scenarios.
