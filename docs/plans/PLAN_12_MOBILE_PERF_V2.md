# PLAN 12 — Mobile Perf V2 (FlashList v2 + Reanimated 3 + Expo Router v7)

**Phase** : 3 (V2 Next Level)
**Effort** : 2-3 semaines
**Pipeline /team** : enterprise
**Prérequis** : P07 (tests), P08 (chat split — composants memoïsables)
**Débloque** : UX premium, différentiation sur devices moyens, rétention

## Context

Le WebSearch 2026 confirme que RN 0.83 (already on `package.json`) active la **New Architecture par défaut** via Expo SDK 55. Gains théoriques : +43% cold start, +39% rendering, +26% memory, +40× JS↔Native comm. Ces gains ne sont pas automatiques — ils demandent d'adopter les APIs modernes :

| Opportunité | Gain attendu | État Musaium |
|---|---|---|
| **FlashList v2** (Shopify) | Scroll zéro native code, sync layout | `ChatMessageList` encore sur FlatList sans memoization |
| **Reanimated 3** | Animations UI thread worklets (55-60fps vs 30-45) | Usage partiel à auditer |
| **Expo Router v7** native Stack API | Header natif déclaratif, meilleure transition | Utilise API legacy |
| **Native Tabs** (Material 3) | Tab bar native, dynamic colors Android | Tab bar custom JS |
| **Apple zoom transitions** | Shared element gesture-driven | Non utilisé |

