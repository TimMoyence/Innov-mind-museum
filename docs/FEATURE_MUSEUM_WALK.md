# MUSAIUM — Feature Spec: Museum Walk (Parcours Guide)

> **Date**: 2026-03-27 | **Status**: SPEC COMPLETE — Ready for implementation
> **Author**: Tech Lead + 3 research agents (maps, competitors, codebase)
> **Effort total**: ~15 jours (3 phases)
> **Sprint tracking**: see [`docs/walk/ROADMAP.md`](./walk/ROADMAP.md)

---

## 1. Vision Produit

### Le probleme
Un touriste arrive dans une ville. Il ouvre Google Maps, voit des musees, ne sait pas par ou commencer, switch entre 3 apps (Maps, TripAdvisor, audio guide). Il perd du temps, rate des oeuvres, ne comprend pas le contexte du quartier.

### La solution
**Museum Walk** transforme Musaium en **compagnon culturel complet** :
1. Propose un parcours adapte (temps dispo, interets, localisation)
2. Guide entre les musees (l'utilisateur ne sort jamais de l'app)
3. Raconte des anecdotes en marchant (contexte quartier, histoire)
4. Accueille a chaque musee avec des recommandations d'oeuvres
5. S'adapte au niveau de l'utilisateur (beginner → expert)

### Positionnement concurrentiel

**Aucune app ne combine AI + parcours guide + carte + narration audio.**

| Feature | Smartify | Rick Steves | Questo | izi.TRAVEL | **Musaium** |
|---------|----------|-------------|--------|------------|-------------|
| AI conversationnelle | Non | Non | Non | Non | **Oui** |
| Reconnaissance oeuvres | Oui | Non | Non | Non | **Oui** |
| Parcours inter-musees | Non | Oui (audio) | Oui (gamifie) | Oui | **Oui + IA** |
| Audio narration | Pre-enregistre | Pre-enregistre | Non | Pre-enregistre | **Genere par IA** |
| Personalisation | Non | Non | Non | Non | **Memoire cross-session** |
| Multi-langue natif | Traduit | EN only | Traduit | Traduit | **IA native 8 langues** |
| Offline | Partiel | Oui | Partiel | Oui | **Prevu Phase C** |

**Differenciateur #1** : Le contenu n'est pas pre-ecrit — l'IA genere du contexte personnalise, adapte au niveau, dans la langue de l'utilisateur. Zero "content bottleneck".

---

## 2. Stack Technique

### Carte : Leaflet + OpenStreetMap via WebView

| Choix | Justification |
|-------|---------------|
| Leaflet 1.9.4 dans WebView | Zero API key, fonctionne dans Expo Go, zero rebuild natif |
| OpenStreetMap tiles | Gratuit, attribution requise, pas de rate limit dur |
| CartoDB light_all (prod) | Pas de cle API, esthetique clean, meilleur SLA qu'OSM |
| react-native-webview | Deja compatible Expo 53, `npx expo install react-native-webview` |

**Communication RN <-> WebView** : `postMessage` / `onMessage` JSON bidirectionnel.

### Routing : OSRM (Open Source Routing Machine)

```
GET https://router.project-osrm.org/route/v1/foot/{lng1},{lat1};{lng2},{lat2}?overview=full&geometries=geojson&steps=true
```

| Aspect | Detail |
|--------|--------|
| Profile | `foot` (pietons) |
| Format reponse | GeoJSON LineString + steps turn-by-turn |
| Limite | 1 req/sec, non-commercial, pas de SLA |
| Production | FOSSGIS mirror `routing.openstreetmap.de` (meme API) |
| Cache | Routes musee-a-musee statiques → cache agressif cote backend |

**Important** : coordonnees en `longitude,latitude` (pas lat,lng).

### GPS : expo-location (deja installe)

| Mode | Accuracy | Intervalle | Usage |
|------|----------|-----------|-------|
| Detection proximite | `Balanced` (~100m) | 10s / 20m | "Vous etes pres du Louvre" |
| Navigation active | `High` (~10m) | 5s / 10m | Suivi temps reel sur la carte |

