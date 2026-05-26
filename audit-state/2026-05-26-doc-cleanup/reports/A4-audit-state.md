# A4 — Audit des artefacts `audit-state/` (audits passés)

**Auditeur** : read-only, session 2026-05-26  
**Scope** : tous les fichiers git-tracked sous `audit-state/` **hors** `audit-state/2026-05-26-doc-cleanup/` (audit en cours)  
**Total fichiers audités** : 103

---

## Méthode

1. Énumération via `git ls-files` (103 fichiers).
2. Vérification des références live : `grep -rn "audit-state" docs/ CLAUDE.md .claude/ museum-*`.
3. Échantillonnage de fichiers représentatifs de chaque groupe (non exhaustif — pas besoin pour les groupes homogènes).
4. Critère de décision : le fichier est-il **référencé par un document vivant** (docs/, ADR, code) ? Son contenu a-t-il été **promu** dans une doc vivante ? S'agit-il d'un working-state consommé sans valeur de rétro unique ?

---

## Références vivantes identifiées (avant de trancher)

| Référençant | Fichier audit-state référencé | Nature du lien |
|---|---|---|
| `docs/ROADMAP_PRODUCT.md:65` | `2026-05-25-roadmap-reconstruction/CONSOLIDATED_STATE.md` | Lien hypertexte cliquable dans la prose roadmap |
| `docs/ROADMAP_PRODUCT.md:74` | `2026-05-25-full-audit/REPORT.md` | Lien hypertexte cliquable |
| `docs/ROADMAP_PRODUCT.md:87` | `audit-state/.../LOT-P0-STABILITY-CLOSURE.md` (ref textuelle, pas lien) | Mention critique (UFR-013 warning) |
| `docs/ROADMAP_PRODUCT.md:89` | `2026-05-25-full-audit/REPORT-PASS2.md` | Lien hypertexte cliquable |
| `docs/adr/ADR-068-sbom-attestation-strategy-mobile-gap.md:15,48` | `2026-05-25-roadmap-reconstruction/findings/D5-lot5-a11y.md` | Lien + référence source ADR (§Context + §References) |
| `museum-frontend/__tests__/maestro/modal-coverage.test.ts:9` | `audit-state/.../C2-maestro-modals/design.md` | **Commentaire de code uniquement** — non lu à l'exécution ; chemin n'existe pas en repo |

**Résultat** : 5 fichiers distincts sont référencés par des docs vivants (liens ou mentions). Tous se trouvent dans `2026-05-25-full-audit/` ou `2026-05-25-roadmap-reconstruction/`. La référence test = commentaire mort, sans impact.

---

## Tableau par groupe

