# MUSAIUM — Backlog

> ⚠️ **IMPLEMENTATION STATUS**: NOT STARTED — 0 lines of code exist for Museum Walk feature.
>
> **Derniere MAJ**: 2026-03-30 | **Source**: (archived: V2_MUSEUM_WALK_STRATEGY.md, FEATURE_MUSEUM_WALK.md, V3_REVIEW_AND_PLAN.md)
> Chaque item est documenté pour permettre de piocher et implementer independamment.

**Legende**: `P0` = critique | `P1` = haute valeur | `P2` = nice-to-have | `P3` = futur

---

## INFRASTRUCTURE / DEVOPS

### Sentry museum-web `P1`
- Integrer `@sentry/nextjs` dans museum-web
- Fichiers: sentry.client.config.ts, sentry.server.config.ts, next.config.ts
- Env var: SENTRY_DSN (graceful si absent)
- Effort: 0.5j

### Maestro E2E en CI `P1`
- Ajouter job Maestro dans `ci-cd-mobile.yml`
- 3 flows YAML existent deja dans `museum-frontend/maestro/`
- Effort: 1j | Ref: V3_REVIEW_AND_PLAN.md Sprint 6b

### Lighthouse CI museum-web `P2`
- Integrer Lighthouse CI dans `ci-cd-web.yml`
- Bloquer si perf < 90 ou a11y < 90
- Effort: 0.5j

### Tests composants frontend `P2`
- 0/31 composants UI testes actuellement
- Priorite: ChatInput, ChatMessageBubble, ErrorBoundary
- Effort: 4j | Ref: V3 Sprint 6

---

## QUICK WINS (non inclus dans S1)

### Push notifications `P1`
- `npx expo install expo-notifications`
- Necessite native rebuild + provisioning iOS push entitlement
- Backend: endpoint stockage push tokens + notification sending
- Use case: re-engagement 24h apres derniere session
- Effort: 2-3j (pas un "quick win" — module natif)
- Ref: V2_MUSEUM_WALK_STRATEGY Decision #2

---

## WALK PHASE A (apres MW-A01/A02)

### MW-A03: Creer un parcours `P1`
- Selectionner 2-5 musees sur carte, route tracee entre eux
- Necessite OSRM routing client (`router.project-osrm.org`)
- Fichier: `features/museum/infrastructure/routingApi.ts`
- Effort: 1j

### MW-A04: Temps et distance `P1`
- Distance totale (km) + duree estimee (vitesse 80m/min)
- Affichage dans WalkRoutePanel
- Effort: 0.5j

### MW-A05: Optimiser l'ordre `P1`
- Algo nearest-neighbor pour reordonner les stops
- Pure function extractible et testable
- Effort: 0.5j

### MW-A06: Sauvegarder parcours `P2`
- AsyncStorage CRUD pour routes sauvees
- Fichier: `features/museum/infrastructure/walkStorage.ts`
- Effort: 0.5j

### MW-A07: Walk preview card `P2`
- Card resume: titre, duree, stops, "Quick peek"
- Fichier: `features/museum/ui/WalkPreviewCard.tsx`
- Effort: 0.5j

---

## WALK PHASE B (complet)

### Walk entity backend `P1`
- Entite TypeORM `Walk` + migration + repository + use cases
- CRUD: createWalk, updateWalkProgress, getWalkContext
- Routes: POST /api/walks, PATCH /api/walks/:id, POST /api/walks/:id/context
- Effort: 3j | Ref: FEATURE_MUSEUM_WALK.md Section 3

### GPS tracking temps reel `P1`
- expo-location watchPositionAsync, blue dot sur carte
- Fichier: `features/walk/application/useWalkNavigation.ts`
- Accuracy.Balanced pour economiser batterie
- Effort: 1j

### Notifications de proximite `P1`
- Notification locale a 150m d'un stop + vibration haptic
- Necessite expo-notifications (module natif)
- Effort: 0.5j (si expo-notifications deja installe)

### Narration IA walk-context `P1`
- Nouvelle section LLM `walk-context` dans llm-sections.ts
- Genere contexte culturel entre stops (2-3 phrases)
- Pre-genere au lancement du walk pour eviter latence
- Effort: 1j

### TTS audio narration `P2`
- Utiliser TextToSpeechService existant (backend)
- Frontend: WalkAudioPlayer.tsx avec play/pause
- Cacher audio genere par contexte
- Effort: 1j

### Walk summary card `P2`
- Card resume fin de walk: musees visites, distance, temps
- Partageable (reutiliser pattern Share de S1)
- Effort: 0.5j

---

## MONETISATION