### Proximite : Haversine manuel (pas de geofencing)

```typescript
// Dans le callback watchPositionAsync :
const dist = haversineDistance(userLat, userLng, stop.lat, stop.lng);
if (dist < 150 && !notifiedStops.has(stop.id)) {
  notifiedStops.add(stop.id);
  triggerLocalNotification(stop);
}
```

Pourquoi pas geofencing natif : limite 20 regions iOS, necessite background location permission (rejet App Store probable).

### Notifications : expo-notifications (local, immediate)

```typescript
await Notifications.scheduleNotificationAsync({
  content: { title: `${museum.name} nearby!`, body: `${dist}m away` },
  trigger: null, // immediate
});
```

Cross-platform, pas de trigger `LOCATION` (iOS only).

### TTS Narration : OpenAI TTS (deja en backend)

Le service `TextToSpeechService.synthesize()` est **production-ready** :
- Model: `tts-1`, Voice: `alloy`, Format: MP3
- Max 4096 chars par synthese
- Integre dans ChatMediaService

---

## 3. Architecture Existante Reutilisable

| Pattern existant | Fichier | Reutilisation |
|-----------------|---------|---------------|
| Museum entity + coords | `museum.entity.ts` | Marqueurs carte, calcul distance |
| `GET /museums/directory` | `museum.route.ts` | Liste musees avec lat/lng |
| Haversine distance | `haversine.ts` | Proximite pietons |
| Visit context tracking | `visit-context.ts` | Accumuler stops visites |
| LLM prompt sections | `llm-sections.ts` | Nouvelle section `walk-guidance` |
| TTS synthesis | `text-to-speech.openai.ts` | Narration audio en marchant |
| Offline queue | `offlineQueue.ts` | Queue instructions offline |
| Knowledge base Wikidata | `knowledge-base.prompt.ts` | Faits verifies par stop |
| Chat session museum mode | `chatSession.entity.ts` | `museumMode + walkRouteId` |
| User expertise detection | `metadata.expertiseSignal` | Adapter profondeur narration |
| i18n 8 langues | `shared/locales/*/translation.json` | Toutes les nouvelles cles |

---

## 4. Phase A — Carte + Parcours (~5 jours)

### Objectif
Carte interactive dans l'onglet Musees + creation de parcours entre musees + route visuelle.

### User Stories

| ID | En tant que... | Je veux... | Criteres d'acceptation |
|----|----------------|------------|----------------------|
| MW-A01 | visiteur | voir les musees sur une carte | Toggle liste/carte, markers avec nom, callout avec distance |
| MW-A02 | visiteur | voir ma position sur la carte | Point bleu si permission accordee, carte centree sur moi |
| MW-A03 | visiteur | creer un parcours | Selectionner 2-5 musees, voir la route tracee entre eux |
| MW-A04 | visiteur | voir le temps de marche | Distance totale + duree estimee affichees |
| MW-A05 | visiteur | optimiser l'ordre | Bouton "Optimiser" → nearest-neighbor algorithm |
| MW-A06 | visiteur | sauvegarder mon parcours | Persistance locale (AsyncStorage), reprise ulterieure |
| MW-A07 | visiteur | naviguer vers le premier stop | Bouton "Demarrer" → mode navigation (Phase B) ou lien Maps externe (Phase A) |

### Fichiers a creer

| Fichier | Description | Lignes est. |
|---------|-------------|-------------|
| `features/museum/ui/MuseumMapView.tsx` | WebView + Leaflet + markers + route | ~200 |
| `features/museum/ui/ViewModeToggle.tsx` | Toggle liste/carte (2 boutons icones) | ~60 |
| `features/museum/ui/WalkRoutePanel.tsx` | Panel bas: stops selectionnes, distance, duree, actions | ~150 |
| `features/museum/application/useWalkRoute.ts` | Hook: selection stops, calcul route OSRM, optimisation | ~120 |
| `features/museum/application/computeInitialRegion.ts` | Calcul bounding box pour centrer la carte | ~40 |
| `features/museum/infrastructure/routingApi.ts` | Client OSRM (fetch route GeoJSON) | ~60 |
| `features/museum/infrastructure/leafletHtml.ts` | Template HTML Leaflet injectable dans WebView | ~100 |
| `features/museum/infrastructure/walkStorage.ts` | Persistence AsyncStorage des parcours sauvegardes | ~50 |
| `__tests__/components/MuseumMapView.test.tsx` | Tests composant carte | ~80 |
| `tests/compute-initial-region.test.ts` | Tests pure logic region | ~40 |