| Groupe/Fichier | Nb | État | Confiance | Justification | Action |
|---|---|---|---|---|---|
| **G1 — `2026-05-23-frontend-dry-audit/SUIVI.md`** | 1 | À SUPPRIMER | Haute | Rapport intermédiaire d'un audit read-only mono-session (2026-05-23). Findings : 7 modaux standalone, FormInput partial, loading dupliqué. Ces findings ont été versés dans les seeds des 5 missions (`MISSIONS.md` full-audit 2026-05-25) et dans des items TECH_DEBT/ROADMAP. Aucune référence live vers ce fichier (grep = 0). Working-state consommé. | `rm -rf audit-state/2026-05-23-frontend-dry-audit/` |
| **G2 — `2026-05-25-full-audit/PLAN.md`** | 1 | À SUPPRIMER | Haute | Plan d'orchestration (« comment les 32 agents ont été lancés »). Purement procédural, jamais référencé depuis l'extérieur. La valeur de contenu est dans REPORT.md (résultats), pas dans le plan d'exécution. | Supprimer |
| **G3 — `2026-05-25-full-audit/REPORT.md`** | 1 | OK / GARDER | Haute | Référencé par `docs/ROADMAP_PRODUCT.md:74` via lien hypertexte cliquable. Sert de preuve audit pour les claims roadmap. Tant que la note roadmap subsiste, le fichier doit aussi. | Garder |
| **G4 — `2026-05-25-full-audit/REPORT-PASS2.md`** | 1 | OK / GARDER | Haute | Référencé par `docs/ROADMAP_PRODUCT.md:89` via lien hypertexte cliquable. Idem G3. | Garder |
| **G5 — `2026-05-25-full-audit/roadmap-ticks.md`** | 1 | À SUPPRIMER | Haute | Liste de coches roadmap proposées (I-CMP1..5, P0.D1..5, etc.) + nouveaux findings. Ces ticks ont **tous été appliqués** à `docs/ROADMAP_PRODUCT.md` (vérifié : 15 occurrences concordantes). Le fichier était un intermédiaire de travail, son contenu est désormais en ROADMAP_PRODUCT. Aucune référence live. | Supprimer |
| **G6 — `2026-05-25-full-audit/PRE-LAUNCH-PLAN.md`** | 1 | À SUPPRIMER | Haute | Plan de lancement J-13 v2 avec décisions NPS/museum_manager/MFA et waves de travail. Le contenu **a été promu** dans `docs/ROADMAP_PRODUCT.md` (Wave 1..4, worktree-prompts, env checklist, OPS TODO). Aucune référence live vers ce fichier (grep = 0). | Supprimer |
| **G7 — `2026-05-25-full-audit/WORKTREE-PROMPTS.md`** | 1 | À SUPPRIMER | Haute | Prompts par feature-slice pour 15 worktrees (W1..W15). Supersédé par `MISSIONS.md` (les 5 missions multi-cycle). Aucune référence live (grep = 0). Working-state opérationnel jamais promu en doc vivante. | Supprimer |
| **G8 — `2026-05-25-full-audit/MISSIONS.md`** | 1 | À SUPPRIMER | Haute | Seeds + préambule commun des 5 missions autonomes. Document de lancement des worktrees, pas une doc de résultat. Aucune référence live. Les seeds eux-mêmes sont du working-state de planification (la valeur = les worktrees lancés, pas le prompt). | Supprimer |
| **G9 — `2026-05-25-full-audit/MISSIONS-EXPLAINED.md`** | 1 | À SUPPRIMER | Haute | Version « prof » pédagogique des 5 missions. Aucune référence live. Valeur pédagogique non nulle mais aucun lien depuis docs/ ou code. Éphémère de planification. | Supprimer |
| **G10 — `2026-05-25-full-audit/phase-a-roadmap/A{1..9}.md`** | 9 | À SUPPRIMER | Haute | Rapports agents de la pass-1 (réalité roadmap par section). Leur contenu **a été consolidé** dans REPORT.md (référencé vivant) et CONSOLIDATED_STATE.md (référencé vivant). Les pass-2 leaf/agg ont corrigé plusieurs verdicts de la pass-1 — garder la pass-1 seule sans les corrections créerait de la confusion. Aucune référence live directe vers `phase-a-roadmap/`. | `rm -rf audit-state/2026-05-25-full-audit/phase-a-roadmap/` |
| **G11 — `2026-05-25-full-audit/phase-b-diffs/B{1..9}-{angle}.md`** | 16 | À SUPPRIMER | Haute | Reviews qualité double-angle par cluster (pass-1). Consolidés dans REPORT.md. Aucune référence live vers `phase-b-diffs/`. La pass-2 a re-fait et corrigé certains verdicts — la pass-1 seule est stale. | `rm -rf audit-state/2026-05-25-full-audit/phase-b-diffs/` |
| **G12 — `2026-05-25-full-audit/phase-c-e2e/C{1..10}.md`** | 10 | À SUPPRIMER | Haute | Tracing E2E feature par feature (pass-1). Consolidés dans REPORT.md. Aucune référence live. Les ruptures E2E identifiées ici ont été intégrées dans les seeds MISSIONS.md et dans la roadmap. | `rm -rf audit-state/2026-05-25-full-audit/phase-c-e2e/` |
| **G13 — `2026-05-25-full-audit/pass2-finegrain/leaf/L{01..30}*.md`** | 39 | À SUPPRIMER | Haute | 39 rapports-feuilles individuels de la pass-2 (1 agent par 2-3 items). Agrégés par les 8 AGG. Intermédiaires de travail. Aucune référence live directe. La valeur de preuve est dans les AGG, eux-mêmes consolidés dans REPORT-PASS2.md (référencé vivant). | `rm -rf audit-state/2026-05-25-full-audit/pass2-finegrain/leaf/` |
| **G14 — `2026-05-25-full-audit/pass2-finegrain/agg/AGG{1..8}*.md`** | 8 | À SUPPRIMER | Moyenne | 8 rapports agrégateurs par domaine (consolidés dans REPORT-PASS2.md qui est référencé vivant). Valeur autonome non nulle (plus détaillés que REPORT-PASS2 sur certains points), mais REPORT-PASS2 contient les findings essentiels. **Finding notable** : AGG1 contient une clarification I-SEC8 (CRITIQUE→LOW) non répétée mot pour mot dans REPORT-PASS2 ; mais cette décision est dans `docs/ROADMAP_PRODUCT.md` (note explicite) — information promue. Aucune référence live directe. | `rm -rf audit-state/2026-05-25-full-audit/pass2-finegrain/agg/` |
| **G15 — `2026-05-25-roadmap-reconstruction/VERIFICATION_TASKLIST.md`** | 1 | À SUPPRIMER | Haute | Plan de vérification read-only produit par un agent (ce que les 8 agents allaient faire). Working-state de planification, consommé. La valeur = les résultats dans findings/ et CONSOLIDATED_STATE.md. Aucune référence live. | Supprimer |
| **G16 — `2026-05-25-roadmap-reconstruction/CONSOLIDATED_STATE.md`** | 1 | OK / GARDER | Haute | Référencé par `docs/ROADMAP_PRODUCT.md:65` via lien hypertexte. Sert de source de vérité des 8 domaines de vérification croisée code↔roadmap. | Garder |
| **G17 — `2026-05-25-roadmap-reconstruction/LOT-P0-STABILITY-CLOSURE.md`** | 1 | À MODIFIER | Haute | Référencé textuellement dans `docs/ROADMAP_PRODUCT.md:87` mais avec un avertissement UFR-013 : « prétend LOT 4 fixé — AUCUN code sur dev ». Le fichier contient des claims de clôture pour des commits qui **ne sont pas ancêtres de dev** selon la note roadmap. **Finding unique** : il contient aussi des runbooks ops (I-OPS5 S3 backup, I-OPS2 exporters, I-OPS3 DR fresh-DB, I-OPS8d branch-protection) qui ne semblent pas promus ailleurs. Ces runbooks ops ont une valeur pratique — vérifier leur présence dans `docs/OPS_DEPLOYMENT.md` ou autre doc ops avant suppression. **Action** : vérifier si les runbooks sont promus ; si oui supprimer, sinon promouvoir d'abord. | Vérifier promotion runbooks ops avant de supprimer |
| **G18 — `2026-05-25-roadmap-reconstruction/findings/D{1..8}*.md`** | 9 | À SUPPRIMER* | Haute-sauf D5 | Findings détaillés par domaine (D1..D8). Consolidés dans CONSOLIDATED_STATE.md (référencé vivant). **Exception : `D5-lot5-a11y.md`** est référencé directement par `docs/adr/ADR-068-sbom-attestation-strategy-mobile-gap.md:15,48` (§Context + §References). Les 8 autres (D1-D4, D6-D8, D7a, D7bc) n'ont aucune référence live directe. | D5 = GARDER ; D1-D4, D6-D8, D7a, D7bc = À SUPPRIMER (8 fichiers) |

