# PLAN 06 — Backend Web Search Providers Unify

**Phase** : 2 (Refactor Structurel)
**Effort** : 2 jours
**Pipeline /team** : standard
**Prérequis** : P03 (cartographie fraîche)
**Débloque** : extensibilité nouveaux providers (Perplexity, Exa, etc.)

## Context

Le module `chat/adapters/secondary/` contient 5 providers de recherche web :
- Tavily
- DuckDuckGo
- Brave
- Google CSE
- SearXNG

L'audit a détecté une **duplication de métadonnées** (cost, latency, quality) et un fallback qui a commencé à être unifié (`fallback-search.provider.ts`) mais pas consolidé. Chaque ajout de provider oblige à toucher le fallback + la registry + les tests.

**Objectif** : Unifier sous une interface commune `SearchProvider` + registry déclaratif + tests contract partagés. Gain : ajouter un nouveau provider en 1 fichier au lieu de 3-4 touchers.

## Actions

### 1. Cartographier l'existant

```bash
cd museum-backend
find src/modules/chat/adapters/secondary -name "*search*" -type f
find src/modules/chat/adapters/secondary -name "tavily*" -o -name "duckduckgo*" \
  -o -name "brave*" -o -name "google-cse*" -o -name "searxng*"
```

Pour chaque provider, noter :
- Signature de l'API (query → results)
- Métadonnées actuelles (cost, latency mesurée, quality subjective)
- Gestion erreurs (rate limit, timeout, quota)

### 2. Concevoir l'interface commune

Créer `chat/domain/ports/search-provider.port.ts` :

```typescript
export interface SearchProvider {
  readonly name: string;
  readonly metadata: SearchProviderMetadata;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  isHealthy(): Promise<boolean>;
}

export interface SearchProviderMetadata {
  costPerQuery: number;        // USD
  p95LatencyMs: number;
  qualityScore: number;        // 0-10 subjective
  rateLimitPerSecond: number;
  supportsImages: boolean;
  freeTier: boolean;
}

export interface SearchOptions {
  maxResults?: number;
  language?: string;
  safeSearch?: boolean;
  timeoutMs?: number;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;           // provider name
  publishedAt?: Date;
  imageUrl?: string;
}
```

### 3. Créer registry déclaratif

`chat/adapters/secondary/search/search-provider.registry.ts` :

```typescript
export class SearchProviderRegistry {
  private providers: Map<string, SearchProvider> = new Map();

  register(provider: SearchProvider): void;
  get(name: string): SearchProvider | undefined;
  list(): SearchProvider[];
  healthyProviders(): Promise<SearchProvider[]>;
  cheapestHealthy(): Promise<SearchProvider | undefined>;
  fastestHealthy(): Promise<SearchProvider | undefined>;
}
```

### 4. Refactor fallback-search.provider.ts

Le fallback utilise désormais la registry :
```typescript
export class FallbackSearchProvider implements SearchProvider {
  readonly name = 'fallback';
  readonly metadata = AGGREGATED_METADATA;

  constructor(private registry: SearchProviderRegistry) {}

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const ordered = await this.registry.healthyProviders();
    for (const provider of ordered) {
      try {
        return await provider.search(query, options);
      } catch (err) {
        // log + next provider
      }
    }
    return [];
  }
}
```

### 5. Migrer les 5 providers

Chaque provider devient une classe implémentant `SearchProvider` :
```
chat/adapters/secondary/search/
├── search-provider.registry.ts          # NEW
├── fallback-search.provider.ts          # REFACTOR
├── providers/
│   ├── tavily.provider.ts               # REFACTOR
│   ├── duckduckgo.provider.ts           # REFACTOR
│   ├── brave.provider.ts                # REFACTOR
│   ├── google-cse.provider.ts           # REFACTOR
│   └── searxng.provider.ts              # REFACTOR
└── __tests__/
    ├── search-provider.contract.test.ts # NEW — contract partagé
    └── registry.test.ts                 # NEW
```

### 6. Tests contract partagés

`chat/adapters/secondary/search/__tests__/search-provider.contract.test.ts` :

