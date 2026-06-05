# SDLC Pipeline — Mode Unique (UFR-022)

Thin per-phase reference. **`SKILL.md` is canonical** (EXECUTION Steps 0-9) — this file
only summarises the fixed 8-phase flow and its fresh-context invariants. Defer to SKILL.md
for the concrete dispatcher actions, handoff JSON shapes, and state.json mutations.

> **UFR-022 retired the 3-tier model.** No more `micro` / `standard` / `enterprise`
> selector, no more mode router (`feature` / `bug` / `chore` / `hotfix` / `mockup` /
> `refactor` / `audit`), no more classification or auto-escalade. UN seul pipeline pour
> toute modif de code applicatif. Historique du 3-tier model → `git log -- this file`.

---

## INVARIANTS FRESH-CONTEXT (s'appliquent à CHAQUE phase)

- **Fresh spawn par phase** — chaque phase = un appel `Agent` tool (nouveau process),
  zéro message d'une autre phase du même RUN_ID dans le context. Jamais de `SendMessage`
  continuation, jamais de résumé inline de la phase précédente (refs disque seulement).
- **`BRIEF-ACK: <sha256>`** — l'agent émet le hash du brief reçu en première réponse.
  Mismatch = BLOCK.
- **`BLOCK-CONTEXT-LEAK`** — si un agent voit dans son history un message d'une autre
  phase, il refuse et le dispatcher re-spawn proprement.
- **Lib-docs obligation** — red / green / reviewer DOIVENT consulter
  `lib-docs/<lib>/PATTERNS.md` + `LESSONS.md` pour chaque lib non-dev-only importée par le
  diff, et reporter `libDocsConsulted[]`. Cache stale (>14j / version drift / manquant) →
  doc-cache refresh. Le hook `pre-phase-doc-reference-check.sh` (gate verify) BLOCK si la couverture manque.
- **Frozen-test** — red écrit `red-test-manifest.json` `{path: sha256}` ; green ne peut
  modifier aucun byte d'un test du manifest (`post-edit-green-test-freeze.sh` enforce).
  Test jugé buggé → `BLOCK-TEST-WRONG <file>:<line> <reason>` SANS toucher → re-spawn fresh red.

**Exemption auto pure-doc** — si `git diff --name-only` ne touche aucun fichier de code
applicatif, `pre-phase-pure-doc-check.sh` (Step 0) écrit `pure-doc-skip.marker` et le run
saute directement Step 9 finalize (toutes les phases 1-8 skippées).

---

## LES 8 PHASES

| # | Phase | Agent (fresh) | Output | Gate / invariant |
|---|-------|---------------|--------|------------------|
| 1 | **spec** | architect #1 | `spec.md` (EARS + NFR + glossary + stakeholders + acceptance) | spec only, pas de design/tasks |
| 2 | **plan** | architect #2 (zéro mémoire de #1, lit `spec.md` du disque) | `design.md` + `tasks.md` | Spec Kit closing gate (`pre-feature-spec-check.sh`, 3 fichiers ≥200B) |
| 3 | **doc-cache** | doc-cache (×N libs stale, parallèles, write-zones disjointes ; fetch PUIS curate en un seul spawn) | `snapshot-*.md`, `PATTERNS.md`, `INDEX.json` maj | `pre-phase-doc-freshness.sh` ; WebSearch fail → WARN, jamais BLOCK |
| 4 | **red** | editor #1 | tests qui **FAIL** + `red-test-manifest.json` | `pnpm test` scoped exit ≠ 0 = succès |
| 5 | **green** | editor #2 (zéro mémoire de #4, lit le red diff du disque) | code applicatif | FROZEN-TEST byte-for-byte ; `pnpm test` scoped exit 0 |
| 6 | **verify** | *gate déterministe (hooks, sans agent)* | gates dans `state.json.gates[]` | `pre-complete-verify.sh` + `pre-phase-doc-reference-check.sh` + freeze final assert ; scope-boundary + spot-check délégués au reviewer (P8) |
| 7 | **security** | security (Read/Grep/Bash, pas d'Edit) | section STORY.md `security` | TOUJOURS exécuté ; `pnpm audit` + semgrep + promptfoo ; FAIL HIGH/CRITICAL = BLOCK |
| 8 | **review** | reviewer | `code-review.json` (5 axes + verdict) | weightedMean ≥85 APPROVED / 70-84.9 CHANGES_REQUESTED / <70 BLOCK |
| 9 | **documenter** | documenter | STORY.md final + ADR/CHANGELOG si requis | TOUJOURS présent (plus de skip "enterprise-only") |

Détail de chaque step (briefs, hooks intra-phase, ordering finalize) → `SKILL.md` EXECUTION.

---

## BOUCLES CORRECTIVES — deux mécanismes distincts

- **Intra-phase hook fail (cap 2)** — fails de `post-edit-lint.sh` / `post-edit-typecheck.sh`
  / `pnpm test` à l'intérieur d'une MÊME phase éditeur (red ou green). Compteur
  `state.json.telemetry.intraPhaseHookLoops`, reset entre phases. `>= 2` → STOP + escalade user.
- **Reviewer rejection loop — ILLIMITÉ.** CHANGES_REQUESTED → re-spawn fresh la phase
  pointée par `reSpawnPhase` (spec/plan/red/green) + re-run des phases downstream.
  `reviewerRejectionLoops` est telemetry pure : **zéro cap, zéro warning auto**. Si le
  reviewer rejette N fois, c'est qu'il y a raison.

`BLOCK-TEST-WRONG` (green → red) n'incrémente PAS `reviewerRejectionLoops` (ce n'est pas
un rejet reviewer) — voir SKILL.md Step 5b.

---

## CONTEXT LOADING (mode unique)

Plus de branching par pipeline. Le dispatcher charge TOUS les protocoles + KB JSON
(équivalent de l'ancien `enterprise`) via le warm-up cache unique avant fan-out
(SKILL.md Step 3). Template unique : `team-templates/enterprise.md` (`micro.md`/`standard.md`
= legacy dead-concept, sélecteur retiré).

---

## CHANGELOG

| Version | Date | Changements |
|---|---|---|
| **v13.UFR-022** | **2026-05-18** | Réécrit en mode-unique. Supprimé : classification micro/standard/enterprise, matrice mode→pipeline, pipelines MICRO/STANDARD/ENTERPRISE, SMART CONTEXT LOADING branché. Remplacé par la table 9-phase (spec/plan/doc-freshness/red/green/verify/security/review/documenter) keyée sur SKILL.md Steps 4a-9. |
| **v13.prune-9→6** | **2026-05-31** | Élagage agents 9→6. Phase `doc-freshness` → `doc-cache` (doc-fetcher+doc-curator fusionnés, fetch+curate un spawn). Phase `verify` devient gate déterministe (hooks, sans agent) ; scope-boundary + spot-check + DoD-confirmation délégués au reviewer (P8). Pipeline 8-phase. |
