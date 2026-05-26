# Audit A11 — Legal / Compliance / Incidents
**Date**: 2026-05-26 | **Auditor**: read-only agent | **Scope**: docs/legal/*.md, docs/compliance/*.md, docs/incidents/*.md

---

## Tableau de synthèse

| Fichier | État | Confiance | Preuve (claim → réalité) | Action |
|---|---|---|---|---|
| `docs/legal/DPIA.md` | À MODIFIER | HIGH | Endpoint faux : claim `/api/auth/me/export` → réel `/api/users/me/export` (me.route.ts:11,42, api.router.ts:374). Endpoint delete correct dans le code (DELETE /account sur authProfileRouter), mais libellé doc dit `/api/auth/account/delete` (la méthode HTTP DELETE n'est pas un segment d'URL). Deadline DPO 2026-05-25 atteinte sans mandat signé (aujourd'hui 2026-05-26). Claim B2B musée comme personne concernée = anticipatoire (aucun musée contracté), mais formulé "utilisateurs B2B musée" sans nuance — risque juridique limité car DPIA peut couvrir des catégories futures, mais à nuancer. | Corriger les 2 endpoints. Documenter le statut DPO manqué. |
| `docs/legal/ROPA.md` | OK | HIGH | Toutes les durées de conservation cross-vérifiées contre `env.ts` (lignes 285, 363, 470-473). B2B "administrateurs musée" idem DPIA — anticipatoire mais défendable. Signature DPO manquante (mandat non signé, deadline 2026-05-25 ratée). Le doc lui-même est honnête : "DRAFT — à valider par DPO". | Documenter statut deadline DPO. Sinon OK. |
| `docs/legal/DPIA_ROPA_READINESS.md` | À MODIFIER | HIGH | Tracking doc dit deadline DPO = 2026-05-25 (J-7 avant launch). Aujourd'hui = 2026-05-26. Le mandat n'est pas signé (aucune mise à jour depuis 2026-05-13, `dpo@musaium.app` = alias non mandaté). La section "date cible signature complète 2026-05-26" = aujourd'hui, non atteinte. | Mettre à jour le statut : deadline manquée. Documenter la décision go/no-go launch avec risque accepté, ou escalade. |
| `docs/legal/DPIA_T1.1_addendum.md` | OK | HIGH | Claims techniques vérifiés : `CONSENT_SCOPES` existence dans `userConsent.entity.ts`, surfaces `AiConsentSheetContent` + `SettingsAiConsentCard`, gaps documentés honnêtement (enforcement runtime manquant, FE↔BE reconciliation manquante). Honnêteté UFR-013 respectée. | RAS |
| `docs/legal/AI_DISCLOSURE.md` | OK | HIGH | Implémentation vérifiée : `VoiceSessionIntro.tsx`, `ChatHeader.tsx`, `AiDisclosureSheetContent.tsx`, `AiDisclosureFooter.tsx` tous référencés et présents. Lien "Learn more" pointe encore `/privacy` (TD-42 documenté). | RAS |
| `docs/legal/AI_DISCLOSURE_AUDIT.md` | À MODIFIER | MEDIUM | Art. 50 status toujours `IN PROGRESS` dans `AI_ACT_CONFORMITY_MATRIX.md` (lignes 67-68), mais `AI_DISCLOSURE.md` dit "Status: implemented 2026-05-12". Discordance entre les 2 docs. L'audit lui-même est correct (pre-launch verdict "appears compliant") mais "pending legal sign-off" = attendu. | Mettre à jour AI_ACT_CONFORMITY_MATRIX.md Art. 50 status → `COMPLIANT` + evidence pointer vers `AI_DISCLOSURE.md`. |
| `docs/legal/SUBPROCESSORS.md` | OK | HIGH | Stub de redirection vers `docs/compliance/SUBPROCESSORS.md` — justification claire (ADR-062 canonicity). Liens corrects. Dernière mise à jour 2026-05-14. | RAS |
| `docs/legal/accessibility-statement-fr.md` | OK | HIGH | Statut "PARTIEL" honnête, aucune claim de conformité totale, audit axe-core 18 routes documenté (2026-05-14), passes manuelle + utilisateurs "non démarrées" admis. Adresse postale placeholder à remplir avant publication. Signature manquante (intentionnel — attendu audit complet). | Remplir adresse postale avant publication. |
| `docs/legal/accessibility-statement-en.md` | OK | HIGH | Idem FR — doublon intentionnel EN/FR. ADR-062 ne couvre que privacy/terms/subprocessors, PAS les déclarations d'accessibilité (vérifié — le doc ADR-062 ne mentionne pas l'EAA). Les deux fichiers FR/EN coexistent légitimement (obligation légale séparée par langue de publication). | RAS |
| `docs/compliance/SUBPROCESSORS.md` | À MODIFIER | HIGH | Entrée #19 (LLM-Guard) dit "Currently disabled (`GUARDRAILS_V2_CANDIDATE=off` default)" → FAUX depuis ADR-015 (2026-05-14) : flag `GUARDRAILS_V2_CANDIDATE` supprimé de `env.ts`, le sidecar est actif quand `GUARDRAILS_V2_LLM_GUARD_URL` est défini. Claim stale. Dernière revue 2026-04-26 (1 mois, cadence trimestrielle = OK). | Corriger l'entrée #19 : remplacer "Currently disabled (GUARDRAILS_V2_CANDIDATE=off)" par "Active si `GUARDRAILS_V2_LLM_GUARD_URL` défini (flag GUARDRAILS_V2_CANDIDATE supprimé ADR-015 2026-05-14)". |
| `docs/compliance/AI_ACT_CONFORMITY_MATRIX.md` | À MODIFIER | HIGH | Art. 50 §1 status = `IN PROGRESS` avec evidence "Phase 0 fold-in" → STALE : implémenté 2026-05-12 per `AI_DISCLOSURE.md`. Path evidence pointe vers `.claude/skills/team/team-state/…/compliance-research-eu-ai-act.md` (fichier non git-tracked, volatile). | Mettre à jour Art. 50 §1 → `COMPLIANT` + evidence pointer → `docs/legal/AI_DISCLOSURE.md` + `docs/legal/AI_DISCLOSURE_AUDIT.md`. |
| `docs/compliance/art5-audit.md` | À MODIFIER | HIGH | §2 dit "Musaium accepts users 13+ per ToS" → FAUX : `register.useCase.ts:18` déclare `MINIMUM_AGE_FOR_REGISTRATION = 15`, confirmé par `auth.schemas.ts:13-15`. L'âge réel est 15 (majorité numérique FR, Loi 2023-566), pas 13. | Corriger "13+" → "15+" dans §2 pour alignement avec le code et la DPIA. |
| `docs/compliance/DATA_FLOW_MAP.md` | À MODIFIER | HIGH | 3 issues marquées OPEN sont résolues dans le code : (1) G2 "No DSAR endpoint" → FAUX : `/api/users/me/export` (me.route.ts:42) + DELETE `/api/auth/account` existent. (2) G5/V4 "LLM cache key omits userId" → FAUX : `llm-cache.service.ts:119,127,130` inclut `userId|anon` dans la key depuis ADR-036 v2. (3) G9/V6 "EXIF not stripped" → FAUX : `image-processing.service.ts:13,50,64,79` strip EXIF via `sharp().rotate()`. Laisser ouvert G1 (DPA/SCC manquants partiels), G3 (breach SLA), G11 (privacy policy subprocessors), G12 (TIA US LLM) — non vérifiés résolus. | Marquer G2, G5, G9 comme `~~RESOLVED~~` dans la section "Open issues". Conserver G1/G3/G11/G12 ouverts. |
| `docs/compliance/FAIRNESS_METRICS_PLAN.md` | OK | HIGH | Métriques Prometheus vérifiées dans code : `prometheus-metrics.ts:347` (`musaium_guardrail_decisions_total`) et `:360` (`musaium_guardrail_category_blocks_total`). Phasing roadmap honnête (Phase 1.A pre-launch, Phase 2/3 post B2B). | RAS |
| `docs/incidents/BREACH_PLAYBOOK.md` | OK | MEDIUM | Playbook solide et wired : `breach-event-types.ts`, `auditCriticalSecurityEvent()`, `.github/workflows/breach-72h-timer.yml`, issue template. Section 9 "Open items" liste honnêtement les TBDs (DPO non mandaté, war-room channel TBD, etc.). Concordance infra réelle (OVH VPS, PG, S3, JWT rotation). Note : "Musaium SAS" dans §7.a CNIL template → legal entity non confirmée (Tim Moyence = Entrepreneur Individuel per DPIA, pas SAS). | Corriger §7.a : remplacer "Musaium SAS (TBD)" par "Tim Moyence — Entrepreneur Individuel (InnovMind / Musaium)" (aligné DPIA ligne 6). |
| `docs/incidents/POST_MORTEM_TEMPLATE.md` | OK | HIGH | Template propre, non rempli (correct — template). Référence playbook cohérente. Champs GDPR Art. 33/34 présents. | RAS |
| `docs/incidents/tabletop/db-compromise-sqli.md` | OK | HIGH | Scénario cohérent avec infra réelle (audit-chain, `verifyAuditChain()`, PG dump, PITR TBD). Référence `auth_session.revoked_at IS NULL` — schéma à vérifier pré-drill (noté dans playbook). "Last run: never" honnête. | RAS |
| `docs/incidents/tabletop/jwt-secret-leaked.md` | OK | HIGH | Scénario cohérent. Référence `JWT_ACCESS_SECRET` + `JWT_REFRESH_SECRET` duals, schéma `auth_session`. "Last run: never". | RAS |
| `docs/incidents/tabletop/openai-key-abuse.md` | OK | HIGH | Scénario le plus réaliste (LLM cost spike). Référence W3.V13 `AUDIT_GUARDRAIL_BLOCKED_*` — facilitateur doit vérifier si livré avant la date du drill. "Last run: never". | RAS |

---

## Findings notables

### F1 — CRITIQUE (éthique/juridique) : DPO non mandaté, deadline manquée (2026-05-25)
**Fichiers** : `DPIA.md`, `ROPA.md`, `DPIA_ROPA_READINESS.md`, `DPIA_T1.1_addendum.md`, `BREACH_PLAYBOOK.md`

La deadline ferme 2026-05-25 pour mandat DPO est passée (aujourd'hui 2026-05-26). `dpo@musaium.app` = alias redirigeant vers `tim.moyence@gmail.com`, pas un DPO mandaté. Sans DPO ou ratification, DPIA/ROPA restent non signées. `DPIA_ROPA_READINESS.md` date cible signature = 2026-05-26 (aujourd'hui) non atteinte. Ce n'est pas une erreur documentaire à corriger dans le doc — c'est un **bloquant de launch** à décider en équipe (go avec "risque accepté documenté" comme prévu au §5 du readiness, ou blocage). Le doc doit refléter l'état réel (deadline manquée) et documenter la décision prise.

### F2 — ERREUR FACTUELLE : art5-audit.md dit "13+" mais le code dit "15+"
**Fichier** : `docs/compliance/art5-audit.md:33`
**Code** : `museum-backend/src/modules/auth/useCase/registration/register.useCase.ts:18` → `MINIMUM_AGE_FOR_REGISTRATION = 15`

La doc compliance Art. 5(1)(b) affirme "Musaium accepts users 13+" — c'est factuellement faux. Le code applique 15 ans (majorité numérique FR). Risque : un régulateur AI Act lisant l'art5-audit se ferait une image incorrecte des mesures de protection des mineurs. Correction urgente.

### F3 — ERREUR FACTUELLE : DATA_FLOW_MAP liste 3 issues "OPEN" résolues dans le code
**Fichier** : `docs/compliance/DATA_FLOW_MAP.md` section "Open issues blocking GDPR sign-off"
- G2 ("No DSAR endpoint") → résolu : `/api/users/me/export` (me.route.ts:42) + `DELETE /api/auth/account`
- G5/V4 ("LLM cache key omits userId") → résolu : `llm-cache.service.ts:119-130` inclut `userId|anon`
- G9/V6 ("EXIF not stripped") → résolu : `image-processing.service.ts:13,50,64,79`

Un DPO qui lit ce doc croit que Musaium n'a pas d'endpoint DSAR ni de protection EXIF. Risque compliance élevé pour le dossier de lancement.

### F4 — ERREUR FACTUELLE : DPIA endpoint DSAR inexact
**Fichier** : `docs/legal/DPIA.md:145`

Claim : "export (Art. 15) via `/api/auth/me/export`" → réel : `/api/users/me/export` (route montée sous `/users` dans `api.router.ts:374`). Erreur mineure mais un DPO vérifiant la conformité technique trouverait l'endpoint incorrect.

### F5 — STALE : AI_ACT_CONFORMITY_MATRIX Art. 50 §1 toujours "IN PROGRESS"
**Fichier** : `docs/compliance/AI_ACT_CONFORMITY_MATRIX.md:67`

Art. 50 §1 status = `IN PROGRESS` avec evidence "Phase 0 fold-in" → implémenté depuis 2026-05-12 (AI_DISCLOSURE.md). Discordance avec `AI_DISCLOSURE_AUDIT.md` verdict "appears compliant". Risque : un auditeur externe consulte la matrix et conclut que Musaium n'est pas conforme Art. 50 alors que l'implémentation est en place.

### F6 — STALE : SUBPROCESSORS #19 LLM-Guard décrit comme "disabled" alors que le flag a été supprimé
**Fichier** : `docs/compliance/SUBPROCESSORS.md` entrée #19

`GUARDRAILS_V2_CANDIDATE=off` est cité comme contrôle d'activation → ce flag a été supprimé depuis ADR-015 (2026-05-14). Le sidecar LLM-Guard s'active désormais via `GUARDRAILS_V2_LLM_GUARD_URL`. Un déploiement croyant "le sidecar est off par défaut" pourrait manquer que l'URL seule suffit à l'activer.

---

## Résumé des actions

| Priorité | Fichier | Action |
|---|---|---|
| P0 | `DPIA_ROPA_READINESS.md` | Documenter deadline DPO manquée (2026-05-25) + décision go/no-go |
| P1 | `docs/compliance/art5-audit.md:33` | Remplacer "13+" par "15+" |
| P1 | `docs/compliance/DATA_FLOW_MAP.md` | Marquer G2, G5, G9 `~~RESOLVED~~` |
| P1 | `docs/compliance/AI_ACT_CONFORMITY_MATRIX.md:67` | Art. 50 §1 → `COMPLIANT` + evidence pointer |
| P2 | `docs/legal/DPIA.md:145` | Corriger endpoint `/api/auth/me/export` → `/api/users/me/export` |
| P2 | `docs/compliance/SUBPROCESSORS.md` entrée #19 | Corriger mention `GUARDRAILS_V2_CANDIDATE=off` → "Active si `GUARDRAILS_V2_LLM_GUARD_URL` défini" |
| P2 | `docs/incidents/BREACH_PLAYBOOK.md:328` | Corriger "Musaium SAS" → "Tim Moyence — Entrepreneur Individuel" |

---

**END A11 — Legal/Compliance/Incidents audit. 2026-05-26.**
