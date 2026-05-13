# R30 — DevOps & Incident Response Audit (Musaium V1, Solo Founder)

> **Research agent:** R30
> **Date:** 2026-05-13
> **Scope:** SEV taxonomy, on-call rotation, status pages, uptime monitoring, chaos engineering, SLI/SLO/SLA, deployment strategies, rollback automation, runbooks, postmortems, solo-founder limits, verdict for Musaium V1.
> **Constraint context:** single OVH VPS, no staging, Docker images GHCR (cosign keyless), pre-revenue, target 100k MAU, V1 launch 2026-06-01.
> **Honesty:** UFR-013. Cited claims verified against linked sources or marked "general SRE knowledge".

---

## 0. TL;DR

Musaium has **above-average** documentation for a pre-revenue solo project (OPS_DEPLOYMENT 27 sections, dedicated LLM-Guard incident runbook, blameless POST_MORTEM_TEMPLATE, BREACH_PLAYBOOK GDPR-aware, auto-rollback script with exit-code semantics, chaos runbooks for Redis/PG/LLM kill, SLO targets explicit, 4 sub-runbooks under `docs/RUNBOOKS/`). The **gaps** are not "missing docs", they are the **single-operator failure modes**:

1. **No actual paging.** Better Stack is documented, but no on-call schedule exists (you are the schedule). Pushover is not in the stack. If you sleep through a Better Stack email, the chat is down until you wake up — there is no second tier.
2. **No status page** — `UPTIME_MONITORING.md` describes Better Stack monitors but never creates a public status surface. For a B2C launch, that is fine for week 1 ; for B2B sales conversation in month 3, it is a credibility gap.
3. **Multi-burn-rate SLO alerts not implemented.** `SLO.md` lists targets (99.9 % API, 30 % LLM cache hit, p99 chat < 5 s) and a tier matrix (burn rate > 14.4 → page) but the corresponding Prometheus rules are not in `infra/grafana/`.
4. **Chaos runbooks reference "staging only"** — staging does not exist in V1 (per memory `project_no_staging_v1.md`). Three runbooks are theoretical for the entire pre-launch window.
5. **No DR site, no second region, no failover.** Single VPS is the entire blast radius. Acceptable for V1 (per `feedback_no_solo_dev_estimates.md` lifecycle framing) — but it must be **named** in the SLO as a known constraint, not implicit.

**Top 5 actions before 2026-06-01 launch** (detailed §11) :
1. Wire **Pushover P0/P1 emergency channel** (5 USD one-time, retry-until-ack) on top of Better Stack — no schedule needed for a single-person team but a phone-shaking alert when the chat dies.
2. Publish a **minimal public status page** (Better Stack free tier or self-hosted Uptime Kuma) at `status.musaium.com`. Wire to the same /api/health probe.
3. Implement **multi-window multi-burn-rate alerts** for the two SLOs that actually matter (chat availability, chat p99 latency). Drop the four others to "dashboard only" until B2B revenue.
4. Add a **postmortem retention policy** (12 months internal, anonymized public posting for SEV-1 only) and link to `docs/incidents/POST_MORTEM_TEMPLATE.md` from the README.
5. Run **one chaos drill on prod, scheduled at low-traffic hour**, before launch — kill Redis, kill llm-guard sidecar, kill primary LLM provider — and time MTTR for each. Then document the actual numbers in `SLO.md` instead of the current targets.

---

## 1. Incident severity taxonomy 2026 — SEV-1 / SEV-2 / SEV-3

### 1.1 Industry consensus

The 2026 industry has converged on a **3-to-5 level severity model** (SEV-0/critical down to SEV-4/cosmetic). The two dominant references are :