---

## Findings notables

### FN-1 — `LOT-P0-STABILITY-CLOSURE.md` contient des runbooks ops non promus (G17)

Ce fichier est dans un état ambigu : la roadmap l'identifie comme contenant des « claims creux » (code non sur dev), mais il contient aussi des runbooks opérationnels précis :

- **I-OPS5** : backup S3 cross-region + bucket dédié backup (`S3_BACKUP_BUCKET`)
- **I-OPS2** : déploiement `postgres_exporter` + `redis_exporter` pour vraies sondes directes
- **I-OPS3** : runbook DR fresh-DB (migrations manuelles hors pipeline CI)
- **I-OPS8(d)** : commande `gh api` exacte pour ajouter `sentinel-mirror`+`migration-drift` aux required-checks branch protection

Avant de supprimer, vérifier si ces 4 runbooks sont dans `docs/OPS_DEPLOYMENT.md` ou `docs/CI_CD_SECRETS.md`. S'ils ne le sont pas, les y transférer.

### FN-2 — `D5-lot5-a11y.md` doit être gardé car référencé par ADR-068

`audit-state/2026-05-25-roadmap-reconstruction/findings/D5-lot5-a11y.md` est cité dans `docs/adr/ADR-068-sbom-attestation-strategy-mobile-gap.md` à la fois dans le §Context et dans §References. Un ADR est un document permanent. Supprimer D5 casserait une ancre de preuve dans un ADR. Garder.

### FN-3 — Le lien test `audit-state/.../C2-maestro-modals/design.md` est un commentaire mort

`museum-frontend/__tests__/maestro/modal-coverage.test.ts:9` cite `audit-state/.../C2-maestro-modals/design.md` mais :
(a) le chemin n'existe pas en repo (vérifié `find`)
(b) c'est un commentaire JSDoc, pas un `readFileSync` — aucune dépendance à l'exécution

Ce n'est pas un blocage pour supprimer quoi que ce soit dans `audit-state/`. Il s'agit d'une documentation de provenance dans un commentaire figé. Les tests ne liront jamais `audit-state/`.

### FN-4 — AGG1 contient la clarification I-SEC8 CRITIQUE→LOW, déjà promue

