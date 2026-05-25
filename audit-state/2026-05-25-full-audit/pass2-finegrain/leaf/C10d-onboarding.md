# C10d — ONBOARDING (first-launch) E2E trace

**Scope** : `museum-frontend/features/onboarding/` + route Expo + gate first-launch + permissions + consent + persistence + Maestro.
**Branch** : `dev` @ `1fb32f5ba`. Read-only, fresh-context (UFR-022).
**Verdict E2E** : flow atteignable et complet POUR un user authentifié — mais ce n'est PAS un "first-launch" au sens littéral (onboarding posé APRÈS auth, pas avant). Aucun dead-end. Ruptures = un Maestro flow stale shippé en CI + un hook orphelin.

---

## Santé E2E : 7/10

Le carousel V2 (Greeting → MuseumMode → CameraIntent → WalkIntent) est cohérent, persiste son état, route proprement vers home, i18n complet, a11y présent. Les points perdus : (1) un Maestro flow stale référençant l'ancienne implémentation 3-slides, actif dans `shards.json` → CI rouge ou faux-vert ; (2) hook `useTypewriter` orphelin ; (3) sémantique "first-launch" : onboarding est gated derrière l'authentification, donc un utilisateur tout neuf voit `/auth` AVANT le carousel — design assumé mais à noter.

---

## 1. Topologie de la feature

| Fichier | Rôle |
|---|---|
| `app/(stack)/onboarding.tsx:34` | `OnboardingScreen` — carousel FlatList 4 slides + Skip + Next/Get Started |
| `features/onboarding/application/useOnboarding.ts:4` | hook step machine (`currentStep`/`next`/`prev`/`goToStep`/`isLast`) |
| `features/onboarding/ui/GreetingSlide.tsx:12` | slide 1 (+ AI disclosure toast `ai_disclosure.onboarding_toast`) |
| `features/onboarding/ui/MuseumModeSlide.tsx:12` | slide 2 |
| `features/onboarding/ui/CameraIntentSlide.tsx:12` | slide 3 |
| `features/onboarding/ui/WalkIntentSlide.tsx:12` | slide 4 |
| `features/onboarding/ui/StepIndicator.tsx:12` | dots indicateur |
| `features/onboarding/application/useTypewriter.ts:25` | **ORPHELIN** — voir §6 |

Gate / persistence (hors `features/onboarding/`) :
- `features/auth/useProtectedRoute.ts:13` — guard de routing first-launch
- `features/auth/application/AuthContext.tsx` — `isFirstLaunch`, `markOnboardingComplete`
- `features/settings/infrastructure/userProfileStore.ts:31` — `hasSeenOnboarding` (zustand persist)
- `features/auth/infrastructure/authApi.ts:176` — `PATCH /api/auth/onboarding-complete`
- `features/settings/ui/SettingsComplianceLinks.tsx:81` — ré-entrée "Onboarding Help"

---

## 2. Flux d'entrée — comment on ATTEINT l'onboarding

**Trace réelle (pas "first-launch avant auth") :**

1. Cold start → `AuthContext` bootstrap (`AuthContext.tsx:152`). Si pas de refresh token → `setIsAuthenticated(false)` + `setIsFirstLaunch(true)` (`:160-161`).
2. `useProtectedRoute.ts:29` : `!isAuthenticated && !isAuthRoute` → `router.replace(AUTH_ROUTE)`. **Un user tout neuf est envoyé sur `/auth`, PAS sur l'onboarding.**
3. User s'inscrit/login → `loginWithSession` → `setIsFirstLaunch(!session.user.onboardingCompleted)` (`AuthContext.tsx:139`).
4. `useProtectedRoute.ts:34-41` : `isAuthenticated && isAuthRoute` → si `isFirstLaunch && !hasSeenOnboarding` → `router.replace(ONBOARDING_ROUTE)`, sinon `HOME_ROUTE`.
5. Fallback `:44-52` : authentifié + first-launch + flag local non posé + pas déjà sur onboarding → redirect onboarding.

**Conséquence** : l'onboarding est un écran **post-authentification réservé aux comptes neufs**. Le terme "first-launch" du brief ne correspond pas à un welcome AVANT signup — c'est un "first authenticated session". C'est volontaire (le serveur porte `onboardingCompleted` par user, pas un flag device-only), mais le carousel vend la camera/walk/museum-mode à quelqu'un qui a déjà franchi le mur d'inscription.

**Ré-entrée manuelle** : Settings → "Onboarding Help" → `onNavigate('/(stack)/onboarding')` (`SettingsComplianceLinks.tsx:81`). C'est le SEUL chemin déterministe pour re-voir le carousel une fois `hasSeenOnboarding=true` — les tests Maestro s'appuient dessus.

