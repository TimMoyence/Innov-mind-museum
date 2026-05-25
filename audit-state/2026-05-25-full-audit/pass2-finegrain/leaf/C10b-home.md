# C10b — HOME feature E2E trace (entrée → data)

- **Audit** : pass2-finegrain leaf, READ-ONLY, fresh-context UFR-022.
- **Branche / HEAD** : `dev` @ `1fb32f5bafc5ada0b97e7ce10af39d02834df8af`.
- **Méthode** : grep + Read + verif tree. Toutes affirmations citées path:line (UFR-013).
- **Santé E2E** : **8/10**.

---

## 0. Premisses du brief — corrigées (UFR-013)

Le brief m'a donné des numéros de ligne et une structure qui NE correspondent PAS à l'arbre `1fb32f5ba`. Corrections vérifiées :

| Premisse brief | Réalité vérifiée |
|---|---|
| `onChooseAnother` au `home.tsx:96-109` | FAUX. `home.tsx:96-109` = bloc `<ProactiveMuseumBanner>` qui passe **uniquement** `museum` / `onStart` / `onDismiss`. `onChooseAnother` n'y est PAS passé (grep `onChooseAnother` sur `app/` + `features/` → 0 hit hors la def + doc du composant). Le fallback silencieux vit dans `ProactiveMuseumBanner.tsx:75-81`, pas dans home. |
| `features/home/` contient une WelcomeCard | FAUX. `features/home/` = **seulement** `ui/HeroSettingsButton.tsx` + `ui/HomeIntentChips.tsx` (`find` exhaustif). |
| « WelcomeCard = 3 boutons fixes (doctrine hybrid violée) ? » | WelcomeCard existe (`features/chat/ui/WelcomeCard.tsx`) mais **n'est montée NULLE PART** dans `app/`/`features/` — uniquement importée par 3 fichiers de test. Dead UI (cf §4). Donc non rendue sur Home ni Chat. |
| Welcome card « dynamique » sur Home | Home n'a pas de WelcomeCard. Le surface d'intent réel = `HomeIntentChips` (3 chips fixes vocal/camera/walk). |

Je traite donc la question telle qu'elle se résout sur le code réel.

---

## 1. Montage Home — daily-art + proactive banner : OUI, correct

`app/(tabs)/home.tsx` (`HomeScreen`) monte dans l'ordre :

1. **Hero GlassCard** (`:69-82`) : `HeroSettingsButton`, `BrandMark`, titre/sous-titre/settings-note i18n.
2. **ConversationResumptionBanner** (`:85-93`, B2) — `onResume` → `router.push(/(stack)/chat/${id})`, `onDismiss` → `dismissResumption()`. Rend `null` si pas de session éligible. Câblé OK.
3. **ProactiveMuseumBanner** (`:96-109`, B6/W3) — voir §2.
4. **DailyArtCard** (`:111-125`) — montée conditionnelle `artwork && !dismissed && !isDailyArtLoading`. Branche `dismissed` → `EmptyState variant="dailyArt"`. Données via `useDailyArt()` (`:43`). Câblé OK.
5. **Carnet link** (`:128-151`, B1) — toujours visible, `router.push('/(stack)/carnet')`. Câblé OK.
6. **HomeIntentChips** (`:153`) — `onPress={handleIntentPress}` → `startConversation({ intent })`. Câblé OK.
7. **ErrorState inline** (`:155-164`) sur erreur de création de session.
8. **CTA primaire « Start Conversation »** (`:166-185`) → `handleStartDefault` → `startConversation({ intent: 'default' })`. Câblé OK.

Daily-art (`useDailyArt`, `features/daily-art/application/useDailyArt.ts`) : fetch `fetchDailyArt()` → `GET /api/daily-art` (typed OpenAPI, `dailyArtApi.ts`). Save/skip persistés via `storage` keys namespacés (`musaium.dailyArt.*`), migration legacy keys gérée. Fail silencieux (non-critique, `:60-62`). **OK.**

