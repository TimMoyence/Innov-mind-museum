# C3 — MUSEUM / géoloc / détection lieu — E2E trace

Branche `dev` @ HEAD `89852f2a1`. Méthode UFR-013 : tout `path:line` ci-dessous = vérifié par Read/Grep. Distinction `vérifié` vs `supposé` annotée.

---

## 1. Diagramme entrée → data

### A. Détection contexte in/out musée (proactive banner + picker)

```
[FE] useLocation()                              museum-frontend/features/museum/application/useLocation.ts:43
  └ Location.requestForegroundPermissionsAsync() (useLocation.ts:66) → status granted/denied
  └ getCurrentPositionAsync(Balanced)            (useLocation.ts:80) → {latitude, longitude}
       │
       ▼
[FE] useProactiveMuseumSuggestion()             features/chat/application/useProactiveMuseumSuggestion.ts:75
  └ tile de-dup ~111m (3 dec)                    (line 97-99)
  └ museumApi.detectMuseum({lat,lng})            (line 120)
  └ eligibility: museumId>0 && confidence>0.5    (line 127-136)
       │  (alt entrée: useDetectMuseum hook, features/museum/application/useDetectMuseum.ts:34)
       ▼  HTTP GET /api/museums/detect-museum
[BE] museum.route.ts buildHandleDetectMuseum     museum-backend/.../museum/adapters/primary/http/routes/museum.route.ts:167
  └ validateQuery(detectMuseumQuerySchema) + rate-limit  (line 212-216)
       │
       ▼
[BE] DetectMuseumUseCase.execute(lat,lng)        .../museum/useCase/detect/detect-museum.useCase.ts:30
  ├ Step1 repository.findByCoords(lat,lng)        (line 41)  → geofence hit → confidence=1.0
  │     └ PG adapter mode pick (postgis|jsonb-bbox|absent)  .../adapters/secondary/pg/museum.repository.pg.ts:133
  │         ├ postgis: ST_Contains(geofence, ST_Point)      (museum.repository.pg.ts:143-144)
  │         └ jsonb-bbox: load all + in-app BETWEEN check    (museum.repository.pg.ts:152-164)
  └ Step2 findNearbyMuseums(lat,lng) haversine     .../chat/useCase/enrichment/nearby-museums.provider.ts:11
        └ repository.findAll({activeOnly}) + haversine ≤30km, top 5  (provider.ts:16-28)
        └ confidence = max(0,1-dist/500)            (detect-museum.useCase.ts:96-99)
       │
       ▼
[DATA] museums table (PK int id, wikidataQid, lat/lng,
        geofence geometry(Polygon,4326) | geofence_bbox jsonb)
        domain/museum/museum.entity.ts:17-97
        migration AddMuseumGeofence1779051738966 (hybrid postgis/jsonb) :47-86
        seed: scripts/seed-museums.ts (Paris/Lyon/Marseille/Bordeaux + Pont de Pierre monument)
```

### B. Géoloc → contexte LLM (chat per-message)

```
[FE] useChatSession → formatLocation(lat,lng)    features/chat/application/chatSessionLogic.pure.ts:323
       => "lat:44.83,lng:-0.57"  (RAW EXACT COORDS)  (line 328)
  └ sendMessageStreaming/Audio: location: context.locationString
       sendStrategies/sendMessageStreaming.ts:69 ; sendMessageAudio.ts:41
       │  HTTP POST /api/chat/sessions/:id/messages  { context.location }
       ▼
[BE] PrepareMessagePipeline.prepare()            .../chat/useCase/orchestration/prepare-message.pipeline.ts:258
  └ enrichAndResolveLocation() (line 386)
      └ resolveLocationForMessage(resolver, input.context.location, session, {userId, consentChecker})
          prepare-message.pipeline.ts:444-447
           │
           ▼
[BE] resolveLocationForMessage()                 .../chat/useCase/location-resolver.ts:188
  ├ GDPR GATE: consentChecker.isGranted(userId,'location_to_llm')  (line 196-199)
  │     denied OR anon → return undefined  ⇒ resolvedLocation absent
  └ if granted: parseLocationString → LocationResolver.resolve(lat,lng)  (line 202-204)
       │
       ▼
[BE] LocationResolver.resolve(lat,lng)           location-resolver.ts:73
  ├ cache geo:resolve:<lat.3>:<lng.3>              (line 74)
  ├ findNearbyMuseums → isInsideMuseum if <200m    (line 81-84)
  ├ inside: cache 20min, no reverse-geocode        (line 86-99)
  └ outside: reverseGeocode via cached Nominatim    (line 106)
        ├ buildFineReverseGeocode (name+road+suburb+city+country) — BACKEND ONLY  (line 128-141)
        └ buildCoarseReverseGeocode (city+country) — LLM-safe     (line 150-160)
       │
       ▼
[BE] buildOrchestratorInput → resolvedLocation + context.location  prepare-message.pipeline.ts:482,494
       │
       ▼
[BE] buildVisitorContextLine(input)              .../chat/useCase/llm/llm-prompt-builder.ts:194
  ├ if resolvedLocation absent → FALLBACK raw context.location  (line 196-200)  ⚠ voir RUPTURE #1
  ├ isInsideMuseum → "inside/near: <museumName>"   (line 202-203)
  ├ reverseGeocodeCoarse → "outdoors in: <city,country>" + nearby  (line 205-210)
  └ else nearbyMuseums → "in the city near: <list>"  (line 212-214)
```

