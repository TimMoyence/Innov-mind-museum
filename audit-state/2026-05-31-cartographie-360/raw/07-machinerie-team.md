# Audit 07 — Machinerie du skill `team` + apparatus d'agents custom

Date: 2026-05-31. Scope: INTROSPECTION de la machine (pas de benchmark vs Anthropic natif).
Repo: Musaium, dev solo assisté-IA, launch V1 ~2026-06-07.

## 1. Volume et surface de la machine

Mesuré (`wc -l`, `find`):

| Couche | Volume |
|---|---|
| Orchestrateur `SKILL.md` | 705 lignes |
| `team-sdlc-index.md` (table de vérité) | 193 lignes |
| Protocoles `team-protocols/*.md` (8 fichiers) | inclus dans ~60 515 lignes `.md` du dossier team (dont team-reports archivés) |
| Hooks shell `team-hooks/*.sh` (12) + `lib/*.sh` (8) | 3 266 lignes shell |
| Agents `.claude/agents/*.md` (9) | 1 741 lignes |
| `shared/user-feedback-rules.json` | 22 UFR |
| Knowledge stores `team-knowledge/*.json` (8) + `lessons/` | ~10 lessons capturées |

C'est une machine substantielle: ~5 000 lignes de spec/protocole + ~3 300 lignes de shell + 9 prompts d'agents (1 741 lignes). Pour un dev solo, l'effort de maintenance est réel: chaque hook a un `--self-test`, chaque agent un mandat, chaque protocole une table croisée.

## 2. Le frozen-test contract est-il infalsifiable ? NON — c'est un honor-system

C'est le défaut central. Le hook `post-edit-green-test-freeze.sh` (`.claude/skills/team/team-hooks/post-edit-green-test-freeze.sh:1-152`) fonctionne correctement quand on l'appelle: son `--self-test` passe `3 pass, 0 fail` (vérifié live), il re-hash chaque test du `red-test-manifest.json` et exit 1 sur mismatch (`:124-151`). La logique est saine.

**MAIS il n'est jamais déclenché automatiquement.** Le commentaire en tête dit "Runs after every Edit/Write during phase 4 (Green)" (`:4`), ce qui est trompeur. Vérification:
- `.claude/settings.json` PostToolUse ne câble QUE `count-design-debt.py` (matcher `git commit`) et `gitnexus analyze`. Aucun hook team.
- `.claude/settings.local.json` PostToolUse `Edit|Write` câble UNIQUEMENT `.claude/hooks/lint-on-edit.sh` — PAS le freeze.

Le freeze n'est invoqué que parce que `SKILL.md:301` ordonne à l'orchestrateur LLM de lancer `RUN_ID=$RUN_ID .claude/skills/team/team-hooks/post-edit-green-test-freeze.sh` après chaque edit Green, et que `agent-mandate.md:161` répète l'instruction. C'est l'orchestrateur (un LLM) qui doit se souvenir de l'exécuter. Un LLM qui oublie, prend un raccourci tokens, ou un agent Green qui édite un test sans que personne ne relance le hook → la violation passe. Le contrat décrit comme "infalsifiable / byte-for-byte / STOP" est en réalité une discipline procédurale que rien dans le harness n'impose.

**Pire — bypass mécanique confirmé (gotcha `feedback_bundled_red_green_frozen_test_gap.md`):** le SEUL hook PostToolUse Edit|Write réellement câblé, `.claude/hooks/lint-on-edit.sh`, lance `prettier + eslint --fix` sur tout `.ts/.tsx/.json` édité (`:34` skip seulement node_modules/lockfiles/team-knowledge/team-reports — PAS les fichiers de test). Si l'agent Green touche/reformate un test, l'auto-fix réécrit le fichier → le sha256 du manifest diverge silencieusement, et comme le freeze n'est pas dans la même chaîne PostToolUse, rien ne le rattrape au moment de l'edit. La mémoire-doctrine reconnaît explicitement ce gap; il n'est pas refermé dans le code.

## 3. Fresh-context 5-phase: implémenté en prose, pas en mécanisme

Le pipeline spec→plan→red→green→review (`SKILL.md:13,28,36`) repose entièrement sur la discipline de l'orchestrateur:
- `BRIEF-ACK: <sha256>` et `BLOCK-CONTEXT-LEAK` (REGLE 6, `SKILL.md:28`) sont des conventions de texte que l'agent doit émettre — aucun hook ne vérifie l'absence réelle de fuite de contexte entre phases.
- Le "fresh spawn zero-memory" dépend de l'orchestrateur appelant l'Agent tool proprement. Aucune barrière technique n'empêche un orchestrateur de résumer la phase précédente dans le brief.
- Le verrou `red-test-manifest.json` sha256-chain est le seul élément déterministe, et il souffre du problème §2.

