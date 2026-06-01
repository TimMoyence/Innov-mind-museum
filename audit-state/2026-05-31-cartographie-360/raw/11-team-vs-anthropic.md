# Team apparatus Musaium vs primitives natives Anthropic / Claude Code

**Date** : 2026-05-31
**Question** : l'apparatus `/team` (skill orchestrateur + 9 agents + fresh-context 5-phase + frozen-test + reviewer loop illimité + lib-docs caching) a-t-il une vraie plus-value vs les primitives natives Anthropic 2025-2026 ?
**Méthode** : lecture du code réel (`.claude/skills/team/SKILL.md`, `.claude/agents/*.md`, `team-hooks/*.sh`, `lib-docs/`) + recherche docs Anthropic / Claude Code / cookbook / plugin superpowers.

---

## 1. Ce que fournit le natif aujourd'hui (vérifié docs)

### 1.1 Subagents Claude Code (`.claude/agents/`)
Chaque subagent natif est « a named, isolated Claude instance with its own system prompt, its own context window, its own tool access list, and its own permission mode ». Les tool calls intermédiaires restent dans le contexte du subagent ; seul le message final remonte au parent. Définition = fichier markdown + frontmatter YAML dans `.claude/agents/` (projet) ou `~/.claude/agents/` (global). Parallélisme natif (style-checker / security-scanner / test-coverage concurrents). Source : [Create custom subagents — Claude Code Docs](https://code.claude.com/docs/en/sub-agents), [Subagents in the SDK](https://platform.claude.com/docs/en/agent-sdk/subagents).

**Conséquence directe** : l'**isolation de contexte par phase** que `/team` réinvente (« chaque phase = un Agent spawn fresh, zero message d'une autre phase ») est *déjà la sémantique native d'un subagent*. Un subagent ne voit pas le contexte du parent au-delà du brief qu'on lui passe. La nouveauté Musaium n'est pas l'isolation — c'est la **discipline d'enchaînement** (5 phases nommées, artefacts sur disque relus à froid) et la **self-defense `BLOCK-CONTEXT-LEAK`**, qui ne sont pas natives.