### C. QR cartel deeplink → [CURRENT ARTWORK]

```
[FE] CartelScannerSheetContent onBarcodeScanned  features/chat/ui/CartelScannerSheetContent.tsx:88
  ├ parseMusaiumDeeplink(data) FIRST              (CartelScannerSheetContent.tsx:94 ; parser sanitizeCartelCode.ts:122)
  │     musaium://museum/<uuidv4>/artwork/<uuidv4>[?room=<uuidv4>]  → {museumId, artworkId, roomId}
  └ else sanitizeCartelCode(data) → string         (sanitizeCartelCode.ts:66)
       │
       ▼
[FE] handleCartelScanned()                       app/(stack)/chat/[sessionId].tsx:383
  ├ string → sendMessage(lookup_template{code})    (line 385-389)
  └ deeplink → setSessionContext({sessionId, currentArtworkId: payload.artworkId, currentRoom: payload.roomId})
        chat/[sessionId].tsx:394-397   (⚠ museumId du deeplink JAMAIS envoyé — voir RUPTURE #2)
       │  HTTP PATCH /api/chat/sessions/:id/context
       ▼
[BE] chat-session.route.ts PATCH /sessions/:id/context  .../chat/adapters/primary/http/routes/chat-session.route.ts:156-161
  └ validateBody(updateSessionContextSchema) : currentArtworkId/currentRoom = optionalNullableUuidV4
        .../chat/adapters/primary/http/schemas/chat-session.schemas.ts:181-187
       │
       ▼
[BE] UpdateSessionContextUseCase.execute()       .../chat/useCase/session/update-session-context.useCase.ts:38
  ├ ensureSessionAccess (ownership/404/400)         (line 42)
  └ repository.updateSessionContext(patch)          (line 55)  ⇒ DATA: chatSession.currentArtworkId, currentRoom
       │
       ▼ (next message)
[BE] PrepareMessagePipeline.resolveCurrentArtwork(session)  prepare-message.pipeline.ts:350
  └ artworkKnowledgeRepo.findById(currentArtworkId) → {title, roomId}  (line 357-359)
  └ → buildOrchestratorInput.currentArtwork → prompt [CURRENT ARTWORK]  (line 507)
```

### D. Suggestions de proximité (« musée pas loin » / « monument à côté »)

```
[FE] useMuseumDirectory / museums tab → museumApi.searchMuseums({lat,lng,radius})
       │  HTTP GET /api/museums/search
       ▼
[BE] searchMuseums.useCase.ts                    .../museum/useCase/search/searchMuseums.useCase.ts
  ├ fetchLocalMuseumsWithCoords (DB seed)           (line 70)
  ├ queryOverpassMuseums (LIVE OSM)                 via shared/http/overpass.client.ts:72
  │     OSM filter = nwr["tourism"="museum"]        shared/http/overpass-queries.ts:11,22  ⚠ MUSÉES SEULEMENT
  ├ dedup OSM↔OSM + OSM↔local                       (searchMuseums.useCase.ts:130-183)
  └ radius filter + sort distance                   (line 199-226)
       │
       ▼
[DATA] museums table (locals) + live Overpass OSM (museums uniquement)
```

---

## ✅ Maillons solides (vérifiés)