Proactive banner data (`useProactiveMuseumSuggestion`) : GPS via `useLocation` (pas de prompt — hérite consent Museums tab), `museumApi.detectMuseum({lat,lng})` 1×/tuile 3-décimales, gate dismiss-until 4h en storage, eligibility `museumId>0 && confidence>0.5 && name!=null`. Tolérant aux fails. **OK.**

---

## 2. `onChooseAnother` — RUPTURE confirmée (fallback dismiss silencieux)

- Home monte le banner SANS `onChooseAnother` : `home.tsx:96-109` ne passe que `museum`/`onStart`/`onDismiss`.
- Le hook ne retourne `museum` que si `confidence > 0.5` (`useProactiveMuseumSuggestion.ts:130`). Le banner affiche la **confirm-sheet branch** (bouton « Choose another ») pour `confidence ∈ (0.5, 0.8]` (`ProactiveMuseumBanner.tsx:62,84`). Donc le bouton EST atteignable en prod.
- `handleChooseAnotherPress` (`ProactiveMuseumBanner.tsx:75-81`) : `if (onChooseAnother) {...} else { onDismiss?.() }`. Comme home ne fournit pas `onChooseAnother`, **« Choose another » == juste fermer la sheet** (équivalent au X), sans router vers le picker.
- **Impact** : l'utilisateur proche d'un musée (medium-confidence) qui veut explicitement choisir un AUTRE musée tape « Choose another » → la sheet se ferme et rien ne s'ouvre. La voie picker (`useStartConversation.ts:112,122,130,141` `/(stack)/museums-picker`) existe mais n'est PAS reliée à ce bouton. Affordance morte / trompeuse.
- **Sévérité** : medium. Le label promet une action de choix, le comportement = dismiss. Le picker manuel reste accessible via les chips → pas un blocage dur, mais c'est un mensonge UI.
- **Fix attendu** : passer `onChooseAnother={() => router.push('/(stack)/museums-picker')}` (+ dismiss) depuis home.

---

## 3. CTA principal (start → chat) : atteint bien le chat — OK

`handleStartDefault` (`home.tsx:52-54`) → `startConversation({intent:'default'})` (`useStartConversation.ts:66`).

