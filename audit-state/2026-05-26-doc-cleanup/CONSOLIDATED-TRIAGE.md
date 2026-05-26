# CONSOLIDATED-TRIAGE — Audit doc-cleanup 2026-05-26

Consolidation fidèle de 13 rapports A1..A13. Aucun re-vérification de code.
Auditeur consolidateur : Claude Sonnet 4.6 (read-only, 2026-05-26).

---

## 1. Résumé exécutif

### Compteurs globaux (tous scopes)

| Zone | Total audités | OK | À MODIFIER | À SUPPRIMER |
|---|---|---|---|---|
| ADR-002..022 (A1) | 19 | 9 | 10 | 0 |
| ADR-023..046 (A2) | 23 | 21 | 2 | 0 |
| ADR-047..068 + README ADR (A3) | 23 | 17 | 4 (+README) | 0 |
| audit-state/ passés (A4) | 103 | 4+1? | 1 (vérif) | 98 |
| Living docs DOCS_INDEX/ROADMAP/TECH_DEBT (A5) | 7 | 2 | 5 | 0 |
| Engineering docs (A6) | 14 | 3 | 11 | 0 |
| Ops/AI docs (A7) | 16 | 6 | 8 (+2 mineurs) | 0 |
| Operations/Runbooks/Observabilité (A8) | 25 | 18 | 5 | 0 |
| .claude/ agents + skills + team (A9) | 31 | 23 | 5+bonus | 0 |
| Root + App READMEs (A10) | 33 | 25 | 5 | 0 |
| Legal / Compliance / Incidents (A11) | 19 | 11 | 7 | 0 |
| Memory + Lessons (A12) | 41+10 | 30 | 14 | 3 |
| lib-docs LESSONS.md (A13) | 98 | 88 | 4 | 1 |
| **TOTAL** | **~462** | **~257** | **~81** | **~102** |

> Note : les fichiers "À MODIFIER (vérif avant action)" comptent en **À MODIFIER** pour ne pas minimaliser.

### Scope exclu (non audité)

- `lib-docs/*/snapshot-*.md` — raw WebFetch dumps, non-trackés, régénérables
- `lib-docs/*/PATTERNS.md` — générés par doc-curator, non-trackés
- `lib-docs/*/sources.json` / `VERSION` — non-trackés
- Plugins vendored : `.claude/skills/gitnexus/`, `/superpowers/`, `/expo/`, `/sentry/`, `/code-review/`, `/frontend-design/`
- `ios/Pods/` — committés pour Xcode Cloud, immutables en review
- `audit-state/2026-05-26-doc-cleanup/` — audit en cours, hors scope

---

## 2. Patterns transverses (récurrences inter-agents)

### P1 — Fantôme `llm-security-garak.yml` (A3, A7)
**2 docs touchés.** `llm-security-garak.yml` supprimé 2026-05-17 (coût réel ~$120/mois, ADR-049 amendment), mais :
- `docs/AI_SAFETY.md §10` : le cite encore comme CI gate actif ("nightly + on guardrail-touching PR")
- `docs/adr/ADR-049-llm-security-ci-gates.md` : OK (amendment en tête, suppression documentée correctement)
**Correction unique** : dans `AI_SAFETY.md §10`, barrer la ligne garak ou la marquer `~~supprimé 2026-05-17 (ADR-049 amendment, coût $120/mois, déferré V2.1)~~`.

### P2 — Path incorrect `screen-test-coverage.mjs` (A6, A6×4 fichiers)
**4 docs touchés.** La sentinelle est à `scripts/sentinels/screen-test-coverage.mjs` (ROOT), wiring `package.json:22` (ROOT). Tous les docs disent `museum-frontend/scripts/sentinels/screen-test-coverage.mjs` + `museum-frontend/package.json:21`.
**Fichiers** : `TEST_INDEX.md`, `TEST_COVERAGE_INVENTORY.md`, `TESTING_DISCIPLINE_PROPOSAL.md`, `TESTING_PHASE2_PLAN.md` (3 occurrences).
**Correction unique** : remplacer `museum-frontend/scripts/sentinels/` → `scripts/sentinels/` + `museum-frontend/package.json:21` → `package.json:22`.

### P3 — Cache key LLM `v1` → `v2` (A1 via CLAUDE.md, A2 ADR-038)
**2 docs touchés.** Bump 2026-05-19 (commit `d54552beb`) inclu `voiceMode`+`audioDescriptionMode` dans le hash.
- `ADR-038-sources-citations.md §Neutral` : dit encore `llm:v1:...`
- `CLAUDE.md §Pièges connus` : **à jour** (v2 documenté + note staleness TD-DOC-WAVEC-01)
**Correction unique** : ADR-038 §Neutral → `llm:v2:...` (bumped 2026-05-19 commit d54552beb).

### P4 — Date launch `2026-06-01` vs `2026-06-07` incohérentes (A5, A10, A11)
**3 docs touchés.** `ROADMAP_PRODUCT.md` (source de vérité) dit `2026-06-07 (minimum, à reconfirmer)`.
- `ROADMAP_TEAM.md` ligne 4/73 : `2026-06-01`
- `SECURITY.md` ligne 9 : `2026-06-01`
- `RELEASE_CHECKLIST.md` (implicitement stale, pas relevé spécifiquement dans A7)
**Correction unique** : aligner tous sur `2026-06-07 (minimum, à reconfirmer)`.

### P5 — `agent-roi.json` fantôme (A9)
**4+ fichiers touchés** dans `.claude/skills/team/`. Le fichier sur disque est `agent-performance.json`. `agent-roi.json` n'a jamais existé à ce path (aucun commit).
**Fichiers** : `SKILL.md:489`, `finalize.md:23`, `enterprise.md:141`, `STORY.md.tmpl:69`, + 4 lessons (archivées — ne pas toucher).
**Correction unique** : renommer les références dans `SKILL.md` Step 9 §1 et `finalize.md` §1 (et optionnellement `enterprise.md` + `STORY.md.tmpl`).

### P6 — Fichiers env fantômes `.env.local.example` / `.env.staging.example` (A7, A10)
**2 docs touchés.** Seuls `.env.example` et `.env.production.example` existent dans `museum-backend/`.
- `docs/OPS_DEPLOYMENT.md §5` : cite `.env.local.example`
- `museum-backend/README.md §Environment Setup` : liste les 3 cp dont 2 fantômes
**Correction unique** : supprimer les 2 références aux fichiers inexistants (ou ajouter une note "à créer").

### P7 — ADR count / index incomplets (A3, A5)
**2 docs touchés.** ADR-059 à ADR-068 absents de deux index :
- `docs/adr/README.md` : s'arrête à ADR-060, annonce "52 ADRs" (réalité : ~64 fichiers)
- `docs/DOCS_INDEX.md` ligne 24 : annonce "ADRs (002-058)", 9 ADRs manquants (059-065, 067, 068)
**Correction unique** : ajouter ADR-059..068 dans les deux tables d'index + corriger les counts.

