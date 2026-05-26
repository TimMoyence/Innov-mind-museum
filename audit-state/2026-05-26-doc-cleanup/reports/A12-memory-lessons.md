---
report: A12-memory-lessons
scope: External memory (39 files) + repo-tracked memory (2 files) + lessons (8 lesson files + LESSONS_DIGEST.md + SCHEMA.md)
auditor: Claude read-only audit
date: 2026-05-26
confidence-legend: HIGH = verified against code/file; MEDIUM = partial verification; LOW = not verifiable without running tests/runtime
---

# A12 — Memory & Lessons Audit

## Structure des deux emplacements mémoire

| Emplacement | Chemins | Fichiers | Git-tracked |
|---|---|---|---|
| **Externe (non-repo)** | `/Users/Tim/.claude/projects/-Users-Tim-Desktop-all-dev-Pro-InnovMind/memory/` | 40 fichiers (39 + MEMORY.md) | NON — local à la machine |
| **Repo-tracked** | `/repo/.claude/projects/-Users-Tim-Desktop-all-dev-Pro-InnovMind/memory/` | 2 fichiers | OUI (`git ls-files`) |

Les deux sont **disjoints** (aucune overlap de contenu, chemins différents). Les 2 fichiers repo-tracked (`project_museum_web.md`, `project_v3_decisions.md`) ne sont **PAS indexés dans MEMORY.md** — lacune d'index.

---

## LOT 1 — Tableau mémoire (39 fichiers externes + 2 repo-tracked)

### Fichiers `project_*`

