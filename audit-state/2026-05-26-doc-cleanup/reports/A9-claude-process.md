# A9 — Audit doc PROCESS `.claude/` (orchestrateur /team, agents, skills)

Auditeur : Claude Code read-only  
Date : 2026-05-26  
Scope : `.claude/agents/*.md`, `.claude/skills/team/**`, `.claude/skills/{recap,rollback,security-scan,test-routes,test-writer,verify-schema}/SKILL.md`, `.claude/commands/power-tools.md`  
Exclusions : `.claude/skills/team/team-knowledge/lessons/` (audité ailleurs) ; plugins vendored (gitnexus/superpowers/expo/sentry/code-review/frontend-design).

---

## Tableau principal

| # | Fichier | État | Confiance | Preuve (doc → réalité) | Action |
|---|---------|------|-----------|------------------------|--------|
| 1 | `.claude/skills/team/SKILL.md` | OK | HAUTE | Hooks cités (11) : tous présents dans `team-hooks/`. Agents (9) : tous présents dans `.claude/agents/`. Lib scripts (`lib/*.sh`) : tous présents. Modèles : REGLE 2 dit tous opus-4.7 sauf documenter opus-4.6 — confirmé par frontmatter de chaque agent. Templates cités : `enterprise.md` présent ; `micro.md`/`standard.md` correctement labelés "legacy dead-concept" et absents du disque. UFR = 22/20 actifs vérifié vs `user-feedback-rules.json`. | Aucune. Seule note : `agent-roi.json` cité au Step 9 §1 est stale (voir ligne 12). |
| 2 | `.claude/skills/team/team-sdlc-index.md` | **À MODIFIER** | HAUTE | Tableau "9 Agents" colonne "Model (doctrine)" : `editor`, `verifier`, `security`, `doc-fetcher`, `doc-curator` affichent `opus-4.6` — **faux**. Chaque fichier agent frontmatter dit `claude-opus-4-7`. La footnote sous le tableau l'admet : "tous déclarent `model: opus` (alias), sauf documenter pin `claude-opus-4-6`". Le tableau n'a pas été mis à jour lors du changement 2026-05-20 (commit `97b02e2bf`). | Corriger les 5 lignes du tableau : `opus-4.6` → `opus-4.7` pour editor/verifier/security/doc-fetcher/doc-curator. |
| 3 | `.claude/skills/team/team-state/README.md` | **À MODIFIER** | HAUTE | Titre = "V12". Lifecycle décrit en 7 étapes v12 (brainstorm, plan, implement, verify, review, finalize) — ne reflète pas les 9 phases UFR-022 (spec, plan, doc-freshness, red, green, verify, security, review, documenter). Layout manque : `multi-cycle-features/`, `cost-history.json`, `quality-scores.json`, `pure-doc-skip.marker`, `roadmap-tick.patch`, `doc-refresh-queue.json`, `red-test-manifest.json`. Section "Optimistic lock" décrit du TypeScript alors que le vrai mécanisme est bash CAS `mkdir state.json.lock.d` (SKILL.md §583). | Mettre à jour titre → V13, lifecycle → 9 phases UFR-022, layout → ajouter les artefacts v13, section lock → bash CAS. |
| 4 | `.claude/skills/team/team-protocols/finalize.md` | **À MODIFIER** | HAUTE | §1 "Update KB" cite `team-knowledge/agent-roi.json` (ligne 23) — fichier ABSENT du disque. Fichier réel : `agent-performance.json`. Le bas du même fichier (Notes KB, ligne 68) référence correctement `agent-performance.json` et décrit son contenu ROI. Double définition incohérente dans le même fichier. Identique dans `SKILL.md` Step 9 §1 line 489 (voir ligne 1 ci-dessus — SKILL.md OK globalement mais cette ligne est stale). | `finalize.md` §1 : remplacer `agent-roi.json` → `agent-performance.json`. Même correction dans `SKILL.md` Step 9 §1. |
| 5 | `.claude/skills/team/team-protocols/sdlc-pipelines.md` | OK | HAUTE | Line 74 mentionne `micro.md`/`standard.md` uniquement pour dire qu'ils sont "legacy dead-concept, sélecteur retiré". Correct — pas de faux claim de chargement. | Aucune. |
| 6 | `.claude/skills/team/team-protocols/agent-mandate.md` | OK | HAUTE | Les 9 agents cités existent tous dans `.claude/agents/`. Mode unique UFR-022 correctement décrit. | Aucune. |
| 7 | `.claude/skills/team/team-protocols/quality-gates.md` | OK | HAUTE | Pipeline unique référencé, pas de sélecteur legacy. Hooks cités présents. | Aucune. |
| 8 | `.claude/skills/team/team-protocols/import-coherence.md` | OK | HAUTE | Aucun path ou hook stale détecté. | Aucune. |
| 9 | `.claude/skills/team/team-protocols/gitnexus-integration.md` | OK | HAUTE | Aucun path ou hook stale. | Aucune. |
| 10 | `.claude/skills/team/team-protocols/error-taxonomy.md` | OK | HAUTE | Mode unique UFR-022 correct. | Aucune. |
| 11 | `.claude/skills/team/team-protocols/conflict-resolution.md` | OK | HAUTE | Mode unique UFR-022 correct. | Aucune. |
| 12 | `.claude/skills/team/team-hooks/README.md` | OK | HAUTE | Liste exactement 11 hooks — correspond à `ls team-hooks/` (11 `.sh` + `README.md`). Descriptions exactes et cohérentes avec SKILL.md. | Aucune. |
| 13 | `.claude/skills/team/team-knowledge/amendments/SCHEMA.md` | OK | HAUTE | Structure pending/applied/rejected vérifiée sur disque. Lifecycle correct. | Aucune. |
| 14 | `.claude/skills/team/team-state/README.md` | **À MODIFIER** | HAUTE | (déjà couvert ligne 3, séparé pour clarté) | Voir ligne 3. |
| 15 | `.claude/skills/team/team-templates/enterprise.md` | OK | HAUTE | Pipeline 9-phase correct, référence `pre-phase-pure-doc-check.sh` (présent), décrit FROZEN-TEST et fresh-context. Pas de legacy sélecteur actif. | Aucune. |
| 16 | `.claude/agents/architect.md` | OK | HAUTE | Paths `team-state/$RUN_ID/`, `lib-docs/INDEX.json`, `team-templates/*.tmpl` corrects. `model: claude-opus-4-7`. | Aucune. |
| 17 | `.claude/agents/editor.md` | OK | HAUTE | Paths hooks `post-edit-lint.sh`, `post-edit-typecheck.sh`, `post-edit-green-test-freeze.sh` corrects. `model: claude-opus-4-7`. FROZEN-TEST protocol correct. | Aucune. |
| 18 | `.claude/agents/verifier.md` | OK | HAUTE | Paths hooks `pre-complete-verify.sh`, `pre-phase-doc-reference-check.sh`, `post-edit-green-test-freeze.sh` corrects. `model: claude-opus-4-7`. | Aucune. |
| 19 | `.claude/agents/reviewer.md` | OK | HAUTE | Output path `.claude/skills/team/team-reports/<RUN_ID>/code-review.json` correct. `model: claude-opus-4-7`. | Aucune. |
| 20 | `.claude/agents/security.md` | OK | HAUTE | `model: claude-opus-4-7`. Aucun path interne stale. | Aucune. |
| 21 | `.claude/agents/documenter.md` | OK | HAUTE | `model: claude-opus-4-6` (seule exception correcte). Output paths `team-state/$RUN_ID/STORY.md` corrects. | Aucune. |
| 22 | `.claude/agents/doc-fetcher.md` | OK | HAUTE | `model: claude-opus-4-7`. Paths `lib-docs/<lib>/`, `lib-docs/INDEX.json` corrects. | Aucune. |
| 23 | `.claude/agents/doc-curator.md` | OK | HAUTE | `model: claude-opus-4-7`. Paths `lib-docs/<lib>/PATTERNS.md`, `snapshot-*.md`, `LESSONS.md` corrects. | Aucune. |
| 24 | `.claude/agents/learning-curator.md` | OK | HAUTE | `model: claude-opus-4-7`. Write scope `team-knowledge/amendments/pending/` correct. Paths hooks cités (`team-hooks/*.sh`) existent. | Aucune. |
| 25 | `.claude/skills/recap/SKILL.md` | **À MODIFIER** | HAUTE | Source 6 cite `wc -l .claude/team-knowledge/*.json` — path **faux**. Le répertoire réel est `.claude/skills/team/team-knowledge/`. `.claude/team-knowledge/` n'existe pas. | Corriger : `.claude/team-knowledge/*.json` → `.claude/skills/team/team-knowledge/*.json`. |
| 26 | `.claude/skills/rollback/SKILL.md` | OK | HAUTE | Aucun path `.claude/` incorrect. Commandes git/docker cohérentes avec CLAUDE.md. | Aucune. |
| 27 | `.claude/skills/security-scan/SKILL.md` | OK | HAUTE | Aucun path stale. Frontmatter `last-verified: 2026-05-18`. | Aucune. |
| 28 | `.claude/skills/test-routes/SKILL.md` | OK | HAUTE | Aucun path stale. Frontmatter `last-verified: 2026-05-16`. Commandes correctes (REST Client / pnpm dev). | Aucune. |
| 29 | `.claude/skills/test-writer/SKILL.md` | **À MODIFIER** | MOYENNE | Description ligne 9 : "Standalone ou integre dans /team Phase 2.5". En UFR-022 v13, `/test-writer` n'est PAS utilisé par `/team` comme phase de pipeline (la phase=red utilise `editor.md` directement). Le corps du SKILL.md le corrige lui-même (section INTEGRATION/team) mais la description de l'en-tête crée une fausse attente. "Phase 2.5" n'est pas un nom de phase dans le pipeline v13 (Step 2.5 = cost telemetry, non une phase d'édition). | Corriger ligne 9 : supprimer la mention "Phase 2.5", remplacer par "standalone uniquement (pipeline /team utilise editor.md fresh-context pour phase=red)". |
| 30 | `.claude/skills/verify-schema/SKILL.md` | OK | HAUTE | Aucun path stale. Commandes TypeORM correctes. | Aucune. |
| 31 | `.claude/commands/power-tools.md` | OK | HAUTE | Paths repo (`museum-backend/`, `museum-frontend/`) corrects. Commandes (`rg`, `jq`, OpenAPI checks, auth flow) cohérentes avec CLAUDE.md. Aucun path `.claude/` interne référencé. | Aucune. |