### Fichiers a modifier

| Fichier | Changement |
|---------|-----------|
| `app/(tabs)/museums.tsx` | Toggle state, rendu conditionnel liste/carte, integration WalkRoutePanel |
| `jest.config.js` | Ajouter `react-native-webview` dans transformIgnorePatterns |
| `__tests__/helpers/test-utils.tsx` | Mock `react-native-webview` et `react-native-maps` |
| 8x `shared/locales/*/translation.json` | ~15 cles i18n museum walk |

### Nouvelle dependance

```bash
npx expo install react-native-webview
```

### Schema communication WebView

```
React Native                          WebView (Leaflet)
    │                                      │
    ├── postMessage({type:'addMarkers',     │
    │    markers: [{lat,lng,name}...]}) ──→ │ L.marker().addTo(map)
    │                                      │
    ├── postMessage({type:'drawRoute',      │
    │    coords: [[lat,lng],...]}) ───────→ │ L.polyline().addTo(map)
    │                                      │
    ├── postMessage({type:'setUserPos',     │
    │    lat, lng}) ──────────────────────→ │ userMarker.setLatLng()
    │                                      │
    │ ←── onMessage({type:'markerTap',      │
    │      museumId}) ←────────────────────│ marker.on('click')
    │                                      │
    │ ←── onMessage({type:'mapReady'}) ←───│ map on 'load'
```

### Algorithm optimisation parcours

```typescript
// Nearest-neighbor heuristic (simple, O(n^2), suffisant pour 2-5 stops)
function optimizeRoute(
  userPos: {lat: number, lng: number} | null,
  stops: Museum[]
): Museum[] {
  const remaining = [...stops];
  const ordered: Museum[] = [];
  let current = userPos ?? { lat: stops[0].latitude, lng: stops[0].longitude };

  while (remaining.length > 0) {
    let nearest = 0;
    let minDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineDistance(current.lat, current.lng, remaining[i].latitude!, remaining[i].longitude!);
      if (d < minDist) { minDist = d; nearest = i; }
    }
    ordered.push(remaining[nearest]);
    current = { lat: remaining[nearest].latitude!, lng: remaining[nearest].longitude! };
    remaining.splice(nearest, 1);
  }
  return ordered;
}
```

### Definition of Done Phase A
- [ ] Toggle liste/carte fonctionne dans l'onglet Musees
- [ ] Markers affiches pour chaque musee avec coordonnees
- [ ] Position utilisateur visible (si permission)
- [ ] Selection 2-5 musees → route tracee (polyline OSRM)
- [ ] Distance + duree affichees
- [ ] Bouton optimiser fonctionne
- [ ] Sauvegarde/reprise parcours (AsyncStorage)
- [ ] i18n 8 langues complet
- [ ] Tests: 8+ tests (carte, region, routing)
- [ ] tsc PASS, Jest PASS, 0 regression

---

## 5. Phase B — Guide en Marche (~5 jours)

### Objectif
Mode navigation temps reel avec narration IA et "learning stops" entre les musees.

### User Stories

