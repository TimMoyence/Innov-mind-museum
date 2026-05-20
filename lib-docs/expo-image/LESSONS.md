# Lessons — expo-image

## 2026-05-20 — RN Image → expo-image migration (TD-RN-02) + recyclingKey
- **Symptôme** : 7 fichiers utilisent `Image` de `react-native` avec des sources réseau `{ uri }` → pas de cache disk/memory, pas de blurhash, pas de transition, ré-download à chaque mount (LCP dégradé sur hero/daily-art).
- **Cause** : project standardisé sur expo-image (PREFERRED) mais migration incomplète. TECH_DEBT.md:919 dit "5 résiduels" — le scan 2026-05-21 en trouve 7 avec URI réseau (`carnet/[sessionId]`, `ArtworkHeroCard`, `ArtworkHeroModal`, `ImageFullscreenModal`, `VisitSummarySheetContent`, `daily-art/DailyArtCard`, `museum/MuseumDetailEnrichment`). Compteur TD à corriger.
- **Fix** : import `expo-image`, `resizeMode`→`contentFit`, ajouter `cachePolicy="memory-disk"` + `placeholder={{ blurhash }}` (si le DTO le porte) + `transition={150}`. `recyclingKey` si rendu en liste.
- **Anti-pattern à éviter** : laisser `resizeMode` sur un `<Image>` expo-image — prop ignorée silencieusement, rend en `cover` par défaut (bug de migration #1). Omettre `recyclingKey` dans une liste recyclée → image fantôme de la row précédente.
- **Ref** : `features/chat/ui/ImageCarousel.tsx:77-78` (bon exemple : `recyclingKey={image.url}` + `cachePolicy="memory-disk"`). `docs/TECH_DEBT.md` TD-RN-02. `shared/ui/BrandMark.tsx` + `LiquidScreen.tsx` = assets PNG locaux `require()`, migration faible valeur.

## 2026-05-20 — cachePolicy default is 'disk' not 'memory-disk'
- **Symptôme** : images réseau re-chargées (flash) au re-mount d'un écran malgré "le cache d'expo-image".
- **Cause** : `cachePolicy` default = `'disk'` seulement. Le memory cache n'est pas activé par défaut.
- **Fix** : `cachePolicy="memory-disk"` explicite sur les surfaces haute-fréquence.
- **Ref** : `node_modules/expo-image/build/Image.types.d.ts:204` (`'none'|'disk'|'memory'|'memory-disk'`, default 'disk').
