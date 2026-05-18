# Lessons — react-native

Project-specific gotchas pour RN 0.83.6 + New Architecture dans Musaium. Audit enterprise-grade 2026-05-18 (sampled 11/27 consumers).

## 2026-05-18 — Network `<Image>` doit utiliser `expo-image`, pas RN `Image`
- **Symptôme** : pas de bug fonctionnel, mais perte de cache disk + memory + blurhash + transition + SVG support.
- **Cause** : RN `Image` n'a pas de cache disk natif, pas de placeholder/blurhash, pas de `contentFit` (utilise `resizeMode`). Doctrine projet : `expo-image` pour TOUS les network URIs ; RN `Image` toléré seulement pour `require('./logo.png')` static assets ou `Animated.Image`.
- **Sites où RN Image est utilisé avec URI réseau** (5) :
  - `museum-frontend/features/chat/ui/ArtworkHeroModal.tsx:25,115`
  - `museum-frontend/features/chat/ui/ArtworkHeroCard.tsx:26,93`
  - `museum-frontend/features/daily-art/ui/DailyArtCard.tsx:2,87`
  - `museum-frontend/features/chat/ui/VisitSummarySheetContent.tsx:2`
  - `museum-frontend/app/(stack)/carnet/[sessionId].tsx:13`
- **Fix** : voir TD-RN-02. Replace `import { Image, ... } from 'react-native'` → `import { Image } from 'expo-image'`. Replace `resizeMode` → `contentFit`. Add `placeholder={{ blurhash }}` + `transition={150}`.
- **Anti-pattern à éviter** : ajouter un nouveau composant qui render une image distante via RN `Image`.

## 2026-05-18 — `TouchableOpacity` est legacy — utiliser `Pressable`
- **Symptôme** : JS-thread lag sur opacity update.
- **Cause** : PATTERNS.md §3 + §4 documente `TouchableOpacity` deprecated trend. Project est 99% conforme — DERNIER site = `shared/ui/ErrorBoundary.tsx`.
- **Fix** : voir TD-RN-01. Replace TouchableOpacity → Pressable avec `style={({pressed}) => [...]}` + `hitSlop`.
- **Anti-pattern à éviter** : ajouter TouchableOpacity dans un nouveau composant.

## 2026-05-18 — `process.env.X` reads doivent passer par `readEnvString` helper
- **Symptôme** : pas de bug actuel mais drift type local↔CI (CLAUDE.md gotcha process.env).
- **Cause** : CLAUDE.md §Pièges connus + `shared/lib/env.ts` mandatent `readEnvString` pour TOUT `process.env.X` read. Le helper absorbe la divergence Dict<string> (local Expo) vs `any` (CI). Audit unification T1.9 2026-05-16.
- **Sites bypass** (2) :
  - `museum-frontend/features/chat/infrastructure/chatApi/_internals.ts:60`
  - `museum-frontend/shared/infrastructure/apiConfig.ts:118`
- **Fix** : voir TD-RN-03. Toujours wrap : `readEnvString(process.env.EXPO_PUBLIC_X)`.
- **Anti-pattern à éviter** : ré-implémenter localement le `typeof X === 'string' ? X.trim() : undefined` (déjà fait par le helper).

## 2026-05-18 — Validations positives (conformité confirmée)
- **Unicode emoji** : ✅ 0 violation (ast-grep rule `no-unicode-emoji-in-screen.yml` enforce, sample audit confirme)
- **RTL `marginStart/End`** : ✅ codemod F10 2026-05-14 propre, pas de violation détectée dans sample
- **`textAlign 'start'/'end'`** : ✅ pas de violation
- **Pressable** : ✅ 99% propagation (1 résidu, TD-RN-01)
- **expo-image** : ✅ 6 fichiers déjà migrés, 5 résiduels (TD-RN-02)
