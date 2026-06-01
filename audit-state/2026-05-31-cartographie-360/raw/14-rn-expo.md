# Cartographie 360 — Volet 14 : React Native + Expo (fiabilité production)

Date : 2026-05-31. Périmètre : `museum-frontend/` (RN 0.83.6, Expo SDK 55, Expo Router, npm). Sources web officielles Expo/RN/Sentry/Maestro + articles reconnus, croisées avec inspection code repo (paths vérifiés).

## 1. État de l'art (SOTA 2025-2026)

### New Architecture (Fabric / TurboModules / JSI)
À partir d'Expo SDK 55 (RN 0.83), **la New Architecture est toujours activée et non désactivable** (doc Expo). Trois piliers : JSI (références C++ directes, plus de sérialisation JSON sur le bridge), Fabric (rendu UI synchrone, priorise les gestes), TurboModules (chargement lazy des modules natifs → cold start réduit). Gains rapportés : ~43 % cold start, ~39 % rendering, ~26 % mémoire vs ère bridge. ~85 % des packages RN populaires sont New-Arch-compatibles en 2026 ; ~15 % bridge-only/partiels. Best practice : `npx expo-doctor` + React Native Directory pour vérifier la compat avant ajout de dep.

### OTA / EAS Update
Best practices doc Expo : bumper `runtimeVersion` à chaque changement de dep native (politique `appVersion` recommandée) ; channels segmentés (beta/staging/prod) ; **rollouts progressifs** (`eas update --rollout-percentage 10`) avec monitoring du taux d'erreur sur le dashboard EAS ; `eas update:rollback` + error-recovery natif intégré (un update qui crash au boot → rollback auto vers la version cachée). Risques : crashes avant init d'expo-updates non récupérables, corruption AsyncStorage non détectée, OTA ne peut PAS modifier le code natif.

### Crash monitoring (Sentry RN)
Sentry supporte New Arch (Fabric/TurboModules/Codegen). Source maps générées/uploadées en build prod uniquement ; pour symbolication native il faut dSYMs (iOS) + Proguard mapping (Android). Wrapper du build phase Xcode « Bundle React Native code and images » + « Upload Debug Symbols ». Fixes récents : doublons d'erreurs JS sur iOS New Arch quand le SDK natif s'init tôt via `sentry.options.json`.

