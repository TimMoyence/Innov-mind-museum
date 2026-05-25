# Audit KISS/DRY — museum-frontend (mobile)

**Run ID** : `2026-05-23-frontend-dry-audit`
**Date début** : 2026-05-23
**Scope** : `museum-frontend/` uniquement (mobile RN/Expo). Backend + web hors scope.
**Mode** : audit read-only. AUCUNE modification de code. Output = recommandations consolidées.
**Déclencheur** : autre agent a signalé « 5 modals standalone réimplémentent chacun leur dismiss ».

## Hypothèses confirmées par l'inventaire pré-audit

- ✅ Pattern `BottomSheetRouter` centralisé existe (`features/chat/ui/bottom-sheet-router/`)
- ✅ 5 modaux/sheets standalone identifiés hors router :
  1. `features/chat/ui/ArtworkHeroModal.tsx`
  2. `features/chat/ui/ImageFullscreenModal.tsx`
  3. `features/auth/ui/BiometricSetupSheet.tsx`
  4. `features/museum/ui/MuseumSheet.tsx`
  5. `features/paywall/ui/QuotaUpsellModal.tsx`
- ✅ Primitives partagées présentes dans `shared/ui/` : à vérifier l'adoption

## Méthodologie

1. **Wave 1** (4 Explore agents //) : inventaire par axe → liste exhaustive des candidats à duplication
2. **Wave 2** (4 Explore agents //) : deep-dive par cluster confirmé, `gitnexus_context` sur fonctions suspectes
3. **Synthèse** : tableau final duplications avec criticité (Critical/High/Medium/Low) + proposition refacto KISS

## Axes Wave 1

| Axe | Question clé | Agent | Statut | Verdict |
|---|---|---|---|---|
| A1 | Modals/dismiss : pattern dupliqué ? | A1 | ✅ done | **CONFIRMED** — 7 standalone (5 + 2 non listés) |
| A2 | Formulaires : FormInput adoption, validation, submit | A2 | ✅ done | **HIGH** duplication |
| A3 | États loading/error/empty : primitives consommées ? | A3 | ✅ done | **HIGH** loading seulement (empty+error excellents) |
| A4 | API hooks : duplication client/retry/error | A4 | ✅ done | **MEDIUM** (couche centrale solide, 2 outliers) |

---

## Findings Wave 1

### A1 — Modals & dismiss → **CONFIRMED + amplified**

**Claim "5 modals" CONFIRMÉE, mais en réalité 7 standalone existent** (l'autre agent a raté 2 cas) :

| # | Fichier | Backdrop | Animation | Effort migration | Risque |
|---|---|---|---|---|---|
| 1 | `features/chat/ui/ArtworkHeroModal.tsx:65-68` | None | Reanimated pinch-zoom | **L** | Med (gesture compound) |
| 2 | `features/chat/ui/ImageFullscreenModal.tsx:98-105, 142` | None | PanResponder swipe + scale | **M** | Med (carousel + dismiss) |
| 3 | `features/auth/ui/BiometricSetupSheet.tsx:58-76, 119, 153` | Animated opacity | translateY + opacity (Animated.Value) | **S** | Low |
| 4 | `features/museum/ui/MuseumSheet.tsx:42-63` | Pressable inline | Aucune | **S** | Low |
| 5 | `features/paywall/ui/QuotaUpsellModal.tsx:90-99, 170, 176` | None | animationType="slide" RN | **S** | Low (R28 blocking spec) |
| **6** | `features/chat/ui/SourceCitation.tsx:42, 68-74, 76` (**non listé initialement**) | Pressable inline | animationType="slide" RN | **S** | Low |
| **7** | `features/.../OfflinePackPrompt.tsx:135-159` (**non listé initialement**) | Pressable inline | Aucune | **S** | Low |

**Pattern central existant** : `features/chat/ui/bottom-sheet-router/{BottomSheetRouter.tsx:48-167, BottomSheetContainer.tsx:71-312, BottomSheetBackdrop.tsx:27-67}` — store module-level, reducer `idle|opening|open|closing`, animation 180ms, swipe-down PanResponder threshold 50 %, BackHandler Android, focus restoration via `AccessibilityInfo.setAccessibilityFocus`.

**Consolidation possible** : 5/7 triviaux (3-4 j combinés), 1/7 medium (ImageFullscreen, 1 sem), 1/7 défer V1.1 (ArtworkHero pinch-zoom). **Gain ~400 LOC.**

### A2 — Formulaires → **HIGH**

**Adoption FormInput partielle** :
- ✅ 3 fichiers : `LoginForm.tsx:46-77`, `RegisterForm.tsx:47-133`, `auth.tsx:239-259` (avec react-hook-form + Controller + Zod)
- ❌ 7+ fichiers TextInput brut : `MfaChallengeScreen.tsx:77-86`, `MfaEnrollScreen.tsx:167-176`, `change-email.tsx:~70-95`, `change-password.tsx`, `reset-password.tsx`, `create-ticket.tsx:105-125`, `reviews.tsx:~60-85`, `ChatInput.tsx:62-79`, `ConversationSearchBar.tsx`

**3 clusters de duplication** :

- **C1 — `useState + try/catch + error` submit handler** (6 fichiers byte-for-byte similar) : `change-email.tsx:29-39`, `create-ticket.tsx:55-70`, `reviews.tsx:63-74`, `MfaChallengeScreen.tsx:49-67`, `MfaEnrollScreen.tsx:60-86`. Différences = noms de variables + path success. Structure identique.
- **C2 — TextInput styling theme inline** (7 fichiers) — chaque écran ré-applique `color/backgroundColor/borderColor` depuis theme. `FormInput.tsx:146-160` encapsule déjà.
- **C3 — Error text inline render sans a11y alert role** (5 fichiers) : `{error ? <Text style={styles.errorText}>{error}</Text> : null}`. FormInput le fait en `:162-171` avec alert role.

**Validation** :
- Zod centralisé : siloed `authFormSchema.ts` (auth seulement)
- Ad-hoc trim+length : `create-ticket`, `reviews`, MFA
- **AUCUNE validation** : `change-email`, `change-password`, `reset-password`, `ConversationSearchBar` (high severity)

**Plan** : extract `useFormSubmit<T>(schema, onSubmit)` hook + adoption FormInput partout + 3 schémas partagés (`emailSchema`, `passwordSchema`, `requiredTextSchema`). Effort **M**.

### A3 — États (loading / error / empty) → **HIGH (loading seulement)**

**Excellent state — primitives `shared/ui/` largement adoptées** :
- `EmptyState` : 6/6 écrans liste (100 %)
- `ErrorState` : 11/11 écrans (`conversations.tsx:225-234`, `home.tsx:155-164`, `MuseumSheetEnrichmentBody.tsx:172-180`, `TicketsListView.tsx:140`, etc.)
- Skeleton* : adoption OK (chat bubbles, museum directory)

**MAIS hotspot loading** : 20 fichiers utilisent `<ActivityIndicator>` brut :
- **Cluster L1 — Settings cards ternary** (anti-pattern majeur) : 8 fichiers ré-implémentent `{isLoading ? <ActivityIndicator color={theme.primary} /> : <Switch />}` — `SettingsPrivacyCard.tsx:29-30`, `SettingsAiConsentCard.tsx:149-150, 165`, `SettingsAccessibilityCard.tsx:29-30`, `CityPackRow.tsx:37-42`, `OfflineMapsSettings.tsx:74-75, 89-90`, `ContentPreferencesCard.tsx:82`, `SettingsDangerZone.tsx:37`
- **Cluster L2 — Loading button label** (acceptable) : `conversations.tsx:136-142`, `home.tsx:178-185`, `MfaEnrollScreen.tsx:116, 188`. Idiom RN, no primitive needed.
- **Cluster L3 — Skeleton list loader** : `MuseumDirectoryList.tsx:45-56` — 1 instance d'un wrapper `Array.from + SkeletonConversationCard`, à standardiser.

**Plan** : extraire `<LoadingToggleCard />` (S, 2-3 h, élimine 8 duplications) + `<SkeletonListLoader variant count />` (S, 1-2 h). Pas d'autre intervention nécessaire.

### A4 — API hooks → **MEDIUM**

**Couche centrale solide** :
- `shared/api/httpRequest.ts` (Axios + auth header + token refresh + retry exponentiel + 429 backoff + AbortSignal)
- `shared/api/openapiClient.ts` (path param + query encoding type-safe)
- `shared/infrastructure/httpClient.ts` (15 s timeout, 10 MiB limits, 402 paywall handler)
- TanStack React Query v5 + zustand
- **47 imports** depuis features (`features/{feature}/infrastructure/...Api`) — adoption excellente

**Outliers (BLOCKER hexagonal)** :
- `features/settings/application/useMemoryPreference.ts:3-4, 17-20` — importe `openApiRequest` directement dans le hook applicatif (saute l'infra service)
- `features/chat/application/thirdPartyAiConsent.ts:1, 81-85` — importe `httpRequest` directement

**Clusters secondaires** :
- **API1 — Manual state vs useAppQuery** : `useMemoryPreference.ts:12-35`, `useDailyArt.ts:23-63`, `useReviews.ts:23-63`, partiel `useMuseumDirectory.ts:100-269` — `useState + useEffect + cancelled flag` au lieu de l'AbortSignal natif de TanStack
- **API2 — Error mapping inconsistent** : `useReviews.ts:50-56` explicite `createAppError`, `useDailyArt.ts:51-53` silent-fail, `useMemoryPreference.ts:27-30` silent-fail
- **API3 — Type-safety partielle** : `thirdPartyAiConsent.ts` maintient `ConsentRow`, `GrantConsentResponse` à la main (raison documentée : OpenAPI BE n'expose pas encore l'endpoint)

**Plan** : extract `memoryPreferenceApi.ts` + `consentApi.ts` (infrastructure layer) + migration `useDailyArt`/`useReviews` vers `useAppQuery`. Effort **M (2-3 h)**.

---

## Synthèse Wave 1 — duplications par criticité

| Cluster | Severity | Effort | Risque | Sprint |
|---|---|---|---|---|
| A1 — 5 modaux standalone triviaux → BottomSheetRouter | **High** (LOC + a11y) | S×5 = 3-4 j | Low | NOW |
| A1 — ImageFullscreenModal carousel → router | Medium | M (1 sem) | Med | NEXT |
| A1 — ArtworkHeroModal pinch-zoom | Low | L | Med | DEFER V1.1 |
| A2 — useState+try/catch submit (×6) → useFormSubmit | **High** (regression risk) | M | Low | NEXT |
| A2 — Bare TextInput → FormInput | Medium | S | Low | NEXT |
| A2 — Schémas Zod partagés | **High** (sécurité) | S | Low | NOW |
| A3 — Settings cards LoadingToggleCard | Medium | S | Low | NEXT |
| A3 — SkeletonListLoader | Low | S | Low | LATER |
| A4 — useMemoryPreference/thirdPartyAiConsent hexagonal violation | **High** (architecture) | S | Low | NOW |
| A4 — useDailyArt/useReviews → useAppQuery | Medium | M | Low | NEXT |

**Total estimé pour résoudre les High (NOW)** : ~5-6 jours solo (calibrage `feedback_no_solo_dev_estimates` appliqué — sur-estimation potentielle ~30 %, donc fourchette réelle 3.5-5 j).

---

## Wave 2 — deep-dive plan (4 axes parallèles)

Objectif : valider rigoureusement les hypothèses Wave 1 avant de recommander une refacto. Chaque agent fresh-context utilise `gitnexus_context` + Read pour vérifier le **callgraph** des fonctions cibles.

| Axe W2 | Question | Cible | Risque "faux positif" si pas vérifié |
|---|---|---|---|
| **D1** — Modal migration feasibility | Chacun des 7 modaux peut-il vraiment migrer vers BottomSheetRouter sans casser un comportement métier (R28 blocking, focus a11y, pinch-zoom, carousel swipe) ? | 7 modaux + BottomSheetRouter routes | Annoncer "faisable S" mais découvrir un coupling gesture/animation critique |
| **D2** — `useFormSubmit` extraction | Les 6 fichiers C1 partagent-ils VRAIMENT la même structure ? Les success paths (`Alert.alert` vs `router.replace` vs `setSuccess + Haptics`) sont-ils paramétrables ? | 6 fichiers C1 + auth handlers | Annoncer "byte-for-byte" mais découvrir 3 variantes incompatibles |
| **D3** — `LoadingToggleCard` extraction | Les 8 settings cards partagent assez de structure pour être absorbés par un seul composant ? Theme color variations + a11y labels uniformes ? | 8 settings cards | Annoncer "1 composant suffit" mais découvrir 3 variantes |
| **D4** — Hexagonal violations exhaustifs | Au-delà des 2 outliers identifiés, y a-t-il d'autres `openApiRequest`/`httpRequest` directs dans `application/` ou `ui/` ? gitnexus_context sur les 2 symboles pour callgraph complet. | `openApiRequest`, `httpRequest`, leurs importers | Manquer une violation, livrer une PR incomplète |

Lancement Wave 2 en parallèle (4 Agent calls) à la prochaine étape.

---

## Findings Wave 2

> **Verdict global Wave 2** : Wave 1 était **systématiquement optimiste**. Les 4 deep-dives ont tous révisé l'effort/risque à la hausse. C'est la valeur du double-pass — Wave 1 fait du grep syntaxique (rapide), Wave 2 fait du callgraph+lecture intégrale (sémantique).

### W2-D1 — Modal migration : 3 blockers cachés + 3 API extensions requises

**Couverture Maestro : 0/7 modaux** → **violation UFR-021 critique** à corriger AVANT migration.

| Modal | Wave 1 → Wave 2 | Blockers cachés |
|---|---|---|
| ArtworkHero | L defer → **L defer (confirmé)** | Reanimated worklet pinch-zoom dans router non testé ; Modal RN window séparée → GestureHandlerRootView local L111 |
| ImageFullscreen | M → **H (gesture conflict)** | PanResponder horizontal (nav prev/next L84-131) vs PanResponder vertical du router (L187-189) : **2 handlers concurrents sur même View**, priorité non documentée |
| BiometricSetup | S → **M (lifecycle)** | State reset on unmount nécessite hook router non existant |
| MuseumSheet | S → **M (BackHandler doublure)** | 2 listeners BackHandler concurrents (L42-48 + Container L168-176) |
| QuotaUpsell | S → **S+ext** | Spec R28 blocking dynamique : routes.ts ne supporte que `blocking: boolean` static → besoin setter `setBlocking(bool)` |
| SourceCitation | S → **S confirmé** | Aucun |
| OfflinePack | S → **M** | Multi-état rendering (accept/decline/error/progress/complete) |

**3 API extensions requises sur BottomSheetRouter** :
1. `useBottomSheetRouter().setBlocking(bool)` dynamique pendant submit (QuotaUpsell R28 GDPR)
2. `onClose` lifecycle callback pour state reset (QuotaUpsell `:90-99`, BiometricSetup `:58-76`)
3. Gesture priority resolution matrix (PanResponder nested children — ImageFullscreen)

**Recommandation révisée** :
- **NOW** : SourceCitation + MuseumSheet + BiometricSetup + OfflinePack (4 modaux, ~5-6h)
- **NEXT** (+ router extension) : QuotaUpsell (R28 dynamic blocking, ~2-3h router amendment + 2h modal)
- **DEFER post-launch** : ImageFullscreen (PoC gesture priority, ~1 sem), ArtworkHero (Reanimated worklet test, ~1 sem)

### W2-D2 — useFormSubmit : Wave 1 RÉFUTÉE — recommandation pivote vers react-hook-form

**Wave 1 a dit "byte-for-byte similar, 3h"** → **Wave 2 dit "4/7 fichiers réellement compatibles, 2-2.5 semaines"**.

| Fichier | Verdict W2 | Raison |
|---|---|---|
| `change-email.tsx` | ✅ compatible | Skeleton standard |
| `change-password.tsx` | ✅ compatible | Skeleton standard + validation length+match |
| `create-ticket.tsx` | ✅ compatible | Skeleton + `Alert.alert` success (paramétrable via `onSuccess`) |
| `MfaChallengeScreen.tsx` | ✅ compatible | Skeleton + mode toggle (totp/recovery) paramétrable |
| `reviews.tsx` | ❌ **incompatible** | Hook `submitReview` retourne `bool`, pas Promise — couche existante |
| `MfaEnrollScreen.tsx` | ❌ **incompatible** | Workflow multi-step (Generate → QR → Verify) avec 2 submit handlers |
| `reset-password.tsx` | ❌ **incompatible** | State machine 3-branches (invalidToken / form / success) |

**Validation fragmentée** :
- Zod schema : 1 module seulement (`authFormSchema.ts`)
- Inline trim+length : 4 fichiers (create-ticket, reviews, MFA challenge, MFA enroll)
- AUCUNE validation client-side : 3 fichiers (`change-email`, `change-password` côté server, `reset-password` côté server, `ConversationSearchBar`) — **high severity sécurité/UX**

**Recommandation pivot** : au lieu d'extraire `useFormSubmit` custom (couvre 4/7), **généraliser le pattern react-hook-form + Zod déjà en production dans `LoginForm.tsx`/`RegisterForm.tsx`/`auth.tsx`**. Pros : (a) DRY validation + types depuis schema, (b) field-level errors via `fieldState`, (c) a11y meilleure (`aria-describedby` auto), (d) pattern déjà éprouvé.

Effort estimé : **1-2 semaines** pour migrer les 4 fichiers compatibles (schema + tests + review chaque), plus 1 sem post-merge pour `reviews.tsx` + `MfaEnroll.tsx` si on veut harmoniser (out-of-scope V1).

### W2-D3 — LoadingToggleCard : Wave 1 confirmée avec nuance

**5/8 cards compatibles** (Wave 1 disait 8/8 implicitement). Effort confirmé **S (2-3h)**, savings ~90-110 LOC.

| Card | Compatible | Variant nécessaire |
|---|---|---|
| `SettingsPrivacyCard.tsx:29-36` | ✅ Group A | default |
| `SettingsAccessibilityCard.tsx:29-36` | ✅ Group A | default |
| `OfflineMapsSettings.tsx:74-84` | ✅ Group A | default |
| `SettingsAiConsentCard.tsx:164-173` | ✅ Group B | `.Row` sub-component (per-scope) |
| `ContentPreferencesCard.tsx:81-89` | ✅ Group B | `.Row` sub-component (per-pref) |
| `CityPackRow.tsx:38-42` | ❌ | Progress percentage display + Pressable buttons (pas Switch) — fundamentally different |
| `SettingsDangerZone.tsx:36-42` | ❌ | Danger red button, indicator dans button (pas adjacent) |
| `SettingsSecurityCard.tsx:46-51` | ❌ | Utilise `disabled` prop natif, pas d'indicator swap (intentionnel UX biometric) |

API proposée : `<LoadingToggleCard title description value onValueChange isLoading variant>` + `<LoadingToggleCard.Row>` pour les listes.

### W2-D4 — Violations hexagonales : 6 au total (Wave 1 disait 2)

**Wave 1 a dit "2 outliers"** → **Wave 2 dit "6 fichiers, dont 4 nouveaux découverts"**.

| Fichier | Layer | Primitive | Endpoint | Sévérité |
|---|---|---|---|---|
| `features/settings/application/useMemoryPreference.ts:3` | application | `openApiRequest` | `/api/chat/memory/preference` | **CRITICAL** |
| `features/chat/application/thirdPartyAiConsent.ts:1` | application | `httpRequest` | `/api/auth/consent[/:scope]` | **CRITICAL** |
| `features/chat/application/useCompareImage.ts:24` | application | `httpClient` | POST `/api/chat/compare` | **HIGH** |
| `features/paywall/ui/QuotaUpsellModal.tsx:7` | **ui** | `httpClient` | POST `/api/leads/paywall-interest` | **HIGH** |
| `features/auth/ui/BiometricGate.tsx:8` | **ui** | `runAuthRefresh` | auth refresh | **HIGH** |
| `features/chat/application/useAiConsent.ts:2` | application | `AsyncStorage.*` direct | n/a (storage) | **HIGH** |

**Pattern à reproduire** : `authApi.ts`, `museumApi.ts` (one infrastructure service per feature, application/ui consomment depuis `@/features/<x>/infrastructure/`).

Effort révisé : **L (4-6h, 6 services à créer)** vs Wave 1 M (2-3h).

---

## Synthèse finale — duplications consolidées + plan refacto

### Tableau récapitulatif criticité

| Cluster | Wave 1 | Wave 2 | Sévérité finale | Effort | Pipeline |
|---|---|---|---|---|---|
| **Hexagonal violations** (6 fichiers) | M (2 fichiers) | **L (6 fichiers)** | 🔴 **CRITICAL** | ~5h | NOW (1 cycle UFR-022) |
| **Modaux NOW** (4/7 triviaux : SourceCitation, MuseumSheet, BiometricSetup, OfflinePack) | S×5 | S×4 + M×0 | 🟠 **HIGH** | ~5-6h | NOW (1 cycle UFR-022) |
| **QuotaUpsell + router extension** (R28 blocking + onClose lifecycle) | S | **S+ext** | 🟠 **HIGH** (GDPR R28) | ~4-5h | NOW (1 cycle UFR-022, router amendment) |
| **Schémas Zod partagés** (emailSchema, passwordSchema) + adoption sur 4 fichiers (change-email, change-password, reset-password, ConversationSearchBar) | S | **M** (réécrit le scope) | 🟠 **HIGH** (sécurité) | ~1 sem | NEXT |
| **LoadingToggleCard + 5 cards refacto** | S | S confirmé | 🟡 **MEDIUM** | ~2-3h | NEXT |
| **react-hook-form généralisation** (4 fichiers compatibles) | M | **L (2 sem)** | 🟡 **MEDIUM** | ~1-2 sem | NEXT (post-launch) |
| **ImageFullscreen migration** (PanResponder priority) | M | **H** | 🟢 **LOW** (déferable) | ~1 sem | DEFER V1.1 |
| **ArtworkHero migration** (Reanimated worklet) | L | L confirmé | 🟢 **LOW** | ~1 sem | DEFER V1.1 |
| **Maestro flows pour 7 modaux** (UFR-021 violation) | non détecté | **CRITIQUE** | 🔴 **CRITICAL** (UFR-021) | ~1 sem | **AVANT** migration modale |
| **useAiConsent AsyncStorage wrapping** | non détecté | nouveau finding | 🟡 **MEDIUM** | ~2h | NEXT |
| **SkeletonListLoader** (factorisation) | S | non re-audité W2 | 🟢 **LOW** | ~1h | LATER |

### Plan refacto en 3 vagues

**Vague NOW (V1 launch — semaines pré-2026-06-07)**
1. **C1** — Hexagonal violations (6 fichiers) → 6 nouveaux infrastructure services. ~5h. **UFR-022 obligatoire** (spec → plan → red → green → review).
2. **C2** — UFR-021 Maestro flows pour 7 modaux (happy path chacun) → bloque la migration mais aussi requis indépendamment.
3. **C3** — Migration 4 modaux triviaux (SourceCitation, MuseumSheet, BiometricSetup, OfflinePack) → ~6h.
4. **C4** — Router amendment (`setBlocking`, `onClose` lifecycle) + QuotaUpsell migration → ~5h.

**Vague NEXT (post-launch sprint juin-août, mois 1)**
5. **C5** — Schémas Zod partagés (`emailSchema`, `passwordSchema`, `requiredTextSchema`) + adoption sur 4 fichiers sans validation.
6. **C6** — LoadingToggleCard + refacto 5 settings cards.
7. **C7** — AsyncStorage wrapping pour `useAiConsent.ts`.

**Vague LATER (post-launch sprint, mois 2-3 OR DEFER V1.1)**
8. **C8** — Migration `ImageFullscreenModal` (PoC PanResponder priority + Maestro e2e gesture validation).
9. **C9** — Migration `ArtworkHeroModal` (PoC Reanimated worklet inside BottomSheetRouter).
10. **C10** — Généralisation react-hook-form + Zod (4 fichiers compatibles).
11. **C11** — SkeletonListLoader factorisation.

### Hypothèse révisée par l'audit

> L'agent précédent disait « 5 modals standalone réimplémentent chacun leur dismiss ».

✅ **Confirmé**. Mais l'audit a révélé que c'est seulement le **symptôme visible** d'un problème plus large :
- 7 modaux standalone (pas 5)
- 6 violations hexagonales (pas 2)
- 8 settings cards avec ternary ActivityIndicator (pas mentionné par l'autre agent)
- Validation client-side absente sur 4 fichiers critiques (sécurité)
- 0 Maestro flow sur 7 modaux (UFR-021 violation latente)

**Impact total estimé sur LOC** : ~600-800 lignes de duplication identifiées, refactorisables en ~2-3 semaines (incl. UFR-022 pipeline + tests).

### Honnêteté UFR-013 — limites de l'audit

- **Non vérifié** : compatibilité Reanimated worklet pinch-zoom dans BottomSheetRouter (requiert PoC runtime, pas analyse statique).
- **Non vérifié** : priorité réelle des `PanResponder` nested dans une vue parent qui en a un (RN docs silencieux, Maestro e2e nécessaire).
- **Non vérifié** : la liste exhaustive de fichiers utilisant `AsyncStorage` directement (recherche limitée aux `application/` et `ui/`).
- **À confirmer par dev** : `OfflinePackPrompt` path exact non confirmé par grep direct (à valider lors du cycle suivant).

---

## Exécution — /team UFR-022 enterprise-grade par cluster

**Lancée** : 2026-05-23.
**Mode** : full autonomy, fresh agent par phase (spec/plan/red/green/verify/security/review/documenter), commit par cluster sur `dev` directement, multi-instances en parallèle (pas de worktree), cross-review finale.

### Checklist d'exécution

Chaque cluster suit le pipeline UFR-022 unique (9 phases). État `team-state/RUN_ID/STORY.md` source de vérité fine-grained.

| # | Cluster | Spec | Plan | Red | Green | Verify | Security | Review | Commit | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| C1 | Hexagonal violations (6 fichiers, **absorbed C7**) | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ (APPROVED 92.7/100) | ☑ `f94291d4e` | **DONE** |
| C7 | AsyncStorage wrapping useAiConsent | – | – | – | – | – | – | – | – | **superseded-by-C1** |
| C2 | UFR-021 Maestro flows pour 7 modaux | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | pending |
| C3 | Migration 4 modaux triviaux → BottomSheetRouter | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | pending |
| C4 | Router amendment + QuotaUpsell migration | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | pending |
| C5 | Schémas Zod partagés + adoption 4 fichiers | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | pending |
| C6 | LoadingToggleCard + refacto 5 settings cards | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | pending |
(C7 row removed — superseded by C1 cluster which absorbed AsyncStorage violation #6)
| C8 | ImageFullscreenModal migration (PoC gesture) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | pending |
| C9 | ArtworkHeroModal migration (PoC Reanimated) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | pending |
| C10 | Généralisation react-hook-form + Zod (4 fichiers) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | pending |
| C11 | SkeletonListLoader factorisation | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | pending |
| **FINAL** | Cross-review globale (reviewer fresh sur diff total) | ☐ | – | – | – | – | – | – | – | pending |

### Trail audit (commits)

| # | Cluster | Commit SHA | Date | Files touched | LOC delta |
|---|---|---|---|---|---|
| C1 | Hexagonal violations + C7 absorbed | `f94291d4e` | 2026-05-23 | 38 (8 new src + 1 new domain + 8 new tests + 23 modified) | +1464 / -365 |

(rempli au fur et à mesure)