### 1.2 Hooks (`PreToolUse` / `PostToolUse` / `Stop` / `SubagentStop`)
Hooks = « deterministic control … ensuring certain actions always happen rather than relying on the LLM to choose to run them ». `PostToolUse` = quality gate après exécution, peut réinjecter du feedback. Source : [Automate workflows with hooks](https://code.claude.com/docs/en/hooks-guide). Le SDK expose `PreToolUse, PostToolUse, Stop, SessionStart, SessionEnd, UserPromptSubmit` ([Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)).

**Conséquence** : les 11 hooks de `team-hooks/` (lint, typecheck, **freeze**, doc-freshness, reference-check, pure-doc) sont du code shell branché sur le mécanisme **natif** `PostToolUse`/`Stop`. Le *mécanisme* est natif ; le *contenu* (ex. `post-edit-green-test-freeze.sh` qui re-hash sha256 chaque test du `red-test-manifest.json` et exit 1 sur mismatch) est custom et n'a pas d'équivalent natif prêt-à-l'emploi.

### 1.3 Skills (progressive disclosure)
Standard ouvert depuis 2025-12-18, adopté par OpenAI/Google/GitHub/Cursor. SKILL.md = frontmatter + markdown, chargé en 3 niveaux (discovery ~80 tokens → activation → execution). Source : [Equipping agents with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills), [Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview). `/team` EST un skill — il utilise déjà cette primitive.

### 1.4 Cookbook : orchestrator-workers + evaluator-optimizer
« Building Effective Agents » formalise 5 patterns : prompt chaining, routing, parallelization, **orchestrator-workers**, **evaluator-optimizer**. Orchestrator-workers : « a central LLM dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results … well-suited for coding tasks requiring coordinated changes across multiple files ». Evaluator-optimizer : « one LLM call generates a response while another provides evaluation and feedback in a loop ». Sources : [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents), [orchestrator_workers.ipynb](https://github.com/anthropics/anthropic-cookbook/blob/main/patterns/agents/orchestrator_workers.ipynb), [evaluator_optimizer.ipynb](https://github.com/anthropics/anthropic-cookbook/blob/main/patterns/agents/evaluator_optimizer.ipynb).

**Conséquence** : `/team` = une **instanciation directe** de orchestrator-workers (dispatcher = orchestrateur ; architect/editor/reviewer/security = workers) + evaluator-optimizer (reviewer loop = boucle d'évaluation/feedback). Le pattern est canonique Anthropic, pas une invention Musaium. Ce que Musaium ajoute = la rigueur SDLC (red→green frozen) par-dessus le pattern.

### 1.5 Plugin `superpowers` (obra, accepté marketplace officiel janv. 2026)
Skills : `test-driven-development` (RED-GREEN-REFACTOR : « write failing test, watch it fail, write minimal code, watch it pass, commit » + « deletes code written before tests »), `subagent-driven-development` (« dispatches fresh subagent per task with two-stage review : spec compliance, then code quality »), `verification-before-completion` (« run the verification command itself and read the output before claiming anything is done »), `writing-plans`, `executing-plans`, `dispatching-parallel-agents`, `requesting/receiving-code-review`, `brainstorming`, `using-git-worktrees`, `finishing-a-development-branch`, `systematic-debugging`. Sources : [superpowers README](https://github.com/obra/superpowers/blob/main/README.md), [Superpowers — Anthropic](https://claude.com/plugins/superpowers).

**C'est le concurrent le plus direct.** Mapping :

| Capacité team Musaium | Équivalent superpowers natif | Couverture |
|---|---|---|
| 5-phase spec→plan→red→green→review | brainstorming + writing-plans + TDD + subagent-driven-dev + requesting-code-review | ~80 % conceptuel |
| Red/Green séparés, fresh subagent | subagent-driven-development (« fresh subagent per task, two-stage review ») | quasi-identique |
| verify avant claim | verification-before-completion | identique |
| reviewer loop | two-stage review (spec + code quality) | proche, mais cap non documenté |
| **frozen-test (sha256, anti self-modif du test par le green)** | **ABSENT** des docs superpowers | **gap réel** |
| **lib-docs caching versionné + BLOCK si non consulté** | **ABSENT** | **gap réel** |
| **reviewer rejection loop explicitement ILLIMITÉ** | non documenté (superpowers ne précise pas) | partiel |

Le README superpowers **ne documente PAS** : isolation fresh-context inter-phases garantie, frozen-test anti-self-modification, reviewer loop illimité, lib-docs caching (confirmé par WebFetch ciblé). Ce sont précisément les 4 mécaniques verrou de UFR-022.

---

## 2. Verdict mécanique par mécanique

| Mécanique team | Statut |
|---|---|
| **Isolation fresh-context par phase** | (a) **Déjà couvert nativement** (subagent = contexte isolé). La valeur ajoutée = la *discipline d'enchaînement* + `BLOCK-CONTEXT-LEAK` self-defense, pas l'isolation elle-même. |
| **Red/Green séparés + TDD** | (a) Couvert par superpowers TDD + subagent-driven-dev. Quasi-redondant. |
| **Frozen-test (sha256 anti-self-modif)** | (b) **Vraie sur-couche utile.** Aucun équivalent natif/plugin documenté. Ferme un trou réel : un agent green qui « corrige » le test pour le faire passer. Adressé directement par CLAUDE.md doctrine (`BLOCK-TEST-WRONG`). |
| **Reviewer rejection loop illimité** | (b) marginalement utile (evaluator-optimizer natif a un loop mais pas de garantie « illimité »). Valeur faible. |
| **lib-docs caching versionné + hook BLOCK** | (b)/(c) **Sur-couche utile MAIS lourde.** Le natif a `WebSearch`/`WebFetch` + skills progressive-disclosure ; lib-docs ré-implémente un cache doc maison (~110 libs trackées). Utile pour cohérence offline + LESSONS.md humains, mais coût de maintenance élevé (staleness 14j, INDEX.json, doc-fetcher+doc-curator). |
| **9 agents nommés** | (c) **Complexité partiellement redondante.** doc-fetcher/doc-curator/learning-curator existent uniquement pour servir lib-docs ; verifier+reviewer+security se chevauchent partiellement avec superpowers two-stage review. |
| **Telemetry Langfuse / cost-estimate** | (b) utile (non couvert natif), mais orthogonal au débat orchestration. |

---

## 3. Lecture honnête (UFR-013)

Ce qui est **réellement original et défendable** dans team :
1. **frozen-test** — le seul mécanisme sans équivalent natif/plugin connu, et il ferme un anti-pattern concret (l'éditeur qui rend ses propres tests verts en les modifiant). UFR-022 et la mémoire `feedback_bundled_red_green_frozen_test_gap` montrent que c'est un risque *observé*, pas théorique.
2. **lib-docs + LESSONS.md humains** — valeur réelle (gotchas pgvector/TypeORM/Expo captés une fois, relus à chaque cycle), mais lourd.
3. **Intégration domaine Musaium** (22 UFR, 24 sentinelles, gates pnpm/tsc spécifiques, roadmap consumption) — un plugin générique ne porte pas ce contexte.

Ce qui est **réimplémentation de primitives natives** :
- L'isolation de contexte = native (subagents).
- L'orchestration spec→plan→red→green→review = pattern cookbook + superpowers à ~80 %.
- Les hooks = mécanisme natif `PostToolUse`/`Stop`, seul le payload shell est custom.
- Le skill packaging = standard Agent Skills.

Donc : **ni pur (a) ni pur (c)**. C'est une **(b) sur-couche réelle mais sur-dimensionnée** : le cœur de valeur tient à 1,5 mécanique (frozen-test + lib-docs/LESSONS), enrobé dans un appareil (9 agents, 11 hooks, telemetry, cost-estimate, roadmap-rotate, learning-review, compose) dont une grande partie duplique ce que superpowers + subagents natifs + hooks fournissent déjà — à coût de maintenance non-trivial pour un **dev solo pré-launch J-7**.

---

## 4. Recommandation

**Verdict : GARDER le cœur, SIMPLIFIER l'enveloppe.** Ne pas remplacer brutalement par natif (perte du frozen-test + lib-docs/LESSONS + intégration UFR), mais réduire la surface :

- **P0 — Conserver tel quel** : frozen-test hook, lib-docs/LESSONS.md, l'enchaînement red→green fresh. C'est la valeur nette non native.
- **P1 — Aligner sur superpowers plutôt que diverger** : adopter les noms/contrats superpowers (`subagent-driven-development`, `verification-before-completion`) comme socle, et ne garder en custom QUE les 2 verrous absents (frozen-test, lib-docs). Réduit la dette de maintenance d'un orchestrateur 45 KB SKILL.md.
- **P2 — Élaguer les agents redondants** : fusionner verifier/security dans le reviewer two-stage natif ; questionner doc-fetcher+doc-curator+learning-curator (3 agents pour un cache doc) face au coût solo. Mesurer : combien de cycles/mois justifient cet appareil ?

> Mise en garde pré-launch : l'arbitrage n'est pas « est-ce que c'est bien conçu » (ça l'est) mais « un dev solo à J-7 doit-il maintenir un orchestrateur custom de 45 KB + 11 hooks + 110 libs cachées quand 80 % est désormais natif/plugin officiel ». La réponse penche vers **simplifier maintenant la dette, capitaliser sur frozen-test + lib-docs**.

---

## Sources
- [Create custom subagents — Claude Code Docs](https://code.claude.com/docs/en/sub-agents)
- [Subagents in the SDK — Claude API Docs](https://platform.claude.com/docs/en/agent-sdk/subagents)
- [Agent SDK overview — Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/overview)
- [Automate workflows with hooks — Claude Code Docs](https://code.claude.com/docs/en/hooks-guide)
- [Building Effective Agents — Anthropic](https://www.anthropic.com/research/building-effective-agents)
- [orchestrator_workers.ipynb — anthropic-cookbook](https://github.com/anthropics/anthropic-cookbook/blob/main/patterns/agents/orchestrator_workers.ipynb)
- [evaluator_optimizer.ipynb — anthropic-cookbook](https://github.com/anthropics/anthropic-cookbook/blob/main/patterns/agents/evaluator_optimizer.ipynb)
- [Equipping agents with Agent Skills — Anthropic](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- [Agent Skills overview — Claude API Docs](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
- [superpowers README — obra/superpowers](https://github.com/obra/superpowers/blob/main/README.md)
- [Superpowers plugin — Anthropic/claude.com](https://claude.com/plugins/superpowers)