Références :
- [FlashList v2 Shopify](https://shopify.engineering/flashlist-v2)
- [RN New Architecture 2026](https://www.agilesoftlabs.com/blog/2026/03/react-native-new-architecture-migration)
- [Expo Router v55/v7](https://expo.dev/blog/expo-router-v55-more-native-navigation-more-powerful-web)

**Objectif** : Exploiter New Architecture sur les chemins critiques (liste messages, animations chat, navigation). Target : **+30% perf perçue** (mesurée objectivement via RN DevTools Performance).

## Actions

### 1. Baseline perf (avant tout changement)

Instrumenter et mesurer sur **2 devices réels** (iPhone 12 mid-range + Pixel 6 entry) :

Métriques :
- Cold start (time to first screen)
- Time-to-interactive chat session
- FPS scroll `ChatMessageList` avec 50/100/200 messages
- FPS animations transition entre screens
- Memory peak pendant 5 min d'usage intense
- Frame drop count sur ouverture keyboard

Outils :
- RN DevTools Performance (new in 0.83)
- React DevTools Profiler
- Flashlight.dev (optionnel, mesure FPS Android)
- Xcode Instruments / Android Profiler

Résultats dans `docs/plans/reports/P12-baseline.md`.

### 2. Migration `ChatMessageList` FlatList → FlashList v2

```bash
cd museum-frontend
npm install @shopify/flash-list
```

Refactor `features/chat/ui/ChatMessageList.tsx` :

```tsx
// Avant
<FlatList
  data={messages}
  renderItem={({ item }) => <ChatMessageBubble message={item} />}
  keyExtractor={item => item.id}
/>

// Après
<FlashList
  data={messages}
  renderItem={({ item }) => <ChatMessageBubble message={item} />}
  keyExtractor={item => item.id}
  // FlashList v2 : plus besoin de estimatedItemSize (sync layout)
  // Possibilité de getItemType pour recycler par type (user vs assistant)
  getItemType={item => item.role}
/>
```

Post P08 : `ChatMessageBubble` est memoïsé (`React.memo`), le recyclage FlashList est efficace.

Bonus : `ViewabilityConfig` pour déclencher actions (mark as read, analytics) uniquement sur messages visibles.

### 3. Audit animations → Reanimated 3

Grep les usages d'animations :
```bash
grep -rn "Animated\." --include="*.tsx" features/ shared/ | head -30
grep -rn "useSharedValue\|useAnimatedStyle" --include="*.tsx" features/ shared/ | head -30
```

Classer :
- **OK** : déjà Reanimated 3 worklets
- **À migrer** : `Animated.Value` classique → `useSharedValue`
- **À réécrire** : animations JS-thread pures (setInterval, requestAnimationFrame)

Zones chaudes probables :
- `ChatInput` — typing indicator
- `ChatMessageBubble` — apparition stream
- Transitions navigation (si customisées)
- Onboarding carousel

Pour chaque animation migrée :
- Tester sur device bas de gamme
- Vérifier que le worklet n'accède pas au JS thread (interdits : `console.log`, async)

### 4. Expo Router v7 — Stack API native

Expo Router v7 (SDK 55) permet de déclarer le header natif dans les screens :

```tsx
// Avant
export default function ChatScreen() {
  return (
    <Stack.Screen options={{ title: 'Musaium', headerStyle: {...} }}>
      <View>...</View>
    </Stack.Screen>
  );
}

// Après (v7)
import { Stack } from 'expo-router';
export default function ChatScreen() {
  return (
    <View>
      <Stack.Screen
        options={{ title: 'Musaium' }}
        // Header natif, pas custom JS
      />
      ...
    </View>
  );
}
```

Audit tous les écrans `app/**/*.tsx` — migrer vers Stack.Screen moderne.

### 5. Native Tabs (si applicable)

Si le projet utilise un tab bar custom :

```tsx
// Avant : tab bar custom JS
// Après :
import { Tabs } from 'expo-router';
<Tabs
  screenOptions={{
    // Material Design 3 dynamic colors Android
    tabBarActiveTintColor: useDynamicColor('primary'),
  }}
>
  <Tabs.Screen name="home" />
  <Tabs.Screen name="conversations" />
</Tabs>
```

À faire uniquement si le design actuel tab bar peut être rapproché du style natif.

### 6. Apple zoom transitions (nice-to-have)

Pour les transitions museum card → museum detail :

```tsx
<Link href={`/museum/${id}`} zoom="expand">
  <MuseumCard />
</Link>
```

Iframe gesture-driven shared element sur iOS. Graceful degradation Android.

### 7. Memoization audit

Après P08, les composants chat sont structurés. Audit `React.memo`, `useMemo`, `useCallback` :

Règles :
- Composants enfants dans listes (FlashList) → `memo` obligatoire
- Props callbacks vers enfants mémoïsés → `useCallback` obligatoire
- Calculs coûteux dans render → `useMemo`
- Ne PAS `memo` si les props changent à chaque render (anti-pattern)

Outil : React DevTools Profiler "why did this render" pour détecter les re-renders inutiles.

### 8. Mesure après

Re-lancer la baseline sur mêmes devices, même scenario.

Objectifs chiffrés :
- FPS scroll `ChatMessageList` : +15-25%
- Cold start : -10-20% (via New Arch déjà actif mais exploité)
- Memory peak : -15%
- Frame drops : -50% sur scénarios critiques

Rapport : `docs/plans/reports/P12-after.md` avec tableau avant/après.

### 9. EAS build vérification

Après refactors majeurs :
```bash
# Dev build
eas build --profile development --platform all
# Test sur devices physiques

# Preview build
eas build --profile preview --platform all
```

## Verification

```bash
cd museum-frontend

# FlashList utilisé
grep -rn "from '@shopify/flash-list'" features/
# attendu: au moins ChatMessageList

# Reanimated 3 patterns
grep -rn "useSharedValue\|useAnimatedStyle" features/ | wc -l
# attendu: en hausse vs baseline

# Expo Router v7 Stack.Screen
grep -rn "Stack.Screen" app/ | wc -l

# Tests verts
npm test
npm run lint

# Performance report généré
ls docs/plans/reports/P12-*.md

# Builds EAS OK
# (vérifier dashboard EAS après run)
```

## Fichiers Critiques

### À modifier
- `museum-frontend/features/chat/ui/ChatMessageList.tsx` (FlatList → FlashList)
- `museum-frontend/features/chat/ui/ChatInput.tsx` (animations typing)
- `museum-frontend/features/chat/ui/ChatMessageBubble/*.tsx` (memoization après P08)
- `museum-frontend/app/**/*.tsx` (Stack.Screen natif progressif)
- `museum-frontend/app/(tabs)/_layout.tsx` (si Native Tabs)
- `museum-frontend/package.json` (+@shopify/flash-list)

### À créer
- `docs/plans/reports/P12-baseline.md`
- `docs/plans/reports/P12-after.md`
- `docs/plans/reports/P12-perf-comparison.md`

### À préserver
- Accessibility props (P09) — ne pas casser le a11y audit
- i18n strings — conserver toutes les clés
- Design system tokens — FlashList n'affecte pas le look

## Risques

- **Moyen** : FlashList v2 recyclage peut glitcher sur messages avec hauteurs très variables. Mitigation : `getItemType` bien séparé user/assistant + tests scroll intensif.
- **Moyen** : migration Animated.Value → useSharedValue peut introduire des régressions subtiles (timing, easing). Mitigation : tests visuels manuels + vidéo comparaison.
- **Faible** : build EAS lourd. Mitigation : profiter d'un créneau CI calme.

## Done When

- [ ] Baseline perf documentée (2 devices)
- [ ] `ChatMessageList` migré FlashList v2
- [ ] Animations chat sur Reanimated 3 UI thread
- [ ] `Stack.Screen` natif adopté sur écrans principaux
- [ ] Memoization audit appliqué (pas de re-render gratuit)
- [ ] Mesures après documentées avec deltas chiffrés
- [ ] +15% FPS scroll minimum sur `ChatMessageList`
- [ ] -10% cold start minimum
- [ ] Aucune régression a11y / i18n
- [ ] EAS dev + preview builds OK