### P8 — Compliance DATA_FLOW_MAP issues "OPEN" en réalité résolues (A11)
**1 doc, 3 issues.** `docs/compliance/DATA_FLOW_MAP.md` liste G2 (no DSAR), G5/V4 (LLM cache sans userId), G9/V6 (EXIF non strippé) comme bloquants GDPR alors que tous sont résolus dans le code.
**Correction unique** : marquer G2, G5, G9 comme `~~RESOLVED~~` avec pointeurs code.

### P9 — AI_ACT status Art. 50 `IN PROGRESS` alors qu'implémenté (A11)
**2 docs touchés.** Implémenté 2026-05-12 (`AI_DISCLOSURE.md` dit "implemented").
- `docs/compliance/AI_ACT_CONFORMITY_MATRIX.md:67` : `IN PROGRESS`
- `docs/legal/AI_DISCLOSURE_AUDIT.md` (discordance) : dit "appears compliant"
**Correction unique** : `AI_ACT_CONFORMITY_MATRIX.md` Art. 50 §1 → `COMPLIANT`, pointer vers `docs/legal/AI_DISCLOSURE.md`.

---

## 3. À SUPPRIMER — manifeste exact

### 3.1 audit-state/ (98 fichiers de l'audit passé + 1 à vérifier)

| Groupe | Fichiers | Justification | Action |
|---|---|---|---|
| `2026-05-23-frontend-dry-audit/SUIVI.md` | 1 | Working-state consommé, findings promus en MISSIONS/TECH_DEBT | `rm -rf audit-state/2026-05-23-frontend-dry-audit/` |
| `2026-05-25-full-audit/phase-a-roadmap/A1..A9` | 9 | Pass-1 supersédée par pass-2 (verdicts incorrects sur I-SEC8, I-CMP3). Consolidée dans REPORT.md | `rm -rf audit-state/2026-05-25-full-audit/phase-a-roadmap/` |
| `2026-05-25-full-audit/phase-b-diffs/B1..B16` | 16 | Pass-1 quality reviews. Consolidés dans REPORT.md | `rm -rf audit-state/2026-05-25-full-audit/phase-b-diffs/` |
| `2026-05-25-full-audit/phase-c-e2e/C1..C10` | 10 | E2E traces pass-1. Consolidés dans REPORT.md | `rm -rf audit-state/2026-05-25-full-audit/phase-c-e2e/` |
| `2026-05-25-full-audit/pass2-finegrain/leaf/L01..L39` | 39 | Agrégés par AGG, agrégés dans REPORT-PASS2.md (vivant). Intermédiaires | `rm -rf audit-state/2026-05-25-full-audit/pass2-finegrain/leaf/` |
| `2026-05-25-full-audit/pass2-finegrain/agg/AGG1..AGG8` | 8 | Consolidés dans REPORT-PASS2.md (vivant) | `rm -rf audit-state/2026-05-25-full-audit/pass2-finegrain/agg/` |
| `2026-05-25-full-audit/PLAN.md` | 1 | Plan orchestration (comment les 32 agents ont été lancés). Jamais référencé | `rm` |
| `2026-05-25-full-audit/roadmap-ticks.md` | 1 | Ticks proposés, tous appliqués à ROADMAP_PRODUCT.md | `rm` |
| `2026-05-25-full-audit/PRE-LAUNCH-PLAN.md` | 1 | Contenu promu dans ROADMAP_PRODUCT.md (waves 1..4) | `rm` |
| `2026-05-25-full-audit/WORKTREE-PROMPTS.md` | 1 | Supersédé par MISSIONS.md. Jamais référencé | `rm` |
| `2026-05-25-full-audit/MISSIONS.md` | 1 | Seeds de lancement des worktrees. Valeur = worktrees lancés, pas le prompt. Jamais référencé | `rm` |
| `2026-05-25-full-audit/MISSIONS-EXPLAINED.md` | 1 | Version pédagogique. Aucun lien depuis docs/ ou code | `rm` |
| `2026-05-25-roadmap-reconstruction/VERIFICATION_TASKLIST.md` | 1 | Plan de vérification consommé | `rm` |
| `2026-05-25-roadmap-reconstruction/findings/D1-lot1-security.md` | 1 | Consolidé dans CONSOLIDATED_STATE.md (vivant) | `rm` |
| `2026-05-25-roadmap-reconstruction/findings/D2-lot3-feature-gates.md` | 1 | idem | `rm` |
| `2026-05-25-roadmap-reconstruction/findings/D3-lot2-gdpr.md` | 1 | idem | `rm` |
| `2026-05-25-roadmap-reconstruction/findings/D4-lot4-stability.md` | 1 | idem | `rm` |
| `2026-05-25-roadmap-reconstruction/findings/D6-lot6-burial.md` | 1 | idem | `rm` |
| `2026-05-25-roadmap-reconstruction/findings/D7a-shipped-reverif.md` | 1 | idem | `rm` |
| `2026-05-25-roadmap-reconstruction/findings/D7bc-reconciled-falsified.md` | 1 | idem | `rm` |
| `2026-05-25-roadmap-reconstruction/findings/D8-techdebt-now.md` | 1 | idem | `rm` |

**Total À SUPPRIMER audit-state/ : 98 fichiers**

#### 5 fichiers À PRÉSERVER ABSOLUMENT (référencés par des docs vivants)

| Fichier | Référençant | Nature |
|---|---|---|
| `audit-state/2026-05-25-full-audit/REPORT.md` | `docs/ROADMAP_PRODUCT.md:74` | Lien hypertexte cliquable |
| `audit-state/2026-05-25-full-audit/REPORT-PASS2.md` | `docs/ROADMAP_PRODUCT.md:89` | Lien hypertexte cliquable |
| `audit-state/2026-05-25-roadmap-reconstruction/CONSOLIDATED_STATE.md` | `docs/ROADMAP_PRODUCT.md:65` | Lien hypertexte cliquable |
| `audit-state/2026-05-25-roadmap-reconstruction/findings/D5-lot5-a11y.md` | `docs/adr/ADR-068...:15,48` | §Context + §References ADR permanent |
| `audit-state/2026-05-26-doc-cleanup/` (tout le dossier courant) | — | Audit en cours |

#### 1 fichier À VÉRIFIER avant suppression

`audit-state/2026-05-25-roadmap-reconstruction/LOT-P0-STABILITY-CLOSURE.md` : référencé textuellement dans `ROADMAP_PRODUCT.md:87` avec avertissement UFR-013 ("claims creux — code non sur dev"). Contient 4 runbooks ops (I-OPS5 backup S3, I-OPS2 exporters, I-OPS3 DR fresh-DB, I-OPS8d branch-protection) qui semblent non promus dans `docs/OPS_DEPLOYMENT.md`. **Vérifier** si ces runbooks sont promus avant suppression. Si oui : `rm`. Si non : promouvoir d'abord dans `docs/OPS_DEPLOYMENT.md`.

### 3.2 Autres fichiers À SUPPRIMER (hors audit-state/)