AGG1-security.md §1 explique en détail pourquoi I-SEC8 passe de CRITIQUE à LOW. Cette information est présente dans `docs/ROADMAP_PRODUCT.md` (note pass-2 2026-05-25) et dans ADR-061. Rien de unique à préserver dans AGG1 avant suppression.

### FN-5 — `phase-a-roadmap/` est supersédé et peut induire en erreur

Les 9 fichiers A1-A9 de la pass-1 ont des verdicts partiellement incorrects (notamment sur I-SEC8, I-CMP3, I-CMP4) qui ont été corrigés par la pass-2. Garder la pass-1 sans la pass-2 associée crée un risque de confusion. La pass-2 entière (leaf + agg) est consolidée dans REPORT-PASS2.md (gardé). Supprimer toute la pass-1 est sain.

---

## Synthèse des comptes

| État | Nb fichiers |
|---|---|
| **OK / GARDER** | **4** (REPORT.md, REPORT-PASS2.md, CONSOLIDATED_STATE.md, findings/D5-lot5-a11y.md) |
| **À MODIFIER (vérif avant action)** | **1** (LOT-P0-STABILITY-CLOSURE.md — vérifier runbooks ops avant suppression) |
| **À SUPPRIMER** | **98** (tous les autres) |

---

## Recommandation de suppression par lot

Les groupes homogènes peuvent être supprimés en `rm -rf` de sous-dossier. Ordre recommandé (du moins risqué au plus) :

```bash
# Lot 1 — audit 2026-05-23 entier (1 fichier)
rm -rf audit-state/2026-05-23-frontend-dry-audit/

# Lot 2 — pass-1 complète (35 fichiers : phase-a + phase-b + phase-c + pass2/leaf + pass2/agg)
rm -rf audit-state/2026-05-25-full-audit/phase-a-roadmap/
rm -rf audit-state/2026-05-25-full-audit/phase-b-diffs/
rm -rf audit-state/2026-05-25-full-audit/phase-c-e2e/
rm -rf audit-state/2026-05-25-full-audit/pass2-finegrain/leaf/
rm -rf audit-state/2026-05-25-full-audit/pass2-finegrain/agg/

# Lot 3 — fichiers racine full-audit sauf REPORT.md + REPORT-PASS2.md
rm audit-state/2026-05-25-full-audit/PLAN.md
rm audit-state/2026-05-25-full-audit/roadmap-ticks.md
rm audit-state/2026-05-25-full-audit/PRE-LAUNCH-PLAN.md
rm audit-state/2026-05-25-full-audit/WORKTREE-PROMPTS.md
rm audit-state/2026-05-25-full-audit/MISSIONS.md
rm audit-state/2026-05-25-full-audit/MISSIONS-EXPLAINED.md

# Lot 4 — roadmap-reconstruction sauf CONSOLIDATED_STATE.md + D5 + LOT-P0-STABILITY-CLOSURE.md (à traiter séparément)
rm audit-state/2026-05-25-roadmap-reconstruction/VERIFICATION_TASKLIST.md
rm audit-state/2026-05-25-roadmap-reconstruction/findings/D1-lot1-security.md
rm audit-state/2026-05-25-roadmap-reconstruction/findings/D2-lot3-feature-gates.md
rm audit-state/2026-05-25-roadmap-reconstruction/findings/D3-lot2-gdpr.md
rm audit-state/2026-05-25-roadmap-reconstruction/findings/D4-lot4-stability.md
rm audit-state/2026-05-25-roadmap-reconstruction/findings/D6-lot6-burial.md
rm audit-state/2026-05-25-roadmap-reconstruction/findings/D7a-shipped-reverif.md
rm audit-state/2026-05-25-roadmap-reconstruction/findings/D7bc-reconciled-falsified.md
rm audit-state/2026-05-25-roadmap-reconstruction/findings/D8-techdebt-now.md

# Lot 5 — LOT-P0-STABILITY-CLOSURE.md (après vérification runbooks ops)
# → Vérifier docs/OPS_DEPLOYMENT.md pour I-OPS5/I-OPS3/I-OPS8d/I-OPS2
# → Si promus : rm audit-state/2026-05-25-roadmap-reconstruction/LOT-P0-STABILITY-CLOSURE.md
```

**Résidu après nettoyage** (5 fichiers gardés) :
```
audit-state/2026-05-25-full-audit/REPORT.md
audit-state/2026-05-25-full-audit/REPORT-PASS2.md
audit-state/2026-05-25-roadmap-reconstruction/CONSOLIDATED_STATE.md
audit-state/2026-05-25-roadmap-reconstruction/findings/D5-lot5-a11y.md
audit-state/2026-05-25-roadmap-reconstruction/LOT-P0-STABILITY-CLOSURE.md  ← à décider après vérif
```