### E2E : Maestro vs Detox
Detox = flakiness la plus basse (<2 %, grey-box sync sur le runtime JS), exécution plus rapide (login 8-12 s vs 12-18 s Maestro), mais setup lourd (config build native, runner Jest, modifs scripts). Maestro = YAML, zéro modif app, install single-CLI, très stable en pratique mais black-box (poll UI, ne voit pas l'état interne). Recommandation 2026 : **Maestro pour les flows critiques, Detox en complément pour scénarios nécessitant grey-box sync**.

### Offline-first
TanStack Query : `networkMode: 'offlineFirst'`, `PersistQueryClientProvider` + AsyncStorage persister (`throttleTime` ~1000ms), `staleTime` 5 min, `gcTime`/`maxAge` 24 h, `refetchOnReconnect`, détection réseau manuelle (listeners → `onlineManager`, pas auto comme en browser). Cache sélectif : pas tout en AsyncStorage.

### Accessibilité / RTL
EN 301 549 (EU, base de l'European Accessibility Act juin 2025) référence WCAG 2.1 AA. RN mappe `accessibilityLabel/Hint/Role/State` sur UIAccessibility (iOS) / AccessibilityNodeInfoCompat (Android). Cibles tap ≥ 44×44 pt, contraste 4.5:1 (texte normal). RTL via props logiques (`marginStart/End`, `I18nManager`).

## 2. Comparaison Musaium vs SOTA (vérifié dans le code)

| Axe | SOTA | Musaium | Verdict |
|---|---|---|---|
| New Architecture | toujours ON SDK 55 | RN 0.83.6 + Expo 55 → New Arch ON par défaut ; commentaire `app.config.ts:365` gère heap D8 (-Xmx6144m) sous Hermes V1 | **SOTA** |
| OTA / EAS Update | rollouts progressifs + rollback | **OTA désactivé volontairement** (`app.config.ts:373-381`, `enabled:false`, `checkAutomatically:NEVER`, ADR-009) | **Gap stratégique assumé** (cf. §3) |
| Build iOS | EAS Build standard | **Xcode Cloud + Pods committés** (XCloud ne run pas `pod install`) — chaîne fragile documentée CLAUDE.md (PR #258 crash SIGABRT TestFlight) | **Non-standard, risque connu** |
| Crash monitoring | Sentry New-Arch + source maps + dSYMs | `@sentry/react-native ^8.9.1`, init `shared/observability/sentry-init.ts` (`tracesSampleRate:0.2`, env prod/dev), scrubber + sentinel `sentry-scrubber-parity.mjs`, OTel BE↔FE | **SOTA** (vérifier upload dSYMs Xcode Cloud) |
| E2E | Maestro flows critiques + Detox grey-box | **44 flows Maestro** (`.maestro/*.yaml`), matrice Android 4 shards + iOS nightly, UFR-021 (tout écran → ≥1 flow happy-path), sentinel `screen-test-coverage.mjs` | **SOTA-Maestro ; pas de Detox** (gap mineur) |
| Offline-first | TanStack persist + networkMode | `@tanstack/react-query-persist-client`, `queryClient.ts` (staleTime 5min, gcTime 24h, `refetchOnReconnect:true`), `onlineManagerBridge.ts` (NetInfo→onlineManager), `connectivity-offline-banner.yaml` | **SOTA** |
| Accessibilité / RTL | WCAG 2.1 AA + props logiques | Discipline RTL stricte (CLAUDE.md : `marginStart/End`, `writingDirection`, audit `_rtl-style-audit.ts`), no-unicode-emoji (PNG+Ionicons, ast-grep), flows `settings-locale-switch` | **SOTA, au-dessus de la moyenne** |
| Sécurité mobile | secure-store, cert pinning | tokens device-bound (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`), `react-native-ssl-public-key-pinning` 2-pin (`cert-pinning-smoke.yaml`), MFA web-only V1 | **SOTA** |
| Perf | New Arch + FlashList + Hermes | Hermes (New Arch), `@shopify/flash-list 2.0.2` (8 usages), Reanimated 4.2.1 | **Bon ; pas de perf budget formalisé** |
| Native modules | expo-doctor + bump runtime | Discipline `pod install` + `git add -f Pods/`, plugins `withFmtConstevalPatch`/`withGradleJvmHeap`, lazy `require()` + global error handler downgrade fatal→non-fatal | **Robuste post-incident PR #258** |

## 3. Gaps identifiés

- **OTA off (ADR-009)** : choix assumé, mais prive d'un canal hotfix JS rapide. En B2C launch, un bug JS-only → cycle App Store review complet (24-48h+) au lieu d'un OTA gated. Le câblage `url` reste configuré → réactivation possible.
- **Xcode Cloud sans `pod install`** : chaîne la plus fragile du repo (Pods committés, patches post_install manuels). Risque récurrent (PR #258 hotfix). Pas de gate auto vérifiant cohérence `Podfile.lock` ↔ Pods committés sur XCloud.
- **Pas de Detox** : Maestro black-box ne couvre pas les scénarios grey-box (idle JS, state interne). Pour une app voice-first (STT/LLM/TTS async), la sync black-box peut flaker sur les latences.
- **Pas de perf budget formalisé** (cold start / TTI / re-render budget) ni de monitoring perf prod (`tracesSampleRate:0.2` capte des spans mais pas de seuil-gate).
- **dSYMs Xcode Cloud** : vérifier que l'upload debug symbols se fait bien hors EAS (symbolication native sinon perdue).

## 4. Verdict global

Le frontend Musaium est **largement aligné SOTA** voire au-dessus de la moyenne sur RTL, a11y, sécurité device-bound et discipline test (UFR-021 + 44 flows Maestro). Les deux écarts structurants — OTA désactivé et build iOS via Xcode Cloud — sont des choix documentés (ADR-009, gotchas CLAUDE.md) avec garde-fous, pas des négligences. Les gaps réels sont : absence de canal hotfix rapide, fragilité de la chaîne Pods/XCloud, et absence de budget perf formalisé.