```typescript
const providers: Array<[string, () => SearchProvider]> = [
  ['tavily', () => new TavilyProvider(mockConfig)],
  ['duckduckgo', () => new DuckDuckGoProvider(mockConfig)],
  ['brave', () => new BraveProvider(mockConfig)],
  ['google-cse', () => new GoogleCseProvider(mockConfig)],
  ['searxng', () => new SearXNGProvider(mockConfig)],
];

describe.each(providers)('%s — SearchProvider contract', (name, factory) => {
  let provider: SearchProvider;
  beforeEach(() => { provider = factory(); });

  it('expose name', () => expect(provider.name).toBe(name));
  it('expose metadata valide', () => {
    expect(provider.metadata.costPerQuery).toBeGreaterThanOrEqual(0);
    expect(provider.metadata.qualityScore).toBeLessThanOrEqual(10);
  });
  it('search retourne SearchResult[]');
  it('respecte maxResults');
  it('gère timeout');
  it('retourne [] au lieu de throw sur query vide');
  it('isHealthy() retourne bool');
});
```

Mocker les HTTP calls avec nock ou msw.

### 7. Update chat-module.ts (composition root)

```typescript
const registry = new SearchProviderRegistry();
registry.register(new TavilyProvider(env));
registry.register(new DuckDuckGoProvider(env));
// ... etc

const searchProvider = env.SEARCH_STRATEGY === 'fallback'
  ? new FallbackSearchProvider(registry)
  : registry.get(env.PRIMARY_SEARCH_PROVIDER);
```

### 8. Documenter l'ajout d'un provider

Créer `src/modules/chat/adapters/secondary/search/README.md` :
```markdown
# Search Providers

## Ajouter un nouveau provider

1. Créer `providers/<name>.provider.ts` implémentant `SearchProvider`
2. Ajouter au test contract
3. Registrer dans `chat-module.ts`

## Providers actifs

| Provider | Cost/q | P95 | Quality |
|---|---|---|---|
| Tavily | $0.005 | 800ms | 8 |
| ... | ... | ... | ... |
```

## Verification

```bash
cd museum-backend

# Tous providers implémentent le port
grep -l "implements SearchProvider" src/modules/chat/adapters/secondary/search/providers/ | wc -l
# attendu: 5

# Tests contract verts sur les 5
pnpm test -- --testPathPattern=search-provider.contract

# Registry testée
pnpm test -- --testPathPattern=search-provider.registry

# Aucune régression chat
pnpm test -- --testPathPattern=chat
pnpm test:e2e -- --testPathPattern=chat

# Lint
pnpm lint
```

## Fichiers Critiques

### À créer
- `museum-backend/src/modules/chat/domain/ports/search-provider.port.ts`
- `museum-backend/src/modules/chat/adapters/secondary/search/search-provider.registry.ts`
- `museum-backend/src/modules/chat/adapters/secondary/search/__tests__/search-provider.contract.test.ts`
- `museum-backend/src/modules/chat/adapters/secondary/search/__tests__/registry.test.ts`
- `museum-backend/src/modules/chat/adapters/secondary/search/README.md`

### À refactor
- `museum-backend/src/modules/chat/adapters/secondary/search/fallback-search.provider.ts`
- `museum-backend/src/modules/chat/adapters/secondary/search/providers/tavily.provider.ts`
- `museum-backend/src/modules/chat/adapters/secondary/search/providers/duckduckgo.provider.ts`
- `museum-backend/src/modules/chat/adapters/secondary/search/providers/brave.provider.ts`
- `museum-backend/src/modules/chat/adapters/secondary/search/providers/google-cse.provider.ts`
- `museum-backend/src/modules/chat/adapters/secondary/search/providers/searxng.provider.ts`
- `museum-backend/src/modules/chat/chat-module.ts` (wiring registry)

## Risques

- **Moyen** : refactor wiring → bugs silencieux sur fallback order. Mitigation : tests contract exhaustifs.
- **Faible** : metadata subjective (quality score) — accepter fourchette ±1 selon contexte.

## Done When

- [ ] Interface `SearchProvider` définie et documentée
- [ ] Registry fonctionnelle avec sélection par cost/latency
- [ ] 5 providers migrés implémentent le port
- [ ] Tests contract partagés verts pour tous
- [ ] `chat-module.ts` wiring propre
- [ ] README ajout provider rédigé
- [ ] Aucune régression chat (e2e vert)
- [ ] Ratchet tests bumped