1. **Consent location gating sur le chemin résolu** — `resolveLocationForMessage` court-circuite à `undefined` si `!userId` (anon) ou `!isGranted(userId,'location_to_llm')`. `location-resolver.ts:196-199`. Câblé en prod : `chat-module.ts:690,722` → `buildLocationConsentChecker()` (`chat-module.ts:844-848`) → `userConsentRepository.isGranted`. **Fail-CLOSED** (pas de port = legacy, mais le port EST toujours wiré en prod).
2. **Coarse-vs-fine géocodage GDPR** — seul `reverseGeocodeCoarse` (city+country) atteint le prompt LLM (`llm-prompt-builder.ts:205-210`) ; `buildFineReverseGeocode` (rue/suburb) reste backend-only (`location-resolver.ts:128-141`, commentaire ligne 124-126). Discipline correcte.
3. **Détection in/out hybride 2-étapes** — geofence containment (confidence 1.0) puis haversine décay. `detect-museum.useCase.ts:39-83`. PG adapter auto-pick postgis/jsonb-bbox bootstrap-cached `museum.repository.pg.ts:133-189`. Migration idempotente + savepoint-guard pour harness sans-txn (`AddMuseumGeofence...ts:47-86`, gotcha CLAUDE.md SAVEPOINT respecté).
4. **QR deeplink parsing durci** — `parseMusaiumDeeplink` rejette schémas non-`musaium:`, fragments, query non-`room`, UUID non-v4, len>256 (`sanitizeCartelCode.ts:122-166`). Ordre parser-avant-sanitizer correct (`CartelScannerSheetContent.tsx:94-106`).
5. **`currentArtworkId` lookup fail-open** — repo manquant/row absent → section omise, jamais de 500 (`prepare-message.pipeline.ts:350-364`).
6. **Proximité musées RÉELLE (pas stub)** — `searchMuseums` fusionne seed DB local + live Overpass OSM avec dedup distance+nom (`searchMuseums.useCase.ts:130-226`). `generateSyntheticPois` est dev-only/perf-HUD (`generateSyntheticPois.ts:32-41`), pas un placeholder de prod.
7. **Cartel code FE double-sanitisation** — NFKC + strip zero-width + truncate `<` + whitelist `[A-Za-z0-9._-]` (`sanitizeCartelCode.ts:66-76`), mirror du BE `sanitizePromptInput`.

---

## ⚠️ Faibles / ruptures

### RUPTURE #1 — Consent `location_to_llm` BYPASSÉ par le fallback raw-coords [SÉVÉRITÉ: HAUTE — GDPR]
`llm-prompt-builder.ts:196-200` : quand `resolvedLocation` est **absent** (= exactement le cas où le consent a été REFUSÉ, `resolveLocationForMessage` retourne `undefined`, `location-resolver.ts:198-199`), le builder retombe sur `input.context?.location` et injecte la chaîne brute `"lat:44.83,lng:-0.57"` dans `<visitor_context>`.
- Source raw confirmée : FE `formatLocation` produit `lat:<exact>,lng:<exact>` (`chatSessionLogic.pure.ts:328`), envoyée inconditionnellement (`prepare-message.pipeline.ts:482`, `sendMessageStreaming.ts:69`).
- `safeContextValue` ne fait que guardrail+sanitize, **ne coarsen PAS** les coords (`llm-prompt-builder.ts:22-27`).
- **Conséquence** : un user qui refuse `location_to_llm` voit quand même ses coordonnées GPS EXACTES (plus précises que le coarse city/country !) partir au LLM tiers (OpenAI/Deepseek/Google). Le gating coarse est contourné par le bas. C'est l'inverse de l'intention GDPR documentée à `location-resolver.ts:182-187` et `consentScopes.ts:13-17`.
- **Vérifié** : la pipeline ne nullifie jamais `input.context.location` en fonction du consent ; seul `resolvedLocation` est gated.

