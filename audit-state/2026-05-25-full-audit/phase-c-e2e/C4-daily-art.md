# C4 — DAILY-ART (Œuvre du jour) — E2E trace

Branche `dev` @ HEAD `89852f2a1`. READ-ONLY architect (UFR-022). Méthode UFR-013 : `path:line` cités, vérifié vs supposé.

## Flux entrée → data (vérifié)

```
[HOME mount]
 app/(tabs)/home.tsx:43            useDailyArt()  ← hook
 app/(tabs)/home.tsx:111-117       <DailyArtCard artwork isSaved onSave onSkip />   (wiré, PAS orphelin)
        │
        ▼  features/daily-art/application/useDailyArt.ts:35-72  useEffect load()
 useDailyArt.ts:40-41   migrateStorageKey(DISMISSED_KEY/SAVED_ARTWORKS_KEY) ← legacy @musaium/* (TD-AS-01)
 useDailyArt.ts:43-48   if storage[DISMISSED_KEY] === todayKey() → dismissed, skip fetch
 useDailyArt.ts:51      fetchDailyArt()
        │
        ▼  features/daily-art/infrastructure/dailyArtApi.ts:9-16
 dailyArtApi.ts:10-14   openApiRequest GET /api/daily-art  query:{ locale }   ← locale ENVOYÉ
        │  (HTTP, bearer auth)
        ▼  museum-backend/src/shared/routers/api.router.ts:375  router.use('/daily-art', createDailyArtRouter(cacheService))
 daily-art.route.ts:19  GET '/' isAuthenticated
 daily-art.route.ts:20-22   now=new Date(); dateStr=toDateString(now); cacheKey=`daily-art:${dateStr}`
 daily-art.route.ts:24-30   cacheService.get<Artwork>(cacheKey) → hit ? res.json({artwork})
 daily-art.route.ts:32      selectArtworkForDate(now)
        │
        ▼  getDailyArtwork.useCase.ts:17-20
 getDailyArtwork.useCase.ts:6-11   getDayOfYear(date)   (1-366, server-local TZ)
 getDailyArtwork.useCase.ts:19     artworks[dayOfYear % artworks.length]   (length=30)
        │
        ▼  adapters/secondary/catalog/artworks.data.ts:7  const artworks: readonly Artwork[]  (30 entrées statiques)
 daily-art.route.ts:34-35   cacheService.set(cacheKey, artwork, 86400)   (TTL 24h)
 daily-art.route.ts:38      res.json({ artwork })
        │
        ▼  retour FE
 useDailyArt.ts:53      setArtwork(data)
 useDailyArt.ts:56-59   storage[SAVED_ARTWORKS_KEY] match title+artist → isSaved
 DailyArtCard.tsx:91-105  <Image uri=imageUrl> onError → setImageError → fallback icône image-outline
 DailyArtCard.tsx:60-64 / 87-176  swipe-to-save / save / skip → toggleSavedArtwork / storage
```

Logout : `features/auth/application/AuthContext.tsx:113` → `clearDailyArtStorage()` (`logoutCleanup.ts:13-18`) purge SAVED+DISMISSED. ✅ (anti-leak multi-user shared device).

## ✅ Solide

- **Feature wirée**, pas orpheline : `home.tsx:43,111`. Affichée conditionnellement (artwork && !dismissed && !loading), sinon `EmptyState variant="dailyArt"` (`home.tsx:118-124`).
- **Sélection déterministe** : `getDailyArtwork.useCase.ts:19` `artworks[dayOfYear % 30]`. Pure, reproductible pour une date donnée. Pas de RNG.
- **Cache BE robuste** : `daily-art.route.ts:22,35` clé `daily-art:YYYY-MM-DD`, TTL 86400s = 24h, cacheService optionnel (dégrade proprement si absent). Pas de risque de stale cross-day (clé porte la date).
- **Auth** : route gardée `isAuthenticated` (`daily-art.route.ts:19`) ; OpenAPI déclare `bearerAuth` + 401 (`openapi.json` /api/daily-art).
- **Fallback image** : `DailyArtCard.tsx:91-105` `onError → setImageError`, rend icône `image-outline`. Dégrade sans crash.
- **Reduced-motion** WCAG 2.3.3 : `DailyArtCard.tsx:45-58` skip fade.
- **a11y** : labels/roles sur Image (`:99`), boutons save/skip (`:149-150,169`), fun-fact expanded state (`:124`).
- **Catalog tous https Wikimedia** : 30/30 URLs `https://upload.wikimedia.org` (aucun http, aucun host tiers). Vérifié grep.
- **Migration storage keys** legacy→namespacé idempotente avant 1er read (`useDailyArt.ts:16,40-41`).

## ⚠️ Faible / rupture

- **[SEVERITE HAUTE] 14/30 URLs images du catalog cassées (HTTP 400/404).** Vérifié par `curl` (UA navigateur + `Referer: commons.wikimedia.org`, identique aux URLs qui passent en 200). Cassées : #1 Mona Lisa (400), #3 Girl with a Pearl Earring (400), #4 The Scream (400), #6 The Kiss/Klimt (400), #10 Guernica (**404**), #12 American Gothic (400), #16 Le Penseur/Rodin (400), #17 Vénus de Milo (400), #18 David/Michelangelo (400), #24 Las Meninas (400), #26 Garden of Earthly Delights (**404**), #28 Arnolfini Portrait (400), #29 Girl with a Red Hat (400), #30 Wanderer above the Sea of Fog (400). Source : `artworks.data.ts` (lignes imageUrl 12,36,48,72,128,164,187,199,211,270,294,317,329,353). **Impact : ~47% des jours affichent le fallback icône au lieu de l'œuvre.** #1 Mona Lisa = `dayOfYear % 30 == 0` (ex. 31 déc → index 0 ; ~12 jours/an) = œuvre la plus exposée, cassée. Cause probable : politique hot-link / thumbs stale Wikimedia (les 400 persistent même décodés et avec Referer).

