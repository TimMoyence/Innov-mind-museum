# GitNexus Skills Validation — 2026-04-17

> Checklist usage pour les 7 skills `gitnexus-*` + 6 MCP tools.
> Reference : [`AGENTS.md`](../../../AGENTS.md)

## Skills disponibles

Verifies via listing Skill tool en session :

| # | Skill | Statut | Trigger principal |
|---|---|---|---|
| 1 | `gitnexus-guide` | ✅ active | "How do I use GitNexus?" / tool reference |
| 2 | `gitnexus-cli` | ✅ active | "Index this repo" / CLI commands |
| 3 | `gitnexus-exploring` | ✅ active | "How does X work?" / architecture |
| 4 | `gitnexus-debugging` | ✅ active | "Why is X failing?" / trace bugs |
| 5 | `gitnexus-refactoring` | ✅ active | "Rename X" / "Extract Y" |
| 6 | `gitnexus-impact-analysis` | ✅ active | "What will break?" / safety check |
| 7 | `gitnexus-pr-review` | ✅ active | "Review this PR" |

**Tous les 7 skills operationnels** (confirmes dans le listing Skill tool au 2026-04-17).

## MCP Tools (6)

Confirmes via AGENTS.md Quick Reference :

| Tool | Purpose | Quand utiliser |
|---|---|---|
| `query` | Recherche par concept | Trouver flows lies a un sujet |
| `context` | 360° sur un symbole | Voir callers/callees/processes |
| `impact` | Blast radius | AVANT de modifier un symbole |
| `detect_changes` | Diff scope | AVANT chaque commit |
| `rename` | Safe refactor | Renommer multi-fichiers |
| `cypher` | Query avancee | Analyses custom |

**Protocole appliqué** : AGENTS.md impose `gitnexus_impact` AVANT toute modification + `gitnexus_detect_changes` AVANT commit.

## Cas d'usage valide par skill

### gitnexus-guide
Usage : Reference tools + ressources `gitnexus://repo/InnovMind/*`.
Validation : Lire AGENTS.md racine — listing complet present.

### gitnexus-cli
Usage : `gitnexus analyze`, `gitnexus status`.
Validation : P03 execute `gitnexus analyze` (13.4s, 926 files, 5550 nodes).

### gitnexus-exploring
Usage : Tracer le flow "message chat de l'UI au LLM".
Test suggere pour agent :
```
Query: "how does a user message flow from ChatInput to the LLM response?"
Expected: Execution flow covering ChatInput -> useSessionApi -> chatApi -> backend /api/chat -> chat.service -> langchain.orchestrator -> LLM
```

### gitnexus-debugging
Usage : Tracer pourquoi un guardrail peut bloquer.
Test suggere :
```
Query: "where is art-topic-guardrail triggered on input and output?"
Expected: art-topic-guardrail.ts, called from chat.service.ts (input pre-LLM + output post-LLM)
```

### gitnexus-refactoring
Usage : Simuler split de `useChatSession.ts` (cf. P08).
Test :
```
gitnexus_impact({target: "useChatSession", direction: "upstream"})
# expected: list all components importing useChatSession
```

### gitnexus-impact-analysis
Usage : Evaluer risque de modifier `chat-message.service.ts` (cf. P04).
Test :
```
gitnexus_impact({target: "ChatMessageService", direction: "upstream"})
# expected: risk level + direct callers + processes affected
```

### gitnexus-pr-review
Usage : Review du PR de P01 (commit f2c68305).
Validation : commit docs-only, risque LOW (aucun code touche).

## AGENTS.md — Alignement

AGENTS.md (racine) reflete l'etat reel :

| Section | Statut |
|---|---|
| Stats (5550 symbols, 14483 rel, 300 flows) | ✅ match avec meta.json |
| 6 MCP tools listes | ✅ match |
| Impact Risk Levels (d=1/2/3) | ✅ applique dans les skills |
| Self-Check Before Finishing (4 etapes) | ✅ applique |
| Post-commit hook reference | ✅ hook actif (notification "stale" apres commits) |

## Integration avec /team (v4)

GitNexus est integre dans le skill /team via :
- Protocol `team-protocols/gitnexus-integration.md`
- Phase 0 COMPRENDRE utilise `gitnexus_query` + `gitnexus_context`
- Phase 1 PLANIFIER utilise `gitnexus_impact`
- Step LIVRER (Tech Lead) : `gitnexus_detect_changes` avant commit

## Prochain refresh

- **Automatique** : post-commit hook (actif, notifications "stale" apparaissent apres commit)
- **Manuel** : avant chaque refactor de Phase 2 (P04, P06, P08, P12)

## Verdict

✅ **GitNexus ecosysteme operationnel et aligne**. Aucune action corrective requise sur AGENTS.md ni sur les skills. Index fresh (post-commit bc93c5f2).