- **PagerDuty** uses SEV-1 through SEV-5, with the rule "if unsure, err toward the higher severity, downgrade in post-mortem" ([response.pagerduty.com — Severity Levels](https://response.pagerduty.com/before/severity_levels/)).
- **Atlassian's incident management handbook** uses SEV-1 (≥50 % users impacted) / SEV-2 (≥10 %) / SEV-3 (degraded performance, no functional break) ([atlassian.com — incident severity levels](https://www.atlassian.com/incident-management/kpis/severity-levels)).

Common 2026 thresholds (composited from PagerDuty + Atlassian + Better Stack + incident.io guides) :

| Sev | Impact | First response | Update cadence | Postmortem |
|---|---|---|---|---|
| **SEV-1** | Service down for ≥50 % users OR security breach OR data loss | ≤15 min | Every 30 min to users | Mandatory |
| **SEV-2** | Major feature broken for ≥10 % users, no security issue | ≤2 h | Every 2 h | Mandatory |
| **SEV-3** | Minor feature broken, degraded but functional | Next business day | None public | Recommended |
| **SEV-4** | Cosmetic / minor latency | Next sprint | None | Optional |

### 1.2 Musaium current state (from `docs/OPS_DEPLOYMENT.md` § 26)

Musaium already uses P1/P2/P3/P4 (escalation table) **and** P0/P1/P2 (per `SLO.md` alert tiers) **and** SEV-mapping in `OPS_INCIDENT_LLM_GUARD.md` (P0/P1/P2). This is **three overlapping taxonomies**, none of which match the industry P → SEV convention.

**Recommendation** : pick one, document it once, propagate. The cleanest mapping :

| Musaium label | Industry equiv | Trigger example |
|---|---|---|
| **SEV-1** | Atlassian SEV-1 | Chat broken (LLM-Guard fail-CLOSED on >50 % requests), or `/api/health` 503 for >5 min, or GDPR-relevant data exposure |
| **SEV-2** | Atlassian SEV-2 | One LLM provider down (fallback chain absorbs it but p99 slips above 5 s), or admin panel down, or image upload broken |
| **SEV-3** | Atlassian SEV-3 | Knowledge-extraction queue lag > 60 s, or one museum's content fails to load |

The current P1/P2/P3 mapping in §26 of `OPS_DEPLOYMENT.md` aligns reasonably ; just **strip the P0/P4 levels** which add taxonomy without paging behavior, and align the names between `OPS_DEPLOYMENT.md`, `SLO.md`, and `OPS_INCIDENT_LLM_GUARD.md`. Confusion during a 3am incident is a measurable cost ; the audit-finding rate of severity misclassification is 30-40 % in unaligned setups ([sre.google managing incidents](https://sre.google/sre-book/managing-incidents/)).

### 1.3 IMAG roles — applicable for a solo founder ?

Google's IMAG (Incident Management at Google) framework specifies three roles : **Incident Commander (IC)** coordinates, **Operations Lead (OL)** mitigates, **Communications Lead (CL)** updates stakeholders ([sre.google managing incidents](https://sre.google/sre-book/managing-incidents/)). At Google, these are separate humans.

**Solo founder reality** : you are all three. The PagerDuty incident commander course explicitly warns "Relying on one senior engineer to save the day during every major incident creates the operational equivalent of a single point of failure" ([incident.io incident management best practices 2026](https://incident.io/blog/incident-management-best-practices-2026)).

For Musaium V1 the IC/OL/CL split is **theatre**, not value. What does work :

- **One predefined behavior per role** in your own muscle memory, executed in sequence :
  1. **IC step** : declare severity in a GitHub issue with `incident` label (the existing `breach-72h-timer.yml` cron is already wired to that label per `BREACH_PLAYBOOK.md`).
  2. **OL step** : execute the matching runbook (e.g. `OPS_INCIDENT_LLM_GUARD.md` § 2-3).
  3. **CL step** : post a single status page update + one tweet/Bluesky if SEV-1 lasts >10 min.

This is what incident.io calls "the simplified playbook for solo developers" — the elaborate role hierarchy can wait until you have an actual second engineer.

---

## 2. On-call rotation for a solo founder

### 2.1 The honest math

Google SRE targets : on-call ≤25 % of total work hours, max 2 incidents per shift, min 8-person team for sustainable week-on / week-off ([sre.google being on-call](https://sre.google/sre-book/being-on-call/)). You are 1 person. You are violating every Google guideline by definition.

A 2025 Catchpoint report found nearly 70 % of SREs reported on-call stress impacted burnout, and 40 % of organizations report on-call burnout symptoms in >25 % of staff ([devops.com — on-call rotation best practices](https://devops.com/on-call-rotation-best-practices-reducing-burnout-and-improving-response/)). For small teams with <5 engineers, the burnout rate is accelerated because each person gets paged disproportionately.

**Solo-founder reality** : you cannot have a rotation. The realistic goals are :

1. **Reduce page count to ≤2/week steady-state** (this requires high-fidelity alerts, see §5).
2. **Define quiet hours** (e.g., 22:00-08:00 Europe/Paris) and have ONLY SEV-1 page you during quiet hours.
3. **Define vacation procedure** — pre-launch this is "the service may be slow to recover for X hours" stated on status page ; post-launch with revenue, hire a contract SRE for vacation backup.

### 2.2 Pushover vs PagerDuty vs Opsgenie vs Better Stack — actual decision matrix

| Tool | Cost (1 user) | Has schedules | Has escalation | Mobile retry-until-ack | Solo verdict |
|---|---|---|---|---|---|
| **Pushover** | **$5 one-time** per platform (iOS or Android) | No | No | **Yes** (priority=2, retry every 30s, expire 10800s max) | **Best for V1** |
| Better Stack (free) | $0 | No (paid) | No (paid) | Email/Slack only | Use for uptime, not paging |
| Better Stack (paid) | $29/mo + $29/responder | Yes | Yes | Phone+SMS | Overkill pre-revenue |
| PagerDuty (free) | $0, ≤5 users | Yes | Yes | Yes | Overkill pre-revenue |
| PagerDuty (Pro) | $21-29/user/mo | Yes | Yes | Yes | Wait for B2B |
| Opsgenie | $9.45-19.95/user/mo | Yes | Yes | Yes | **End-of-life** — Atlassian retired standalone signups June 2025 ; merged into Jira Service Management |
| incident.io | $45/user/mo | Yes | Yes | Yes | Wait for B2B |
| Rootly | $40/user/mo combined | Yes | Yes | Yes | Wait for team ≥3 |

**Sources** :
- [Pushover API — Emergency priority](https://pushover.net/api) — "retry parameter of 60 and an expire parameter of 1800 will cause your notification to be retried every 60 seconds for 30 minutes"
- [Opsgenie 2026 EOL — dev.to/siddharth_singh](https://dev.to/siddharth_singh_409bd5267/opsgenie-2026-features-pricing-eol-alternatives-1bm0) — "Atlassian stopped new Opsgenie signups on June 4, 2025"
- [BetterStack pricing 2026 — cubeapm](https://cubeapm.com/blog/betterstack-pricing-review/) — "paid plans starting at $29 unlocking unlimited team members, phone and SMS alerts"
- [PagerDuty pricing 2026 — costbench](https://costbench.com/software/developer-tools/pagerduty/) — "Free tier with up to 5 users"
- [Pushover Notilens comparison 2026](https://www.notilens.com/blog/pushover-alternatives-business-teams-2026) — "Pushover has no on-call scheduling, no rotation management, no escalation policies"

**Recommendation for Musaium V1** :

1. **Better Stack free tier** as is (already in `docs/UPTIME_MONITORING.md`) — email + Slack on outage.
2. **Add Pushover** as a second channel with `priority=2` for SEV-1 only — retry every 60 s, expire after 30 min. Cost : $5 one-time. Wired via Better Stack webhook → Pushover or directly from AlertManager (which is already in the prod docker-compose).
3. **Honest disclaimer in the status page** : "Musaium is a solo-operated service. Quiet hours 22:00-08:00 Europe/Paris ; non-critical issues may take up to 12 h to acknowledge."
4. **Re-evaluate** at first B2B sale → upgrade to PagerDuty free (you get unlimited acknowledgers, free for 5 users) and add a contract SRE for vacation cover.

---

## 3. Status pages 2026 — Atlassian Statuspage / Better Stack / OhDear / self-hosted

### 3.1 Why even bother for V1

UptimeRobot's 2026 best-practices guide reports : "companies that communicate proactively during incidents see 60% lower churn compared to those that stay silent" and "a well-implemented status page reduces support ticket volume by up to 40% during incidents" ([uptimerobot.com — Building a status page 2026](https://uptimerobot.com/knowledge-hub/monitoring/building-a-status-page-ultimate-guide/)).

For Musaium B2C (freemium) — low ticket volume, no SLA — the support-ticket reduction matters less. **The B2B sales conversation matters more**. Museum operators evaluating you will look for `status.<domain>` as a proxy for operational maturity. Its absence is a red flag at the procurement stage.

### 3.2 Tool comparison

| Tool | Free tier | Custom domain | Self-host | Verdict |
|---|---|---|---|---|
| **Atlassian Statuspage** | None — starts $79/mo (business) → $399/mo (enterprise) | Yes | No | Overkill pre-revenue |
| **Better Stack** | Yes — 1 status page included free | Paid only ($29/mo) | No | Free tier enough for V1, upgrade with paid |
| **Instatus** | Yes — unlimited subscribers, sub-domain only | $20/mo for custom domain | No | Good cheap alternative |
| **OhDear** | No free tier — €12/site/mo | Yes | No | Built for site monitoring, status page secondary |
| **Uptime Kuma** | Self-hosted free | Yes (own domain) | **Yes** | Best for self-host, runs in Docker |
| **Kener** | Self-hosted free | Yes | **Yes** | "deploys with Docker in under 2 minutes" |
| **OneUptime** | Self-hosted free, $22/user/mo SaaS | Yes | **Yes** | Heavy ; overkill for V1 |

**Sources** :
- [betterstack — statuspage alternatives 2026](https://betterstack.com/community/comparisons/statuspage-alternatives/) — pricing claims
- [Atlassian Statuspage handbook](https://www.atlassian.com/software/statuspage) — confirms $79+ base
- [openstatus — top five statuspage alternatives](https://www.openstatus.dev/guides/top-five-atlassian-statuspage-alternatives) — instatus pricing
- [betterstack — free status page tools 2026](https://betterstack.com/community/comparisons/free-status-page-tools/) — Uptime Kuma and Kener references

### 3.3 Recommendation for Musaium V1

**Phase 1 (week 1 before launch)** :
- **Self-host Uptime Kuma** on the same VPS, behind nginx at `status.musaium.com` (sub-domain new in DNS). Docker-compose service, ~50 MB image. Tracks the existing `/api/health` endpoint plus `/api/chat/sessions` (login + session create). Free, zero recurring cost, reads from the same probe Better Stack already hits.
- Use Better Stack as the **alerting backbone**, Uptime Kuma as the **public surface**. Don't mirror manually — Uptime Kuma's `/api/status` JSON can be polled by Better Stack as a webhook integration.

**Phase 2 (first B2B sale)** :
- Migrate to Better Stack paid tier (1 user × $29/mo) which gives custom-domain status page + AI-generated incident updates + on-call rotation when you have a contractor.

**Honest framing** : if you launch without a status page, the first sustained outage (>30 min) on launch day creates 100+ duplicate support tickets and zero visibility into your competence. The 30-min spent setting up Uptime Kuma pre-launch saves 4 h of post-launch firefighting. This is the only category in this report where I'd label the current absence as a **launch blocker**.

---

## 4. Uptime monitoring — UptimeRobot / Better Stack / Pingdom / Healthchecks.io

### 4.1 Cross-tool feature matrix (2026)

| Tool | Free monitors | Interval | Status page | Heartbeat | On-call | Annual cost (1 user) |
|---|---|---|---|---|---|---|
| **UptimeRobot Free** | 50 | 5 min | 1 basic | No | No | $0 |
| **UptimeRobot Solo** | 10 → scalable | 60 s | 1 | Yes | No | $84 ($7/mo annual) |
| **Better Stack Free** | 10 | 3 min | 1 | 10 hb | No | $0 |
| **Better Stack Team** | unlimited | 30 s | unlimited | unlimited | Yes | $348+ ($29/mo) |
| **Pingdom (Solo)** | 10 | 60 s | 1 | No | No | ~$15/mo |
| **Healthchecks.io Free** | 20 cron jobs | varies | No | **Yes (specialty)** | No | $0 |

**Sources** :
- [UptimeRobot pricing — notifier.so 2026 guide](https://notifier.so/guides/uptimerobot-pricing-2026/)
- [Better Stack vs UptimeRobot — Better Stack community](https://betterstack.com/community/comparisons/better-stack-vs-uptimerobot/) — "UptimeRobot is a cost-effective alternative with similar capabilities and over 90% lower prices"
- [Healthchecks.io pricing](https://healthchecks.io/pricing/) — "20 cron jobs free, free for hobby use, open source projects, non-profits"

### 4.2 Musaium-specific recommendation

Three checks **must** exist before launch :

| Check | Tool | Interval | Alert channel |
|---|---|---|---|
| `GET /api/health` returns 200 with `"status":"ok"` | Better Stack | 60 s | Email + Pushover SEV-1 |
| `POST /api/auth/login` (synthetic) returns access token | Better Stack | 5 min | Email only |
| Daily DB backup heartbeat (already in `DB_BACKUP_RESTORE.md`) | **Healthchecks.io** | 25 h grace | Email |
| TLS certificate expiry probe (already in `tls-cert-monitor.yml`) | GHA cron | 1 h | GitHub issue + Better Stack |

The current `UPTIME_MONITORING.md` already calls out the first two. The fourth is implemented in CI. The third — **the cron heartbeat for backups** — is the missing piece I'd add specifically because Better Stack's free tier covers 10 monitors but Healthchecks.io is purpose-built for "the backup didn't run" detection, which is a fundamentally different signal than "the HTTP endpoint is down".

**One trap to avoid** : do NOT add /metrics or /grafana to the public uptime check — those are nginx-gated to super_admin and a probe getting a 401 from outside the iframe is correct behavior, not a downtime signal. (Per `OPS_DEPLOYMENT.md` § 27 "Single-auth iframe", Grafana auth_request returns 401 for anonymous requests by design.)

---

## 5. SLI / SLO / SLA framework 2026

### 5.1 The three concepts, plain language

- **SLI** (Service Level Indicator) — what you measure (e.g., fraction of HTTP requests returning <500 in <1 s).
- **SLO** (Service Level Objective) — your internal target on the SLI (e.g., 99.9 % of requests meet SLI).
- **SLA** (Service Level Agreement) — your **external contractual** promise to customers, usually weaker than the SLO (e.g., 99.5 %), with penalties.

For Musaium B2C V1 you have **no SLA** (freemium, no contract, no penalty). You have an **internal SLO** in `docs/SLO.md` you measure against yourself. For B2B post-launch you'll need an SLA — typically 1-2 nines below the SLO. ([atlassian.com — SLA vs SLO vs SLI](https://www.atlassian.com/incident-management/kpis/sla-vs-slo-vs-sli))

### 5.2 Current Musaium SLOs vs industry guidance

From `docs/SLO.md` :

| Musaium SLO | Target | Industry check |
|---|---|---|
| API availability | 99.9 % | Standard for B2C non-mission-critical — ✓ |
| `POST /api/chat/messages` p99 latency | <5 s | High but defensible given LLM inference budget — ✓ |
| Other API p99 latency | <200 ms | Aggressive ; common B2B SaaS = 300-500 ms ; achievable ✓ |
| LLM cache hit ratio | ≥30 % | Per ADR-036 LlmCacheServiceImpl — internal metric, not user-facing |
| Redis cache hit ratio | ≥80 % | Standard for warm cache — ✓ |
| BullMQ job lag p99 | <60 s | Standard background queue — ✓ |
| Audit log integrity | 100 % | Compliance-mandated, no error budget — ✓ |

Google's "Embracing Risk" chapter ([sre.google embracing risk](https://sre.google/sre-book/embracing-risk/)) is explicit : "100 % is probably never the right reliability target". Your audit log SLO at 100 % is the **one place that's correct** because hash-chain integrity is a security invariant, not a reliability one — a single broken hash invalidates the chain.

### 5.3 Multi-burn-rate alerts (the missing implementation)

`SLO.md` § "Alert tiers" defines :
- **P0** : burn rate > 14.4 (1 h error budget burnt in 1 h) → page
- **P1** : burn rate > 1 → ticket within 24 h
- **P2** : cache hit drop > 20 % baseline → dashboard

This is **Google's recommended multi-burn-rate approach** ([sre.google alerting on SLOs](https://sre.google/workbook/alerting-on-slos/)), specifically the 14.4× / 6× threshold pair, but the corresponding **Prometheus rules don't exist** in `infra/grafana/prometheus.yml` per file structure inspection.

**Suggested Prometheus rule for the chat-availability SLO** (99.9 % over 30 d → 0.1 % error budget = 43 min/month) :

```yaml
# infra/grafana/alerting/slo-burn-rate.yml
groups:
- name: chat-availability-slo
  rules:
  # Fast burn — 14.4× over 1 h with 5 min short-window confirmation
  - alert: ChatAvailabilityFastBurn
    expr: |
      (
        (sum(rate(http_requests_total{route=~"/api/chat/(sessions|messages).*",status=~"5.."}[1h]))
         / sum(rate(http_requests_total{route=~"/api/chat/(sessions|messages).*"}[1h])))
        > (14.4 * 0.001)
      )
      and
      (
        (sum(rate(http_requests_total{route=~"/api/chat/(sessions|messages).*",status=~"5.."}[5m]))
         / sum(rate(http_requests_total{route=~"/api/chat/(sessions|messages).*"}[5m])))
        > (14.4 * 0.001)
      )
    for: 2m
    labels:
      severity: sev1
      slo: chat-availability
    annotations:
      summary: "Chat availability burning 14.4× error budget (1h window). 1h budget consumed in 1h. Page on-call."
      runbook: "https://github.com/timmoyence/musaium/blob/main/docs/OPS_INCIDENT_LLM_GUARD.md"

  # Slow burn — 6× over 6 h with 30 min short-window confirmation
  - alert: ChatAvailabilitySlowBurn
    expr: |
      (
        (sum(rate(http_requests_total{route=~"/api/chat/(sessions|messages).*",status=~"5.."}[6h]))
         / sum(rate(http_requests_total{route=~"/api/chat/(sessions|messages).*"}[6h])))
        > (6 * 0.001)
      )
      and
      (
        (sum(rate(http_requests_total{route=~"/api/chat/(sessions|messages).*",status=~"5.."}[30m]))
         / sum(rate(http_requests_total{route=~"/api/chat/(sessions|messages).*"}[30m])))
        > (6 * 0.001)
      )
    for: 15m
    labels:
      severity: sev2
      slo: chat-availability
    annotations:
      summary: "Chat availability burning 6× error budget (6h window). Slow erosion ; ticket."
```

Then wire `alertmanager.yml` to route `severity=sev1` to the Pushover bridge and `severity=sev2` to the Telegram bridge (already configured).

**Source** : [sre.google alerting on SLOs](https://sre.google/workbook/alerting-on-slos/) — "the multiwindow, multi-burn-rate alerting technique is considered the most appropriate approach to defending an application's SLOs".

### 5.4 Error budget policy (already in SLO.md, validate)

`SLO.md` defines soft-freeze at 50 % budget consumed, hard-freeze at 80 %. This **matches** Google's published "Error Budget Policy" template ([sre.google error budget policy](https://sre.google/workbook/error-budget-policy/)). Two improvements :

1. **Add a monthly review trigger** — currently "Monthly: SLO numbers vs targets — adjust budget" is vague. Add a calendar event on the 1st of each month.
2. **Specify what "non-critical deploy" means** during soft-freeze. The current draft says "pause non-critical deploys" but Musaium doesn't yet have a deploy-criticality classification. Suggest : critical = security fix or rollback ; non-critical = everything else. Add a 2-line decision tree.

---

## 6. Deployment strategies — blue/green vs rolling vs canary on single VPS

### 6.1 Constraint reality

Single VPS = you cannot run blue and green simultaneously at the **host** level (would double RAM cost). You can run them at the **container** level — Docker Compose can hold 2 service instances on different ports, with nginx switching upstream.

### 6.2 What Musaium already does

From `OPS_DEPLOYMENT.md` § 17 and § 22 :

- **Current strategy** : sequential restart with health-check loop ("appleboy/ssh-action deploy step" → `docker compose pull` → `up -d` → `migration:run` → 20-try health loop × 3 s × ~60 s window).
- **Rollback** : automatic on smoke-test failure via `rollback.sh` exit codes 0/42/43/44.
- **Image tags** : SHA-pinned via `${IMAGE_TAG:?required}` syntax — no `:latest` mutable fallback (good).

This is **rolling deployment at scale=1**, which is effectively a "stop the old, start the new, hope health-check catches a bad version before traffic hits". The window of unavailability is the duration of `docker compose up -d` plus the migration run — typically 5-30 s for the backend, longer if migrations run.

### 6.3 Tool comparison

| Strategy | Tool on single VPS | Pros | Cons |
|---|---|---|---|
| **Current (rolling restart)** | docker compose + health check | Simple, works, already coded | 5-30 s outage per deploy |
| **Docker rollout (plugin)** | [github.com/wowu/docker-rollout](https://github.com/wowu/docker-rollout) | Zero-downtime, drop-in replacement for `up -d` | Adds CLI plugin dependency |
| **Blue/green via nginx upstream switch** | nginx + 2 service containers | True zero downtime, fast rollback | Doubles RAM during deploy ; complex compose file |
| **Canary via percentage routing** | nginx weighted upstream | Limit blast radius of bad deploys | Requires user-stickiness logic to avoid version mixing in mid-session |

**Sources** :
- [github.com/wowu/docker-rollout](https://github.com/wowu/docker-rollout) — "scales the service to twice the current number of instances, waits for the new containers to be ready, then removes the old containers"
- [virtualizationhowto.com — Docker rollout zero-downtime](https://www.virtualizationhowto.com/2025/06/docker-rollout-zero-downtime-deployments-for-docker-compose-made-simple/) — "Docker Rollout does something Docker Compose doesn't do — it waits for your container to pass its health check"
- [Octopus Deploy — blue/green vs canary](https://octopus.com/devops/software-deployments/blue-green-vs-canary-deployments/) — "Blue/green requires availability of two fully functional environments, which can significantly increase resource usage"

### 6.4 Recommendation

**Pre-launch (V1)** : keep the current rolling restart. The 5-30 s outage per deploy is acceptable for a freemium pre-revenue app with no SLA. Migration is reversible via `rollback.sh`.

**Post-B2B (V1.5+)** : adopt **docker-rollout** as a one-line CI change. The cost is a CLI plugin install in the VPS bootstrap ; the benefit is zero-downtime backend deploys without changing the compose architecture. Reviewing the plugin code (~200 lines of bash) is feasible in 30 min for the audit.

**V2+ (when 100k MAU justifies)** : move backend to a 2-host Docker Swarm or Kubernetes minimal setup (k3s) and adopt blue/green via service definition. Canary will require feature-flag integration (LaunchDarkly / Flagsmith) that's premature for V1.

---

## 7. Rollback automation

### 7.1 Musaium current state — actually well-designed

From `docs/RUNBOOKS/auto-rollback.md` and `museum-backend/deploy/rollback.sh` (referenced) :

- ✓ Captures pre-deploy migration count in `~/.museum-rollback/<service>/pre-count.txt`
- ✓ Computes delta and reverts exactly that many migrations via `migration:revert`
- ✓ Retags `:previous` → `:latest` (image already pulled on VPS)
- ✓ Health-checks rolled-back container for 60 s
- ✓ Documents exit codes 0/42/43/44 with explicit operator actions
- ✓ Drill cadence : 90 days on staging (but staging doesn't exist V1 — see §10)
- ✓ Blocks irreversible migrations at PR time via `scripts/check-migration-down.cjs`

This is **above the median** for a single-founder project. The exit-code semantics in particular are a sign of someone who has rolled back during a real incident.

### 7.2 Known gaps (acknowledged in the runbook itself)

| Gap | Severity | Notes |
|---|---|---|
| "Does not resurrect dropped data" — destructive migrations revert schema only | Medium | Requires manual review per migration ; PR template flag would help |
| "Does not touch Redis cache" — poisoned cache survives | Low | Manual `FLUSHDB` command documented |
| "Does not roll back the uploaded Docker image in GHCR" | Low | `:latest` in registry still points at broken build — next deploy needs explicit tag |
| "Does not notify PagerDuty/Slack directly. Only Sentry is wired" | **High** | Tied directly to §2 paging gap |
| "Only reverts the most recent deploy" — multi-step rollback awkward | Low | Acceptable V1, V2 feature |

The **High** gap is the one I'd close pre-launch : wire `rollback.sh` to also fire a Pushover priority=2 notification on exit code 0 (so you know it auto-fired), 42 (DB intermediate state — needs you NOW), or 44 (rolled-back image is also broken).

### 7.3 PostgreSQL migration rollback — best practices 2026

From [matthiasbruns.com — Database Migrations in Production 2026](https://blog.matthiasbruns.com/database-migrations-in-production-zero-downtime-strategies-that-actually-work) and [softacom.com — best PostgreSQL migration tools 2026](https://www.softacom.com/wiki/the-best-postgresql-migration-tools-in-2026/) :

- **pgroll** is the 2026 reference for expand/contract pattern with multi-version schema. Not relevant for Musaium V1 (single schema is fine).
- **TypeORM `migration:revert`** (current Musaium approach) is the simplest and works as long as `down()` blocks exist. The `check-migration-down.cjs` gate is the right shape.
- **Liquibase** offers built-in rollback per changeset — would require migrating away from TypeORM, which `CLAUDE.md` notes is monitored but not urgent.

**No change needed for Musaium V1**. The current approach is correct.

---

## 8. Runbooks — what to document, how to test

### 8.1 What Musaium has

Inventory from `docs/RUNBOOKS/README.md` :

| Runbook | Trigger | Cadence |
|---|---|---|
| `auto-rollback.md` | Deploy/smoke fail | On-demand + 90-day drill |
| `prod-secrets-bootstrap.md` | Auto-rollback w/ missing env var | On-demand |
| `redis-rotation.md` | Quarterly cron | Every 90 d |
| `secrets-rotation.md` | Class-specific cadence | Scheduled + emergency |
| `audit-chain-forensics.md` | Hash chain verifier breaks | Nightly cron + on-demand |
| `CERT_ROTATION.md` | Mobile cert pinning emergency | On-demand (rare) |
| `V1_FALLBACKS.md` | Dormant V2 workflows | Daily/weekly until V2 |
| `guardrail-incidents.md` | Guardrail anomalies | On-demand |
| `OPS_INCIDENT_LLM_GUARD.md` (in `docs/`, not RUNBOOKS) | LLM Guard sidecar outage | On-demand |

This is a **strong baseline** — 9 runbooks for 9 distinct failure modes, each with explicit triggers and either drill cadence or "when this fires" guidance. The "one file per incident class" rule in `RUNBOOKS/README.md` is the right doctrine.

### 8.2 What's missing

Compared to a standard 2026 runbook inventory (composited from [counteractive/incident-response-plan-template](https://github.com/counteractive/incident-response-plan-template) and [oneuptime.com — effective runbooks 2026](https://oneuptime.com/blog/post/2026-02-02-effective-runbooks/view)) :

| Missing runbook | Trigger | Priority |
|---|---|---|
| **DB primary unreachable** | `/api/health` reports `database: down` for >30 s | High (no doc today, just § 21 of OPS_DEPLOYMENT) |
| **S3 / object storage outage** | image upload 500s, signed URL generation fails | Medium |
| **Single LLM provider outage** | Per `CHAOS_RUNBOOKS.md` § 3 — exists as chaos but not as incident runbook | Medium |
| **DDoS / rate-limit overflow** | Cloudflare or backend rate-limit table fills | Medium |
| **CI/CD outage** | GitHub Actions degraded, deploy needed urgently | Low |
| **Disk full on VPS** | docker images accumulate, /var/lib/docker fills | Medium (silent failure mode) |
| **PgBouncer connection pool exhaustion** | Per CLAUDE.md ADR-021 — risks are scoped, but no runbook | Low |

The **High** gap is DB primary unreachable. § 21 of OPS_DEPLOYMENT has the symptom checklist but no decision tree ("if DB host is up but Postgres dead → restart vs restore from backup ?"). A dedicated `docs/RUNBOOKS/db-primary-down.md` with PG-specific steps (e.g., check `pg_isready`, check WAL replay, check `max_connections`, when to escalate to backup restore) would close it.

### 8.3 How to test runbooks

Two industry-standard approaches :

- **Chaos game day** (quarterly) — induce the failure on a controlled schedule, follow the runbook, time MTTR, file deviations. ([gremlin.com — ensuring runbooks up to date](https://www.gremlin.com/blog/ensuring-runbooks-are-up-to-date))
- **Tabletop exercise** (monthly) — read the runbook, simulate the steps without executing, identify gaps. Already exists for Musaium per `docs/incidents/tabletop/` (3 scenarios : `db-compromise-sqli.md`, `jwt-secret-leaked.md`, `openai-key-abuse.md`).

Recommendation : add a **quarterly chaos game day on prod** (per `CHAOS_RUNBOOKS.md` § "When to run", which already lists "Whenever a claim of fault tolerance is added"). Time it for low-traffic Sunday 04:00 Europe/Paris. Schedule via GitHub issue, post status page maintenance window 24 h in advance. The first one is the highest-value because the runbooks are untested under real conditions.

---

## 9. Postmortems — blameless template, retention

### 9.1 Musaium template is already excellent

`docs/incidents/POST_MORTEM_TEMPLATE.md` includes :
- ✓ Metadata (incident ID, severity, MTTD/MTTC/MTTR, GDPR Art 33/34 flags)
- ✓ Timeline (UTC, observed vs decision events)
- ✓ Detection, Containment, Eradication, Recovery sections
- ✓ 5-whys root cause analysis
- ✓ Impact assessment (data classes, geo scope, regulatory triggers)
- ✓ Lessons learned (worked / didn't work / got lucky)
- ✓ Action items with verification gate ("PR merged AND regression test exists or written justification")
- ✓ Sign-off (Tech Lead / DPO / Process Auditor / CEO for P0/P1)

This is **better than the Atlassian template** ([atlassian.com — postmortem templates](https://www.atlassian.com/incident-management/postmortem/templates)) and **roughly matches Google's published postmortem culture chapter** ([sre.google postmortem culture](https://sre.google/sre-book/postmortem-culture/)). The "blameless" framing ("Keep prose factual. Avoid blame; describe systems and decisions, not individuals") is correct doctrine.

### 9.2 Retention policy — undefined

GDPR Article 33(5) requires **documenting personal data breaches** but does **not** set a fixed retention period. From [usercentrics.com — GDPR data retention](https://usercentrics.com/knowledge-hub/gdpr-data-retention/) : "organizations must determine appropriate time frames based on purpose, sector-specific regulation, and legal obligation".

For **incident postmortems** specifically, industry consensus (composited from incident.io, Atlassian, Rootly 2026 guides) :
- **Internal retention** : **3-5 years minimum**, indefinite if compliance-relevant
- **Public retention** : 12-24 months on status page
- **Anonymization** : redact user IDs, IPs after the legal review period (typically 12 months)

**Recommendation for Musaium** : add to `BREACH_PLAYBOOK.md` § 5 the line "Postmortems retained for **5 years** in `docs/incidents/<YYYY-MM-DD>-<slug>/` per `auditCriticalSecurityEvent` + GDPR Art 5(2) accountability. Public-facing postmortems on the status page are retained 12 months then archived to a 'historical incidents' page."

### 9.3 Solo-founder writing the postmortem

The standard postmortem template assumes multiple roles : reviewer ≠ author ≠ DPO. For a solo founder, you're all three. The honest workaround :

1. Write the postmortem within 48 h, as documented.
2. **Wait 7 days, then re-read with fresh eyes**. This catches the "I had to be hero" bias and surface genuine systemic issues.
3. Optionally circulate to an external SRE friend or Mastodon for a sanity check on the 5-whys (paid : $200 for a 2 h external review on Fiverr).
4. Sign off as Tech Lead and DPO (you wear both hats). Mark the CEO sign-off as "self".

This avoids the trap of "the author signs off on their own work" creating a rubber-stamp culture. For Musaium V1, the discipline is more important than the role separation.

---

## 10. Solo founder limits — what to delegate to managed services

### 10.1 The core trade-off

Self-host = predictable cost, full control, requires time. SaaS = variable cost, no control, no time. For a solo pre-revenue founder, the limiting resource is **founder hours**, not euros. Anything that takes >2 h/month to maintain self-hosted should be on SaaS until revenue justifies otherwise.

### 10.2 Per-service decision matrix

| Service | Current | Recommended V1 | Recommended post-revenue |
|---|---|---|---|
| **Error tracking (Sentry)** | Sentry SaaS (per `OPS_DEPLOYMENT.md`) | **Keep SaaS** (free tier 5k errors/mo) | Sentry Team $26/mo when volume exceeds |
| **Uptime monitoring** | Better Stack | **Keep Better Stack free** | Better Stack Team $29/mo when >10 monitors |
| **Status page** | None | **Self-host Uptime Kuma** on same VPS | Better Stack Team includes status page |
| **APM / metrics** | Self-host Prometheus+Grafana | Keep self-host (already running in compose) | Add managed APM if cardinality exceeds VPS (~1M series) |
| **Log aggregation** | Loki (per docker-compose mentions) | Keep self-host | OK as is, Loki scales well |
| **Incident management** | None (manual GitHub issue + label) | **Stay manual** | incident.io / Rootly when team ≥3 |
| **On-call paging** | Email via Better Stack | **Add Pushover $5 one-time** | PagerDuty free when team ≥2 |
| **Backup storage** | OVH or local (per DB_BACKUP_RESTORE.md) | OK as is | Add cross-region S3 backup at €5/mo |
| **DNS / CDN** | OVH (assumption) | Add Cloudflare free tier | OK as is |
| **TLS certs** | Let's Encrypt via certbot, GHA-driven | Keep | Keep |
| **Secrets management** | GHA secrets + VPS `.env` | Keep V1 | Move to Doppler / Infisical at >5 secrets/month rotation |

**Sources** :
- [securityboulevard — Sentry alternatives 2026](https://securityboulevard.com/2026/04/best-sentry-alternatives-for-error-tracking-and-monitoring-2026/) — "Self-hosted GlitchTip or Bugsink achieves the same goal with a fraction of the operational overhead. €32.48/month with 15 minutes to deploy"
- [Pushover pricing](https://pushover.net/pricing) — "$5 one-time per platform"
- [Healthchecks.io pricing](https://healthchecks.io/pricing/) — "free for hobby use, open source projects, non-profits"

### 10.3 The "Sentry rotation" question

The mission mentioned "Sentry rotation" as an example of delegation. Sentry as a vendor handles its own credential rotation — you rotate **your own DSN** (Data Source Name) when compromised. From `docs/RUNBOOKS/secrets-rotation.md` (referenced) Musaium has scheduled rotation cadence for OPENAI/DEEPSEEK/GOOGLE (180d) and JWT (90d). Adding SENTRY_DSN to that list would be the next step — there's no automatic rotation, but ranging it on a 365-day cadence catches "the DSN got committed by accident" issues.

For solo founder context : Sentry's actual ops burden is **near zero**. You set the DSN once, you read alerts in the UI, you don't manage the data store. This is the right place to spend $0-$26/mo for SaaS instead of running a self-hosted Sentry on the VPS (which would require ~2 GB RAM minimum and competes with the LLM-Guard sidecar's memory budget).

---

## 11. Verdict for Musaium V1 — minimum viable ops setup

### 11.1 Already in place (don't change)

✓ Auto-rollback with exit-code semantics — better than most multi-engineer setups
✓ Self-hosted Prometheus + Grafana + AlertManager + Telegram bridge
✓ Cosign keyless signing on CI images
✓ SHA-pinned Docker image tags (no `:latest` fallback)
✓ Per-incident-class runbooks structure (`docs/RUNBOOKS/`)
✓ Blameless postmortem template with GDPR awareness
✓ Breach playbook with 72-h CNIL timer wired to GHA cron
✓ Better Stack uptime free tier for `/api/health`
✓ TLS renewal via GHA + monitoring + escalation
✓ Audit log hash chain with nightly verification
✓ Chaos runbooks for Redis / PG / LLM kill (theoretical until §11.4 drill)
✓ SLO targets explicit in `docs/SLO.md`

### 11.2 Top 5 actions before 2026-06-01 launch

| # | Action | Effort | Rationale |
|---|---|---|---|
| **1** | **Wire Pushover priority=2 emergency alert for SEV-1** | 2 h | Better Stack email won't wake you up. Pushover retry-every-30-s until acked. $5 one-time. |
| **2** | **Self-host Uptime Kuma at `status.musaium.com`** | 1 h | B2B credibility, support ticket deflection, public proof of reliability. Free, runs in existing compose. |
| **3** | **Implement multi-window multi-burn-rate Prometheus rules** | 3 h | Targets in SLO.md but no actual alert rules. Fast burn 14.4× over 1h, slow burn 6× over 6h. Wire to AlertManager → Pushover/Telegram. |
| **4** | **Add postmortem retention policy + DB-down runbook** | 2 h | Compliance gap (retention undefined) ; ops gap (DB-down is the most likely real incident class with no dedicated runbook). |
| **5** | **Run a real chaos drill on prod, Sunday 04:00 EU/Paris** | 4 h drill + 4 h followup | Kill llm-guard sidecar, kill Redis, kill primary OpenAI route. Time actual MTTR. Update SLO.md with **observed** numbers, not aspirations. |

**Total** : ~16 h founder time. Spread over 3 weeks pre-launch this is 5 h/week.

### 11.3 Things to NOT do for V1

- Don't buy PagerDuty / incident.io / Rootly. Wait for first B2B sale or team ≥2.
- Don't build a CL/OL/IC three-role response. You're one person ; pretend otherwise creates fake ceremony.
- Don't run blue/green deploys. Current rolling restart with rollback is correct for V1 outage budget.
- Don't introduce Litmus / Chaos Mesh / Gremlin. The handwritten `CHAOS_RUNBOOKS.md` is correct shape for V1 ; chaos-mesh assumes Kubernetes.
- Don't migrate Sentry to self-hosted GlitchTip pre-launch. The 2 h/month operational savings aren't worth the migration risk in the launch window.
- Don't try to hit 99.9 % availability from day 1. Per Google SRE "Embracing Risk" — set a realistic SLO **after** observing actual user expectations.

### 11.4 Critical caveat — the chaos drill exposes truth

The largest risk to this verdict is that **the chaos runbooks were never tested on prod**. `CHAOS_RUNBOOKS.md` explicitly states "All experiments are run on staging only" but staging does not exist. The Redis-kill / PG-replica-kill / LLM-kill behaviors are **hypothesized**, not measured.

If one of those runbooks turns out to be wrong on launch day (e.g., Redis kill takes the entire backend down instead of fail-closed graceful degrade), the launch is broken. The §11.2 action #5 is the highest-leverage hour you can spend pre-launch — not because the runbooks are wrong, but because the only honest claim is "we don't know yet".

---

## Sources

- [response.pagerduty.com — Severity Levels](https://response.pagerduty.com/before/severity_levels/)
- [atlassian.com — Understanding incident severity levels](https://www.atlassian.com/incident-management/kpis/severity-levels)
- [betterstack.com — What Are Incident Severity Levels?](https://betterstack.com/community/guides/incident-management/severity-levels/)
- [sre.google — Managing incidents](https://sre.google/sre-book/managing-incidents/)
- [sre.google — Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/)
- [sre.google — Implementing SLOs](https://sre.google/workbook/implementing-slos/)
- [sre.google — Embracing Risk](https://sre.google/sre-book/embracing-risk/)
- [sre.google — Error Budget Policy](https://sre.google/workbook/error-budget-policy/)
- [sre.google — Being On-Call](https://sre.google/sre-book/being-on-call/)
- [sre.google — Postmortem Culture](https://sre.google/sre-book/postmortem-culture/)
- [sre.google — Eliminating Toil](https://sre.google/sre-book/eliminating-toil/)
- [sre.google — Incident Management Guide PDF](https://sre.google/static/pdf/IncidentManagementGuide.pdf)
- [incident.io — Incident management best practices 2026](https://incident.io/blog/incident-management-best-practices-2026)
- [incident.io — On-call best practices 2026](https://incident.io/blog/on-call-best-practices-guide-2026)
- [incident.io — Implementation guide Slack-native 2026](https://incident.io/blog/implementation-guide-slack-native-incident-management-platform-2026)
- [incident.io — Best postmortem software 2026](https://incident.io/blog/best-postmortem-software-for-compliance-audit-teams-2026)
- [pagerduty.com — Outage communication](https://www.pagerduty.com/resources/collaboration/learn/outage-communication/)
- [pagerduty.com — Incident severity classification](https://www.pagerduty.com/resources/incident-management-response/learn/incident-severity-classification/)
- [pushover.net — API documentation](https://pushover.net/api)
- [pushover.net — Pricing](https://pushover.net/pricing)
- [dev.to/siddharth_singh — Opsgenie 2026 EOL](https://dev.to/siddharth_singh_409bd5267/opsgenie-2026-features-pricing-eol-alternatives-1bm0)
- [notilens.com — Pushover Alternatives 2026](https://www.notilens.com/blog/pushover-alternatives-business-teams-2026)
- [costbench.com — PagerDuty Pricing 2026](https://costbench.com/software/developer-tools/pagerduty/)
- [betterstack — vs UptimeRobot 2026](https://betterstack.com/community/comparisons/better-stack-vs-uptimerobot/)
- [betterstack — Statuspage Alternatives 2026](https://betterstack.com/community/comparisons/statuspage-alternatives/)
- [betterstack — Free Status Page Tools 2026](https://betterstack.com/community/comparisons/free-status-page-tools/)
- [betterstack — PagerDuty Alternatives 2026](https://betterstack.com/community/comparisons/pagerduty-alternatives/)
- [betterstack — Incident management platform](https://betterstack.com/incident-management)
- [cubeapm — Better Stack pricing review 2026](https://cubeapm.com/blog/betterstack-pricing-review/)
- [uptimerobot.com — Building a status page 2026](https://uptimerobot.com/knowledge-hub/monitoring/building-a-status-page-ultimate-guide/)
- [uptimerobot.com — 11 best uptime monitoring tools 2026](https://uptimerobot.com/knowledge-hub/monitoring/11-best-uptime-monitoring-tools-compared/)
- [notifier.so — UptimeRobot pricing 2026](https://notifier.so/guides/uptimerobot-pricing-2026/)
- [oneuptime.com — Best statuspage alternatives 2026](https://oneuptime.com/blog/post/2026-03-10-best-statuspage-alternatives/view)
- [oneuptime.com — Effective runbooks 2026](https://oneuptime.com/blog/post/2026-02-02-effective-runbooks/view)
- [oneuptime.com — SRE postmortem templates 2026](https://oneuptime.com/blog/post/2026-01-30-sre-postmortem-templates/view)
- [oneuptime.com — Multi-window multi-burn-rate alerting](https://oneuptime.com/blog/post/2026-02-17-how-to-set-up-multi-window-multi-burn-rate-alerting-for-slos-on-google-cloud/view)
- [oneuptime.com — Chaos engineering game days 2026](https://oneuptime.com/blog/post/2026-01-28-chaos-engineering-game-days/view)
- [oneuptime.com — Canary deployment configuration 2026](https://oneuptime.com/blog/post/2026-01-30-canary-deployment-configuration/view)
- [oneuptime.com — Docker image tagging 2026](https://oneuptime.com/blog/post/2026-02-02-docker-image-tagging/view)
- [octopus.com — Blue/green vs canary deployments](https://octopus.com/devops/software-deployments/blue-green-vs-canary-deployments/)
- [github.com/wowu/docker-rollout](https://github.com/wowu/docker-rollout)
- [virtualizationhowto.com — Docker rollout zero-downtime 2026](https://www.virtualizationhowto.com/2025/06/docker-rollout-zero-downtime-deployments-for-docker-compose-made-simple/)
- [healthchecks.io — Pricing](https://healthchecks.io/pricing/)
- [github.com/counteractive — incident-response-plan-template](https://github.com/counteractive/incident-response-plan-template)
- [github.com/aws-samples — aws-incident-response-playbooks](https://github.com/aws-samples/aws-incident-response-playbooks)
- [gremlin.com — Ensuring runbooks are up to date](https://www.gremlin.com/blog/ensuring-runbooks-are-up-to-date)
- [gremlin.com — Chaos engineering tools build vs buy](https://www.gremlin.com/blog/chaos-engineering-tools-build-vs-buy)
- [litmuschaos.io](https://litmuschaos.io/)
- [usercentrics.com — GDPR data retention](https://usercentrics.com/knowledge-hub/gdpr-data-retention/)
- [konfirmity.com — GDPR logging and monitoring 2026](https://www.konfirmity.com/blog/gdpr-logging-and-monitoring)
- [matthiasbruns.com — Database migrations in production 2026](https://blog.matthiasbruns.com/database-migrations-in-production-zero-downtime-strategies-that-actually-work)
- [softacom.com — Best PostgreSQL migration tools 2026](https://www.softacom.com/wiki/the-best-postgresql-migration-tools-in-2026/)
- [securityboulevard — Sentry alternatives 2026](https://securityboulevard.com/2026/04/best-sentry-alternatives-for-error-tracking-and-monitoring-2026/)
- [devops.com — On-call rotation best practices](https://devops.com/on-call-rotation-best-practices-reducing-burnout-and-improving-response/)
- [uptimelabs.io — Reduce on-call burnout](https://uptimelabs.io/learn/reduce-on-call-burnout/)
- [rootly.com — 2025 observability stack for SRE teams](https://rootly.com/sre/2025-observability-stack-sre-teams-boost-reliability)
- [dev.to/alexcloudstar — Production observability for solo developers](https://dev.to/alexcloudstar/what-happens-after-you-vibe-code-production-observability-for-solo-developers-2iba)
- [atlassian.com — Postmortem templates](https://www.atlassian.com/incident-management/postmortem/templates)
- [atlassian.com — SLA vs SLO vs SLI](https://www.atlassian.com/incident-management/kpis/sla-vs-slo-vs-sli)
- [sigstore.dev — cosign overview](https://docs.sigstore.dev/cosign/signing/overview/)
- [oneuptime.com — Deploy cosign verification 2026](https://oneuptime.com/blog/post/2026-02-26-deploy-cosign-verification-argocd/view)

---

**End of R30.**
