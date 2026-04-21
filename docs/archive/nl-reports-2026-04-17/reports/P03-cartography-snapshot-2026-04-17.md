# GitNexus Cartography Snapshot — 2026-04-17

> Baseline pour mesurer l'impact des refactors Phase 2 (P04, P06, P08, P12).
> Re-generer via `gitnexus analyze` et regenerer ce rapport apres chaque refactor majeur.

## Metadata

| Field | Value |
|---|---|
| Repo | InnovMind (Musaium) |
| GitNexus version | 11.7.0 |
| Indexed at | 2026-04-17T12:32:39 UTC |
| Last commit | bc93c5f2 (P02 team hardening) |
| Embeddings | 0 (not generated) |

## Stats globales

| Metric | Value |
|---|---|
| Files indexed | 926 |
| Nodes (symbols) | 5 550 |
| Edges (relations) | 14 483 |
| Communities (clusters) | 539 |
| Processes (execution flows) | 300 |
| Analyze duration | 13.4s |

## Repartition (estimation)

Le monorepo couvre 4 apps :

| App | Framework | Taille indicative |
|---|---|---|
| `museum-backend/` | Node 22 + Express 5 + TypeORM + LangChain | ~60% des nodes |
| `museum-frontend/` | RN 0.83 + Expo 55 + Expo Router v7 | ~25% des nodes |
| `museum-web/` | Next.js 15 + Server Components | ~10% des nodes |
| `design-system/` | tokens build | ~5% des nodes |

## Baseline pour refactors

### P04 Backend Chat Slim (cibles)

Les 3 fichiers obeses a splitter :

| Fichier | LOC actuelles | Cible LOC |
|---|---|---|
| `museum-backend/src/modules/chat/useCase/chat-message.service.ts` | 457 | ~150 |
| `museum-backend/src/modules/chat/adapters/secondary/langchain.orchestrator.ts` | 500 | ~280 |
| `museum-backend/src/modules/chat/adapters/secondary/llm-section-runner.ts` | 365 | ~200 |

Avant refactor, runner GitNexus MCP :
```
gitnexus_impact({target: "chat-message.service.ts", direction: "upstream"})
gitnexus_context({name: "ChatMessageService"})
```

### P08 Mobile Chat Split (cibles)

Les 3 god-hooks a decomposer :

| Fichier | LOC actuelles | Cible (apres split) |
|---|---|---|
| `museum-frontend/features/chat/application/useChatSession.ts` | 442 | facade 80 + 3 hooks ~150 |
| `museum-frontend/features/chat/ui/ChatMessageBubble.tsx` | 365 | facade 40 + 4 composants ~90 |
| `museum-frontend/features/chat/application/useAudioRecorder.ts` | 257 | facade 40 + 2 hooks .web/.native ~120 |

### P06 Backend Web Search Unify

5 providers a unifier sous `SearchProvider` port :
- Tavily, DuckDuckGo, Brave, Google CSE, SearXNG
- Registry declaratif + contract tests partages

## Verification MCP tools (post-refactor)

Apres chaque refactor, verifier :

```
# 1. Re-indexer
gitnexus analyze

# 2. Verifier impact risk level
gitnexus_impact({target: "<refactored-symbol>", direction: "upstream"})
# => doit rester LOW ou MEDIUM, pas HIGH/CRITICAL

# 3. Detection changements
gitnexus_detect_changes({scope: "staged"})
# => doit matcher ce qu'on attend

# 4. Snapshot metrics
gitnexus status
```

## Prochain snapshot

Apres completion de P04 (Backend Chat Slim). Mesurer :
- Variation nb de nodes/edges sur module chat
- Nouvelles communities (attendu : +3 pour les splits)
- Coverage chat/ via `pnpm test`

## References

- Index : `.gitnexus/`
- AGENTS.md (racine) : instructions GitNexus pour agents
- Skills : `.claude/skills/gitnexus-*` (7 skills)
- Protocol : `.claude/skills/team/team-protocols/gitnexus-integration.md`
