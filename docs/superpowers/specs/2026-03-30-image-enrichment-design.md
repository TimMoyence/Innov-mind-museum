# Image Enrichment — Design Spec

> Chaque reponse assistant est enrichie d'images pertinentes.
> Backend cherche en parallele du LLM call, score les resultats multi-sources, renvoie les meilleures dans le `done` SSE event.
> Frontend affiche un carrousel de miniatures au-dessus du texte, cliquable en plein ecran.

**Date**: 2026-03-30
**Status**: Approved
**Scope**: Backend image enrichment pipeline + Frontend carousel display

---

## 1. Flux Global

```
User envoie message
        |
        +----------------------+
        |                      |
   LLM Call (streaming)    Image Enrichment (parallele)
        |                      |
        |                 1. Knowledge-base: SPARQL P18
        |                 2. Unsplash: search photos
        |                 3. Score & rank resultats
        |                      |
   SSE: token events      Images pretes
        |                      |
        +----------+-----------+
                   |
            SSE: done event
            { messageId, metadata, images: [...] }
                   |
            Frontend: carrousel fade-in au-dessus du texte
```

**Post-LLM lazy enrichment**: Si le LLM suggere des queries supplementaires via `suggestedImages` dans [META], le backend les traite apres le streaming et les inclut dans le `done` event.

---

## 2. Sources d'Images

### Priorite 1 — Wikidata / Wikimedia Commons

- Propriete `P18` (image) ajoutee a la requete SPARQL existante
- URL pattern: `https://commons.wikimedia.org/wiki/Special:FilePath/{filename}`
- Thumbnail: `https://commons.wikimedia.org/wiki/Special:FilePath/{filename}?width=300`
- Gratuit, pas de cle API, images libres de droits
- Couverture: ~80% des monuments/oeuvres majeurs

### Priorite 2 — Unsplash