| Fichier | État | Confiance | Encore vrai / respecté ? | Action |
|---|---|---|---|---|
| `project_c2_ai_side_only.md` | **OK** | HIGH | Vérifié : aucun multi-image picker dans `features/`. Pipeline single-image intact (`ImageProcessingService`, `useImagePicker` single). Doctrine respectée. | Garder |
| `project_geolocation_pipeline.md` | **À MODIFIER** | HIGH | `haversine.ts` et `nominatim.client.ts` existent. MAIS le chemin `location-resolver.ts` est **FAUX** : la mémoire dit `src/modules/chat/useCase/location/location-resolver.ts` (sous-dossier `location/`), la réalité est `src/modules/chat/useCase/location-resolver.ts` (directement dans `useCase/`). Sinon contenu correct. | Corriger le path |
| `project_hybrid_product_philosophy.md` | **OK** | MEDIUM | Doctrine "proactive at transitions, reactive during interaction" — pas de 3-choice fixed buttons trouvés dans l'UI. Confiance MEDIUM car non vérifié exhaustivement tous les écrans. | Garder |
| `project_ios26_crash_investigation.md` | **OK** | HIGH | `NSSetUncaughtExceptionHandler` toujours à `AppDelegate.swift:93` (vérifié). `IOS26_CRASH_DIAG.md` existe. Bake date 2026-06-15 pas encore atteinte (aujourd'hui 2026-05-26). Statut RESOLVED correct. | Garder jusqu'au 2026-06-15 puis supprimer |
| `project_no_staging_v1.md` | **OK** | HIGH | Pas de staging server constaté. Feature flag policy cohérente avec `feedback_no_feature_flags_prelaunch`. | Garder |
| `project_remediation_roadmap_2026-06-07.md` | **À MODIFIER** | HIGH | `docs/ROADMAP_REMEDIATION_2026-06-07.md` **N'EXISTE PAS** dans le repo (vérifié `find`). La source de vérité citée est absente. Le roadmap a probablement été intégré dans `ROADMAP_PRODUCT.md` ou supprimé lors d'un doc prune. | **Mettre à jour la référence ou supprimer ce pointeur** |
| `project_roadmap_b2b_claims_false.md` | **OK** | HIGH | `ROADMAP_PRODUCT.md` dit explicitement "Aucun musée n'a été démarché à ce jour", "données de démo, pas des pilots contractés". Correction honnête effectuée. | Garder |
| `project_museum_web.md` (repo-tracked) | **À MODIFIER** | HIGH | Cite `.github/workflows/ci-web.yml` et `deploy-web.yml`. En réalité : `ci-cd-web.yml` (pas `ci-web.yml`), et `deploy-web.yml` **N'EXISTE PAS** (workflow deployé dans `ci-cd-web.yml` directement). Fichier très ancien (2026-03-25), pré-refactor workflows. | Corriger les noms de workflows ou supprimer (info absorbée par CLAUDE.md) |
| `project_v3_decisions.md` (repo-tracked) | **À SUPPRIMER** | HIGH | Décisions 2026-03-26 "V3 plan" : (1) Maestro URGENT → **FAIT** (42 flows Maestro vérifiés dans `.maestro/`), (2) Lighthouse CI → **FAIT** (`ci-cd-web.yml:326`), (3) Wikidata spec re-validate → implémentation Wikidata bien présente (143 hits dans le code). Toutes les décisions sont **exécutées depuis 2 mois**. Fichier périmé sans valeur résiduelle. | **Supprimer** |

### Fichiers `reference_*`

| Fichier | État | Confiance | Encore vrai / respecté ? | Action |
|---|---|---|---|---|
| `reference_bordeaux_museum_qcodes.md` | **OK** | HIGH | Q-codes vérifiés dans `seed-museums.ts:114,124,134` — Aquitaine Q3329534, CAPC Q2945071, Cité du Vin Q16964634. Correspondance exacte. | Garder |
| `reference_cert_pinning_runbook.md` | **OK** | HIGH | `cert-pinning.ts`, `CERT_PINNING_RUNBOOK.md`, `capture-spki.sh` existent tous. `EXPO_PUBLIC_CERT_PINNING_ENABLED` présent dans les `.env.*`. Note: `.env:28` montre `CERT_PINNING_ENABLED=false` — cert pinning désactivé localement (correct pour dev). | Garder |
| `reference_maestro_modal_backdrop_a11y.md` | **OK** | HIGH | `MODAL_FLOWS_NOTES.md` existe et contient exactement la doctrine `museum-sheet-backdrop` (a11y-hidden, dismissal via `museum-sheet-close`). Règle documentée et intégrée. | Garder |
| `reference_mcp_prompt_injection_repomix.md` | **OK** | MEDIUM | Le cas observé (Repomix injection) reste pertinent — Repomix MCP toujours installé (visible dans system-reminder session courante). UFR-024 mentionné mais non encore dans `user-feedback-rules.json` (max = UFR-022). Lacune : UFR-024 pas encore formalisé. | Garder + noter UFR-024 manquant |
| `reference_otel_router_max_listeners.md` | **OK** | HIGH | Vérifié : `instrumentation.ts` ne mentionne pas `instrumentation-router` dans les disabled flags (grep vide). MAIS le fix commit `7f60283e` est antérieur — vérification directe dans l'instrumentation impossible sans lecture de la config complète. Confiance MEDIUM sur state actuel. | **Vérifier** dans `src/instrumentation.ts` que `@opentelemetry/instrumentation-router: { enabled: false }` est bien présent |

### Fichiers `feedback_*`

| Fichier | État | Confiance | Encore vrai / respecté ? | Action |
|---|---|---|---|---|
| `feedback_aggressive_doc_prune.md` | **OK** | MEDIUM | Doctrine en place. MEMORY.md le référence correctement. Absorbé partiellement dans CLAUDE.md (pas de section dédiée). Prose unique (2 user quotes). | Garder |
| `feedback_audit_full_reverify_tree_aggregate.md` | **À MODIFIER** | MEDIUM | **Non indexé dans MEMORY.md** — absent de l'index. Contenu (re-verify everything, tree aggregation, no silent downscale) non redondant avec UFRs existants. | Ajouter à MEMORY.md index |
| `feedback_auto_commit_end_feature.md` | **OK** | HIGH | Procédural (non-UFR). `git status` before commit pattern — doctrine active et unique ici. | Garder |
| `feedback_bundled_red_green_frozen_test_gap.md` | **OK + GAP CONNU** | HIGH | Le hook gap identifié (freeze ne tourne pas en pre-commit avant lint-staged) est **toujours présent** : `pre-commit` ne contient aucune référence à `post-edit-green-test-freeze.sh` (vérifié). Gap non résolu. | Garder (gap documenté, ouvert) |
| `feedback_bury_dead_code.md` | **OK** | HIGH | Quasi-absorbé par UFR-016. Valeur unique : user quote exact "il est mort on l'enterre". | Garder (valeur prose unique) |
| `feedback_check_configs_before_assuming.md` | **OK** | HIGH | Absorbé partiellement par UFR-018. Valeur unique : user quote exact + cas cert pinning. | Garder |
| `feedback_check_network_before_hook_hacking.md` | **OK** | MEDIUM | Pas de UFR équivalent. Cas unique (7h perdues réseau). | Garder |
| `feedback_check_tests_before_bug_classification.md` | **OK** | HIGH | Absorbé par UFR-017. Valeur unique : cas `chat-message-service:224-236` détaillé. | Garder |
| `feedback_closure_cell_cancellation_react_hooks.md` | **OK** | HIGH | Pattern `let cancelled = false` vérifié dans **10+ hooks** dans `features/` (useRuntimeSettings, useAutoPreCachePreference, useMemoryPreference, useVoiceDisclosure, useSottoVoce, etc.). Pattern bien adopté. | Garder |
| `feedback_devclient_no_churn.md` | **OK** | MEDIUM | Dev-only. Pas de UFR. | Garder |
| `feedback_doc_honesty_enforcement.md` | **À MODIFIER** | HIGH | Cite `scripts/sentinels/doc-anchor-check.mjs` — ce fichier **N'EXISTE PAS** dans le repo (vérifié). Sentinel promis en Wave C-Agent-3 non livré. Doctrine réelle mais sentinel non implémenté. | Marquer sentinel comme NON LIVRÉ |
| `feedback_integration_test_teardown.md` | **OK** | HIGH | `harness.scheduleStop()` est le pattern canonique vérifié dans `integration-harness.ts:107-111`. Les tests support citent le pattern dans leurs commentaires. Aucun appel `harness.stop()` direct trouvé dans les suites integration (seulement dans le harness lui-même). | Garder |
| `feedback_jsonb_drift_guard.md` | **OK** | HIGH | `deriveLastArtworkTitle` (`chat-session.service.ts:50`) a le guard `typeof last.title === 'string'` (vérifié). Fix appliqué correctement. | Garder |
| `feedback_no_feature_flags_prelaunch.md` | **OK avec nuances** | MEDIUM | Doctrine UFR-015 active. Dans le code, les flags `OTEL_ENABLED`, `LANGFUSE_ENABLED`, `EXTRACTION_WORKER_ENABLED`, `GUARDRAILS_V2_OBSERVE_ONLY` existent — mais ce sont des flags infra/operational, pas des feature-product flags. Aucun `CHAT_ENRICHMENT_V2_ENABLED` ou équivalent feature trouvé. UFR-015 exception "scaling-sensitive infra" couvre ces cas. | Garder |
| `feedback_no_git_stash_multi_agent.md` | **OK** | MEDIUM | Pas de UFR équivalent. Cas unique. | Garder |
| `feedback_no_solo_dev_estimates.md` | **OK** | HIGH | Absorbé par UFR-019. Valeur unique : user quote "50 à 70% trop importantes". | Garder |
| `feedback_opaque_animated_value_test_contract.md` | **À MODIFIER / VIOLATION** | HIGH | Violation trouvée : `__tests__/features/chat/ui/ImageCompareCardSkeleton.test.tsx:67` accède `flat.opacity as { _value?: number }` avec commentaire explicite "Allow Animated objects too (they expose `_value` in tests)". C'est un test RED non encore en GREEN (SUT n'existe pas — ligne 12 "Component does NOT exist yet"), donc la violation est dans un test RED. Mais le fallback `?? 1` est défensif. La doctrine dit "MUST NOT" — violation partielle (test non exécuté car composant absent). | Signaler violation + corriger quand composant implémenté |
| `feedback_phase_span_dual_path_emit.md` | **OK** | HIGH | Pattern try/finally + outcome vérifié dans `text-to-speech.openai.ts:141-165`. | Garder |
| `feedback_quality_doctrine.md` | **OK** | MEDIUM | Absorbé partiellement par UFR-001/004/005/006. Valeur unique : 4 règles consolidées avec WHY datés. | Garder |
| `feedback_runtime_archive_promotion_threshold.md` | **OK** | MEDIUM | Règle opérationnelle spécifique au /team lifecycle. Pas dans UFR. | Garder |
| `feedback_squash_merge_verify_ancestor.md` | **OK** | MEDIUM | Pas de UFR. Cas unique squash-merge. | Garder |
| `feedback_state_machine_react_key.md` | **OK** | HIGH | `BottomSheetRouter.tsx:155` a bien `key={state.route}` avec commentaire explicite "forces React to UNMOUNT". Fix appliqué. | Garder |
| `feedback_team_frozen_manifest_flat.md` | **OK** | MEDIUM | Doctrine spécifique /team. Pas de UFR. | Garder |
| `feedback_team_worktree_orchestration.md` | **OK** | MEDIUM | Doctrine opérationnelle /team worktree. Pas de UFR. | Garder |
| `feedback_tier_baseline_cap_discipline.md` | **OK** | HIGH | `integration-tier-baseline-cap.test.ts` existe. `.integration-tier-baseline.json` introuvable à `scripts/sentinels/` — **chemin mémoire potentiellement faux** (peut être ailleurs). | Vérifier le chemin exact du baseline JSON |
| `feedback_track_not_treat_v1_blocker.md` | **OK** | MEDIUM | Doctrine "fix in-session". Pas dans UFR (procédural). | Garder |
| `feedback_zero_bypass.md` | **OK** | HIGH | Pre-commit hook dit explicitement "NO BYPASS" et "There is no SKIP_PRE_COMMIT escape hatch". UFR-020 twinné. | Garder (doctrine unique sur scope Docker/env au-delà du hook bypass) |