Ce qui EST déterministe et fonctionne: `pre-feature-spec-check.sh --self-test` → `8/8 PASS` (vérifié), `pre-phase-doc-reference-check.sh` (assertion `libDocsConsulted[]`), `post-edit-lint.sh`, `post-edit-typecheck.sh`. Ce sont de vrais gates shell. Mais ils ne sont, eux aussi, lancés que sur ordre de l'orchestrateur (SKILL.md:299-301), pas par le harness.

## 4. lib-docs obligation: couche entière jamais exercée ?

`lib-docs/` (REGLE 15) impose doc-fetcher + doc-curator (2 des 9 agents) + cache PATTERNS.md/LESSONS.md par lib + refresh forcé si >14j. C'est l'ajout de complexité le plus lourd au rapport bénéfice. Aucune preuve dans `team-reports/` qu'un cycle ait réellement bloqué sur un drift lib-docs, ni que `libDocsConsulted[]` ait attrapé un mauvais pattern. 2 agents sur 9 servent une obligation dont l'efficacité n'est pas démontrée.

## 5. Preuves que la machine a attrapé de vrais défauts

Faible mais non-nul. Sur 36 runs archivés dans `team-reports/`:
- 3 `CHANGES_REQUESTED` (pr-9-assertPasswordReauth, pr-13-threeStateCircuit, chat-composer-buttons-modal-dismiss) — le reviewer a effectivement rejeté.
- ~27 `APPROVED`, plusieurs avec `findings` non-nuls (web-refactor-p1: 9 findings, cluster5-jwt: 4, pr-6: 5) → des findings ont été remontés même sur des APPROVED.
- 2 verdicts `?` (pr-10, pr-11) = champ verdict absent → drift de schéma dans les artefacts.

Donc la review semantic produit du signal réel (3 rejets + findings). Mais 25/36 runs datent du 19-23 mai (burst de micro-PRs DRY-refactor `extractEmailDomain`, `formatZodIssues`, `assertPagination`...). Beaucoup étaient des extractions triviales où le pipeline 5-phase complet est démesuré. Aucune preuve qu'un défaut de gravité haute (sécurité, contrat cassé) ait été attrapé SPÉCIFIQUEMENT par le frozen-test ou le fresh-context — les rejets viennent de la review humaine-like, pas des mécaniques UFR-022 lourdes.

`learning/` ne contient qu'un dossier (`2026-05-28-weekly`, sessions de formation Tim) — pas une boucle d'amélioration automatique active. `team-knowledge/lessons/` = ~7 lessons, fail-open.

## 6. Sur-ingénierie vs réellement protecteur

**Réellement protecteur (garder):**
- `post-edit-lint.sh` / `post-edit-typecheck.sh` — gates déterministes scoped, vrai filet.
- `pre-feature-spec-check.sh` (8/8 self-test) — force des artefacts spec/design/tasks non-vides.
- Reviewer semantic — a produit 3 rejets + findings réels.
- État durable `state.json` + resume — légitime pour runs longs.

**Sur-ingénierie / fausse sécurité:**
- **Frozen-test** présenté comme infalsifiable alors qu'il est honor-system non-câblé (§2). C'est la pire forme: donne confiance dans une garantie inexistante.
- **lib-docs/doc-fetcher/doc-curator** (§4) — couche lourde, zéro preuve d'efficacité.
- **22 UFR + 8 protocoles + reviewer rejection loop illimité** — pour un dev solo, le ratio cérémonie/code est élevé. Le burst de micro-PRs DRY montre le pipeline 5-phase appliqué à des extractions de 10 lignes.
- **Drift de version modèle**: `SKILL.md:24` REGLE 2 et les frontmatter agents pinnent `claude-opus-4-7` / `documenter: 4-6`, alors que l'environnement tourne `opus-4-8 [1M]`. La doctrine "all-Opus 4-7" est stale → les agents spawnés ne sont pas sur le modèle déclaré.

## 7. Verdict

Machine impressionnante sur le papier, partiellement creuse à l'exécution. Les gates shell déterministes (lint/tsc/spec-check) sont du vrai filet de sécurité testé. Mais les trois innovations vedettes d'UFR-022 — frozen-test, fresh-context anti-leak, lib-docs — reposent sur la discipline d'un orchestrateur LLM et non sur le harness, donc falsifiables, et le frozen-test a un bypass mécanique connu et non-refermé (lint-on-edit auto-fix). Pour un dev solo à 1 semaine du launch, le coût de maintenance (~5 000 lignes prose + 3 300 shell + 9 agents) dépasse vraisemblablement le bénéfice marginal sur des PRs majoritairement triviales. La machine se vend comme enterprise-grade infalsifiable; elle est en réalité enterprise-grade-cérémonie avec quelques gates réels au centre.
