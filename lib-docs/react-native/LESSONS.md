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

## 2026-05-20 — Refresh enterprise (full scan app/features/shared/components, RN 0.83.6 inchangé)

Audit complet (pas un sample) sur `app/`, `features/`, `shared/`, `components/`. Deltas vs 2026-05-18 :

- **TD-RN-01 (Touchable→Pressable) — effectivement clos.** Le résidu `shared/ui/ErrorBoundary.tsx` est migré → `Pressable` (`ErrorBoundary.tsx:66`). Seul `Touchable*` restant = `app/(stack)/chat/[sessionId].tsx:451` `TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}` — c'est l'idiome canonique keyboard-dismiss (Pressable y est inadapté). **Acceptable, ne pas migrer.** DON'T : introduire un nouveau `TouchableOpacity`/`TouchableHighlight`.

- **TD-RN-03 (process.env via readEnvString) — RÉSOLU.** Les 2 sites bypass cités le 2026-05-18 (`chatApi/_internals.ts`, `apiConfig.ts`) passent maintenant par `readEnvString`. `cert-pinning-init.ts` aussi. **0 read `process.env` brut** sous app/features/shared/components. Garder la doctrine pour le code neuf.

- **TD-RN-02 (RN Image → expo-image) — INCHANGÉ, 5 fichiers.** Toujours les mêmes : `carnet/[sessionId].tsx:13`, `VisitSummarySheetContent.tsx:2`, `ArtworkHeroModal.tsx:25`, `ArtworkHeroCard.tsx:26`, `DailyArtCard.tsx:2`. Tous portent déjà `accessibilityLabel`/role — le gap est la LIB image (cache/blurhash/contentFit), pas l'a11y. Seul TD RN ouvert.

- **RTL — 0 violation (scan complet, pas sample).** `marginLeft/Right`, `paddingLeft/Right`, `left:/right:` positionnel, `borderLeft/Right`, `textAlign:'start'/'end'` : tous à 0. Codemod F10 tient. (Correction du 2026-05-18 qui disait "sample".)

- **FlatList — correction de comptage.** Le snapshot -18 affirmait "FlatList utilisé dans 2 sites". FAUX : **11 sites** (`conversations.tsx`, `ticket-detail.tsx`, `onboarding.tsx`, `reviews.tsx`, `ChatSessionSurface`, `ChatMessageList`, `ImageCompareCarousel`, `TicketsListView`, `MuseumDirectoryList`, `MuseumPickerScreen`, `ConversationItem`). **Un seul** (`onboarding.tsx`) utilise `getItemLayout`. Pour les listes à hauteur fixe (rows museum/conversation), ajouter `getItemLayout` + `React.memo` sur la row + `renderItem` stable. Pas un bug, mais dette perf latente — voir PATTERNS.md §5.

- **Modal reset** : 8 Modals dans l'app. Pattern `useEffect(reset,[visible])` requis pour ceux qui portent state form/consent (`QuotaUpsellModal` lignée). Voir PATTERNS.md §9.

- **Versions** : `react-native@0.83.6` (3 patches derrière 0.83.9 — in-minor, safe pré-launch), `react-native-reanimated@4.2.1` (9 sites), `expo-image@~55.0.10`, `expo@^55.0.11`. 0.84 (post-launch) RETIRE l'arch legacy → auditer les deps natives avant ce bump.

- **Sécurité** : 0 GHSA advisory contre `facebook/react-native` au 2026-05-21. CVE-2025-55182 (RSC) ne touche pas RN (pas de dépendance `react-server-dom-*`). Aucune pression d'upgrade sécu.