| ID | En tant que... | Je veux... | Criteres d'acceptation |
|----|----------------|------------|----------------------|
| MW-B01 | visiteur | suivre ma progression sur la carte | GPS temps reel, point bleu anime, recentrage auto |
| MW-B02 | visiteur | savoir quand je m'approche d'un stop | Notification locale a 150m, vibration haptic |
| MW-B03 | visiteur | recevoir du contexte en marchant | "Learning stops" entre musees: anecdotes quartier, histoire |
| MW-B04 | visiteur | ecouter en mode mains-libres | TTS lit les anecdotes automatiquement |
| MW-B05 | visiteur | voir ma progression | "Stop 2/5 — 12 min de marche — ~1h30 de visite" |
| MW-B06 | visiteur | adapter la profondeur | Beginner = fun facts, Expert = contexte art-historique |
| MW-B07 | visiteur | arriver au musee et basculer en mode chat | Transition fluide: Walk → Chat avec contexte preserve |

### Backend : nouvelle section LLM `walk-context`

```typescript
// Nouvelle section dans llm-sections.ts
const WALK_CONTEXT_SECTION: LlmSectionDefinition = {
  name: 'walk-context',
  timeoutMs: 10000,
  required: false,
  prompt: `You are a cultural city guide walking with the visitor.
Current location: {district/neighborhood}.
Walking from: {previousMuseum} to: {nextMuseum}.
Distance: {distance}m, ETA: {duration}min.

Generate a SHORT cultural anecdote (2-3 sentences) about:
- The neighborhood they're walking through
- Historical context relevant to the museums they're visiting
- A "did you know?" fact that connects the two museums

Adapt depth to guide level: {guideLevel}.
Language: {locale}.
Max 100 words.`
};
```

### Backend : nouvel endpoint walking context

```
POST /api/walks/:walkId/context
Body: { currentLat, currentLng, nextStopId, locale, guideLevel }
Response: { text, audioUrl?, facts[] }
```

Le backend :
1. Determine le quartier (reverse geocoding ou lookup table)
2. Genere le contexte via LLM section `walk-context`
3. Optionnel: synthetise en audio via TTS
4. Cache le resultat (meme trajet = meme contexte)

### Backend : entite Walk

```typescript
@Entity('walks')
class Walk {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() userId: number;
  @Column('jsonb') stops: WalkStop[];     // ordered array
  @Column() totalDistance: number;         // meters
  @Column() totalDuration: number;         // seconds
  @Column({ default: 'planned' }) status: 'planned' | 'active' | 'completed' | 'abandoned';
  @Column({ nullable: true }) currentStopIndex: number;
  @Column('jsonb', { nullable: true }) routeGeometry: GeoJSON.LineString;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

interface WalkStop {
  museumId: number;
  museumName: string;
  latitude: number;
  longitude: number;
  order: number;
  arrivedAt?: string;          // ISO timestamp
  contextDelivered?: boolean;  // learning stop triggered?
}
```

### Frontend : mode navigation

```
┌────────────────────────────────────┐
│  ← Back          Stop 2/4    ⏸ ▶  │  ← Header progress
├────────────────────────────────────┤
│                                    │
│          [CARTE LEAFLET]           │  ← User dot + route + markers
│          Position temps reel       │
│                                    │
├────────────────────────────────────┤
│  🏛 Musee d'Orsay                  │  ← Next stop card
│  📍 450m — 6 min a pied           │
│                                    │
│  💡 "Le quartier Saint-Germain..." │  ← Learning stop (contexte IA)
│  🔊 Ecouter                       │  ← TTS button
├────────────────────────────────────┤
│       [ Marquer comme visite ]     │  ← Manual arrival button
└────────────────────────────────────┘
```

### Fichiers a creer (backend)

| Fichier | Description |
|---------|-------------|
| `src/modules/walk/core/domain/walk.entity.ts` | Entite Walk |
| `src/modules/walk/core/domain/walk.repository.interface.ts` | Port interface |
| `src/modules/walk/core/useCase/createWalk.useCase.ts` | Creer un parcours |
| `src/modules/walk/core/useCase/updateWalkProgress.useCase.ts` | Progression |
| `src/modules/walk/core/useCase/getWalkContext.useCase.ts` | Generer contexte IA |
| `src/modules/walk/adapters/primary/http/walk.route.ts` | Routes HTTP |
| `src/modules/walk/adapters/secondary/walk.repository.pg.ts` | Repo PG |
| `src/modules/walk/index.ts` | Wiring DI |
| Migration `AddWalksTable` | Table walks |
| `tests/unit/walk/` | 15+ tests |

