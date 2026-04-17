# PLAN 02 — /team Skill Hardening

**Phase** : 1 (Quick Win)
**Effort** : 1 jour
**Pipeline /team** : standard
**Prérequis** : P01 (DOCS_INDEX)
**Débloque** : exécution fiable de P04+ via /team

## Context

Le skill `/team` v3 délivre sa promesse (orchestrateur enterprise, 3 pipelines, 3 quality gates, Sentinelle persistente, 9 agents spécialisés, 22 skills générés). L'audit a cependant détecté **un gap** : les 9 agents spécialisés ont des mandats bien structurés mais **pas de hardened system prompts** — ils héritent du système par défaut Claude Code, ce qui ouvre la porte à des dérives sur tâches complexes (oubli de contraintes, context leak, over-engineering).

**Objectif** : Ajouter des system prompts durcis aux 9 agents + créer un `team-sdlc-index.md` (tableau vérité liant 12 protocoles + 9 agents + 22 skills générés) + auditer l'isolation du contexte.

**Référence mémoire** : `project_team_v11_improvement.md` — sprints 2-5 planifiés, dont certaines améliorations rejoignent ce plan.

## Actions

### 1. Cartographier l'état actuel

```bash
ls .claude/agents/                              # 9 agents attendus
ls .claude/skills/team/                         # SKILL.md + protocoles + templates
ls .claude/skills/team/protocols/               # 12 protocoles SDLC
ls .claude/skills/team/templates/               # 9 team-templates + 4 pipeline
```

Pour chaque agent, lister :
- Nom
- Mandat (description dans le frontmatter)
- Tools autorisés
- Model actuel (rappel mémoire: **tous Opus**)

### 2. Template de system prompt durci

Créer `.claude/skills/team/templates/agent-system-prompt.template.md` :

```markdown
# System Prompt Template — Agent Musaium

## Identité
Tu es [AGENT_NAME], agent spécialisé au sein du pipeline /team Musaium.
Ton mandat : [AGENT_MANDATE].

## Contraintes non-négociables
1. Respecte le protocole SDLC actif (phase courante : {PHASE}).
2. Utilise uniquement les outils listés dans ton mandat.
3. Ne sors pas de ton périmètre : si tâche hors-scope, remonte via le protocole `conflict-resolution`.
4. Applique les règles de `feedback_*` de la mémoire utilisateur (autonomy 100/100 only, pas de minimal fixes, verify-before-validate).
5. Contribue au `team-knowledge.json` partagé : chaque finding actionnable y va.

## Workflow
1. COMPRENDRE : lire contexte, interroger GitNexus si code touché.
2. EXÉCUTER : action ciblée, documenter décisions.
3. VALIDER : vérifier résultat (tests, lint, compilation).
4. REMONTER : rapport concis au team-lead.

## Anti-patterns
- Ne jamais piler du code (cf. `feedback_no_code_piling`).
- Ne jamais `eslint-disable` en premier réflexe (cf. `feedback_eslint_disable_discipline`).
- Ne jamais inliner d'entités test (cf. `feedback_dry_test_factories`).
- Ne jamais proposer un "minimal fix" comme option viable (cf. `feedback_ban_minimal_fixes`).

## Model
claude-opus-4-7[1m] (user: operational excellence, not token savings)
```

### 3. Appliquer le template aux 9 agents

Pour chaque `.claude/agents/<agent>.md`, enrichir le frontmatter + injecter la section "System Prompt" durcie.

Convention :
```markdown
---
name: <agent>
description: <mandate one-liner>
tools: [Read, Grep, Glob, ...]
model: opus
---

# System Prompt

[contenu du template avec placeholders résolus]

# Mandate

[contenu existant]
```

### 4. Créer `team-sdlc-index.md`

Fichier : `.claude/skills/team/team-sdlc-index.md`