### Free tier paywall UI `P1`
- Remplacer le placeholder par vrai paywall quand FREE_TIER_DAILY_CHAT_LIMIT est atteint
- Design: soft paywall avec proposition de valeur
- Effort: 1j | Dep: S0 free tier gate

### RevenueCat integration `P1`
- `npx expo install react-native-purchases`
- Backend: premiumStatus sur User entity, webhook RevenueCat
- Frontend: features/subscription/ module (SubscriptionScreen, useSubscription, paywall)
- Configurer produits App Store Connect + Google Play Console
- Effort: 5j | Ref: V2 Decision #3

### Per-tour IAP `P1`
- In-app purchase 3.99EUR pour debloquer walk complet + audio + offline
- Necessite RevenueCat (ci-dessus)
- Effort: inclus dans RevenueCat integration

### Premium subscription `P1`
- Mensuel 4.99EUR ou annuel 29.99EUR, tout illimite
- Necessite RevenueCat (ci-dessus)
- Effort: inclus dans RevenueCat integration

---

## RETENTION

### Art Collection `P1`
- Galerie de tous les artworks sauves (Daily Art + walks)
- Backend: table `collections` + CRUD endpoints
- Frontend: CollectionScreen + useCollection hook
- Effort: 2j | Dep: S1 Daily Art

### Museum Passport `P2`
- Grille visuelle de tampons par musee visite
- Animation au completion d'un walk
- Effort: 1j | Dep: Walk Phase B

### Year in Culture `P2`
- "Spotify Wrapped" culturel — resume annuel de l'activite
- Backend: endpoint aggregation GET /api/users/me/year-in-culture
- Frontend: ecran summary partageable
- Effort: 3j

### Monthly streak `P3`
- 1 action culturelle/mois = streak maintenu
- Backend: tracker dans profil utilisateur
- Frontend: affichage streak dans profil
- Effort: 0.5j

### Educational badges `P3`
- 5-8 badges avec micro-histoires
- Ex: "Explorateur Impressionniste", "Connaisseur Renaissance"
- Backend: definitions + award logic
- Frontend: grille de badges
- Effort: 1j

---

## SEO / ASO

### Pages /walks/[city] `P2`
- museum-web: pages dynamiques par ville avec contenu walk curate
- Schema.org TouristTrip structured data
- Mettre a jour sitemap.xml
- Effort: 1j | Dep: Walk Phase A

### Universal Links `P2`
- .well-known/apple-app-site-association (iOS)
- .well-known/assetlinks.json (Android)
- Deep linking app ↔ web
- Effort: 1j

### Blog SEO `P3`
- 12 articles SEO sur le voyage culturel
- "Les 10 musees incontournables de Paris", etc.
- Effort: 1j par article (contenu, pas dev)

---

## B2B

### Multi-tenancy activation `P2`
- Feature flag `FEATURE_FLAG_MULTI_TENANCY` existe deja
- Dashboard admin par musee (white-label config)
- Effort: 3j | Ref: roadmap B2B

### Commission tracking `P3`
- Systeme de commission 15-30% par musee partenaire
- Backend: table transactions, dashboard admin
- Effort: 2j

### QR codes musee `P3`
- QR code par musee → ouvre l'app avec contexte musee
- Universal Links necessaires (voir ci-dessus)
- Effort: 1j

---

## AI AVANCEE

### Wikidata Knowledge Base `P2`
- Spec complete: FEATURE_KNOWLEDGE_BASE_WIKIDATA.md (31K)
- Feature flag: FEATURE_FLAG_KNOWLEDGE_BASE
- Enrichissement musees + artworks avec donnees structurees
- SPARQL queries pour facts culturels
- Effort: 5j

### User Memory cross-session `P2`
- Feature flag: FEATURE_FLAG_USER_MEMORY
- Memoriser preferences, artistes favoris, niveau expertise
- Personnaliser recommandations walk + chat
- Effort: 3j

### Routes IA generees `P2`
- POST /api/walks/generate — LLM genere parcours optimise
- Input: temps dispo, interets, localisation
- Output: walk avec stops, contexte, duree
- Effort: 3j | Dep: Walk Phase A + B

---

## OFFLINE

### Walk offline mode `P2`
- Pre-cacher au telechargement: tiles carte, route GeoJSON, contexte IA, audio TTS
- Limite: max 20MB par walk
- Afficher estimation taille avant download
- Effort: 2j | Dep: Walk Phase B + TTS

---

## FINANCEMENT

### BPI France `P3`
- Candidature apres traction (M6+)
- Budget: ~500K
- Prerequis: metriques MAU, revenue, retention
- Ref: V2 Decision #7

### EU Creative Europe `P3`
- Candidature parallele
- Budget: ~200K
- Alignement mission culturelle + innovation IA