### Fichiers a creer (frontend)

| Fichier | Description |
|---------|-------------|
| `app/(stack)/walk/[walkId].tsx` | Ecran navigation active |
| `features/walk/application/useWalkNavigation.ts` | Hook: GPS watch, proximite, progression |
| `features/walk/application/useWalkContext.ts` | Hook: fetch contexte IA par stop |
| `features/walk/ui/WalkProgressHeader.tsx` | "Stop 2/4" + progress bar |
| `features/walk/ui/NextStopCard.tsx` | Info prochain stop + distance + contexte |
| `features/walk/ui/WalkAudioPlayer.tsx` | Lecteur TTS pour contexte narration |
| `features/walk/infrastructure/walkApi.ts` | Client API walks |

### Definition of Done Phase B
- [ ] Mode navigation avec GPS temps reel
- [ ] Notification proximite a 150m de chaque stop
- [ ] Contexte IA genere entre les stops (LLM section)
- [ ] TTS narration fonctionnelle
- [ ] Progression visuelle (stop X/Y, distance, duree)
- [ ] Transition Walk → Chat preservee (session contextuelle)
- [ ] Entite Walk backend avec CRUD
- [ ] 15+ tests backend, 8+ tests frontend
- [ ] i18n 8 langues complet

---

## 6. Phase C — Intelligence (~5 jours)

### Objectif
Parcours auto-generes, thematiques, offline complet, partage social.

### User Stories

| ID | En tant que... | Je veux... | Criteres d'acceptation |
|----|----------------|------------|----------------------|
| MW-C01 | visiteur | un parcours genere pour moi | "J'ai 3h, je suis pres du Louvre" → parcours optimise IA |
| MW-C02 | visiteur | choisir un theme | "Impressionnistes a Paris", "Renaissance a Florence" |
| MW-C03 | visiteur | utiliser offline | Carte + route + contexte pre-telecharges |
| MW-C04 | visiteur | partager mon parcours | Lien/QR code vers le parcours pour des amis |
| MW-C05 | visiteur | voir mon historique | "Vous avez visite 3/5 musees de ce parcours" |
| MW-C06 | visiteur | recevoir des suggestions | "Basee sur vos 3 visites, vous aimerez ce parcours" |

### Backend : auto-generation parcours

```
POST /api/walks/generate
Body: {
  userLat, userLng,
  durationMinutes: 180,      // "j'ai 3h"
  theme?: 'impressionism',   // optionnel
  guideLevel: 'intermediate',
  locale: 'fr',
  maxStops: 5
}
Response: {
  walk: Walk,
  reasoning: "Based on your location near..."
}
```

Le LLM recoit :
- Liste des musees avec leurs collections/specialites (depuis `museum.config` JSONB)
- Position utilisateur
- Temps disponible
- Preferences (theme, niveau)
- Historique visites (user memory cross-session)

### Parcours thematiques pre-configures

Stockes dans `museum.config` JSONB ou table `walk_templates` :

```json
{
  "templates": [
    {
      "id": "paris-impressionism",
      "title": { "en": "Impressionists in Paris", "fr": "Les Impressionnistes a Paris" },
      "stops": [1, 5, 3],          // museumIds ordered
      "duration": 180,
      "theme": "impressionism",
      "description": { "en": "From Monet to Renoir..." }
    }
  ]
}
```

### Offline complet

| Composant | Strategie |
|-----------|-----------|
| Carte tiles | PouchDB cache dans WebView (tiles vues = cachees 7j) |
| Route GeoJSON | Cache dans AsyncStorage au moment de la sauvegarde |
| Contexte IA | Pre-genere et cache pour chaque stop au demarrage du walk |
| Audio TTS | Pre-synthetise et stocke en fichier local (expo-file-system) |
| Musee data | Cache depuis `/museums/directory` dans AsyncStorage |