---

## LOT 2 — Tableau lessons

| Fichier | État | Confiance | Lesson respectée / utile ? | Action |
|---|---|---|---|---|
| `SCHEMA.md` | **OK** | HIGH | Schema valide — définit frontmatter + 5 sections obligatoires + honesty rule (UFR-013). Cohérent avec les lessons actuelles. | Garder |
| `LESSONS_DIGEST.md` | **OK partiellement** | MEDIUM | 5 nuggets consolidés (i18n hook arg, /auth/me pref round-trip, MapLibre CartoDB, chaos circuit-breaker swap, GitNexus interface blindspot). Tous toujours utiles. Mais **ne reflète pas les 8 nouvelles lessons** 2026-05-17 → 2026-05-25 (digest consolidé à partir des 5 runs pré-mai-17 uniquement). Digest stale. | Mettre à jour digest OU documenter intentionnellement qu'il ne couvre que les runs consolidés |
| `2026-05-17-w3-geo-walk-intra.md` | **OK** | HIGH | Lesson très détaillée (242 lignes). Findings critiques : SAVEPOINT migration fix (`isTransactionActive`) → **vérifié implémenté** dans `AddMuseumGeofence.ts:48`. Corrective loops appliqués. Lesson reflète le travail réel. | Garder |
| `2026-05-21-connectivity-offline-first.md` | **À MODIFIER** | MEDIUM | Sections "Trigger", "Surprises", "Action items" contiennent `_no data captured_` ou des templates non remplis. Sections "What worked" et "What failed" ont du contenu réel (3 iterations de reviewer, blocker resolution). La lesson est **partiellement remplie** — non conforme au SCHEMA.md qui interdit de laisser des placeholders ("Action items: - commit: ..."). | Compléter ou accepter comme partiellement capturé |
| `2026-05-21-location-monument.md` | **À MODIFIER** | MEDIUM | Même problème : "Trigger" = `_no data captured_`, "Surprises" = `_no data captured_`, "Action items" = template non rempli. Content réel dans "What failed" seulement. | Compléter ou nettoyer les templates |
| `2026-05-21-p0-gdpr.md` | **À MODIFIER + SUIVI REQUIS** | HIGH | "Trigger", "Surprises", "Action items" = `_no data captured_`. Plus important : lesson note **4 findings CHANGES_REQUESTED** dont 2 BLOCKER/IMPORTANT. On ne sait pas si ces findings ont été résolus (le verdict final de la lesson est CHANGES_REQUESTED, pas APPROVED). Il manque la suite. IMPORTANT 3 (sentinel:web-cookies dans mauvais workflow) → **vérifié RÉSOLU** : note dans `ci-cd-backend.yml:131` et step dans `ci-cd-web.yml:81`. IMPORTANT 4 (strip-comments) → **vérifié RÉSOLU** : `privacy-content-drift.mjs:169+` a `stripComments()`. BLOCKER 1 (privacyPolicyContent.ts vendors) → non vérifié dans ce rapport. | Marquer resolutions dans la lesson |
| `2026-05-21-universal-links-inapp-routing.md` | **À MODIFIER** | MEDIUM | Sections "Trigger", "Surprises", "Action items" = template non rempli. Content réel dans "What worked"/"What failed". APPROVED. | Compléter ou nettoyer |
| `2026-05-21-universal-links-td-rnav-01.md` | **À MODIFIER** | MEDIUM | Mêmes problèmes templates non remplis. APPROVED. | Compléter ou nettoyer |
| `2026-05-25-p0-a11y-compliance.md` | **OK** | HIGH | Lesson la plus complète des récentes. APPROVED 91.2, 11/11 DoD, gates verbatim. Section "What failed" contient les résultats reviewer. Seules "Trigger/Surprises/Action items" manquent mais l'essentiel est là. | Garder |
| `2026-05-25-p0-cleanup.md` | **À SUPPRIMER / VIDE** | HIGH | Toutes sections = `_no data captured_` ou template non rempli. Lesson **entièrement vide** sauf les métadonnées. Inutile en l'état. | **Supprimer ou remplir** |