### RUPTURE #2 — QR cross-museum replay : museumId du deeplink jamais validé/propagé [SÉVÉRITÉ: MOYENNE]
- Le deeplink porte un `museumId` (UUID v4, `sanitizeDeeplink` schema), mais `handleCartelScanned` ne l'envoie PAS au BE — seuls `currentArtworkId`+`currentRoom` partent (`chat/[sessionId].tsx:394-397`).
- `UpdateSessionContextUseCase` ne vérifie AUCUNE appartenance `artworkId ∈ museum` ni ne touche `session.museumId` (`update-session-context.useCase.ts:38-64`). N'importe quel `artworkId` UUID-valide est accepté sur n'importe quelle session.
- **Mismatch de type structurel** : `museums.id` est un `int` auto-généré (`museum.entity.ts:18-19`) alors que le deeplink `museumId` est un `UUID v4` (`sanitizeCartelCode.ts:90,147`). Le museumId du QR ne peut PAR CONSTRUCTION référencer une ligne museum réelle par id. Soit le deeplink encode autre chose (slug? qid?) — non vérifié côté émetteur (aucun générateur de QR trouvé dans le repo) — soit le format deeplink est spéculatif/non-câblé bout-en-bout.
- **Replay** : scanner un cartel d'un musée A pendant une session du musée B set `currentArtworkId` de A sans contrôle. Si `artworkKnowledgeRepo.findById` ne filtre pas par museum (à vérifier hors scope C3), le `[CURRENT ARTWORK]` pourrait afficher une œuvre d'un autre musée. Surface limitée (titre d'œuvre, pas de data sensible) mais incohérence produit.

### RUPTURE #3 — « Monument à côté » : discovery live INEXISTANTE [SÉVÉRITÉ: MOYENNE — produit/North Star]
- North Star V1 = suggestions de proximité « un monument à côté ». Mais Overpass ne query QUE `nwr["tourism"="museum"]` (`overpass-queries.ts:11,22`). Aucun `historic=*`, `tourism=attraction`, `man_made=*`, `memorial`, etc.
- Les monuments n'existent que comme lignes seed manuelles dans `museums` (ex Pont de Pierre, `seed-museums.ts:9-16`, `wikidataQid:Q1773424`). Hors des ~quelques monuments seedés, « un monument à côté » ne retourne RIEN de vivant.
- `findNearbyMuseums` / `searchMuseums` ne distinguent pas musée vs monument (tout est ligne `museums`). La promesse « monument dehors » repose à 100% sur un seed statique minuscule.

### RUPTURE #4 — Seed ≠ géofences seedées pour toutes les lignes [SÉVÉRITÉ: BASSE — à confirmer]
- `seed-museums.ts` fournit lat/lng mais PAS de polygone/bbox geofence. Une 2e migration `SeedPilotMuseumGeofences` existe (`1779051850000-...ts`, non lue en détail) mais ne couvre vraisemblablement que les "pilot" (Bordeaux). Conséquence : pour les museums sans geofence, Step1 (`findByCoords`) miss systématique → confidence haversine-only (max 1-dist/500), jamais 1.0. Détection in-museum dégradée hors lignes geofencées. **Supposé** (migration seed non lue ligne-à-ligne) — à vérifier.

---

## 🔧 Gaps E2E

- **G1 (bloquant GDPR, lié RUPTURE #1)** : le consent `location_to_llm` doit gater AUSSI `input.context.location`, pas seulement `resolvedLocation`. Fix candidat : nullifier `context.location` dans `buildOrchestratorInput` quand consent refusé, OU retirer le fallback raw-coords du `buildVisitorContextLine` (lignes 196-200) — la branche raw n'a aucune valeur GDPR (coords exactes > coarse) et devrait être supprimée. Le flux géoloc→contexte→chat est *continu* mais *fuit sous le gate*.
- **G2 (lié RUPTURE #2)** : `UpdateSessionContextUseCase` devrait valider `artworkId ∈ session.museumId` (jointure knowledge repo) avant de persister, et/ou le deeplink devrait porter un museumId cohérent avec le type `museums.id`. Clarifier le contrat du QR (qui le génère ? format réel ?). Aucun générateur QR trouvé dans le repo → format deeplink possiblement non-testé E2E réel.
- **G3 (lié RUPTURE #3)** : si « monument à côté » est promesse V1, soit étendre l'Overpass query (`historic=monument`, `tourism=artwork|attraction`, `man_made=bridge|tower`), soit acter explicitement que seuls les monuments seedés sont supportés V1 (honnêteté NorthStar). Actuellement la couverture dehors = seed manuel uniquement.
- **G4** : pas de validation que la détection in/out fonctionne E2E pour les lignes sans geofence (RUPTURE #4) — confirmer la couverture de `SeedPilotMuseumGeofences`.
- **Note positive** : le chemin in-museum (geofence hit → `isInsideMuseum` → prompt "inside <museum>") est cohérent et continu. Le chemin QR→[CURRENT ARTWORK] est continu côté happy-path (parse → patch → lookup → prompt), modulo G2.