Taille estimee par parcours offline : ~10-20 MB (audio + tiles + data).

### Partage parcours

```
POST /api/walks/:id/share → { shareCode: 'ABC123', url: 'musaium.com/walk/ABC123' }
GET /api/walks/shared/:shareCode → Walk details (public, read-only)
```

Deep link dans l'app : `musaium://walk/ABC123`

### Definition of Done Phase C
- [ ] Parcours auto-genere par l'IA (temps + theme + localisation)
- [ ] 3+ parcours thematiques pre-configures
- [ ] Mode offline complet (carte + route + contexte + audio)
- [ ] Partage parcours (lien + QR code)
- [ ] Historique visites + suggestions personnalisees
- [ ] 10+ tests backend, 5+ tests frontend

---

## 7. Migration Database

### Phase A
Aucune migration (tout en AsyncStorage cote frontend).

### Phase B

```sql
-- Migration: CreateWalksTable
CREATE TABLE walks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stops JSONB NOT NULL DEFAULT '[]',
  total_distance INTEGER NOT NULL DEFAULT 0,
  total_duration INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'planned',
  current_stop_index INTEGER,
  route_geometry JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_walks_user_id ON walks(user_id);
CREATE INDEX idx_walks_status ON walks(status);
```

### Phase C

```sql
-- Migration: CreateWalkTemplatesTable
CREATE TABLE walk_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(128) UNIQUE NOT NULL,
  title JSONB NOT NULL,           -- { "en": "...", "fr": "..." }
  description JSONB NOT NULL,
  stops INTEGER[] NOT NULL,        -- museumId array
  duration INTEGER NOT NULL,       -- minutes
  theme VARCHAR(64),
  city VARCHAR(128),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Migration: AddShareCodeToWalks
ALTER TABLE walks ADD COLUMN share_code VARCHAR(8) UNIQUE;
CREATE UNIQUE INDEX idx_walks_share_code ON walks(share_code) WHERE share_code IS NOT NULL;
```

---

## 8. Risques & Mitigations

| Risque | Impact | Probabilite | Mitigation |
|--------|--------|-------------|------------|
| WebView Leaflet lag sur vieux Android | UX | Moyenne | Limiter markers a 50, simplifier tiles |
| OSRM rate limit (1 req/s) | Fonctionnel | Faible | Cache routes, debounce, FOSSGIS mirror |
| GPS battery drain en navigation | UX | Haute | `Accuracy.Balanced` sauf navigation active, bouton pause |
| LLM lent pour contexte walking | UX | Moyenne | Pre-generer au demarrage du walk, cache |
| OSM tiles down | Fonctionnel | Tres faible | Fallback CartoDB, PouchDB cache |
| App Store rejection background location | Bloquant | Moyenne | Utiliser UNIQUEMENT foreground location + haversine |
| Pas assez de musees en base | Produit | Haute | Seeder les musees des grandes villes, API Overpass OSM |

---

## 9. Timeline

```
Phase A (5j)  |  Carte + Parcours + Route
              |  Leaflet WebView, OSRM routing, selection stops
              |  AsyncStorage persistence, nearest-neighbor optim
              |  → Livrable: carte fonctionnelle + creation parcours

Phase B (5j)  |  Guide en Marche + Narration IA
              |  GPS watch, proximite, module Walk backend
              |  LLM section walk-context, TTS narration
              |  → Livrable: navigation active + learning stops

Phase C (5j)  |  Intelligence + Offline
              |  Auto-generation IA, themes, offline complet
              |  Partage, historique, suggestions
              |  → Livrable: experience complete autonome
```

---

## 10. KPIs

| Metrique | Phase A | Phase B | Phase C |
|----------|---------|---------|---------|
| Parcours crees / utilisateur / mois | Baseline | +50% | +100% |
| Temps dans l'app par session | +10% | +30% | +50% |
| Retention J7 | Baseline | +15% | +25% |
| NPS feature | > 7 | > 8 | > 9 |
| Musees visites / parcours | 2-3 | 3-4 | 3-5 |