| Fichier | Zone | Justification |
|---|---|---|
| `.claude/projects/.../memory/project_v3_decisions.md` (repo-tracked) | Memory | 3 décisions de 2026-03-26, toutes exécutées depuis 2 mois (Maestro 42 flows ✓, Lighthouse CI ✓, Wikidata ✓). Aucune valeur résiduelle. |
| `.claude/projects/.../memory/2026-05-25-p0-cleanup.md` (lesson) | Lessons | Intégralement vide (toutes sections = `_no data captured_`). |
| `lib-docs/framer-motion/LESSONS.md` (+ dossier) | lib-docs | `framer-motion` renommé `motion`, retiré de tous les `package.json`. Stub dit "legacy alias — do not edit". Leçons canoniques dans `lib-docs/motion/LESSONS.md`. |

### 3.3 Commande shell de suppression sûre (NE PAS EXÉCUTER — proposition seulement)

```bash
# ============================================================
# ÉTAPE 0 : Vérifier LOT-P0-STABILITY-CLOSURE.md AVANT
# grep -n "I-OPS5\|I-OPS3\|I-OPS8d\|I-OPS2" \
#   audit-state/2026-05-25-roadmap-reconstruction/LOT-P0-STABILITY-CLOSURE.md
# → si runbooks non promus dans docs/OPS_DEPLOYMENT.md : promouvoir d'abord
# ============================================================

# PRÉSERVÉS : REPORT.md, REPORT-PASS2.md, CONSOLIDATED_STATE.md, D5-lot5-a11y.md
# Supprimer audit 2026-05-23
rm -rf audit-state/2026-05-23-frontend-dry-audit/

# Supprimer pass-1 complète (35 fichiers)
rm -rf audit-state/2026-05-25-full-audit/phase-a-roadmap/
rm -rf audit-state/2026-05-25-full-audit/phase-b-diffs/
rm -rf audit-state/2026-05-25-full-audit/phase-c-e2e/
rm -rf audit-state/2026-05-25-full-audit/pass2-finegrain/leaf/
rm -rf audit-state/2026-05-25-full-audit/pass2-finegrain/agg/

# Supprimer fichiers racine full-audit (sauf REPORT.md + REPORT-PASS2.md)
rm audit-state/2026-05-25-full-audit/PLAN.md
rm audit-state/2026-05-25-full-audit/roadmap-ticks.md
rm audit-state/2026-05-25-full-audit/PRE-LAUNCH-PLAN.md
rm audit-state/2026-05-25-full-audit/WORKTREE-PROMPTS.md
rm audit-state/2026-05-25-full-audit/MISSIONS.md
rm audit-state/2026-05-25-full-audit/MISSIONS-EXPLAINED.md

# Supprimer roadmap-reconstruction (sauf CONSOLIDATED_STATE.md + D5 + LOT-P0 à décider)
rm audit-state/2026-05-25-roadmap-reconstruction/VERIFICATION_TASKLIST.md
rm audit-state/2026-05-25-roadmap-reconstruction/findings/D1-lot1-security.md
rm audit-state/2026-05-25-roadmap-reconstruction/findings/D2-lot3-feature-gates.md
rm audit-state/2026-05-25-roadmap-reconstruction/findings/D3-lot2-gdpr.md
rm audit-state/2026-05-25-roadmap-reconstruction/findings/D4-lot4-stability.md
rm audit-state/2026-05-25-roadmap-reconstruction/findings/D6-lot6-burial.md
rm audit-state/2026-05-25-roadmap-reconstruction/findings/D7a-shipped-reverif.md
rm audit-state/2026-05-25-roadmap-reconstruction/findings/D7bc-reconciled-falsified.md
rm audit-state/2026-05-25-roadmap-reconstruction/findings/D8-techdebt-now.md

# Supprimer LOT-P0 (SEULEMENT APRÈS vérification étape 0)
# rm audit-state/2026-05-25-roadmap-reconstruction/LOT-P0-STABILITY-CLOSURE.md

# Hors audit-state/
rm .claude/projects/-Users-Tim-Desktop-all-dev-Pro-InnovMind/memory/project_v3_decisions.md
rm .claude/projects/-Users-Tim-Desktop-all-dev-Pro-InnovMind/memory/2026-05-25-p0-cleanup.md
rm -rf lib-docs/framer-motion/
```

---

## 4. À MODIFIER — liste actionnable priorisée

### Sévérité P0 (dangereux/bloquant en prod ou compliance)

| Fichier | Sévérité | Claim faux | Correction (vérité-code) | Source |
|---|---|---|---|---|
| `docs/CI_CD_SECRETS.md:48` | **P0** | "`--no-verify` est toléré en dernier recours mais à documenter" | UFR-020 : bypass interdit **sans exception**. Supprimer la phrase de tolérance, remplacer par "UFR-020 — bypass interdit, voir CLAUDE.md § Hook bypass interdit". | A6/F1 |
| `docs/RUNBOOKS/guardrail-incidents.md` (S7 ligne ~251) | **P0** | `grep "image:.*llm-guard" /Users/Tim/Desktop/all/dev/Pro/InnovMind/infra/docker-compose.prod.yml` — chemin absolu local + fichier inexistant | Remplacer par `grep "image:.*llm-guard" museum-backend/deploy/docker-compose.prod.yml` (depuis racine repo). S7 = supply-chain compromise P0, commande cassée = runbook mort. | A8/F2 |
| `docs/OPS_INCIDENT_LLM_GUARD.md` (§2 lignes 23, 107) | **P0** | `jq '.llmGuardCircuitBreaker'` et `jq '.llmGuardCircuitBreaker.state'` → retournent `null` | Remplacer par `jq '.checks.llmGuard'` et `jq '.checks.llmGuard.state'` (`api.router.ts:112,166`). Un SRE à 03:00 obtient `null` et croit le circuit breaker absent. | A7/F1 |
| `docs/CHAOS_RUNBOOKS.md §1` | **P0** | `RATE_LIMIT_FAIL_OPEN=true` — variable inexistante dans le code | Remplacer par `RATE_LIMIT_FAIL_CLOSED=false` (`env.ts:198`, ADR-011). L'escape hatch est `RATE_LIMIT_FAIL_CLOSED=false`, pas `FAIL_OPEN`. Un op suit le runbook verbatim et rien ne se passe. | A7/F4 |
| `docs/compliance/art5-audit.md:33` | **P0** | "Musaium accepts users 13+" | Remplacer par "15+" — `register.useCase.ts:18` déclare `MINIMUM_AGE_FOR_REGISTRATION = 15` (majorité numérique FR). Un régulateur AI Act lit 13 alors que le code enforces 15. | A11/F2 |
| `docs/legal/DPIA_ROPA_READINESS.md` | **P0** | Deadline DPO 2026-05-25 (hier) non atteinte, état non documenté | Documenter deadline manquée + décision go/no-go launch avec risque accepté (ou escalade). Le mandat DPO n'est pas signé, `dpo@musaium.app` = alias non mandaté. | A11/F1 |

### Sévérité P1 (erreurs factuelles à impact significatif)

