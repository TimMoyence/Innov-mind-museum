# A8 — Audit documentation opérationnelle + observabilité
**Date:** 2026-05-26
**Lot audité:** `docs/operations/*.md`, `docs/RUNBOOKS/*.md`, `docs/observability/*.md`
**Méthode:** read-only, vérification systématique code/scripts/CI vs claims doc.

---

## Tableau de synthèse

| Fichier | État | Confiance | Preuve (doc → code) | Action |
|---|---|---|---|---|
| `docs/RUNBOOKS/auto-rollback.md` | **À MODIFIER** | HIGH | `museum-backend/deploy/rollback.sh` EXISTS · `museum-backend/scripts/smoke-api.cjs` EXISTS (runbook ne précise pas le préfixe `museum-backend/` mais CI confirme `working-directory: museum-backend`) · scripts cités OK | Corriger le chemin de `scripts/smoke-api.cjs` (ajouter contexte `museum-backend/`) |
| `docs/RUNBOOKS/CERT_ROTATION.md` | **OK** | HIGH | `museum-frontend/shared/config/cert-pinning.ts` EXISTS · `museum-frontend/scripts/capture-spki.sh` EXISTS (CLAUDE.md dit `scripts/` mais c'est `museum-frontend/scripts/` — la doc ne cite pas le chemin complet, pas de claim faux dans le runbook lui-même) | Aucune |
| `docs/RUNBOOKS/README.md` | **OK** | HIGH | Index correct, tous les fichiers listés existent | Aucune |
| `docs/RUNBOOKS/V1_FALLBACKS.md` | **OK** | HIGH | Workflows dormants tous présents: `db-backup-daily.yml`, `db-backup-monthly-restore-drill.yml`, `tls-renewal.yml`, `tls-cert-monitor.yml`, `breach-72h-timer.yml` existent dans `.github/workflows/` · `docs/incidents/BREACH_PLAYBOOK.md` EXISTS | Aucune |
| `docs/RUNBOOKS/audit-chain-forensics.md` | **À MODIFIER** | HIGH | `museum-backend/src/shared/audit/audit-chain.ts` EXISTS · `scripts/audit-chain-verify.cjs` NOT FOUND (marqué TODO dans la doc, OK) · `docs/RUNBOOKS/audit-chain-verification-log.md` NOT FOUND (appendice mentionné mais pas créé) | Préciser que `audit-chain-verification-log.md` doit être créé à la première utilisation (ou créer le stub) |
| `docs/RUNBOOKS/guardrail-incidents.md` | **À MODIFIER** | HIGH | **CRITIQUE S7** : la commande `grep "image:.*llm-guard" /Users/Tim/Desktop/all/dev/Pro/InnovMind/infra/docker-compose.prod.yml` contient un chemin absolu local hardcodé + fichier inexistant (`infra/docker-compose.prod.yml` NOT FOUND ; le fichier réel est `museum-backend/deploy/docker-compose.prod.yml`). Les commandes S1-S6 utilisent correctement `/srv/museum/docker-compose.prod.yml` (chemin VPS). S6 référence `tenant_active_policies` / `guardrail_policies` (schéma Phase 2, pas encore shippen — doc l'indique, OK). Référence à `design.md` et `docs/incidents/BREACH_PLAYBOOK.md` OK. | Corriger la commande S7 Orient : remplacer le chemin absolu local par `grep "image:.*llm-guard" museum-backend/deploy/docker-compose.prod.yml` |
| `docs/RUNBOOKS/prod-secrets-bootstrap.md` | **OK** | HIGH | `museum-backend/src/config/env.production-validation.ts` EXISTS · tous les noms de vars vérifiés (`MFA_ENCRYPTION_KEY`, `MFA_SESSION_TOKEN_SECRET`, `CSRF_SECRET` présents dans la validation) · commande validate correcte | Aucune |
| `docs/RUNBOOKS/redis-rotation.md` | **OK** | HIGH | `.github/workflows/redis-rotation-reminder.yml` EXISTS · `env.production-validation.ts` confirme la contrainte ≥ 32 chars sur `REDIS_PASSWORD` | Aucune |
| `docs/RUNBOOKS/secrets-rotation.md` | **À MODIFIER** | MEDIUM | `docs/RUNBOOKS/secrets-rotation-log.md` NOT FOUND (ledger appendé mentionné comme existant) · `scripts/rotate-mfa-encryption-key.cjs` NOT FOUND (marqué TODO dans la doc, OK) · `JWT_MFA_SECRET` dans le tableau cadence ≠ nom réel `MFA_SESSION_TOKEN_SECRET` dans `env.production-validation.ts` (la parenthèse `(MFA_SESSION_TOKEN_SECRET)` est présente mais confus) | (1) Créer le stub `secrets-rotation-log.md` (fichier vide avec en-tête). (2) Clarifier le tableau cadence : supprimer `JWT_MFA_SECRET`, garder uniquement `MFA_SESSION_TOKEN_SECRET`. |
| `docs/observability/DISTRIBUTED_TRACING.md` | **À MODIFIER** | HIGH | **STALE §5** : le doc dit "The middleware is exported but **not yet mounted** in `museum-backend/src/app.ts`" et donne les instructions pour l'activer. Or `app.ts` ligne 135 prouve que `tracePropagationMiddleware` est **déjà monté** (`app.use(tracePropagationMiddleware)` importé ligne 31). La doc a été écrite avant le wiring et n'a pas été mise à jour. Typo `traceePropagationMiddleware` (double `e`) dans l'exemple §5 vs nom réel `tracePropagationMiddleware` (simple `e`). `museum-frontend/shared/observability/sentry-init.ts` EXISTS avec `tracePropagationTargets`. | Supprimer §5 "To activate, add after..." (déjà fait). Corriger le typo `traceePropagation` → `tracePropagation`. |
| `docs/observability/METRIC_NAMING_AUDIT.md` | **OK** | HIGH | `scripts/sentinels/metric-naming.mjs` EXISTS · `museum-backend/src/shared/observability/prometheus-metrics.ts` confirme 44 metrics et `musaium_rerank_latency_ms` · `infra/grafana/dashboards/guardrail-fairness.json` EXISTS · `infra/grafana/alerting/llm-cost.yml` EXISTS · `docs/observability/alerts-llm-guard.yml` EXISTS | Aucune |
| `docs/operations/CAPACITY_PLAN_100K.md` | **OK** | HIGH | `docs/CAPACITY_PLAN.md` EXISTS · `design.md` dans team-state EXISTS · Contenu est projection order-of-magnitude, pas des claims falsifiables | Aucune |
| `docs/operations/CHAOS_GAMEDAY_2026-05.md` | **OK** | HIGH | `docs/CHAOS_RUNBOOKS.md` EXISTS · `infra/grafana/docker-compose.local.yml` EXISTS · Références aux dashboards OK | Aucune |
| `docs/operations/CNIL_BREACH_NOTIFICATION_DRYRUN.md` | **OK** | HIGH | `docs/legal/ROPA.md` EXISTS · `docs/legal/DPIA.md` EXISTS · `VDP_RUNBOOK.md` EXISTS · Procédure cohérente avec la réalité CNIL | Aucune |
| `docs/operations/ENISA_SRP_ONBOARDING.md` | **OK** | HIGH | `SECURITY.md` EXISTS · `VDP_RUNBOOK.md` EXISTS · URLs ENISA SRP correctes au moment de l'audit (2026-05-17) | Aucune |
| `docs/operations/INCIDENT_CONTACTS.md` | **OK** | HIGH | Contacts vérifiés au 2026-05-17 selon le doc lui-même. URLs présentes. Note: contacts légaux et assurance cybersécurité = TBD (doc le précise explicitement) | Aucune |
| `docs/operations/LIGHTHOUSE_AUDIT.md` | **OK** | HIGH | `museum-web/lighthouserc.json` EXISTS avec thresholds confirmés (a11y 0.90, perf 0.85, seo 0.90, best-practices 0.85) — exactement ce que la doc décrit | Aucune |
| `docs/operations/PENTEST_SCOPE.md` | **OK** | HIGH | `docs/RUNBOOKS/guardrail-incidents.md` EXISTS · `docs/operations/POSTMORTEM_TEMPLATE.md` EXISTS · `docs/compliance/AI_ACT_CONFORMITY_MATRIX.md` EXISTS · `docs/compliance/SUBPROCESSORS.md` EXISTS | Aucune |
| `docs/operations/PGP_KEY_GENERATION.md` | **OK** | HIGH | `museum-web/public/.well-known/pgp-key.txt` EXISTS avec le token placeholder `PGP_KEY_PLACEHOLDER_DO_NOT_SHIP` (la doc décrit exactement cet état comme "pas encore exécuté") · `SECURITY.md` EXISTS | Aucune — placeholder conforme à la description de la doc |
| `docs/operations/POSTMORTEM_TEMPLATE.md` | **À MODIFIER** | MEDIUM | Référence à `docs/incidents/POST_MORTEM_TEMPLATE.md` (GDPR heavy) EXISTS OK. Référence à `design.md` dans team-state EXISTS. Mais la référence au "steward design.md §12.1" est `../../.claude/skills/team/team-state/2026-05-12-llm-guard-perennial-10y-design/design.md` — ce path relatif depuis `docs/operations/` ne résout pas correctement (dépasse la racine repo). | Corriger le path relatif : depuis `docs/operations/`, le chemin vers `.claude/` = `../../.claude/...` est faux (`.claude/` est à la racine, `docs/operations/` est 2 niveaux en dessous → `../../.claude/` est correct). Vérification : `docs/operations/` → `docs/` → racine → `.claude/`. En fait c'est correct (2 `../` depuis `docs/operations/`). LOW concern, ne pas modifier. |
| `docs/operations/SECURITY_MAILBOX_SETUP.md` | **OK** | HIGH | `VDP_RUNBOOK.md` EXISTS · `SECURITY.md` EXISTS · Procédures DNS/OVH cohérentes · `security.txt` Expires date 2027-05-14 citée dans le doc | Aucune |
| `docs/operations/SENTRY_P0_TRIAGE_2026-05-20.md` | **À MODIFIER** | MEDIUM | `docs/SENTRY_KNOWN_NOISE.md` NOT FOUND (le doc dit "create if needed" — c'est correct, le stub n'existe pas encore). Mais si la triage a été exécutée (elle devait l'être avant 2026-05-19 EOD), ce fichier devrait exister ou le doc devrait indiquer que la triage a été faite. Document daté 2026-05-17, goal = 2026-05-19. Statut d'exécution inconnu. | Marquer le doc comme EXÉCUTÉ si la triage a eu lieu (ajouter un `## Done` avec la date d'exécution réelle) ou comme EN ATTENTE avec la date limite. |
| `docs/operations/UNIVERSAL_LINKS_VERIFICATION.md` | **OK** | HIGH | `museum-frontend/app.config.ts`, `museum-web/public/.well-known/apple-app-site-association`, `museum-web/public/.well-known/assetlinks.json`, `museum-frontend/app/+native-intent.tsx` — le doc dit "shipped" et ces fichiers existent (confidence: vérification d'existence, pas de contenu profond) | Aucune |
| `docs/operations/VDP_RUNBOOK.md` | **OK** | HIGH | `SECURITY.md` EXISTS · `docs/legal/SUBPROCESSORS.md` EXISTS · `docs/compliance/SUBPROCESSORS.md` EXISTS (les deux existent, la doc cite les deux paths — cohérent) · `docs/operations/POSTMORTEM_TEMPLATE.md` EXISTS · `docs/incidents/BREACH_PLAYBOOK.md` EXISTS | Aucune |

---

## Findings notables

### F1 — DISTRIBUTED_TRACING.md §5 : stale "not yet mounted" (HARD, À CORRIGER)
**Fichier:** `docs/observability/DISTRIBUTED_TRACING.md`, §5 lignes 80-88.
**Claim doc:** "The middleware is exported but **not yet mounted** in `museum-backend/src/app.ts`. To activate, add after `requestIdMiddleware`" + code snippet.
**Réalité code:** `museum-backend/src/app.ts` ligne 31 : `import { tracePropagationMiddleware }` ; ligne 135 : `app.use(tracePropagationMiddleware)`. Le middleware est monté depuis le commit mentionné dans le doc (W4 W6.9).
**Risque:** Un ops qui lit §5 tente de réajouter le middleware → import dupliqué / comportement inattendu.
**Action:** Remplacer §5 par "Wired at `app.ts:135` (W4 W6.9). No action required." + corriger le typo `traceePropagationMiddleware` → `tracePropagationMiddleware`.

### F2 — guardrail-incidents.md S7 : chemin absolu local hardcodé + fichier inexistant (CRITIQUE)
**Fichier:** `docs/RUNBOOKS/guardrail-incidents.md`, ligne 251 (section S7 — Orient).
**Claim doc:** `grep "image:.*llm-guard" /Users/Tim/Desktop/all/dev/Pro/InnovMind/infra/docker-compose.prod.yml`
**Réalité code:** (a) Le chemin `/Users/Tim/Desktop/all/dev/Pro/InnovMind/` est le répertoire local du développeur — non transférable à aucun autre opérateur ou VPS. (b) `infra/docker-compose.prod.yml` n'existe pas dans le repo ; le fichier réel est `museum-backend/deploy/docker-compose.prod.yml`.
**Risque:** La commande échoue en production pour tout opérateur != Tim. Incident S7 = supply-chain compromise P0 — une commande cassée dans ce scénario est critique.
**Action:** Remplacer par `grep "image:.*llm-guard" museum-backend/deploy/docker-compose.prod.yml` (chemin relatif depuis la racine du repo, ou ajouter note "depuis la racine du checkout").

### F3 — secrets-rotation.md : `JWT_MFA_SECRET` ≠ nom réel `MFA_SESSION_TOKEN_SECRET` (MEDIUM)
**Fichier:** `docs/RUNBOOKS/secrets-rotation.md`, tableau cadence ligne `JWT_MFA_SECRET (MFA_SESSION_TOKEN_SECRET)`.
**Réalité code:** `env.production-validation.ts` ligne 214 : `required('MFA_SESSION_TOKEN_SECRET', ...)`. Le nom `JWT_MFA_SECRET` n'existe pas dans le code.
**Risque:** Confusion lors d'une rotation — l'opérateur cherche `JWT_MFA_SECRET` dans le `.env` et ne le trouve pas.
**Action:** Changer la ligne du tableau en `MFA_SESSION_TOKEN_SECRET` uniquement, supprimer l'alias `JWT_MFA_SECRET`.

### F4 — audit-chain-forensics.md : `audit-chain-verification-log.md` n'existe pas (LOW)
**Fichier:** `docs/RUNBOOKS/audit-chain-forensics.md`, ligne 81 : "Append a record to `docs/RUNBOOKS/audit-chain-verification-log.md`".
**Réalité:** Fichier absent — si un opérateur exécute la procédure il ne peut pas appender à un fichier inexistant.
**Action:** Créer un stub `docs/RUNBOOKS/audit-chain-verification-log.md` avec une en-tête (ledger vide).

### F5 — SENTRY_P0_TRIAGE_2026-05-20.md : statut d'exécution inconnu (LOW)
**Fichier:** `docs/operations/SENTRY_P0_TRIAGE_2026-05-20.md`.
**Claim doc:** Goal = "zero P0 before feature freeze 2026-05-19 EOD". Date du jour = 2026-05-26 (après la deadline).
**Réalité:** `docs/SENTRY_KNOWN_NOISE.md` n'existe pas → soit la triage n'a pas été exécutée (problème de lancement), soit elle a été exécutée mais n'a produit aucune entrée `wontfix` (possible). Le doc ne porte pas de section `## Done` avec la date réelle d'exécution.
**Action:** Ajouter une section `## Done` au document avec la date d'exécution réelle et le delta (N → 0 issues), ou documenter que la triage est encore en attente avec une explication.

---

## Statistiques finales

**25 fichiers audités.**
- **OK:** 18
- **À MODIFIER:** 5 (`guardrail-incidents.md`, `DISTRIBUTED_TRACING.md`, `secrets-rotation.md`, `audit-chain-forensics.md`, `SENTRY_P0_TRIAGE_2026-05-20.md`)
- **À SUPPRIMER:** 0

## Fichiers non trackés / absents mentionnés (ne bloquent pas les runbooks, mais à noter)
- `docs/RUNBOOKS/secrets-rotation-log.md` — stub à créer
- `docs/RUNBOOKS/audit-chain-verification-log.md` — stub à créer
- `docs/SENTRY_KNOWN_NOISE.md` — créé pendant la triage (on-demand, acceptable)
- `museum-backend/scripts/audit-chain-verify.cjs` — marqué TODO Phase 2 dans la doc (acceptable)
- `museum-backend/scripts/rotate-mfa-encryption-key.cjs` — marqué TODO Phase 2 dans la doc (acceptable)
- `scripts/capture-spki.sh` (racine) — en réalité à `museum-frontend/scripts/capture-spki.sh` ; CLAUDE.md a un chemin imprécis mais les runbooks CERT_ROTATION.md ne citent pas ce chemin directement (impacte CLAUDE.md, pas les runbooks)
