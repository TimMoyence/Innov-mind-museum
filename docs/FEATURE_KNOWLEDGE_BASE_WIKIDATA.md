# Feature: Knowledge Base Wikidata

> **Status**: IMPLEMENTED (feature-flagged)
> **Module**: `museum-backend/src/modules/chat`
> **Implementation**: `adapters/secondary/wikidata.client.ts` + `useCase/knowledge-base.service.ts`
> **Prerequisites**: Node.js 22 (native `fetch`), existing chat pipeline with user memory

---

## Table of Contents

1. [Objectif](#1-objectif)
2. [Architecture](#2-architecture)
3. [Flux d'integration](#3-flux-dintégration)
4. [API Wikidata](#4-api-wikidata)
5. [Format du bloc prompt](#5-format-du-bloc-prompt)
6. [Interfaces TypeScript](#6-interfaces-typescript)
7. [Configuration](#7-configuration)
8. [Fichiers a creer et modifier](#8-fichiers-à-créer-et-modifier)
9. [Strategie d'enrichissement iteratif](#9-stratégie-denrichissement-itératif)
10. [Plan de tests](#10-plan-de-tests)
11. [Risques et mitigations](#11-risques-et-mitigations)
12. [Estimation d'effort](#12-estimation-deffort)
13. [Scope MVP vs iterations futures](#13-scope-mvp-vs-itérations-futures)

---

## 1. Objectif

### Probleme

Les LLM hallucinent regulierement sur les dates, les techniques, les attributions d'oeuvres d'art. Un assistant de musee qui affirme que la Joconde est une aquarelle de Raphael detruit la confiance utilisateur.

### Solution

Enrichir le prompt LLM avec des **faits verifies provenant de Wikidata** avant chaque appel. Le LLM recoit un bloc `[KNOWLEDGE BASE]` contenant des donnees structurees (artiste, date, technique, collection, mouvement) qu'il doit traiter comme **source de verite**.

### Avantage concurrentiel

L'analyse concurrentielle identifie cette feature comme l'**avantage concurrentiel #1** de Musaium :

| Concurrent | Knowledge base structuree | Source de verite pour le LLM |
|---|---|---|
| Smartify | Non | Non |
| Ask Mona | Non | Non |
| Musa Guide | Non | Non |
| **Musaium** | **Wikidata (open data, 100M+ entites)** | **Oui, injection prompt** |

Aucun concurrent n'injecte de faits verifies dans le contexte LLM. Tous dependent uniquement de la memoire parametrique du modele, avec les hallucinations qui en decoulent.

### Objectifs mesurables

- Reduire les hallucinations factuelles sur les oeuvres connues (mesure via reports `inaccurate`)
- Latence ajoutee < 500ms (p95) grace au fail-open et au cache
- Zero impact sur la disponibilite du service (fail-open complet)

---

## 2. Architecture

La Knowledge Base suit l'architecture hexagonale existante du module chat. Elle s'insere en tant que **nouveau port secondaire** avec un adaptateur Wikidata.

### Arborescence des fichiers

```
src/modules/chat/
├── domain/
│   └── knowledge-base.port.ts              # Interface KnowledgeBaseProvider + types
├── application/
│   ├── knowledge-base.service.ts           # Orchestration, cache in-memory, fail-open, logging
│   └── knowledge-base.prompt.ts            # Construction du bloc [KNOWLEDGE BASE] sanitise
└── adapters/
    └── secondary/
        └── wikidata.client.ts              # Client HTTP (wbsearchentities + SPARQL)
```

### Diagramme de dependances

```
                    ┌──────────────────────────┐
                    │   ChatMessageService      │
                    │   (prepareMessage)         │
                    └──────────┬───────────────┘
                               │
                    ┌──────────▼───────────────┐
                    │  KnowledgeBaseService      │
                    │  - cache Map<string, ...>  │
                    │  - fail-open wrapper       │
                    │  - logging                 │
                    └──────────┬───────────────┘
                               │ implements KnowledgeBaseProvider
                    ┌──────────▼───────────────┐
                    │  WikidataClient            │
                    │  - wbsearchentities        │
                    │  - SPARQL                  │
                    │  - native fetch (Node 22)  │
                    └──────────────────────────┘
```

### Principes

- **Port/Adapter** : `KnowledgeBaseProvider` est une interface (port) dans `domain/`. `WikidataClient` est l'adaptateur concret. On peut substituer un mock, un cache Redis, ou une base locale sans toucher au service.
- **Fail-open** : si Wikidata est injoignable ou lent, le pipeline continue sans enrichissement. Aucune degradation de l'experience utilisateur.
- **Zero dependance npm** : utilisation de `fetch` natif Node 22 et construction manuelle des requetes SPARQL (pas de librairie SPARQL).

---

## 3. Flux d'integration

### Position dans le pipeline existant

Le lookup Knowledge Base s'insere dans `prepareMessage()` de `ChatMessageService`, **en parallele** du fetch user memory existant :

```
prepareMessage(sessionId, input, requestId, currentUserId)
  │
  ├── ensureSessionAccess(...)
  ├── input validation + image processing
  ├── OCR guard (si active)
  ├── input guardrail
  ├── persistMessage (user message)
  │
  ├── PARALLEL:
  │   ├── userMemory.getMemoryForPrompt(ownerId)      [existant]
  │   └── knowledgeBase.lookup(searchTerm)              [NOUVEAU, fail-open, timeout 500ms]
  │
  └── return { ..., userMemoryBlock, knowledgeBaseBlock }
```

### Determination du `searchTerm`

Le terme de recherche est derive par priorite :

1. **`detectedArtwork.title`** du message precedent (metadata du dernier message assistant dans l'historique) -- c'est le chemin le plus fiable (cf. section 9)
2. **`input.text`** (texte du message utilisateur courant) -- fallback pour le premier message
3. **`input.context?.location`** -- dernier recours si aucun texte

### Injection dans le prompt

Le bloc s'insere dans `buildSectionMessages()` de `langchain.orchestrator.ts`, entre `userMemoryBlock` et `redirectHint` :

```
SystemMessage(systemPrompt)                    # identite Musaium + regles
SystemMessage(sectionPrompt)                   # instructions de section [SECTION:summary]
SystemMessage(userMemoryBlock?)                # [USER MEMORY] (existant)
SystemMessage(knowledgeBaseBlock?)             # [KNOWLEDGE BASE] ← NOUVEAU
SystemMessage(redirectHint?)                   # hint de redirection guardrail (existant)
...historyMessages                             # conversation precedente
HumanMessage(userMessage)                      # message courant
SystemMessage(antiInjection)                   # rappel anti-injection (existant)
```

L'ordre est delibere : le bloc Knowledge Base est place **apres** la memoire utilisateur (contexte personnel) et **avant** le redirect hint et l'historique, pour que le LLM le traite comme un fait de reference avant de formuler sa reponse.

---

## 4. API Wikidata

### Vue d'ensemble

Le lookup Wikidata se fait en **deux etapes sequentielles** via l'API publique REST :

| Etape | Endpoint | Latence typique | Fonction |
|---|---|---|---|
| 1 | `wbsearchentities` | ~100ms | Recherche par label -> QID |
| 2 | SPARQL Wikidata | ~200ms | Proprietes art par QID |

**Budget total : 300ms typique, 500ms timeout hard.**

### Etape 1 : Recherche d'entite (`wbsearchentities`)

```
GET https://www.wikidata.org/w/api.php?action=wbsearchentities
  &search=Mona+Lisa
  &language=en
  &type=item
  &limit=3
  &format=json
```

Reponse exploitee : on prend le premier resultat dont le `description` contient un mot-cle art (painting, sculpture, artwork, fresco, drawing, etc.).

```json
{
  "search": [
    {
      "id": "Q12418",
      "label": "Mona Lisa",
      "description": "painting by Leonardo da Vinci"
    }
  ]
}
```

Si aucun resultat ne match le filtre art, le lookup retourne `null` (fail-open, pas d'enrichissement).

### Etape 2 : Requete SPARQL ciblee

Une fois le QID obtenu, une requete SPARQL cible les proprietes pertinentes pour l'art :

| Propriete | Code | Description |
|---|---|---|
| Creator | P170 | Artiste / createur de l'oeuvre |
| Inception | P571 | Date de creation |
| Material used | P186 | Technique / materiaux |
| Collection | P195 | Musee / collection d'appartenance |
| Movement | P135 | Mouvement artistique |
| Genre | P136 | Genre (portrait, paysage, etc.) |

#### Requete SPARQL complete

```sparql
SELECT ?itemLabel ?creatorLabel ?inception ?materialLabel ?collectionLabel ?movementLabel ?genreLabel
WHERE {
  BIND(wd:Q12418 AS ?item)

  OPTIONAL { ?item wdt:P170 ?creator. }
  OPTIONAL { ?item wdt:P571 ?inception. }
  OPTIONAL { ?item wdt:P186 ?material. }
  OPTIONAL { ?item wdt:P195 ?collection. }
  OPTIONAL { ?item wdt:P135 ?movement. }
  OPTIONAL { ?item wdt:P136 ?genre. }

  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr". }
}
LIMIT 1
```

Endpoint SPARQL :
```
GET https://query.wikidata.org/sparql?query=<URL-encoded SPARQL>&format=json
```

### Rate limits et bonnes pratiques

- **User-Agent obligatoire** : Wikidata bloque les requetes sans User-Agent. Utiliser `Musaium/1.0 (https://musaium.app; contact@musaium.app)`.
- **5 requetes paralleles max** : ne pas depasser 5 requetes concurrentes vers les endpoints Wikidata.
- **Pas de burst** : espacer les requetes en cas de charge elevee (le cache in-memory absorbe la majorite des cas).
- **Respecter HTTP 429** : en cas de rate-limit, fail-open immediat (pas de retry).

---

## 5. Format du bloc prompt

Le bloc `[KNOWLEDGE BASE]` est construit par `buildKnowledgeBasePromptBlock()` et injecte en tant que `SystemMessage` dans le prompt LLM. Il est **sanitise** via `sanitizePromptInput()` et **tronque a 400 caracteres max**.

### Exemple de bloc complet

```
[KNOWLEDGE BASE — verified facts from Wikidata]
Artwork: "Mona Lisa" (Q12418)
Artist: Leonardo da Vinci
Date: c. 1503–1519
Technique: Oil on poplar panel
Collection: Louvre Museum
Movement: High Renaissance
Use these verified facts as ground truth. Do not contradict them.
```

### Regles de construction

1. L'en-tete `[KNOWLEDGE BASE — verified facts from Wikidata]` est toujours present.
2. Chaque ligne est une paire `Label: value`, sanitisee individuellement.
3. Les champs `null`/`undefined`/vides sont omis (pas de ligne "Date: unknown").
4. La derniere ligne est toujours l'instruction `Use these verified facts as ground truth. Do not contradict them.`
5. Le bloc total est tronque a `MAX_PROMPT_BLOCK_LENGTH = 400` caracteres.
6. Si le lookup n'a retourne aucun fait, la fonction retourne une chaine vide (pas de bloc injecte).

### Coherence avec le pattern existant

Ce format suit exactement le pattern de `buildUserMemoryPromptBlock()` dans `user-memory.prompt.ts` :
- En-tete entre crochets (`[KNOWLEDGE BASE]` comme `[USER MEMORY]`)
- Sanitisation via `sanitizePromptInput()`
- Troncature a une longueur max
- Retour d'une chaine vide si pas de donnees

---

## 6. Interfaces TypeScript

### `domain/knowledge-base.port.ts`

```typescript
/**
 * Verified factual data about an artwork, sourced from Wikidata.
 */
export interface ArtworkFacts {
  /** Wikidata QID (e.g. "Q12418" for Mona Lisa). */
  qid: string;
  /** Canonical artwork title from Wikidata. */
  title: string;
  /** Creator / artist name. Wikidata P170. */
  artist?: string;
  /** Creation date or date range as free-text. Wikidata P571. */
  date?: string;
  /** Technique / material used. Wikidata P186. */
  technique?: string;
  /** Museum or collection holding the artwork. Wikidata P195. */
  collection?: string;
  /** Art movement (e.g. "High Renaissance"). Wikidata P135. */
  movement?: string;
  /** Genre (e.g. "portrait", "landscape"). Wikidata P136. */
  genre?: string;
}

/**
 * Verified factual data about an artist, sourced from Wikidata.
 * Reserved for future iterations (artist-centric queries).
 */
export interface ArtistFacts {
  /** Wikidata QID for the artist. */
  qid: string;
  /** Artist full name. */
  name: string;
  /** Birth date as free-text. */
  birthDate?: string;
  /** Death date as free-text (undefined if still living). */
  deathDate?: string;
  /** Primary art movement(s). */
  movements?: string[];
  /** Notable works (titles only, max 5). */
  notableWorks?: string[];
}

/**
 * Query input for a knowledge base lookup.
 */
export interface KnowledgeBaseQuery {
  /** Free-text search term (artwork title, artist name, etc.). */
  searchTerm: string;
  /** Preferred language for Wikidata labels (ISO 639-1). Defaults to "en". */
  language?: string;
}

/**
 * Result of a knowledge base lookup.
 * Returns `null` when no relevant artwork facts could be resolved.
 */
export type KnowledgeBaseResult = ArtworkFacts | null;

/**
 * Port for external knowledge base providers.
 * Implementations must be stateless and safe to call concurrently.
 */
export interface KnowledgeBaseProvider {
  /**
   * Looks up verified facts for a search term.
   * Must not throw — returns `null` on any failure (network, parse, no results).
   * @param query - Search parameters.
   * @returns Artwork facts or `null`.
   */
  lookup(query: KnowledgeBaseQuery): Promise<KnowledgeBaseResult>;
}

/**
 * Configuration for the KnowledgeBaseService.
 */
export interface KnowledgeBaseServiceConfig {
  /** Hard timeout for the full lookup (wbsearchentities + SPARQL). Default: 500ms. */
  timeoutMs: number;
  /** In-memory cache TTL in seconds. Default: 3600 (1h). */
  cacheTtlSeconds: number;
  /** Maximum entries in the in-memory cache. Default: 500. */
  cacheMaxEntries: number;
}
```

---

## 7. Configuration

### Variables d'environnement

| Variable | Type | Default | Description |
|---|---|---|---|
| `FEATURE_FLAG_KNOWLEDGE_BASE` | boolean | `false` | Active/desactive la feature KB |
| `KB_TIMEOUT_MS` | number | `500` | Timeout total pour un lookup (ms) |
| `KB_CACHE_TTL_SECONDS` | number | `3600` | TTL du cache in-memory (secondes) |
| `KB_CACHE_MAX_ENTRIES` | number | `500` | Nombre max d'entrees en cache |

### Integration dans `config/env.ts`

```typescript
// Dans l'interface AppEnv > featureFlags :
featureFlags: {
  // ... existants ...
  knowledgeBase: boolean;
};

// Nouvelles proprietes dans AppEnv :
knowledgeBase: {
  timeoutMs: number;
  cacheTtlSeconds: number;
  cacheMaxEntries: number;
};
```

Parsing :

```typescript
featureFlags: {
  // ... existants ...
  knowledgeBase: toBoolean(process.env.FEATURE_FLAG_KNOWLEDGE_BASE, false),
},
knowledgeBase: {
  timeoutMs: toNumber(process.env.KB_TIMEOUT_MS, 500),
  cacheTtlSeconds: toNumber(process.env.KB_CACHE_TTL_SECONDS, 3600),
  cacheMaxEntries: toNumber(process.env.KB_CACHE_MAX_ENTRIES, 500),
},
```

### Zero dependance npm

La feature n'ajoute aucune dependance npm. Elle repose sur :
- `fetch` natif de Node.js 22 (deja utilise en production)
- `Map` natif pour le cache in-memory (LRU fait main)
- `sanitizePromptInput()` existant dans `@shared/validation/input`

---

## 8. Fichiers a creer et modifier

### Fichiers a creer (4)

| # | Fichier | Description |
|---|---|---|
| 1 | `src/modules/chat/domain/knowledge-base.port.ts` | Interfaces `KnowledgeBaseProvider`, `ArtworkFacts`, `ArtistFacts`, `KnowledgeBaseQuery`, `KnowledgeBaseServiceConfig`. Port secondaire. |
| 2 | `src/modules/chat/application/knowledge-base.service.ts` | `KnowledgeBaseService` : orchestration du lookup, cache in-memory LRU, fail-open avec `Promise.race` sur le timeout, logging structure. Methode publique `lookup(searchTerm, language?) -> string` retournant le prompt block. |
| 3 | `src/modules/chat/application/knowledge-base.prompt.ts` | `buildKnowledgeBasePromptBlock(facts: ArtworkFacts | null): string`. Construit le bloc `[KNOWLEDGE BASE]` sanitise, max 400 chars. Retourne `''` si `facts` est null. |
| 4 | `src/modules/chat/adapters/secondary/wikidata.client.ts` | `WikidataClient implements KnowledgeBaseProvider`. Deux appels HTTP sequentiels : `wbsearchentities` puis SPARQL. User-Agent configure. Parsing JSON de la reponse SPARQL. Ne throw jamais, retourne `null`. |

### Fichiers a modifier (5)

| # | Fichier | Changement |
|---|---|---|
| 1 | `src/config/env.ts` | Ajouter `knowledgeBase` dans `featureFlags` (`knowledgeBase: boolean`) et le bloc `knowledgeBase: { timeoutMs, cacheTtlSeconds, cacheMaxEntries }` dans `AppEnv`. Ajouter le parsing des 4 env vars. |
| 2 | `src/modules/chat/index.ts` | Conditionner la creation du `KnowledgeBaseService` sur `env.featureFlags.knowledgeBase`. Instancier `WikidataClient` puis `KnowledgeBaseService`. Passer en dependance de `ChatService` via `ChatServiceDeps`. Exposer un getter `getKnowledgeBaseService()`. |
| 3 | `src/modules/chat/application/chat.service.ts` | Ajouter `knowledgeBase?: KnowledgeBaseService` dans `ChatServiceDeps`. Le transmettre a `ChatMessageService`. |
| 4 | `src/modules/chat/application/chat-message.service.ts` | Dans `prepareMessage()` : ajouter le lookup KB en parallele du user memory (`Promise.all`). Extraire le `searchTerm` depuis le `detectedArtwork` du dernier message assistant de l'historique, ou depuis `input.text`. Ajouter `knowledgeBaseBlock` au retour `kind: 'ready'`. Passer `knowledgeBaseBlock` a `orchestrator.generate()` / `generateStream()`. |
| 5 | `src/modules/chat/adapters/secondary/langchain.orchestrator.ts` | Ajouter `knowledgeBaseBlock?: string` dans `OrchestratorInput`. Dans `buildSectionMessages()`, inserer `new SystemMessage(knowledgeBaseBlock)` entre `userMemoryBlock` et `redirectHint`. |

### Diagramme de diff

```
config/env.ts                        +15 lignes (types + parsing)
modules/chat/index.ts                +12 lignes (wiring conditionnel)
modules/chat/application/
  chat.service.ts                    +3 lignes (dep forwarding)
  chat-message.service.ts            +20 lignes (lookup parallel + searchTerm extraction)
modules/chat/adapters/secondary/
  langchain.orchestrator.ts          +5 lignes (bloc insertion)

Nouveaux fichiers :
  domain/knowledge-base.port.ts      ~60 lignes
  application/knowledge-base.service.ts    ~90 lignes
  application/knowledge-base.prompt.ts     ~45 lignes
  adapters/secondary/wikidata.client.ts    ~120 lignes
```

---

## 9. Strategie d'enrichissement iteratif

### Le vrai levier : le 2e message

Le premier message d'une conversation est souvent une photo ou une question vague ("Parle-moi de ce tableau"). A ce stade, le LLM n'a pas encore identifie l'oeuvre -- le lookup Wikidata a peu de chances de matcher.

Le vrai levier se situe au **2e message et au-dela** :

```
Message 1 (user): [photo d'une oeuvre]
  → LLM identifie l'oeuvre → metadata.detectedArtwork = { title: "Mona Lisa", artist: "Leonardo da Vinci" }
  → KB lookup sur "photo" ou texte vague → probablement null ❌

Message 2 (user): "Peux-tu m'en dire plus sur la technique ?"
  → prepareMessage() voit detectedArtwork.title = "Mona Lisa" dans l'historique
  → KB lookup sur "Mona Lisa" → ArtworkFacts complet ✅
  → LLM repond avec des faits verifies sur la technique (oil on poplar panel)
```

### Algorithme d'extraction du searchTerm

```typescript
function extractSearchTerm(
  history: ChatMessage[],
  inputText?: string,
): string | null {
  // 1. Chercher detectedArtwork dans le dernier message assistant
  const lastAssistant = [...history]
    .reverse()
    .find(m => m.role === 'assistant' && m.metadata?.detectedArtwork?.title);

  if (lastAssistant?.metadata?.detectedArtwork?.title) {
    return lastAssistant.metadata.detectedArtwork.title;
  }

  // 2. Fallback sur le texte utilisateur courant (si assez specifique, > 3 mots)
  if (inputText && inputText.split(/\s+/).length >= 3) {
    return inputText;
  }

  // 3. Pas de terme exploitable
  return null;
}
```

### Consequence sur le cache

Le cache est cle sur `searchTerm.toLowerCase()`. Si l'utilisateur pose 3 questions de suite sur la Joconde, les appels 2 et 3 sont servis depuis le cache.

---

## 10. Plan de tests

### Tests unitaires

#### `wikidata.client.test.ts`

| Test | Description |
|---|---|
| `returns ArtworkFacts for known artwork` | Mock fetch : reponse `wbsearchentities` + SPARQL valides -> retourne des facts completes |
| `returns null when no search results` | Mock fetch : reponse `wbsearchentities` vide -> retourne `null` |
| `returns null when SPARQL returns empty bindings` | QID trouve mais aucune propriete art -> `null` |
| `returns null on network error` | Mock fetch throw -> ne throw pas, retourne `null` |
| `returns null on HTTP 429` | Mock fetch 429 -> `null` (pas de retry) |
| `sets correct User-Agent header` | Verifie que les appels fetch incluent le User-Agent Musaium |
| `filters non-art entities from wbsearchentities` | Resultat "Mona Lisa (album)" filtre, seul "Mona Lisa (painting)" est retenu |

#### `knowledge-base.service.test.ts`

| Test | Description |
|---|---|
| `returns prompt block for valid lookup` | Provider mock retourne des facts -> bloc non-vide |
| `returns empty string when provider returns null` | Provider mock retourne `null` -> `''` |
| `returns empty string on timeout (500ms)` | Provider mock delayed 600ms -> fail-open, `''` |
| `caches results by searchTerm` | Deux appels meme terme -> provider appele une seule fois |
| `cache respects TTL` | Apres expiration TTL, provider re-appele |
| `cache evicts LRU when max entries reached` | Remplir 500 entrees, ajouter la 501e -> la plus ancienne evictee |
| `fail-open: does not throw on provider error` | Provider mock throw -> service retourne `''` |
| `logs warning on provider failure` | Verifie l'appel logger.warn avec le bon event name |

#### `knowledge-base.prompt.test.ts`

| Test | Description |
|---|---|
| `builds complete block with all fields` | Facts avec tous les champs -> bloc complet avec en-tete et instruction |
| `omits empty fields` | Facts avec `technique: undefined` -> pas de ligne "Technique:" |
| `returns empty string for null facts` | `null` -> `''` |
| `truncates to 400 characters` | Facts avec des valeurs tres longues -> resultat <= 400 chars |
| `sanitizes fields via sanitizePromptInput` | Facts avec caracteres zero-width -> caracteres supprimes |

### Tests d'integration

#### `chat-message.service.integration.test.ts` (extension des tests existants)

| Test | Description |
|---|---|
| `postMessage injects KB block when feature flag enabled` | Mock KB service retournant un bloc -> verifier que `orchestrator.generate` recoit `knowledgeBaseBlock` |
| `postMessage works without KB when feature flag disabled` | Pas de KB service -> `knowledgeBaseBlock` absent ou vide, pas d'erreur |
| `KB failure does not break message flow` | KB service throw -> message poste normalement, pas d'erreur visible |
| `KB block appears in correct prompt position` | Verifier l'ordre : userMemoryBlock -> knowledgeBaseBlock -> redirectHint dans les messages passes a l'orchestrateur |

---

## 11. Risques et mitigations

| Risque | Impact | Probabilite | Mitigation |
|---|---|---|---|
| **Latence Wikidata** : l'API publique est lente ou instable | Ralentissement du temps de reponse | Moyenne | Timeout hard 500ms + fail-open. Cache in-memory absorbe les requetes repetees. P95 attendu < 50ms apres warm-up du cache. |
| **Disambiguation** : "Mona Lisa" peut matcher l'album de Nat King Cole, le film, etc. | Facts incorrects injectes dans le prompt | Haute | Filtre sur `description` de `wbsearchentities` : ne retenir que les entites dont la description contient un mot-cle art (`painting`, `sculpture`, `artwork`, `fresco`, `drawing`, `mural`, `installation`, `photograph`). |
| **Injection prompt** : des valeurs Wikidata malveillantes pourraient contenir des instructions LLM | Contournement des guardrails | Faible (donnees curatees par la communaute) | Chaque valeur Wikidata est passee par `sanitizePromptInput()` avant injection. Troncature a 400 chars du bloc total. Le bloc est un `SystemMessage` place dans la zone controlable. |
| **Rate limits Wikidata** : HTTP 429 en cas de pics | Perte temporaire d'enrichissement | Faible | Fail-open immediat (pas de retry sur 429). Cache reduit le volume de requetes. Le service degrade gracieusement. |
| **Donnees Wikidata incompletes** : proprietes manquantes pour certaines oeuvres | Bloc prompt partiellement vide | Moyenne | Les champs sont tous optionnels. Un bloc avec uniquement titre + artiste est deja utile. Le LLM a l'instruction de ne pas contredire les faits presentes, pas de les completer. |
| **Cache stale** : donnees Wikidata modifiees avant expiration du cache | Facts obsoletes pendant max 1h | Tres faible | TTL 1h est un bon compromis. Les donnees Wikidata sur les oeuvres d'art sont stables (dates, techniques ne changent pas). |
| **Overhead memoire** : cache in-memory de 500 entrees | Consommation RAM supplementaire | Faible | Chaque entree ~500 bytes (ArtworkFacts). 500 entrees = ~250 KB. Negligeable. |

---

## 12. Estimation d'effort

| Tache | Heures | Dependances |
|---|---|---|
| `knowledge-base.port.ts` : interfaces et types | 1h | - |
| `wikidata.client.ts` : client HTTP, parsing SPARQL, filtre disambiguation | 4h | Port defini |
| `knowledge-base.service.ts` : cache LRU, fail-open, timeout, logging | 3h | Port + Client |
| `knowledge-base.prompt.ts` : construction du bloc sanitise | 1h | Port |
| `config/env.ts` : ajout feature flag + config | 0.5h | - |
| `chat/index.ts` : wiring conditionnel | 0.5h | Service |
| `chat.service.ts` + `chat-message.service.ts` : integration pipeline | 2h | Service + Prompt |
| `langchain.orchestrator.ts` : injection du bloc dans les messages | 1h | - |
| Tests unitaires (wikidata.client, service, prompt) | 3h | Implementation |
| Tests d'integration (pipeline complet) | 1h | Tout |
| **Total** | **17h** | |

### Repartition suggeree

- **Jour 1** (8h) : port, client Wikidata, service, prompt builder, config, wiring
- **Jour 2** (6h) : integration pipeline (chat-message.service + orchestrator), tests unitaires
- **Jour 3** (3h) : tests d'integration, review, documentation inline, QA manuelle

---

## 13. Scope MVP vs iterations futures

### MVP (ce sprint)

| Inclus | Detail |
|---|---|
| Lookup par titre d'oeuvre | `wbsearchentities` + SPARQL avec les 6 proprietes P170/P571/P186/P195/P135/P136 |
| Filtre disambiguation | Filtrage sur la description `wbsearchentities` (mots-cles art) |
| Cache in-memory LRU | Map avec TTL 1h et max 500 entrees |
| Fail-open complet | Timeout 500ms, catch-all, aucune exception propagee |
| Feature flag | `FEATURE_FLAG_KNOWLEDGE_BASE` pour activation progressive |
| Enrichissement iteratif | Extraction du `searchTerm` depuis `detectedArtwork` du message precedent |
| Bloc prompt sanitise | `[KNOWLEDGE BASE]` avec max 400 chars, `sanitizePromptInput()` |
| Tests unitaires + integration | Couverture des 4 nouveaux fichiers + integration pipeline |

### Exclus du MVP (iterations futures)

| Feature | Sprint cible | Detail |
|---|---|---|
| **Lookup artiste** | S+1 | Requete SPARQL specifique artiste (P569/P570 birth/death, P800 notable works). Utilise `ArtistFacts`. |
| **Cache Redis** | S+1 | Remplacement du cache in-memory par Redis quand `CACHE_ENABLED=true`. Partage du cache entre instances horizontales. |
| **Prefetch sur `detectedArtwork`** | S+1 | Lancer le lookup Wikidata en fire-and-forget des que `detectedArtwork` est detecte (dans `commitAssistantResponse`), pour que le cache soit chaud au message suivant. |
| **Fallback Wikipedia** | S+2 | Si Wikidata ne retourne pas assez de proprietes, fetch du premier paragraphe Wikipedia comme contexte supplementaire. |
| **Multilingual labels** | S+2 | Passer la `locale` de l'utilisateur au SPARQL `SERVICE wikibase:label` pour obtenir les labels dans la langue de la conversation. |
| **Dashboard analytics** | S+2 | Metriques : taux de hit cache, taux de lookup reussi, latence p50/p95/p99, top oeuvres recherchees. |
| **Knowledge base locale** | S+3 | Base SQLite/JSON locale avec les 1000 oeuvres les plus discutees, pour latence < 1ms et fonctionnement offline. |
| **Enrichissement image** | S+3 | Utiliser le resultat de l'image recognition (Google Vision / OpenAI) pour identifier l'oeuvre avant meme le premier message LLM, et pre-fetcher les facts Wikidata. |

---

## Annexe A : Sequence diagram complet

```
User                 App              ChatMessageService    KnowledgeBaseService   WikidataClient      Wikidata API
 │                    │                      │                      │                    │                   │
 │── POST /message ──►│                      │                      │                    │                   │
 │                    │── postMessage() ────►│                      │                    │                   │
 │                    │                      │── prepareMessage() ─►│                    │                   │
 │                    │                      │                      │                    │                   │
 │                    │                      │   ┌── Promise.all ──┐│                    │                   │
 │                    │                      │   │ userMemory      ││                    │                   │
 │                    │                      │   │ .getMemoryFor   ││                    │                   │
 │                    │                      │   │  Prompt()       ││                    │                   │
 │                    │                      │   │                 ││                    │                   │
 │                    │                      │   │ knowledgeBase   ││                    │                   │
 │                    │                      │   │ .lookup() ──────►│── lookup() ───────►│                   │
 │                    │                      │   │                 ││                    │── wbsearchent. ──►│
 │                    │                      │   │                 ││                    │◄── QID ───────────│
 │                    │                      │   │                 ││                    │── SPARQL ────────►│
 │                    │                      │   │                 ││                    │◄── facts ─────────│
 │                    │                      │   │                 ││◄── ArtworkFacts ───│                   │
 │                    │                      │   │◄── KB block ────││                    │                   │
 │                    │                      │   └─────────────────┘│                    │                   │
 │                    │                      │                      │                    │                   │
 │                    │                      │── orchestrator.generate(                  │                   │
 │                    │                      │     ..., knowledgeBaseBlock)               │                   │
 │                    │                      │                      │                    │                   │
 │◄── response ───────│◄── result ──────────│                      │                    │                   │
```

## Annexe B : Exemple de `.env` pour le developpement

```bash
# Knowledge Base (Wikidata)
FEATURE_FLAG_KNOWLEDGE_BASE=true
KB_TIMEOUT_MS=500
KB_CACHE_TTL_SECONDS=3600
KB_CACHE_MAX_ENTRIES=500
```