| Fichier | Sévérité | Claim faux | Correction (vérité-code) | Source |
|---|---|---|---|---|
| `docs/CONTRIBUTING.md §8` | **P1** | 5 gates pré-commit (<5s), 10 gates pré-push (<30s) | Réalité : 8 gates pré-commit, 21 gates pré-push, budget <2min. Mettre à jour les deux tableaux complets. | A6/F2 |
| `docs/compliance/DATA_FLOW_MAP.md` (section Open issues) | **P1** | G2 "No DSAR endpoint", G5/V4 "LLM cache omits userId", G9/V6 "EXIF not stripped" marqués OPEN bloquants GDPR | Marquer ~~RESOLVED~~ avec preuves code : G2→`me.route.ts:42`, G5→`llm-cache.service.ts:119-130`, G9→`image-processing.service.ts:50`. Un DPO croit 3 gaps compliance non résolus. | A11/F3 |
| `docs/compliance/AI_ACT_CONFORMITY_MATRIX.md:67` | **P1** | Art. 50 §1 = `IN PROGRESS` | → `COMPLIANT`, evidence pointer → `docs/legal/AI_DISCLOSURE.md` + `docs/legal/AI_DISCLOSURE_AUDIT.md`. Implémenté 2026-05-12. | A11/F5 |
| `docs/legal/AI_DISCLOSURE_AUDIT.md` | **P1** | Discordance avec `AI_ACT_CONFORMITY_MATRIX.md` sur Art. 50 | Aligner en même temps que le correctif AI_ACT_CONFORMITY_MATRIX. | A11 |
| `docs/compliance/SUBPROCESSORS.md` entrée #19 | **P1** | "Currently disabled (`GUARDRAILS_V2_CANDIDATE=off` default)" | `GUARDRAILS_V2_CANDIDATE` supprimé (ADR-015 2026-05-14). Sidecar actif si `GUARDRAILS_V2_LLM_GUARD_URL` défini. Remplacer l'état. | A11/F6 |
| `docs/adr/ADR-037-pgvector-halfvec-index.md` | **P1** | IVFFlat index dans 3 endroits + conseils `lists` parameter | Code réel : HNSW (`m=16, ef_construction=64`) depuis jour-1 (`1778406339944-AddArtworkEmbeddings.ts:72-78`). Conseils IVFFlat inapplicables à HNSW. Ops risk : fausse manœuvre de tuning. Aussi corriger `siglip-base` → `siglip2-base-patch16-224`. | A2/F1 |
| `docs/AI_SAFETY.md §10` | **P1** | `llm-security-garak.yml` cité comme CI gate actif | Fichier absent (supprimé 2026-05-17). Barrer/marquer supprimé avec renvoi ADR-049. | A7/F2 |
| `docs/adr/README.md` (docs/adr/) | **P1** | Table s'arrête à ADR-060, annonce "52 ADRs" | Ajouter ADR-061..068 (8 entrées). Corriger le count (~64 fichiers réels). | A3/F1 |
| `docs/DOCS_INDEX.md` ligne 24 + ligne 35 | **P1** | "ADRs (002-058)" — 9 ADRs manquants ; ref morte `HANDOFF-2026-05-19-debt-collision-report.md` avec faux label "load-bearing per CLAUDE.md:158" | Étendre la plage à 002-068 + ajouter les 9 ADRs manquants (059-065, 067, 068). Supprimer ligne 35. | A5/F1+F2 |
| `docs/observability/DISTRIBUTED_TRACING.md §5` | **P1** | "The middleware is exported but **not yet mounted**" + instructions pour activer | `tracePropagationMiddleware` monté à `app.ts:135` depuis W4 W6.9. Remplacer §5 par "Wired at `app.ts:135`". Corriger typo `traceePropagation` → `tracePropagation`. | A8/F1 |
| `docs/legal/DPIA.md:145` | **P1** | endpoint DSAR `/api/auth/me/export` | Réel : `/api/users/me/export` (`me.route.ts:42`, `api.router.ts:374`) | A11/F4 |

### Sévérité P2 (claims faux, impact modéré)