---

## Respect des lessons — violations constatées

### V1 — `feedback_opaque_animated_value_test_contract` : VIOLÉE (partielle)

**Fichier** : `museum-frontend/__tests__/features/chat/ui/ImageCompareCardSkeleton.test.tsx:67`
**Violation** : Accès à `Animated.Value._value` via `(flat.opacity as { _value?: number } | undefined)?._value ?? 1`. Commentaire explicite dans le code ("Allow Animated objects too (they expose `_value` in tests)").
**Contexte atténuant** : Ce fichier est un test RED (SUT n'existe pas encore — ligne 12 "Component does NOT exist yet"). La violation sera dans un test live uniquement quand le composant sera implémenté.
**Sévérité** : MEDIUM — la doctrine dit "MUST NOT", violation documentée et intentionnelle mais le test est inactif.

### V2 — `feedback_doc_honesty_enforcement` (sentinel `doc-anchor-check.mjs`) : SENTINEL NON LIVRÉ

**Claim mémoire** : "Sentinel `scripts/sentinels/doc-anchor-check.mjs` (Wave C-Agent-3) : grep chaque path:line dans `*.md`, fail si introuvable. Pre-push + CI mirror."
**Réalité** : Le fichier `museum-backend/scripts/sentinels/doc-anchor-check.mjs` **n'existe pas**.
**Impact** : La doctrine "toute affirmation factuelle dans *.md DOIT résoudre" n'a **aucun enforcement mécanique** — repose sur vigilance humaine uniquement.
**Sévérité** : HIGH — engagement Wave C-Agent-3 non honoré.

### V3 — `project_remediation_roadmap_2026-06-07.md` : SOURCE DE VÉRITÉ ABSENTE

**Claim mémoire** : "Source de vérité = `docs/ROADMAP_REMEDIATION_2026-06-07.md` (14 vagues, A-N)"
**Réalité** : Ce fichier n'existe pas dans le repo (ni dans `docs/`, ni ailleurs).
**Sévérité** : MEDIUM — le roadmap a probablement été intégré/purgé mais la mémoire pointe vers un artefact mort (exactement ce que `feedback_doc_honesty_enforcement` devrait bloquer).

### V4 — `feedback_bundled_red_green_frozen_test_gap` : HOOK GAP TOUJOURS OUVERT

**Claim mémoire** : "Hook gap à fix : `post-edit-green-test-freeze.sh` devrait aussi tourner en pre-commit (en plus de post-edit) pour catch les auto-fix prettier/eslint."
**Réalité** : Le hook `pre-commit` ne contient aucune référence à `post-edit-green-test-freeze.sh` (vérifié `.husky/pre-commit` complet). Le gap documenté reste **non résolu**.
**Sévérité** : LOW pour les commits normaux (pre-commit lint-staged peut dériver les sha si un test est dans le diff), HIGH pour les cycles /team avec lint-staged actif.

### V5 — `reference_otel_router_max_listeners` : VÉRIFICATION IMPOSSIBLE DIRECTE

**Claim mémoire** : `instrumentation-router: { enabled: false }` doit être dans la config.
**Réalité partielle** : `src/instrumentation.ts` existe, le grep de `instrumentation-router` ne retourne rien. Deux interprétations : (a) la clé est absente (non désactivé explicitement), (b) le fichier utilise une version plus récente de l'API qui ne nécessite pas la ligne. Confiance LOW sur l'état actuel.
**Sévérité** : MEDIUM si non désactivé (risque MaxListeners warning en prod).

### V6 — `project_geolocation_pipeline.md` : CHEMIN INCORRECT

**Claim** : `src/modules/chat/useCase/location/location-resolver.ts`
**Réalité** : `src/modules/chat/useCase/location-resolver.ts` (pas de sous-dossier `location/`)
**Impact** : Faible (fichier bien trouvable), mais fausse doctrine CLAUDE.md path.

---

## MEMORY.md — Intégrité de l'index

- **Fichier non indexé** : `feedback_audit_full_reverify_tree_aggregate.md` est dans le répertoire mais absent de MEMORY.md.
- **Fichiers repo-tracked non indexés** : `project_museum_web.md` et `project_v3_decisions.md` (dans `.claude/projects/` repo-tracked) ne sont pas mentionnés dans le MEMORY.md externe. Ce sont deux systèmes parallèles (externe ≠ repo) — MEMORY.md couvre le système externe uniquement. Architecture acceptable mais confusante.

---

## Findings notables

### FN-1 — Sentinel `doc-anchor-check.mjs` promis, non livré (CRITIQUE)
Doctrine `feedback_doc_honesty_enforcement` promise un mécanisme d'enforcement mécanique (Wave C-Agent-3). Il n'existe pas. Ironie : cette doctrine elle-même contient un path qui ne résout pas.

### FN-2 — `project_remediation_roadmap_2026-06-07.md` pointe vers un artefact mort
Le fichier `docs/ROADMAP_REMEDIATION_2026-06-07.md` n'existe plus. La mémoire est la seule trace de l'existence de ce document. La source de vérité "14 vagues" n'est pas accessible via le chemin cité.

### FN-3 — `project_v3_decisions.md` (repo-tracked) entièrement périmé
Les 3 décisions de 2026-03-26 sont toutes exécutées (Maestro 42 flows ✓, Lighthouse CI ✓, Wikidata implémenté ✓). Garder ce fichier dans le repo n'a aucune valeur opérationnelle — pollution.

### FN-4 — 6 lessons sur 8 ont des sections template non remplies
Pattern systématique : "Trigger" = `_no data captured_`, "Action items" = `- commit: ...` (template brut). Seule la lesson `2026-05-17-w3-geo-walk-intra.md` est pleinement remplie. `2026-05-25-p0-cleanup.md` est intégralement vide. Le SCHEMA.md dit "MUST write `_no data captured_`" pour les sections sans signal — OK pour certaines, mais les "Action items" avec template brut ne respectent pas l'esprit.

### FN-5 — Hook gap frozen-test / pre-commit non résolu depuis 2026-05-22
Depuis la documentation du gap dans `feedback_bundled_red_green_frozen_test_gap.md` (case 2026-05-22), le `.husky/pre-commit` n'a pas été modifié pour y inclure `post-edit-green-test-freeze.sh`. Ce gap expose les sessions bundled red+green à des silent drifts via lint-staged.

### FN-6 — Violation doctrine Animated._value dans un test RED
`ImageCompareCardSkeleton.test.tsx:67` lit `_value` privé. Violation intentionnelle documentée dans le code ("Allow Animated objects too"). Test inactif (SUT absent), mais quand le composant sera implémenté, ce pattern passera en phase green sans correction.

---

## Compteurs

- Mémoires totales auditées : 41 (39 externes + 2 repo-tracked)
- État **OK** : 27
- État **À MODIFIER** : 8 (`project_geolocation_pipeline`, `project_remediation_roadmap`, `project_museum_web`, `feedback_audit_full_reverify` [index gap], `feedback_bundled_red_green` [gap ouvert], `feedback_doc_honesty_enforcement` [sentinel absent], `feedback_opaque_animated_value` [violation RED test], `reference_otel_router_max_listeners` [vérification impossible])
- État **À SUPPRIMER** : 2 (`project_v3_decisions.md`, `2026-05-25-p0-cleanup.md` lesson vide)
- Lessons totales : 10 (8 lesson files + LESSONS_DIGEST + SCHEMA)
- Lessons **OK** : 3 (SCHEMA, `2026-05-17-w3-geo-walk-intra`, `2026-05-25-p0-a11y-compliance`)
- Lessons **À MODIFIER** : 6 (5 lessons avec templates non remplis + LESSONS_DIGEST stale)
- Lessons **À SUPPRIMER** : 1 (`2026-05-25-p0-cleanup` intégralement vide)
- Violations lessons constatées : 6 (V1 à V6 ci-dessus)
- **Violations HIGH** : 2 (V2 sentinel absent, V1 Animated._value)
- **Violations MEDIUM** : 3 (V3 artefact mort, V4 hook gap, V5 OTel vérification)