Structure :
```markdown
# /team SDLC — Index de référence

## 10 Phases SDLC
| Phase | Nom | Protocole | Agents invoqués |
|---|---|---|---|
| 0 | COMPRENDRE | `gitnexus-integration.md` | team-lead, explorer |
| 1 | PLANIFIER | `planning.md` | team-lead, planner, impact-analyzer |
| 2 | ... | ... | ... |

## 9 Agents spécialisés
| Agent | Mandat | Phase(s) | Model | Tools |
|---|---|---|---|---|
| team-lead | Orchestration + coordination | 0-10 | opus | * |
| explorer | Exploration codebase | 0, 1 | opus | Read, Grep, Glob |
| ... | ... | ... | ... | ... |

## 12 Protocoles
| Protocole | Usage | Référence |
|---|---|---|
| error-taxonomy | Classification erreurs | error-taxonomy.md |
| conflict-resolution | Dirimer conflits agents | conflict-resolution.md |
| ... | ... | ... |

## 3 Quality Gates
| Gate | Critère | JSON |
|---|---|---|
| error-budget | budget < seuil | error-budget.json |
| viability | score ≥ 100/100 (user requirement) | viability.json |
| product | alignement intent produit | product-gate.json |

## 3 Pipelines
| Pipeline | Use case | Agents mobilisés |
|---|---|---|
| micro | 1-2 files, quick fix | team-lead + 1 specialist |
| standard | feature avec tests | 3-5 agents |
| enterprise | refactor cross-module | 7-9 agents |

## Skills générés auto
[liste des 22 skills avec bref descriptif]
```

### 5. Audit isolation context

Pour chaque agent, vérifier :
- Reçoit-il uniquement le contexte nécessaire ?
- Évite-t-il le leak de prompts système entre agents ?
- Respecte-t-il la scope spécifiée dans son mandat ?

Méthode :
1. Lancer un test du skill /team sur une tâche mineure (P03 par exemple).
2. Inspecter les prompts envoyés à chaque agent (via transcripts `.claude/projects/.../`).
3. Détecter fuites context et durcir les system prompts.

### 6. Documenter l'écart promesse vs réalité

Mettre à jour `.claude/skills/team/SKILL.md` avec :
- Section "Current State" : qu'est-ce qui est implémenté aujourd'hui ?
- Section "Known gaps" : ce qui manque (filling auto team-knowledge.json, context efficiency metrics)
- Section "Changelog v3 → v4" : ajouts de ce plan

## Verification

```bash
# Chaque agent a un system prompt enrichi
for f in .claude/agents/*.md; do
  grep -q "# System Prompt" "$f" || echo "MISSING in $f"
done
# attendu: aucun output

# Tous les agents sont en model opus
grep -l "model: opus" .claude/agents/*.md | wc -l
# attendu: 9

# team-sdlc-index.md existe et référence bien tous les items
[ -f .claude/skills/team/team-sdlc-index.md ] && \
  grep -c "team-lead\|explorer\|planner" .claude/skills/team/team-sdlc-index.md

# Skill /team fonctionne toujours (smoke test)
# Lancer /team sur une micro-tâche (ex: P03)
```

## Fichiers Critiques

- `.claude/skills/team/SKILL.md` (mise à jour changelog)
- `.claude/skills/team/team-sdlc-index.md` (créer)
- `.claude/skills/team/templates/agent-system-prompt.template.md` (créer)
- `.claude/agents/*.md` (9 fichiers — hardening system prompts)
- `docs/DOCS_INDEX.md` (P01 — ajouter référence team-sdlc-index)

## Risques

- **Moyen** : durcir les system prompts peut limiter la créativité des agents sur tâches ambiguës. Mitigation : les contraintes sont sur les anti-patterns connus, pas sur l'exploration.
- **Faible** : perte de perf si prompts devenus trop longs. Mitigation : rester sous 400 tokens par system prompt.

## Done When

- [ ] Template `agent-system-prompt.template.md` créé
- [ ] 9 agents ont un system prompt durci
- [ ] team-sdlc-index.md créé et lié depuis DOCS_INDEX
- [ ] SKILL.md enrichi de la section Known gaps + Changelog v3→v4
- [ ] Audit context isolation documenté (findings dans team-knowledge.json)
- [ ] Smoke test /team sur P03 OK