Chaîne data vérifiée :
- `chatApi.createSession(payload)` (`useStartConversation.ts:170`) → `router.push(/(stack)/chat/${response.session.id}${suffix})` (`:177`).
- `intent`/`initialPrompt` propagés via query string (`:171-176`), PAS via payload (BE Zod enum n'accepte que `default|walk`, commentaire `:163-168` — vérifié comme garde-fou cohérent contre 400).
- Le chat screen (`app/(stack)/chat/[sessionId].tsx:53-56,193-194`) lit `intent` + `initialPrompt` via `useLocalSearchParams` et les consomme. **Boucle fermée OK.**
- Intent chips `camera`/`audio`/`walk` (`INTENT_MAP` `home.tsx:28-32`) → même chemin ; ils n'utilisent PAS `autoDetectMuseum` (laissé `false` par défaut) — donc pas de geo-detect au départ depuis Home, cohérent.
- Garde anti-double-tap : `guardRef` (`useStartConversation.ts:58,68,73`). `disabled={isCreating}` sur CTA + chips. **OK.**

---

## 4. WelcomeCard = DEAD UI (rupture mineure / dette)

`features/chat/ui/WelcomeCard.tsx` : composant complet, 3 boutons fixes selon `museumMode` (museum: camera/history/next ; standard: camera/style/question). C'est bien un set **fixe de 3 boutons** (pas dynamique data-driven).

MAIS : grep `WelcomeCard` sur tout `app/` + `features/` (hors `node_modules`/`coverage`/sa propre def) → **uniquement 3 fichiers de test** (`__tests__/components/WelcomeCard.test.tsx`, `__tests__/snapshots/...`, `__tests__/a11y/...`). Pas monté sur Home, pas monté dans `chat/[sessionId].tsx` (grep `WelcomeCard|Welcome` → 0 hit). 

⇒ **Code mort testé** (les tests gardent un composant non rendu). Re : doctrine hybrid (rejet des « 3 boutons fixes / flows forcés », project_hybrid_product_philosophy + UFR-016 « enterre le mort ») : le composant *incarne* le pattern rejeté, mais comme il n'est pas monté il ne viole pas la doctrine en runtime. Reco : enterrer (`WelcomeCard.tsx` + ses 3 tests) ou justifier. **Sévérité : low (dette/honnêteté), pas un bug runtime.**

Note : le surface réellement montée sur Home (`HomeIntentChips`) = aussi 3 chips fixes (vocal/camera/walk). C'est de la navigation d'intention, pas un menu conversationnel forcé → acceptable comme entrée hybride (l'utilisateur peut aussi taper le CTA libre « Start Conversation »).

---

## 5. i18n daily-art locale — RUPTURE mineure

`useDailyArt.ts:51` appelle `fetchDailyArt()` **sans argument** → `dailyArtApi.ts` default `locale='en'`. Home lit pourtant `locale` depuis `useRuntimeSettings()` (`home.tsx:42`) mais ne le thread JAMAIS jusqu'à daily-art. ⇒ **L'œuvre du jour est toujours servie en anglais**, même pour un user FR. Sévérité : low-medium (contenu visible mais mauvaise langue). Fix : `fetchDailyArt(locale)`.

---

## 6. Coverage UFR-021 (Maestro home happy-path) : PRÉSENT — OK

- `home.tsx` n'est PAS dans `.maestro/coverage-baseline.json` (grep `home` → 0 entrée) ⇒ pas grandfathered, doit avoir un flow réel.
- **`chat-flow.yaml`** : `extendedWaitUntil "Start Conversation"` puis `tapOn: "Start Conversation"` (le CTA primaire de Home) → consent → input → submit. C'est un tap-through du happy-path Home → Chat (submit/CTA/nav réel, pas « s'affiche »). **Satisfait UFR-021.**
- **`nav-tabs-roundtrip.yaml`** : tape l'onglet Home, assert hero `"Your museum companion"`, round-trip. Couvre le rendu tab mais pas un CTA submit (complémentaire).
- Tests composant/écran additionnels : `__tests__/screens/home.test.tsx`, `home-proactive-museum-banner.test.tsx`, `home-resumption-banner.test.tsx`, `home.rtl.test.tsx`, `__tests__/components/HomeIntentChips.test.tsx`. (Rappel UFR-021 : Jest ne suffit pas — mais le Maestro existe.)
- **Gap non couvert par Maestro** : aucun flow n'exerce un intent chip (`home-intent-chip-vocal/camera/walk`) ni le carnet link ni la confirm-sheet « Choose another ». Le happy-path principal est couvert ; les branches d'intention ne le sont pas E2E.

---

## 7. Synthèse ruptures (path:line)

| # | Sévérité | Rupture | Localisation |
|---|---|---|---|
| R1 | **Medium** | `onChooseAnother` non câblé par Home → bouton « Choose another » de la confirm-sheet = dismiss silencieux (n'ouvre pas le picker). Affordance trompeuse. | `home.tsx:96-109` (omission) + `ProactiveMuseumBanner.tsx:75-81` (fallback) |
| R2 | Low-med | Daily-art toujours fetché en `en` — `locale` runtime jamais threadé. | `useDailyArt.ts:51` → `dailyArtApi.ts:9` ; locale dispo `home.tsx:42` |
| R3 | Low | `WelcomeCard` = dead UI (3 boutons fixes, montée nulle part hors tests). Candidat burial UFR-016. | `features/chat/ui/WelcomeCard.tsx` (0 mount) |
| R4 | Low | Maestro ne tap-through aucun intent chip / carnet link / confirm-sheet ; seul le CTA principal est couvert. | `.maestro/chat-flow.yaml` (scope) |

Non-ruptures vérifiées : daily-art mount ✓, proactive banner mount + data hook ✓, CTA→chat boucle fermée (intent/initialPrompt via query, lus `chat/[sessionId].tsx:193-194`) ✓, guard double-tap ✓, UFR-021 happy-path présent ✓.