- **[SEVERITE MOYENNE] `locale` envoyé par le FE mais totalement ignoré par le BE + absent du contrat OpenAPI.** FE : `dailyArtApi.ts:9-14` passe `query:{ locale }`. BE : `daily-art.route.ts:19` n'extrait jamais `req.query.locale`, ne le passe pas à `selectArtworkForDate`. OpenAPI `/api/daily-art` ne déclare AUCUN paramètre `locale` (vérifié `openapi.json`). Le query param est silencieusement dropé. Pas de crash mais contrat trompeur + le paramètre suggère un i18n qui n'existe pas.

- **[SEVERITE MOYENNE] Contenu artwork (title/description/funFact/museum) anglais uniquement, non i18n.** `artwork.types.ts:1-9` = champs string plats, une seule langue. Catalog 100% EN (`artworks.data.ts`). Seuls les LABELS UI sont traduits (`shared/locales/{en,fr,...}/translation.json` clé `dailyArt`: title/save/skip/saved/by/fun_fact/swipeToSave — 8 locales). Donc un user FR voit « Oeuvre du Jour » + « par » mais une description et un fun-fact en anglais. Incohérent avec une app multilingue ; aggravé par le faux signal `locale` ci-dessus.

- **[SEVERITE MOYENNE] Désynchronisation timezone FE (device-local) vs BE (server-local) sur le découpage « du jour ».**
  - BE `daily-art.route.ts:20` `new Date()` + `getDailyArtwork.useCase.ts:6-7` `getDayOfYear` utilise `getFullYear()` (TZ serveur) ; cache key `toDateString` = `toISOString().slice(0,10)` = **UTC** (`useCase.ts:14`). Donc la *sélection* est en TZ serveur mais la *clé cache* en UTC → possible incohérence si serveur ≠ UTC (sélection peut changer à minuit local mais cache encore sur date UTC, ou inverse).
  - FE `useDailyArt.ts:26` `todayKey = new Date().toISOString().slice(0,10)` = **UTC** pour décider du « dismissed today ».
  - Conséquence : un user à l'ouest de UTC (ex. fuseau négatif) qui « skip » le soir verra le dismissal expirer à minuit UTC (= avant son minuit local), ou l'œuvre du jour BE peut changer à un moment décalé de son ressenti local. Edge-case mineur mais réel ; pas de TZ unique (Europe/Paris) imposée nulle part.

- **[SEVERITE BASSE] Pas de garantie de non-répétition immédiate au rollover annuel.** `dayOfYear % 30` : sur 365/366 jours, l'index reboucle 12×/an. Au passage d'année, `dayOfYear` repart à 1 → index 1, alors que le 31 déc était index 0 (365%30=5 ou 366%30=6 selon année) → **pas de répétition immédiate par construction** en cours d'année (incréments de +1). MAIS aucune protection explicite si la longueur du catalog changeait à un diviseur ; et 30 œuvres = chaque œuvre revient tous les 30 jours (acceptable produit, à confirmer). Pas un bug, juste non documenté/non testé.

- **[SEVERITE BASSE] Cache stocke l'objet artwork entier (`daily-art.route.ts:35`).** Si le catalog est édité (fix d'URL), le cache 24h sert l'ancienne version jusqu'à expiration — fix d'URL pas effectif avant 24h en prod. Mineur.

## 🔧 Gaps E2E

1. **Aucun monitoring/sentinel de validité des 30 URLs images.** Rien ne vérifie en CI que les `imageUrl` répondent 200. C'est exactement comment 14/30 ont pourri sans détection. → ajouter un check (script nightly ou test contract) HEAD sur chaque URL.
2. **Pas de test couvrant le rendu image réel / fallback en E2E Maestro** (UFR-021). `__tests__/components/DailyArtCard.test.tsx` mocke `<Image>` → ne peut PAS attraper une URL 400 (même classe de faux-positif que le bug DOB-2026-05-17). Le happy-path « image de l'œuvre du jour s'affiche » n'est pas exercé sur device.
3. **Contrat locale incohérent** : soit le BE consomme `locale` et sert du contenu localisé (impliquerait catalog multilingue), soit le FE arrête de l'envoyer et OpenAPI reste muet. État actuel = dette/mensonge de contrat.
4. **Pas de validation runtime du shape catalog** (que `dayOfYear % length` reste valide si length=0). `artworks` non-vide est supposé, jamais asserté ; `artworks[idx]` pourrait être `undefined` si vidé (typé `Artwork` mais non garanti runtime).
5. **i18n du contenu** absent — décision produit requise (catalog multilingue vs EN-only assumé). Actuellement mix langue UI/contenu.

## Verdict E2E

Flux FE↔BE **complet et fonctionnel** (mount → hook → API → useCase → catalog → cache → render → save/skip → logout purge). Architecture propre (hexagonal BE, feature-driven FE). MAIS **data integrity dégradée** : ~47% des images cassées sans aucune détection, + 2 incohérences de contrat (locale fantôme, contenu EN-only). La feature « marche » techniquement mais sert souvent une carte sans visuel.