---

## 3. Permissions (location / camera / notif) — AUCUNE demandée à l'onboarding

`grep requestPermission* / requestForegroundPermissionsAsync / requestCameraPermissionsAsync / Notifications.requestPermissionsAsync` sur `features/onboarding/` + `onboarding.tsx` = **0 hit**.

Les permissions sont **deferred au point d'usage** (pattern correct iOS/Android moderne, évite le rejet App Store des prompts à froid) :
- Caméra / galerie → `features/chat/application/useImagePicker.ts:28,56` (`requestMediaLibraryPermissionsAsync` / `requestCameraPermissionsAsync`) avec fallback Alert → `Linking.openSettings()`.
- Localisation → `features/museum/application/useLocation.ts:66` (`Location.requestForegroundPermissionsAsync`).
- Notifications → aucune demande détectée nulle part (pas de push V1 — cohérent avec le scope).

**Évaluation "au bon moment"** : OUI. Camera demandée quand l'utilisateur tape "prendre une photo" dans le chat ; localisation quand le contexte géo est requis. Les slides `cameraIntent`/`museumMode`/`walkIntent` *expliquent* l'intention mais ne *déclenchent aucun* prompt — c'est le bon découplage. **Pas de rupture ici.**

---

## 4. Consent GDPR initial — NON posé dans l'onboarding (posé ailleurs, correctement)

L'onboarding ne pose **aucun consentement actionnable**. `GreetingSlide.tsx:32-37` affiche seulement un **texte de disclosure IA** (`ai_disclosure.onboarding_toast` = "Musaium is an AI assistant. Replies are generated automatically.") — informatif, pas un opt-in.

Les consentements réels vivent en dehors du flow onboarding :
- **GDPR signup** : `features/auth/ui/RegisterForm.tsx` + `GdprConsentCheckbox.tsx` — posé à l'inscription (donc AVANT l'onboarding, étape 3 du flux §2). Cohérent.
- **Consent AI tiers** : `features/chat/application/useAiConsent.ts` + `AiConsentSheetContent.tsx` — bottom-sheet déclenché côté chat, pas onboarding.
- **Consent analytics** : `<ConsentBanner />` monté au root (`app/_layout.tsx:231`, TD-C5-MOBILE-CONSENT-01) — flotte au-dessus de tout écran tant que `status === 'unset'`, persiste la décision.

**Évaluation** : le consent GDPR obligatoire est capturé au signup (en amont), pas redondé dans l'onboarding — pas de double-prompt, pas de consent manquant. **Pas de rupture GDPR.** L'onboarding reste purement éducatif/marketing.

---

## 5. Persistance "onboarding vu" — double couche, robuste

- **Local (device)** : `userProfileStore.setHasSeenOnboarding(true)` (`onboarding.tsx:68`), persisté zustand sous `musaium.userProfile` via `expo-secure-store` adapter, `partialize` inclut `hasSeenOnboarding` (`userProfileStore.ts:89`). Survit aux relances.
- **Serveur (par user)** : `markOnboardingComplete()` → `PATCH /api/auth/onboarding-complete` (`authApi.ts:176`) → `setIsFirstLaunch(false)` (`AuthContext.tsx:149`). Le flag serveur revient dans `session.user.onboardingCompleted` au login/refresh (`AuthContext.tsx:139,246`).

**handleComplete (`onboarding.tsx:56-70`)** :
- Si `isAuthenticated` → tente `markOnboardingComplete()` dans try/catch (warn-only si échec, pas de blocage — `:64-66`).
- Si NON authentifié → skip le call serveur (commentaire `:57-60`), pose seulement le flag local. Le sync serveur se fera au prochain boot authentifié via `bootstrapProfile`.
- Dans tous les cas → `setHasSeenOnboarding(true)` + `router.replace('/(tabs)/home')`.

**Re-affichage évité** : OUI. `hasSeenOnboarding` local + `onboardingCompleted` serveur ferment les deux portes du gate (`useProtectedRoute.ts:35,47`). Note : si un user authentifié arrive sur onboarding mais que le PATCH échoue (warn-only), `isFirstLaunch` reste `true` côté contexte — mais `hasSeenOnboarding` local passe `true`, et le gate exige les DEUX faux (`isFirstLaunch && !hasSeenOnboarding`), donc pas de boucle. Cohérent. **Pas de rupture.**

---

## 6. Dead-ends / écrans orphelins