- Endpoint: `GET https://api.unsplash.com/search/photos?query={term}&per_page=5`
- Header: `Authorization: Client-ID {UNSPLASH_ACCESS_KEY}`
- Thumbnail: `urls.small` (400px), Full: `urls.regular` (1080px)
- Attribution obligatoire: `"Photo by {user.name} on Unsplash"`
- Env var: `UNSPLASH_ACCESS_KEY` (optionnel — si absent, pas d'Unsplash)
- Rate limit: 50 req/h (gratuit), 5000 req/h (prod)

---

## 3. Backend

### 3.1 Types (`chat.types.ts`)

```typescript
interface EnrichedImage {
  url: string;              // image pleine resolution
  thumbnailUrl: string;     // 300px max
  caption: string;          // description de l'image
  source: 'wikidata' | 'unsplash';
  score: number;            // 0-1, pertinence calculee
  attribution?: string;     // credit photo (obligatoire Unsplash)
}
```

Ajout a `ChatAssistantMetadata`:
```typescript
images?: EnrichedImage[];   // top 5 max, triees par score desc
```

### 3.2 Wikidata Client (`wikidata.client.ts`)

Modification de la requete SPARQL existante:
- Ajouter `OPTIONAL { ?item wdt:P18 ?image. }` au SELECT
- Ajouter `P373` (Commons category) pour recherche elargie
- Retourner `imageUrl?: string` dans `ArtworkFacts`
- Generer thumbnail URL via le pattern `?width=300`

### 3.3 Nouveau: `ImageEnrichmentService`

Emplacement: `src/modules/chat/application/image-enrichment.service.ts`

```typescript
class ImageEnrichmentService {
  constructor(
    private readonly wikidataClient: WikidataClient,
    private readonly unsplashClient: UnsplashClient | null, // null si pas de cle
    private readonly cache: LruCache<ImageEnrichmentResult>,
  ) {}

  async enrich(searchTerm: string): Promise<ImageEnrichmentResult> {
    // 1. Check cache (cle = searchTerm normalise, TTL 24h)
    // 2. Fetch Wikidata P18 (deja dans le knowledge-base lookup)
    // 3. Fetch Unsplash (si client disponible)
    // 4. Merge, score, trier par score desc
    // 5. Retourner top 5
    // Timeout: 4s max, fail-open (pas d'images = array vide)
  }
}
```

### 3.4 Nouveau: `UnsplashClient`

Emplacement: `src/modules/chat/adapters/secondary/unsplash.client.ts`

```typescript
interface UnsplashPhoto {
  url: string;
  thumbnailUrl: string;
  description: string;
  photographerName: string;
}

class UnsplashClient {
  constructor(private readonly accessKey: string) {}

  async searchPhotos(query: string, perPage = 5): Promise<UnsplashPhoto[]> {
    // GET https://api.unsplash.com/search/photos
    // Timeout: 3s, AbortController
    // Extraire: urls.regular, urls.small, description || alt_description, user.name
  }
}
```

### 3.5 Scoring

Criteres de scoring (total = 1.0):

| Critere | Poids | Detail |
|---------|-------|--------|
| Titre match | 0.40 | Similarite Levenshtein normalise entre caption et search term |
| Resolution | 0.25 | >800px = 0.25, 400-800 = 0.15, <400 = 0.05 |
| Source fiabilite | 0.20 | Wikidata = 0.20, Unsplash = 0.15 |
| Position API | 0.15 | 1er resultat = 0.15, 2e = 0.10, 3e+ = 0.05 |

### 3.6 LLM Prompt (`llm-sections.ts`)

Ajouter dans les instructions systeme:
```
When your response discusses visual subjects (artworks, monuments, places, sculptures),
include in the [META] section:
"suggestedImages": [{ "query": "search term for image", "description": "what the image shows" }]
Suggest 1-3 image queries for the most visually relevant subjects in your response.
```

### 3.7 Chat Message Service (`chat-message.service.ts`)

Modification du flux `postMessage`:
```
// Existant: Promise.allSettled([knowledgeBase, userMemory])
// Nouveau: ajouter imageEnrichment au meme allSettled

const [kbResult, memResult, imgResult] = await Promise.allSettled([
  knowledgeBaseLookup,
  userMemoryLookup,
  imageEnrichment.enrich(searchTerm),  // NOUVEAU
]);

// Apres LLM streaming complete:
// 1. Parser META → extraire suggestedImages
// 2. Si suggestedImages et images manquantes → lazy enrichment (Unsplash queries)
// 3. Merger images pre-LLM + post-LLM
// 4. Inclure dans metadata du done event
```

### 3.8 SSE Done Event

Structure enrichie:
```json
{
  "messageId": "msg-123",
  "createdAt": "2026-03-30T...",
  "metadata": {
    "detectedArtwork": {},
    "recommendations": [],
    "images": [
      {
        "url": "https://upload.wikimedia.org/wikipedia/commons/...",
        "thumbnailUrl": "https://upload.wikimedia.org/.../300px-...",
        "caption": "Tour Eiffel vue du Trocadero",
        "source": "wikidata",
        "score": 0.92,
        "attribution": null
      },
      {
        "url": "https://images.unsplash.com/photo-...",
        "thumbnailUrl": "https://images.unsplash.com/photo-...&w=300",
        "caption": "Eiffel Tower at sunset",
        "source": "unsplash",
        "score": 0.78,
        "attribution": "Photo by John Doe on Unsplash"
      }
    ]
  }
}
```

### 3.9 Config (`env.ts`)

```typescript
imageEnrichment: {
  unsplashAccessKey: toOptionalString(process.env.UNSPLASH_ACCESS_KEY),
  cacheTtlMs: toInt(process.env.IMAGE_CACHE_TTL_MS, 86_400_000),  // 24h
  cacheMaxEntries: toInt(process.env.IMAGE_CACHE_MAX, 500),
  fetchTimeoutMs: toInt(process.env.IMAGE_FETCH_TIMEOUT_MS, 4000),
  maxImagesPerResponse: toInt(process.env.IMAGE_MAX_PER_RESPONSE, 5),
}
```

---

## 4. Frontend

### 4.1 Types (`chatSessionLogic.pure.ts`)

```typescript
interface ChatUiEnrichedImage {
  url: string;
  thumbnailUrl: string;
  caption: string;
  source: 'wikidata' | 'unsplash';
  score: number;
  attribution?: string | null;
}
```

Ajout a `ChatUiMessageMetadata`:
```typescript
images?: ChatUiEnrichedImage[];
```

### 4.2 Nouveau: `ImageCarousel.tsx`

Emplacement: `features/chat/ui/ImageCarousel.tsx`

- `ScrollView` horizontal avec `pagingEnabled={false}`
- Miniatures ~120px hauteur, largeur proportionnelle, coins arrondis 8px
- Attribution Unsplash en overlay semi-transparent en bas de chaque miniature
- Fade-in animation (`Animated.timing`, 300ms) a l'apparition
- Skeleton placeholder pendant chargement de chaque image
- `onPress` callback par image

### 4.3 Nouveau: `ImageFullscreenModal.tsx`

Emplacement: `features/chat/ui/ImageFullscreenModal.tsx`

- Modal plein ecran, fond noir
- Image zoomable (pinch-to-zoom via `expo-image` ou `react-native-gesture-handler`)
- Swipe horizontal pour naviguer entre images du meme carrousel
- Swipe down pour dismiss
- Caption + attribution en bas
- Bouton X en haut a droite
- StatusBar hidden pendant le fullscreen

### 4.4 Modification: `ChatMessageBubble.tsx`

Au-dessus du `<MarkdownBubble>`, dans la bulle assistant:
```tsx
{!isStreaming && message.metadata?.images?.length ? (
  <ImageCarousel
    images={message.metadata.images}
    onImagePress={(image, index) => openFullscreen(index)}
  />
) : null}
<MarkdownBubble text={message.text} />
```

### 4.5 i18n

Nouvelles cles (8 locales):
- `chat.imageAttribution` — "Photo by {photographer} on Unsplash"
- `chat.imageLoadError` — "Image could not be loaded"
- `chat.viewFullscreen` — accessibilityHint pour les miniatures

---

## 5. Fichiers Impactes

### Backend (modifications)
| Fichier | Changement |
|---------|-----------|
| `config/env.ts` | Ajouter section `imageEnrichment` |
| `modules/chat/domain/chat.types.ts` | Ajouter `EnrichedImage`, `images` a metadata |
| `modules/chat/adapters/secondary/wikidata.client.ts` | Ajouter P18 au SPARQL, retourner imageUrl |
| `modules/chat/application/knowledge-base.service.ts` | Exposer imageUrl du lookup |
| `modules/chat/application/chat-message.service.ts` | Parallele image enrichment, merger dans done |
| `modules/chat/application/llm-sections.ts` | Instruction suggestedImages dans prompt |
| `modules/chat/application/assistant-response.ts` | Parser suggestedImages du META |

### Backend (nouveaux)
| Fichier | Role |
|---------|------|
| `modules/chat/adapters/secondary/unsplash.client.ts` | Client API Unsplash |
| `modules/chat/application/image-enrichment.service.ts` | Orchestration multi-source + scoring |

### Frontend (modifications)
| Fichier | Changement |
|---------|-----------|
| `features/chat/application/chatSessionLogic.pure.ts` | Type `ChatUiEnrichedImage` |
| `features/chat/ui/ChatMessageBubble.tsx` | Inserer `ImageCarousel` au-dessus du texte |
| `shared/locales/*/translation.json` (x8) | Cles i18n images |

### Frontend (nouveaux)
| Fichier | Role |
|---------|------|
| `features/chat/ui/ImageCarousel.tsx` | Carrousel horizontal miniatures |
| `features/chat/ui/ImageFullscreenModal.tsx` | Modal plein ecran zoomable |

---

## 6. Ce qu'on NE fait PAS (V1)

- Pas de cache images cote client (URLs Wikimedia/Unsplash sont deja CDN)
- Pas de telechargement/stockage des images cote backend (URLs directes)
- Pas de moderation des images (sources fiables uniquement)
- Pas de generation d'images IA
- Pas de Google Places Photos (V2 si besoin)
- Pas de pre-fetch avant que l'utilisateur envoie le message

---

## 7. Tests

### Backend
- Unit: `image-enrichment.service.test.ts` — scoring, merge, timeout, cache, fail-open
- Unit: `unsplash.client.test.ts` — parsing reponse, timeout, erreur API
- Unit: `wikidata.client.test.ts` — etendre tests existants pour P18
- Integration: `chat-service-images.test.ts` — enrichissement dans le flux message complet
- Contract: ajouter `images` au schema OpenAPI + contract test

### Frontend
- Unit: `ImageCarousel.test.tsx` — rendu, scroll, onPress callback
- Unit: `ImageFullscreenModal.test.tsx` — navigation, dismiss, zoom
- Unit: `chatSessionLogic.pure.test.ts` — mapping images depuis API response