---

## Findings notables

### F1 — BLOQUANT : `team-sdlc-index.md` modèles agents erronés (ligne 2 du tableau)
5 agents affichent `opus-4.6` dans la table du fichier index alors que leurs frontmatter réels disent `claude-opus-4-7`. Décision user 2026-05-20 "tous 4.7 sauf documenter" bien capturée dans SKILL.md REGLE 2 et dans les fichiers agent, mais l'index n'a pas été mis à jour lors du commit `97b02e2bf`. L'index est utilisé comme "table de vérité unique" (ligne 1) — sa corruption fausse le référentiel.

### F2 — `agent-roi.json` fantôme : 8 références, 0 fichier sur disque
`agent-roi.json` est référencé dans : `SKILL.md:489`, `finalize.md:23`, `enterprise.md:141`, `STORY.md.tmpl:69`, 4 lessons (2026-05-21/25). Le fichier sur disque est `agent-performance.json`. Historique git confirme : `agent-roi.json` n'a jamais existé à ce chemin (aucun commit). Le fichier a toujours été `agent-performance.json` (même contenu ROI selon `team-sdlc-index.md` ligne 140). Correction : renommer les références dans `SKILL.md` Step 9 §1 et `finalize.md` §1 (les lessons sont archivées — ne pas toucher). Les templates (`enterprise.md`, `STORY.md.tmpl`) peuvent aussi être corrigés.

