# NL-2 — Mobile Perf V2 (P12) — Code-possible portions

**Date** : 2026-04-17
**Sprint** : NL-2 Phase 3 launch
**Effort réel** : ~1h (vs 10-15j plan original — majorité déjà faite + reste device-dependent)

## Reality check vs plan P12

Le plan P12 présumait des migrations manquantes (FlashList v2, Reanimated 3, Expo Router v7, React Compiler). Audit empirique :

| Item | Plan présumé | Réalité |
|---|---|---|
| FlashList v2 | à migrer | **déjà migré** dans ChatMessageList, conversations, MuseumDirectoryList (Technical Polish 2026-03-26 + Prod Hardening) |
| Reanimated 3 | audit à faire | **3 fichiers** utilisent déjà worklets ; 4 restent sur Animated.Value avec `useNativeDriver: true` (déjà UI thread — migration ROI négligeable) |
| Expo Router v7 Stack.Screen | à migrer | **déjà compliant** : root layout utilise `<Stack.Screen options={...} />` natif, 0 legacy `navigation.setOptions` |
| React Compiler | à activer | **déjà actif** via `babel.config.js` (babel-plugin-react-compiler) |
| Memoization | manuelle à faire | **automatique** via React Compiler + manual `memo()` sur composants chat (TP-04→08) |
| Native Tabs | à évaluer | Pas applicable ici — tab bar custom avec BlurView est volontairement stylisé (liquid glass design identity) |

Le plan P12 était sur-prescriptif. La vraie dette résiduelle était 3 fichiers `FlatList` non migrés + absence de `getItemType` sur 2 FlashList.

## Fix appliqué (NL-2 code-possible)

### 3 fichiers FlatList → FlashList

1. **`app/(stack)/tickets.tsx`** — paginated list (PAGE_LIMIT=15) → FlashList sans `estimatedItemSize` (v2 sync layout)
2. **`app/(stack)/reviews.tsx`** — infinite scroll reviews → FlashList + séparateur hoisted (`ReviewSeparator` vs inline)
3. **`app/(stack)/ticket-detail.tsx`** — messages thread → FlashList + `FlashListRef<TicketMessageDTO>` + `scrollToEnd` compatible

### 2 `getItemType` ajoutés pour recyclage optimisé

1. **`ChatMessageList.tsx`** — `getItemType={item => item.role}` (user vs assistant vs system)
2. **`ticket-detail.tsx`** — `getItemType={item => item.senderRole}` (visitor vs staff)

Benefit : quand FlashList recycle un item, il réutilise une view du même type (bubble user ↔ user, staff ↔ staff) → évite re-layout inter-types.

### Fichiers conservés en FlatList (intentionnel)

- **`onboarding.tsx`** — horizontal pager avec `horizontal + pagingEnabled + ViewToken` — FlashList v2 ne supporte pas toutes les options de paging horizontal snap.
- **`__tests__/helpers/test-utils.tsx`** — mocks de test.

## Items documentés device-dependent (NON actionable en autonome)

### NL-2.1 Baseline perf (2 devices physiques)

Nécessite :
- iPhone mid-range (iPhone 12/13) + Pixel 6 entry
- RN DevTools Performance + Xcode Instruments + Android Profiler
- Scenarios : cold start, chat 50/100/200 messages scroll, transitions screens, keyboard open
- Métriques cibles : FPS, TTI, memory peak, frame drops

Protocole :
1. `eas build --profile preview --platform all`
2. Install sur les 2 devices
3. Lancer scenario baseline (fixture 200 messages)
4. Noter : cold start (ms), FPS scroll (moyen + P1%), memory peak (MB), frame drop count
5. Rapport dans `docs/plans/reports/NL-2.1-baseline.md`

### NL-2.5 After-measure

Même protocole post-migrations (déjà faites en NL-2). Attendu : FlashList `getItemType` doit montrer amélioration marginale sur scroll mixte (user↔assistant alternating).

### Reanimated 3 migration Animated.Value restants

4 fichiers à migrer SI une baseline montre un dégradation FPS sur :
- `ChatMessageBubble.tsx` — cursor blink (Animated.loop)
- `DailyArtCard.tsx` — fade-in (Animated.timing)
- `ImageCarousel.tsx` — fade-in (Animated.timing)
- `SwipeableConversationCard.tsx` — gesture-handler Animated (3rd party) — non migratable sans remplacer lib

Recommandation : **pas de migration préventive**. `useNativeDriver: true` met déjà ces animations sur UI thread. Gain attendu < 2%, risque > 0%. Attendre mesures réelles avant action.

### Apple zoom transitions (nice-to-have)

Non appliqué : nécessiterait tests utilisateurs iOS pour valider l'UX shared element. Reporté v1.1.

## Métriques

| Mesure | Avant | Après | Delta |
|---|---|---|---|
| Fichiers FlatList (production) | 4 | 1 (onboarding intentionnel) | -3 |
| FlashList avec `getItemType` | 1 | 3 | +2 |
| Composants Animated.Value legacy | 4 | 4 (stable, justified) | 0 |
| Tests jest | 1120 | 1120 | 0 (0 régression) |
| Lint errors | 0 | 0 | 0 |

## Done When (partial — le reste device-dependent)

- [x] FlashList migration 100% sur les listes éligibles (3 fichiers)
- [x] getItemType ajouté sur chat + ticket-detail (recyclage optimisé)
- [x] Reanimated audit réalisé + rationale "pas de migration préventive"
- [x] Expo Router v7 Stack.Screen verifié compliant (0 legacy)
- [x] React Compiler actif (verifié via babel.config.js)
- [x] Memoization audit : React Compiler + memo() existants suffisent
- [x] 0 régression tests
- [ ] NL-2.1 baseline sur devices physiques (dépendance humaine)
- [ ] NL-2.5 after-measure comparatif (dépendance humaine)
- [ ] EAS dev + preview builds sur devices (dépendance humaine)

## Conclusion

80% du P12 était soit déjà fait, soit non-applicable, soit device-dependent. Ce qui était code-possible (3 migrations FlashList + 2 getItemType) est fait avec 0 régression. Les items restants nécessitent accès device physique et ne sont pas bloquants pour la continuité du sprint.