- **Pas de dead-end de navigation** : chaque sortie (Skip `:72`, Get Started via `handleNext` `:76-83`) appelle `handleComplete` → `router.replace('/(tabs)/home')`. Le Next intermédiaire scrolle le FlatList (`:82`). `goToStep` borné `[0, totalSteps)` (`useOnboarding.ts:9`). Aucun cul-de-sac.
- **`useTypewriter.ts` ORPHELIN** : `features/onboarding/application/useTypewriter.ts:25` n'est importé que par son propre test (`__tests__/hooks/useTypewriter.test.ts`). Zéro usage dans les slides ou l'écran. Vestige d'une version "greeting typée caractère par caractère" abandonnée. Dead code (UFR-016 → à enterrer ou justifier).
- **`prev` exporté mais inutilisé** : `useOnboarding.ts:20` expose `prev`, jamais consommé par `onboarding.tsx` (pas de bouton Back). Mineur.

---

## 7. Coverage Maestro

3 flows dans `.maestro/`, **tous les 3 enregistrés dans `.maestro/shards.json:20-22`** (donc tous exécutés en CI) :

| Flow | État | Verdict |
|---|---|---|
| `onboarding-full-carousel.yaml` | **À JOUR** — assert les 4 titres V2 (Welcome to Musaium / Museum mode / Photograph artworks / Guided walks), Next×3, switch Get Started, lande home. Ré-entrée via Settings → "Onboarding Help". | Couvre le happy path authentifié complet. OK. |
| `onboarding-skip-anonymous.yaml` | À JOUR — regression guard du fix 401 (skip non-authentifié ne doit pas crasher). Dégrade gracieusement. | OK, mais beaucoup d'`optional`/`when` → faible pouvoir d'assertion. |
| **`onboarding-flow.yaml`** | **STALE (RUPTURE)** — daté 2 avr. Référence l'ANCIENNE impl 3-slides : `tapOn: "Onboarding"` depuis home (bouton inexistant, voir §2), puis `assertVisible "Practical Tips"` (slide 2 disparu) et `"Help & Support"` (slide 3 disparu). | **Échouera** à Phase 2 (`tapOn "Onboarding"` introuvable sur home) ou Phase 4 ("Practical Tips" absent). Soit la CI Maestro est rouge sur ce shard, soit le flow est masqué (faux-vert) — à vérifier côté run logs. |

**Conformité UFR-021** : l'écran `app/(stack)/onboarding.tsx` est couvert par `onboarding-full-carousel.yaml` (tap-through happy path réel : Next → Get Started → home). Pas d'entrée dans `coverage-baseline.json` (grep vide), pas de `// e2e-skip`. Donc l'écran satisfait la discipline post-feature via le carousel flow. OK.

---

## Ruptures (path:line)

1. **`.maestro/onboarding-flow.yaml` STALE + actif en CI** (`.maestro/shards.json:20`) — assert `"Practical Tips"` (l.59) et `"Help & Support"` (l.70) = slides supprimés ; `tapOn: "Onboarding"` (l.35) = bouton home inexistant. Soit shard rouge, soit faux-vert masqué. **À supprimer** (redondant avec `onboarding-full-carousel.yaml`) ou réécrire.
2. **`features/onboarding/application/useTypewriter.ts:25` orphelin** — dead code (importé seulement par son test). Enterrer (UFR-016).
3. **Sémantique "first-launch" trompeuse** (`useProtectedRoute.ts:29` vs `:35`) — onboarding posé APRÈS le mur d'auth, jamais avant. Pas un bug (design serveur-side `onboardingCompleted`), mais le carousel "vend" l'app à un user déjà inscrit. À acter si le brief produit attendait un welcome pré-signup.

## Non-ruptures (vérifiés OK)
- Permissions deferred au point d'usage (camera `useImagePicker.ts:28,56`, geo `useLocation.ts:66`) — bon timing, pas de prompt à froid.
- GDPR posé au signup (`RegisterForm` + `GdprConsentCheckbox`), analytics via `<ConsentBanner/>` root (`_layout.tsx:231`) — pas de consent manquant ni doublonné.
- Persistance double (local zustand `hasSeenOnboarding` + serveur `onboarding-complete` PATCH) — pas de re-affichage, pas de boucle.
- i18n complet : `onboarding.v2.{greeting,museumMode,cameraIntent,walkIntent}.{title,description}` + `skip/next/get_started` + `a11y.onboarding.*` présents (`shared/locales/en/translation.json`).
- a11y : Skip/Next/Get Started ont `accessibilityRole="button"` + `accessibilityLabel` ; titres `accessibilityRole="header"`.
- Pas de dead-end navigation (toutes sorties → `router.replace('/(tabs)/home')`).
