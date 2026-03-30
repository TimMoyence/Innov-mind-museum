# Sprint 1 — Quick Wins

> **Duree**: 1 semaine | **Priorite**: IMMEDIATE (pendant review stores) | **Dependances**: S0 complete

## Goal

Shipper les 4 features a plus haut ROI pendant que Apple/Google review l'app. Toutes deployables en OTA (pas de module natif).

## Prerequis

- Sprint 0 termine (app soumise, tests passent, Sentry live)
- Store review en cours (cycle 1-2 semaines)

## User Stories

| ID | En tant que... | Je veux... | Critere d'acceptation |
|----|---------------|------------|----------------------|
| S1-01 | visiteur | etre invite a noter l'app | StoreKit (iOS) / Play In-App Review (Android) prompt apres 3eme session chat |
| S1-02 | visiteur | ouvrir un musee dans Maps | Bouton "Ouvrir dans Maps" sur museum-detail → ouvre Apple Maps (iOS) / Google Maps (Android) |
| S1-03 | visiteur | partager une reponse IA | Bouton share sur messages IA → genere texte + lien App Store |
| S1-04 | visiteur | decouvrir une oeuvre par jour | Daily Art card sur home screen, 1 artwork/jour, save/skip |

## Taches Techniques

### In-App Review (3h)

- [ ] `npx expo install expo-store-review`
- [ ] Creer `museum-frontend/shared/infrastructure/inAppReview.ts`
  - `StoreReview.isAvailableAsync()` → prompt
  - Trigger: apres 3eme session chat completee
  - Compter sessions dans AsyncStorage (`@musaium/review_session_count`)
  - Max 3 prompts par an (Apple guideline)
- [ ] Integrer dans `features/chat/application/useChatSession.ts` (dans onDone callback)

### Open in Maps (2h)

- [ ] Ajouter bouton "Ouvrir dans Maps" dans `museum-frontend/app/(stack)/museum-detail.tsx`
  - iOS: `Linking.openURL('https://maps.apple.com/?ll=${lat},${lng}&q=${name}')`
  - Android: `Linking.openURL('https://www.google.com/maps/search/?api=1&query=${lat},${lng}')`
  - Detection plateforme via `Platform.OS`
- [ ] Icone: `navigate-outline` (Ionicons, deja installe)
- [ ] i18n cle `museumDirectory.open_in_maps` dans 8 locales

### Share AI Response (4h)

- [ ] Ajouter bouton share sur `ChatMessageBubble` (messages role=assistant uniquement)
  - Utiliser `Share.share()` de react-native (built-in, pas de dep)
  - Texte: `"{response excerpt (200 chars)}..."\n\nDecouvrez Musaium — votre compagnon de musee IA\n{app_store_link}`
- [ ] i18n cles: `chat.share_response`, `chat.share_footer` dans 8 locales

### Daily Art Card (1 jour)

**Backend:**
- [ ] Creer endpoint `GET /api/daily-art`
  - Fichier: `museum-backend/src/modules/daily-art/`
  - Retourne 1 artwork par jour (rotation sur liste seedee)
  - Selection deterministe: `artworks[dayOfYear % artworks.length]`
  - Cache Redis 24h
  - Response: `{ artwork: { title, artist, year, imageUrl, description, funFact } }`
- [ ] Seeder JSON avec 30 oeuvres celebres
  - Mona Lisa, La Nuit Etoilee, La Jeune Fille a la Perle, Le Cri, etc.
  - Images: URLs Wikimedia Commons (domaine public)
  - Descriptions courtes en anglais (frontend traduit via i18n)

**Frontend:**
- [ ] Creer `museum-frontend/features/daily-art/application/useDailyArt.ts`
  - Fetch depuis `/api/daily-art`
  - Track artworks sauves dans AsyncStorage (`@musaium/saved_artworks`)
  - Expose: artwork, save(), skip(), savedCount
- [ ] Creer `museum-frontend/features/daily-art/ui/DailyArtCard.tsx`
  - Card avec image, titre, artiste, annee
  - Boutons: Save (coeur) / Skip (suivant)
  - Fun fact expandable
  - Style: glass card, coherent avec design system
- [ ] Integrer DailyArtCard dans `museum-frontend/app/(tabs)/home.tsx`
  - Positionner au-dessus du bouton "New Conversation"
- [ ] i18n 8 langues (~8 cles: daily_art.title, .save, .skip, .fun_fact, etc.)

## Fichiers critiques

| Fichier | Action |
|---------|--------|
| `museum-frontend/app/(stack)/museum-detail.tsx` | Ajouter "Open in Maps" |
| `museum-frontend/app/(tabs)/home.tsx` | Integrer DailyArtCard |
| `museum-frontend/features/chat/ui/ChatMessageBubble.tsx` | Ajouter bouton share |
| `museum-backend/src/modules/daily-art/` | Nouveau module (endpoint + seed data) |

## Definition of Done

- [ ] In-app review prompt apres 3eme session (iOS + Android)
- [ ] "Ouvrir dans Maps" fonctionne sur museum-detail (iOS + Android)
- [ ] Share sur messages IA genere texte + lien
- [ ] Daily Art card visible sur home, save/skip fonctionne
- [ ] i18n complet (8 langues, toutes les nouvelles cles)
- [ ] Tests existants PASS (aucune regression)
- [ ] tsc PASS | lint PASS
- [ ] Deployable en OTA update (zero module natif ajoute)

## Risques

| Risque | Proba | Impact | Mitigation |
|--------|-------|--------|------------|
| StoreKit review prompt rejete par Apple | Low | Low | Suivre guidelines: max 3x/an, apres interaction positive |
| Daily Art contenu insuffisant | Medium | Medium | Commencer avec 30 oeuvres celebres; Wikidata enrichissement plus tard |
| Share deep link sans Universal Links | Medium | Low | V1: texte + lien store; deep links en S5 |
| OTA update bloque par store review | Low | Low | Les OTA passent sans review si pas de module natif |

## Ship Decision

- **Deploy**: Toutes les features live immediatement (pas de feature flags)
- **Methode**: OTA update via expo-updates (pas de nouveau build store)
- **Marketing**: Communiquer les quick wins aux premiers utilisateurs