| Fichier | Sévérité | Claim faux | Correction (vérité-code) | Source |
|---|---|---|---|---|
| `docs/adr/ADR-003-auth-route-split-deferred.md` | **P2** | Status: "Deferred (2026-04-20)" | Status → "Implemented (2026-05-05, commit b36c67b96)". Code cite même ADR-003 (`auth.route.ts:11`). | A1/F1 |
| `docs/adr/ADR-010-eslint-10-harmonize-deferred.md` | **P2** | Décision : garder BE sur `eslint ^10.2.0` | Commit `42d81090a` (2026-05-17) : BE descend à `^9.39.4`, monorepo uniforme. Ajouter section amendment 2026-05-17. ADR-032 répercute la même erreur (corriger aussi). | A1/F2 |
| `docs/adr/ADR-038-sources-citations.md §Neutral` | **P2** | Cache key `llm:v1:...` | Key bumped → `v2` (commit `d54552beb` 2026-05-19). Ajouter note/amendment. | A2/F2 |
| `docs/adr/ADR-048-guardrail-strategy-interface.md` | **P2** | Status: "Proposed", 6 cases non cochées | Code `guardrail-provider.port.ts:115` implémenté. Status → Accepted, cocher les 6 cases, aligner README. | A3/F2 |
| `docs/adr/ADR-063-langfuse-mask-central.md:135` | **P2** | "ce ADR-061 NE migre PAS" (auto-référence fausse avant renommage) | Remplacer "ce ADR-061" → "ce ADR-063". | A3/F3 |
| `docs/adr/ADR-066-rn-modal-pointer-events-routing.md` | **P2** | `commit \`<placeholder>\`` non résolu | Remplacer par le vrai SHA ou supprimer le placeholder. | A3/F4 |
| `docs/adr/ADR-067-base-modal-custom-vs-radix.md` | **P2** | "PR pending — branch `dev`" | `BaseModal.tsx` présent sur dev → PR mergée. Retirer "PR pending". | A3/F4 |
| `docs/ROADMAP_PRODUCT.md` (OKR ligne 53) | **P2** | BLOCKER KR2 : "reviews table sans museumId, NPS 0-10 non implémenté. Voir P0.B7." | Migration museumId faite (#295) mais NPS `aggregateNps` dead-code (0 caller). Renvoi → P0.C7+P0-FA4 (pas P0.B7). North Star note P0.B9 stale (fix FE appliqué, bypass réel en BE `prepare-message.pipeline.ts:482`, voir P0-FA3). | A5/F1+F5 |
| `docs/ROADMAP_PRODUCT.md:40` | **P2** | "PostHog" dans tableau Audience | Remplacer par "Plausible" (câblé sur dev, PostHog jamais implémenté). | A5/F2 |
| `docs/ROADMAP_PRODUCT.md:107` | **P2** | `doc-anchor-check.mjs` cité comme sentinelle UFR-024 active | `scripts/sentinels/doc-anchor-check.mjs` n'existe pas. UFR-024 n'est pas enforced mécaniquement. Corriger/supprimer la référence. | A5/F4 |
| `docs/ROADMAP_TEAM.md` lignes 4/73 | **P2** | Sprint end "2026-06-01" | ROADMAP_PRODUCT source de vérité dit "2026-06-07 minimum". Aligner. | A5/F1 |
| `docs/RELEASE_CHECKLIST.md §3.3` | **P2** | Feature flags `FEATURE_FLAG_VOICE_MODE`, `FEATURE_FLAG_USER_MEMORY`, etc. | Vars inexistantes dans `env.ts` (grep vide). Voice pipeline always-on depuis 2026-04. Supprimer §3.3 entièrement. | A7/F3 |
| `docs/RELEASE_CHECKLIST.md §5.1.A` | **P2** | "version complète de la section 2.1.D ci-dessus" — section inexistante | Remplacer la référence dangling par contenu inline ou renvoi §2.1. | A7 |
| `docs/UPTIME_MONITORING.md` | **P2** | `<prod-domain>` / `<staging-domain>` placeholders non résolus | Remplacer `<prod-domain>` par `api.musaium.com`. Supprimer section staging (pas de staging V1 per memory). | A7 |
| `docs/GDPR_ART22_SCOPE.md §5` | **P2** | "Phase 1 will ship the `GET /api/chat/messages/:id/explanation` endpoint preemptively" | Endpoint déjà livré (commit `c59cabc6b`, `chat-module.ts:926`, `explanation.controller.ts`). Mettre à jour → "Livré en V1". | A7/F5 |
| `docs/incidents/BREACH_PLAYBOOK.md:328` | **P2** | "Musaium SAS (TBD)" dans §7.a template CNIL | Remplacer par "Tim Moyence — Entrepreneur Individuel (InnovMind / Musaium)" (aligné DPIA ligne 6). | A11 |
| `SECURITY.md:9` | **P2** | V1 target date `2026-06-01` | → `2026-06-07 (minimum, à reconfirmer)` | A10/F3 |
| `museum-backend/README.md §Environment Setup` | **P2** | `cp .env.local.example .env` + `cp .env.staging.example .env` | Fichiers inexistants. Retirer les 2 lignes cp ou ajouter note "à créer". | A10/F4 |
| `museum-web/README.md §More docs` | **P2** | Lien `../docs/CDN_CLOUDFLARE_SETUP.md` | Fichier inexistant. Doc CDN réel = `docs/adr/ADR-024-cloudflare-cdn-strategy.md`. | A10/F5 |
| `docs/RUNBOOKS/secrets-rotation.md` (tableau cadence) | **P2** | `JWT_MFA_SECRET` — nom inexistant dans le code | Remplacer par `MFA_SESSION_TOKEN_SECRET` (`env.production-validation.ts:214`). | A8/F3 |
| `.claude/skills/team/team-sdlc-index.md` (colonne Model) | **P2** | `editor`, `verifier`, `security`, `doc-fetcher`, `doc-curator` affichent `opus-4.6` | Réalité : `claude-opus-4-7` (frontmatter de chaque agent, commit `97b02e2bf`). Corriger 5 lignes. | A9/F1 |
| `.claude/skills/team/team-protocols/finalize.md §1` | **P2** | Cite `team-knowledge/agent-roi.json` | Fichier réel = `agent-performance.json`. Idem dans `SKILL.md:489`. | A9/F2 |
| `.claude/skills/team/team-state/README.md` | **P2** | Titre "V12", lifecycle 6 étapes v12, pseudo-TypeScript pour lock, 8 artefacts v13 manquants dans layout | Mettre à jour → V13, lifecycle 9 phases UFR-022, bash CAS lock, ajouter layout artefacts v13. | A9/F3 |
| `.claude/skills/recap/SKILL.md` (Source 6) | **P2** | `wc -l .claude/team-knowledge/*.json` | Path faux. Réel : `.claude/skills/team/team-knowledge/`. Commande retournerait 0 silencieusement. | A9/F4 |
| `CLAUDE.md §Common Commands` lignes 28/54 | **P2** | `pnpm lint # typecheck (tsc --noEmit)` (backend + frontend) | Réalité BE : ESLint + lint:test-discipline + tsc. Réalité FE : ESLint + tsc. Corriger les 2 commentaires. | A10/F1 |
| `CLAUDE.md §Token Discipline` (chemin artworks.data.ts) | **P2** | `museum-backend/src/modules/daily-art/artworks.data.ts` | Réel : `museum-backend/src/modules/daily-art/adapters/secondary/catalog/artworks.data.ts`. | A10/F2 |
| `museum-frontend/features/README.md` | **P2** | Table "Status per feature" manque 5 features (diagnostics, home, legal, paywall, support) | Ces 5 dossiers existent (`ls` vérifié). Ajouter ou mettre à jour la date. | A10/F6 |
| `docs/adr/ADR-006-ssrf-defense-in-depth.md` (impl note) | **P2** | path `...adapters/secondary/html-scraper.ts` + caller `chat-message.service.ts:260` | Réel : `...adapters/secondary/scraper/html-scraper.ts` + `prepare-message.pipeline.ts:172`. | A1/F3 |
| `docs/adr/ADR-002-typeorm-1-0-mitigation.md` | **P2** | Pin décrit `>=0.3.27 <1.0.0` ; 113 migrations, 19 entités | Réel : pin exact `0.3.28` ; 69 migrations, 24 entités. | A1 |
| `docs/adr/ADR-004-ios26-a18pro-crash-watch.md` | **P2** | Status "Active monitoring" sans résolution documentée | Ajouter section amendment "2026-05-14 RESOLVED via Expo SDK downgrade" + statut watching. | A1 |
| `docs/adr/ADR-007-coverage-gate-policy.md` | **P2** | Thresholds stales (BE 88/77/85/88, FE 86/74/72/87, Web 70/60/70/70) | Réels : BE 88/74/86/89 (`jest.config.ts:127-130`), FE 91/78/80/91 (`jest.config.js`), Web 70/54/64/68 (`vitest.config.ts:53-57`). | A1 |
| `docs/adr/ADR-015-llm-judge-guardrail-v2.md` | **P2** | Référence `guardrail-evaluation.service.ts:118` pour confidence | Réel : `eval/v2-layers.helper.ts:45` (refactorisé). | A1 |
| `docs/adr/ADR-017-mfa-rn-wire-deferred.md` | **P2** | 6 phases toutes déférées post-launch+30j | Phase 1 partiellement livrée : `app/(stack)/mfa-enroll.tsx` shiped via TD-SEC-02 (R8). `mfa-challenge.tsx` manque encore. | A1/F5 |
| `docs/ARCHITECTURE.md` | **P2** | Module list "admin/auth/leads/museum/review/support" — `telemetry` absent | `museum-backend/src/modules/telemetry/` existe avec structure hexagonale. | A6/F4 |
| `docs/TEST_INDEX.md + TEST_COVERAGE_INVENTORY.md + TESTING_DISCIPLINE_PROPOSAL.md + TESTING_PHASE2_PLAN.md` (×4) | **P2** | path `museum-frontend/scripts/sentinels/screen-test-coverage.mjs` | Réel : `scripts/sentinels/screen-test-coverage.mjs` (ROOT). Voir Pattern P2. | A6/F3 |
| `docs/ROADMAP_FE_RN_BEST_PRACTICES.md item F11` | **P2** | "cf. CLAUDE.md §Coverage uplift gates" | Section inexistante dans CLAUDE.md. Thresholds dans `museum-frontend/jest.config.js:61-64`. | A6/F5 |
| `docs/AI_VOICE.md` (table FE) | **P2** | "TODO J2: cache local expo-file-system" pour `useTextToSpeech` | Cache implémenté (`useTextToSpeech.ts:4,40`). Mettre à jour. `useOfflineAudio.ts` toujours absent — confirmer abandon/backlog. | A7 |
| `docs/operations/SENTRY_P0_TRIAGE_2026-05-20.md` | **P2** | Goal = "zero P0 before 2026-05-19 EOD" — deadline passée, statut d'exécution inconnu | Ajouter `## Done` avec date réelle + delta (N→0 issues), ou documenter encore en attente. | A8/F5 |
| `.claude/skills/test-writer/SKILL.md` ligne 9 | **P2** | "Standalone ou integre dans /team Phase 2.5" | `test-writer` n'est pas utilisé par `/team` v13 (pipeline utilise `editor.md` pour phase=red). Corriger ligne 9. | A9/F5 |
| `lib-docs/expo-screen-capture/LESSONS.md` | **P2** | Placeholder "No lessons recorded yet" | CLAUDE.md §Pièges connus contient un gotcha critique : `usePreventScreenCapture()` release-on-unmount only, `useFocusEffect` pattern obligatoire. Transcrire. | A13 |
| `lib-docs/@sentry/node/LESSONS.md` | **P2** | F1/F2 HIGH en début (BLOCKER, tracePropagationTargets MISSING) | Refresh 2026-05-20 ferme F2 (TD-SN-02 closed) et downgrade F1 → MEDIUM STALE-BY-DESIGN. Barrer les sections initiales. | A13 |
| `lib-docs/@sentry/react-native/LESSONS.md` | **P2** | F1 MAJOR "metro.config.js uses getDefaultConfig" en début | Fermé (commit d06bfd54c, TD-SRN-01 archivé 2026-05-21). Barrer la section initiale. | A13 |
| `lib-docs/react-native-qrcode-svg/LESSONS.md` | **P2** | F1 HIGH "ecl='M' au lieu de 'H'" toujours open | TD-QR-01 archivé 2026-05-21, `ecl="H"` confirmé `MfaEnrollScreen.tsx:127`. Barrer F1. | A13 |
| `lib-docs/langchain/LESSONS.md` (lignes 8,15,22) | **P2** | Paths `art-topic-classifier.ts` | Renommé → `art-topic-guardrail.ts`. | A13 |
| `.claude/projects/.../memory/project_geolocation_pipeline.md` | **P2** | Path `src/modules/chat/useCase/location/location-resolver.ts` (sous-dossier `location/`) | Réel : `src/modules/chat/useCase/location-resolver.ts` (directement dans `useCase/`). | A12/V6 |
| `.claude/projects/.../memory/project_remediation_roadmap_2026-06-07.md` | **P2** | Source de vérité citée = `docs/ROADMAP_REMEDIATION_2026-06-07.md` | Fichier inexistant dans le repo. Mettre à jour la référence (probablement intégré dans ROADMAP_PRODUCT.md) ou supprimer. | A12/V3 |
| `.claude/projects/.../memory/project_museum_web.md` (repo-tracked) | **P2** | Cite `ci-web.yml` + `deploy-web.yml` inexistants | Réels : `ci-cd-web.yml` (pas `ci-web.yml`), deploy intégré dans `ci-cd-web.yml`. | A12 |
| `.claude/projects/.../memory/feedback_doc_honesty_enforcement.md` | **P2** | Cite `scripts/sentinels/doc-anchor-check.mjs` comme actif (Wave C-Agent-3) | Fichier absent du repo. Sentinel non livré. Marquer NON LIVRÉ dans la mémoire. | A12/V2 |
| `docs/TEST_FACTORIES.md` | **P2** | Mention "Phase 7 reduces this list" sans dire si done/pending | Clarifier statut Phase 7 = PENDING (migration FE factories non encore exécutée). | A6 |
| `docs/PASSWORD_HASH_MIGRATION.md §2` | **P2** | Line refs décalées (`resetPassword.useCase.ts:31`→:30, `recoveryCodes.ts:42`→:50, `seed-smoke-account.ts:46`→:141) | Actualiser ou supprimer les numéros de lignes. | A6/F6 |
| Lessons 5×templates non remplis (2026-05-21 connectivity, location-monument, p0-gdpr, universal-links ×2) | **P2** | Sections "Trigger"/"Surprises"/"Action items" = placeholders template bruts | Compléter les sections réelles ou nettoyer les placeholders. `2026-05-21-p0-gdpr.md` a aussi 4 findings CHANGES_REQUESTED non résolus documentés — marquer resolutions. | A12/FN-4 |
| `LESSONS_DIGEST.md` | **P2** | Ne reflète pas les 8 lessons 2026-05-17..2026-05-25 (digest couvre uniquement runs consolidés pré-mai-17) | Mettre à jour le digest OU documenter explicitement la couverture temporelle. | A12 |
| `docs/RUNBOOKS/auto-rollback.md` | **P2** | `scripts/smoke-api.cjs` sans préfixe `museum-backend/` | Ajouter contexte `museum-backend/` (ou noter "depuis le working-directory museum-backend/"). | A8 |
| `docs/RUNBOOKS/audit-chain-forensics.md` | **P2** | `docs/RUNBOOKS/audit-chain-verification-log.md` mentionné comme appendice mais absent | Créer le stub (fichier vide avec en-tête). | A8/F4 |
| `docs/RUNBOOKS/secrets-rotation.md` | **P2** | `docs/RUNBOOKS/secrets-rotation-log.md` mentionné comme existant, absent | Créer le stub. | A8/F3 |
| `docs/TECH_DEBT.md TD-44` (workaround note) | **P2** | Cite `docs/HANDOFF_W3_GEO_PILOT.md` (probablement inexistant — non vérifié par git ls-files direct) | Vérifier existence. Si absent : retirer la référence. | A5/F1 |
| `docs/adr/ADR-011-rate-limit-fail-closed.md` | **P2** | Path middleware `src/helpers/middleware/rate-limit.middleware.ts` | Réel : `src/shared/middleware/rate-limit.middleware.ts`. | A1 |
| `docs/adr/ADR-009-ota-disabled.md` | **P2** | Ligne 318-323 pour bloc `updates:` dans `app.config.ts` | Réel : lignes 376-380. | A1 |
| `docs/adr/ADR-014-mfa-all-roles-enforcement.md` | **P2** | Path test `tests/integration/auth/mfa-flow.e2e.test.ts` | Réel : `tests/unit/auth/mfa-flow.e2e.test.ts`. | A1/F4 |
| `lib-docs/express-middleware-thin/LESSONS.md` | **P2** | Cite `shared/config/cors.config.ts` | Réel : `shared/http/cors.config.ts` (déplacé). | A13 |

---

## 5. Respect des lessons — violations constatées (d'après A12)

| ID | Lesson/UFR violée | Fichier violation | Sévérité | État |
|---|---|---|---|---|
| V1 | `feedback_opaque_animated_value_test_contract` — "Tests MUST NOT introspect `Animated.Value._value`" | `museum-frontend/__tests__/features/chat/ui/ImageCompareCardSkeleton.test.tsx:67` accède `(flat.opacity as { _value?: number })?._value` avec commentaire explicite | MEDIUM | Test RED inactif (SUT absent), violation dormante jusqu'à la phase Green. À corriger lors de l'implémentation. |
| V2 | `feedback_doc_honesty_enforcement` — "Sentinel `doc-anchor-check.mjs` mécanique enforce doc paths" | `scripts/sentinels/doc-anchor-check.mjs` **n'existe pas** | HIGH | Engagement Wave C-Agent-3 non honoré. Doctrine sans enforcement mécanique — repose sur vigilance humaine uniquement. |
| V3 | `feedback_doc_honesty_enforcement` + UFR-013 — "chemin cité dans *.md DOIT résoudre" | `project_remediation_roadmap_2026-06-07.md` pointe vers `docs/ROADMAP_REMEDIATION_2026-06-07.md` inexistant | MEDIUM | Artefact mort — ironiquement, la doctrine qui devrait le bloquer n'est pas implémentée (V2). |
| V4 | `feedback_bundled_red_green_frozen_test_gap` — "hook gap : `post-edit-green-test-freeze.sh` devrait aussi tourner en pre-commit" | `.husky/pre-commit` ne contient aucune référence à `post-edit-green-test-freeze.sh` | HIGH (dans sessions /team avec lint-staged) | Gap documenté 2026-05-22, toujours non résolu. Silent drift possible via lint-staged auto-fix pendant phase green. |
| V5 | `reference_otel_router_max_listeners` — "`@opentelemetry/instrumentation-router: { enabled: false }` DOIT être dans la config" | `src/instrumentation.ts` : grep de `instrumentation-router` = 0 résultat | MEDIUM | Deux interprétations possibles. Vérification impossible sans exécution. Risque MaxListeners warning prod si non désactivé. |
| V6 | UFR-013 honesty — "path cité dans doc DOIT résoudre" | `project_geolocation_pipeline.md` cite `useCase/location/location-resolver.ts` (sous-dossier inexistant) | LOW | Path faux dans une mémoire — réel = `useCase/location-resolver.ts`. |

---

## 6. OK — inventaire condensé

### Zone ADRs (A1-A3)
- **A1** : 9 OK sur 19 (ADR-012, 013, 016, 018, 019, 020, 021, 022 — rétention, auth session, PgBouncer, read-replica)
- **A2** : 21 OK sur 23 (ADR-023..046 sauf ADR-037/038). Notable : ADR-023 (Redis cluster toggle), ADR-025 (Zustand), ADR-029 (documenter=opus confirmé), ADR-030 (Lua INCRBY atomique), ADR-031 (cert-pinning disabled), ADR-033/046 (SUPERSEDED, correctement marqués), ADR-036 (LLM cache v2 + L2 supprimé), ADR-039 (opossum circuit-breaker), ADR-045 (shared package amendment 2026-05-25)
- **A3** : 17 OK sur 23 (ADR-047..068 sauf 048, 063, 066, 067). Notable : ADR-049 (garak amendment honnête), ADR-053 (Apple 5.1.2 consent 8 scopes), ADR-055/056 (BottomSheetRouter, phases client), ADR-059 (online-manager bridge), ADR-068 (SBOM attestation)

### Zone audit-state/ (A4)
4 fichiers préservés (REPORT.md, REPORT-PASS2.md, CONSOLIDATED_STATE.md, D5-lot5-a11y.md).

### Zone Engineering / Ops (A6-A8)
- **OK** notables : `MIGRATION_GOVERNANCE.md`, `LINT_DISCIPLINE.md`, `GITHUB_ACTIONS_SHA_PINS.md`, `SOCIAL_AUTH_SETUP.md`, `DB_BACKUP_RESTORE.md`, `STORE_SUBMISSION_GUIDE.md`, `MOBILE_INTERNAL_TESTING_FLOW.md`, `SECURITY.md` (hors date), `SLO.md`, `AI_VISUAL_SIMILARITY.md`, `FAIRNESS_METRICS_PLAN.md`, `CHAOS_RUNBOOKS/CERT_ROTATION.md`, `CHAOS_RUNBOOKS/V1_FALLBACKS.md`, `CHAOS_RUNBOOKS/prod-secrets-bootstrap.md`, `CHAOS_RUNBOOKS/redis-rotation.md`, ensemble `docs/operations/` sauf SENTRY_P0_TRIAGE et POSTMORTEM

### Zone legal (A11)
- **OK** : `ROPA.md` (hors deadline DPO), `AI_DISCLOSURE.md`, `legal/SUBPROCESSORS.md` (stub canonique), `DPIA_T1.1_addendum.md`, accessibilité FR/EN, tabletop exercices (3 scénarios "Last run: never" — honnêtes)

### Zone lib-docs (A13)
**88 libs sur 93 sans remarque** : toutes les libs expo (35+), react-native*, langfuse, opossum, bcrypt, bullmq, typeorm, zod, zustand, opentelemetry umbrella, etc.

---

## 7. Décisions humaines requises

Ces findings dépassent un simple fix doc et demandent un arbitrage :

### D1 — DPO non mandaté, deadline manquée (2026-05-25), launch à risque
**Fichiers** : `docs/legal/DPIA_ROPA_READINESS.md`, `docs/legal/DPIA.md`, `docs/legal/ROPA.md`
**Situation** : deadline DPO 2026-05-25 passée sans mandat signé. `dpo@musaium.app` = alias vers `tim.moyence@gmail.com`, pas un DPO mandaté. DPIA/ROPA unsigned. Le §5 du readiness prévoit un "risque accepté documenté" comme sortie possible.
**Question** : Go avec risque accepté formalisé dans `DPIA_ROPA_READINESS.md` ? Ou trouver un DPO externe avant launch ? La doc doit refléter la décision réelle.

### D2 — Contradiction `--no-verify` dans CI_CD_SECRETS.md vs UFR-020
**Fichier** : `docs/CI_CD_SECRETS.md:48`
**Situation** : la doc dit toléré "en dernier recours avec documentation" ; UFR-020 + CONTRIBUTING.md §8 + `.claude/settings.json` disent ZÉRO bypass. La correction est documentée comme P0 ci-dessus, mais si la tolérance était intentionnelle pour un cas ops spécifique, l'humain doit confirmer la suppression.
**Question** : supprimer toute la phrase ou garder une exception ops précise (laquelle ?) ?

### D3 — `SENTRY_P0_TRIAGE_2026-05-20.md` : triage exécutée ou non ?
**Fichier** : `docs/operations/SENTRY_P0_TRIAGE_2026-05-20.md`
**Situation** : Goal = "zero P0 before 2026-05-19 EOD". Deadline passée. `docs/SENTRY_KNOWN_NOISE.md` absent → triage non exécutée OU exécutée sans `wontfix`. Statut inconnu.
**Question** : la triage a-t-elle été exécutée ? Ajouter `## Done` avec la date réelle et le delta.

### D4 — Age minimum 13 vs 15 (impact régulateur)
**Fichier** : `docs/compliance/art5-audit.md:33`
**Situation** : le code dit 15 ans (majorité numérique FR, Loi 2023-566). La doc dit "13+". C'est une erreur factuelle (correction = P0). Mais la question sous-jacente : est-ce intentionnel de rester "harmonisé COPPA 13" pour un marché US futur ? Si oui, c'est une décision produit à documenter.
**Question** : confirmer que 15 est la cible volontaire (et corriger la doc), ou documenter l'arbitrage 13/15 explicitement.

### D5 — Runbooks ops dans `LOT-P0-STABILITY-CLOSURE.md` : promus ou non ?
**Fichier** : `audit-state/2026-05-25-roadmap-reconstruction/LOT-P0-STABILITY-CLOSURE.md`
**Situation** : contient 4 runbooks ops (I-OPS5 backup S3, I-OPS2 exporters, I-OPS3 DR fresh-DB, I-OPS8d branch-protection) qui semblent absents de `docs/OPS_DEPLOYMENT.md`.
**Question** : vérifier si ces runbooks sont dans `docs/OPS_DEPLOYMENT.md`. Si non : promouvoir avant suppression du fichier.

### D6 — `RELEASE_CHECKLIST.md §3.3` feature flags : voice "always-on" à documenter
**Situation** : les feature flags supprimés en §3.3 cachent le fait que Voice est now always-on. Le checklist de release ne mentionne pas comment vérifier que Voice fonctionne. Gap opérationnel post-suppression.
**Question** : après suppression §3.3, ajouter une entrée "Voice pipeline : toujours actif, vérifier `TTS_MODEL` + `LLM_AUDIO_TRANSCRIPTION_MODEL` dans `.env.production`" dans une autre section du checklist ?

### D7 — `feedback_bundled_red_green_frozen_test_gap` : hook gap frozen-test/pre-commit non résolu depuis 2026-05-22
**Situation** : gap structurel documenté. Le hook `post-edit-green-test-freeze.sh` n'est pas appelé dans `.husky/pre-commit`. Lint-staged peut auto-fix les tests après hash, créant un silent drift.
**Question** : planifier la correction dans le backlog V1 ou accepter le risque comme LOW pour les commits normaux ?

---

## 8. Index des rapports détaillés

| Rapport | Fichier | Zone couverte | Compteurs |
|---|---|---|---|
| A1 | `reports/A1-adr-002-022.md` | ADR-002 à ADR-022 (19 ADRs) | 9 OK / 10 À MODIFIER / 0 À SUPPRIMER |
| A2 | `reports/A2-adr-023-046.md` | ADR-023 à ADR-046 (23 ADRs) | 21 OK / 2 À MODIFIER / 0 À SUPPRIMER |
| A3 | `reports/A3-adr-047-068.md` | ADR-047 à ADR-068 + README ADR (23 fichiers) | 17 OK / 4+1 À MODIFIER / 0 À SUPPRIMER |
| A4 | `reports/A4-audit-state.md` | `audit-state/` fichiers passés (103 fichiers) | 4 OK / 1 À MODIFIER (vérif) / 98 À SUPPRIMER |
| A5 | `reports/A5-living-docs.md` | Living docs : DOCS_INDEX, ROADMAP_PRODUCT, ROADMAP_TEAM, TECH_DEBT, TECH_DEBT_ARCHIVE, GOTCHAS_ARCHIVE, PHASE_HISTORY (7 fichiers) | 2 OK / 5 À MODIFIER / 0 À SUPPRIMER |
| A6 | `reports/A6-engineering.md` | Engineering docs : ARCHITECTURE, CONTRIBUTING, MIGRATION_GOVERNANCE, LINT_DISCIPLINE, TEST_FACTORIES, TEST_INDEX, TEST_COVERAGE_INVENTORY, TESTING_DISCIPLINE_PROPOSAL, TESTING_PHASE2_PLAN, CI_CD_SECRETS, GITHUB_ACTIONS_SHA_PINS, PASSWORD_HASH_MIGRATION, SOCIAL_AUTH_SETUP, ROADMAP_FE_RN_BEST_PRACTICES (14 fichiers) | 3 OK / 11 À MODIFIER / 0 À SUPPRIMER |
| A7 | `reports/A7-ops-ai.md` | Ops + AI docs : OPS_DEPLOYMENT, OPS_INCIDENT_LLM_GUARD, DB_BACKUP_RESTORE, RELEASE_CHECKLIST, STORE_SUBMISSION_GUIDE, MOBILE_INTERNAL_TESTING_FLOW, GOOGLE_PLAY_DATA_SAFETY, AI_SAFETY, AI_VOICE, AI_VISUAL_SIMILARITY, GDPR_ART22_SCOPE, SECURITY, SLO, UPTIME_MONITORING, CAPACITY_PLAN, CHAOS_RUNBOOKS (16 fichiers) | 6 OK / 8+2min À MODIFIER / 0 À SUPPRIMER |
| A8 | `reports/A8-operations.md` | docs/RUNBOOKS/*.md + docs/observability/*.md + docs/operations/*.md (25 fichiers) | 18 OK / 5 À MODIFIER / 0 À SUPPRIMER |
| A9 | `reports/A9-claude-process.md` | `.claude/agents/` (9 agents) + `.claude/skills/team/**` + user skills (recap/rollback/security-scan/test-routes/test-writer/verify-schema) + power-tools (31 fichiers) | 23 OK / 5+bonus À MODIFIER / 0 À SUPPRIMER |
| A10 | `reports/A10-root-app.md` | Root READMEs (CLAUDE.md, README.md, AGENTS.md, CHANGELOG.md, SECURITY.md) + app READMEs (museum-backend, frontend, web, packages, tools) (33 fichiers) | 25 OK / 5 À MODIFIER / 0 À SUPPRIMER |
| A11 | `reports/A11-legal-compliance.md` | docs/legal/*.md + docs/compliance/*.md + docs/incidents/*.md (19 fichiers) | 11 OK / 7 À MODIFIER / 0 À SUPPRIMER |
| A12 | `reports/A12-memory-lessons.md` | Memory externes (39 fichiers) + repo-tracked (2) + Lessons (10 fichiers) = 51 fichiers | 30 OK / 14 À MODIFIER / 3 À SUPPRIMER |
| A13 | `reports/A13-libdocs-lessons.md` | `lib-docs/*/LESSONS.md` (98 fichiers, 93 libs distinctes) | 88 OK / 4 À MODIFIER / 1 À SUPPRIMER |

---

*Fichier généré par consolidation read-only des rapports A1..A13. Aucun code ni fichier modifié.*
*Consolidateur : Claude Sonnet 4.6, 2026-05-26.*
