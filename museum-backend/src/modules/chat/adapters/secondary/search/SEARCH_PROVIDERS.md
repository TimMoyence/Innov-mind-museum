# Web Search Providers — Architecture

> Documentation du pattern de composition pour les providers de recherche web.
> Mis à jour 2026-05-17 (C9.15 — Google CSE / SearXNG / DuckDuckGo retired; Tavily + Brave only).

## Vue d'ensemble

Le module `chat` consomme la recherche web via le port `WebSearchProvider`. L'implémentation est composée via `FallbackSearchProvider` qui essaie les providers en série jusqu'à obtenir des résultats non-vides.

```
┌─────────────────────────────────────────────┐
│ chat.service.ts (useCase)                   │
│   consumes: WebSearchProvider (port)        │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│ FallbackSearchProvider                      │
│   chains: [provider1, provider2, ...]       │
│   returns: premier non-vide, sinon []       │
└──────┬──────┬──────┬──────┬──────┬──────────┘
       │      │      │      │      │
       ▼      ▼      ▼      ▼      ▼
       Tavily              Brave
```

## Port (domain)

`src/modules/chat/domain/ports/web-search.port.ts`

```typescript
export interface WebSearchProvider {
  readonly name?: string;
  search(query: WebSearchQuery): Promise<SearchResult[]>;
}
```

## Providers actifs (adapters/secondary/)

| Client | API | Requiert |
|---|---|---|
| `tavily.client.ts` | Tavily Search API | `TAVILY_API_KEY` |
| `brave-search.client.ts` | Brave Search API | `BRAVE_SEARCH_API_KEY` |

> **Retirés 2026-05-17 (C9.15)** : `google-cse.client.ts`, `searxng.client.ts`, `duckduckgo.client.ts` — jamais activés en production. Reintroduction via PR + env var au besoin.

Tous implémentent `WebSearchProvider` avec `readonly name` exposé pour le logging.

## Composition (FallbackSearchProvider)

`fallback-search.provider.ts` :
- Essaie chaque provider dans l'ordre de la liste
- Retourne le premier résultat non-vide
- Log `fallback_search_hit/empty/provider_error/all_failed`
- Ne throw jamais — retourne `[]` au pire

## Wiring (composition root)

`chat/chat-module.ts` construit la liste de providers selon les env vars disponibles, puis instancie `FallbackSearchProvider`.

Ordre actuel : `Tavily` puis `Brave`. Les deux sont payants ; pas de fallback gratuit V1 (retiré 2026-05-17, cf. C9.15).

## Ajouter un nouveau provider

### 1. Créer le client

`chat/adapters/secondary/<name>.client.ts` :

```typescript
import type { SearchResult, WebSearchProvider, WebSearchQuery } from '../../domain/ports/web-search.port';

export class MyNewProviderClient implements WebSearchProvider {
  readonly name = 'my-provider';

  constructor(private readonly config: { apiKey: string; /* ... */ }) {}

  async search(query: WebSearchQuery): Promise<SearchResult[]> {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        signal: query.signal,
        // ...
      });
      if (!response.ok) return [];
      const data = await response.json();
      return data.results
        .slice(0, query.maxResults ?? 10)
        .map((r) => ({ url: r.url, title: r.title, snippet: r.snippet }));
    } catch {
      return []; // fail-open
    }
  }
}
```

### 2. Écrire le test

`tests/unit/chat/<name>-client.test.ts` — calquer sur `tavily-client.test.ts` :
- mock `global.fetch`
- mock le logger
- tester : success (résultats normalisés), non-ok HTTP (retourne `[]`), network error (retourne `[]`), `maxResults` respecté, `signal` propagé

### 3. Wirer dans chat-module.ts

Ajouter la construction conditionnelle sur la présence de l'env var, puis l'insérer dans la liste passée à `FallbackSearchProvider`.

### 4. Ajouter l'env var

- `config/env.ts` — parser + validation Zod optionnelle
- `.env.local.example`, `.env.staging.example`, `.env.production.example` — documenter la variable
- `docs/CI_CD_SECRETS.md` — si la clé doit être en GHA

## Tests

Chaque client a un fichier de tests dédié :
- `tavily-client.test.ts`
- `brave-search-client.test.ts`

Le chaînage est testé dans :
- `fallback-search-provider.test.ts` (15 cas : success/empty/throw/all-fail/logging/stringify)

Pattern commun aux tests client :
- Mock `global.fetch` pour chaque scenario (ok, !ok, network error)
- Mock `logger` pour ne pas polluer la sortie
- Vérifier que les résultats sont **normalisés** en `SearchResult[]` (même shape pour tous les providers)
- Vérifier respect de `maxResults` (cap à 10) et propagation de `signal`

## Décisions d'architecture

- **Pas de registry central** : `FallbackSearchProvider` avec une `readonly list<WebSearchProvider>` suffit. Un registry déclaratif ajouterait de la complexité sans bénéfice concret (pas de sélection dynamique runtime).
- **Pas de métadonnées (cost, latency, quality)** : non utilisé par le caller actuel (pas de sélection optimale runtime). À introduire seulement si on veut des politiques de sélection (ex: « le moins cher disponible »).
- **Fail-open par défaut** : un provider qui échoue ne bloque pas le caller — on passe au suivant. Si tous échouent, le chat continue sans web search.
- **Name optionnel dans le port** : le port accepte `name?` pour autoriser des implémentations legacy/tests, mais tous les clients de prod exposent leur name pour la traçabilité logs.