### F3 — `team-state/README.md` : V12 non mis à jour post-UFR-022
Le README porte encore "V12", décrit un lifecycle en 6 étapes v12, utilise une section "Optimistic lock" avec du pseudo-TypeScript alors que le mécanisme réel est bash `mkdir`. 8 artefacts v13 (multi-cycle-features, cost-history.json, quality-scores.json, pure-doc-skip.marker, roadmap-tick.patch, doc-refresh-queue.json, red-test-manifest.json, roadmap-context.json) sont absents du layout. Ce fichier est tracké dans git et potentiellement lu par des agents en phase resume.

### F4 — `recap/SKILL.md` : path KB incorrect
Source 6 (`wc -l .claude/team-knowledge/*.json`) pointe vers `.claude/team-knowledge/` qui n'existe pas. Le répertoire réel est `.claude/skills/team/team-knowledge/`. La commande shell retournerait une erreur silencieuse ou un count de 0, faussant le "KB Health" du recap.

### F5 — `test-writer/SKILL.md` : "Phase 2.5" description trompeuse (mineure)
La description d'en-tête dit "integre dans /team Phase 2.5" alors que (a) Step 2.5 de SKILL.md = cost telemetry, pas une phase d'édition de tests, et (b) en UFR-022 le test-writer ne fait pas partie du pipeline /team (`editor.md` est utilisé pour red). Le corps du skill le rectifie explicitement. Impact faible (description courte, corps correct) mais crée confusion pour onboarding.

---

## Résumé

- **19 OK** : agents (9/9 ✓), protocoles (8/8 ✓), hooks README (✓), templates enterprise/spec/design/tasks/STORY/handoff (✓), amendments SCHEMA (✓), skills rollback/security-scan/test-routes/verify-schema (✓), power-tools (✓).
- **4 À MODIFIER** : `team-sdlc-index.md` (modèles stale), `team-state/README.md` (V12 entier à refondre), `finalize.md` (agent-roi→agent-performance dans §1), `recap/SKILL.md` (path KB wrong).
- **Bonus dans les À MODIFIER** : `SKILL.md` Step 9 §1 et `enterprise.md`/`STORY.md.tmpl` contiennent aussi `agent-roi.json` → même correction cohérente.
- **1 À MODIFIER mineure** : `test-writer/SKILL.md` description ligne 9 ("Phase 2.5" trompeuse).
- **0 À SUPPRIMER** : `micro.md`/`standard.md` n'existent plus sur disque (déjà supprimés). `audit.md` = idem. Les fichiers legacy templates sont absents = OK.
- **Aucun hook manquant** : les 11 hooks documentés existent tous dans `team-hooks/`.
- **Aucun agent manquant** : les 9 agents documentés existent tous dans `.claude/agents/`.
