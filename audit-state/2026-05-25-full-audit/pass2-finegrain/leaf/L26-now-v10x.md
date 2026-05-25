# L26 — NOW / V1.0.x post-launch (hotfix window) — fine-grain audit

- **Scope** : `docs/ROADMAP_PRODUCT.md` §"V1.0.x post-launch (hotfix window 2026-06-07 → 2026-06-21)" (lignes 287–301), items `[ ]` non cochés.
- **Branch/HEAD** : `dev` @ `1fb32f5bafc5ada0b97e7ce10af39d02834df8af`.
- **Méthode** : fresh-context, re-dérivé from scratch, zéro confiance aux marqueurs antérieurs. Chaque verdict confirmé par lecture code (path:line).

---

## Verdicts

### C3.5 — wire `useCompareImage` hook dans actual UI — **STILL-OPEN**

- `useCompareImage` (`museum-frontend/features/chat/application/useCompareImage.ts:70`) : **zéro caller production**. Les seules occurrences hors-test sont des self-references dans docstrings (`useCompareImage.ts:2`, `imageComparisonApi.ts:32`).
- `imageComparisonApi` (le wrapper wire) : **zéro caller production** (grep `imageComparisonApi|useCompareImage` sur `features/`+`app/`+`components/` *.tsx hors test = vide).
- `metadata.compareResults` : **lu** dans `ChatMessageBubble.tsx:276` (rend `<ImageCompareCarousel matches=...>`), **typé** dans `chatSessionLogic.pure.ts:88`, mais **jamais écrit** en prod. Seuls sites d'assignation = tests (`ChatMessageBubble.compare.test.tsx:96,145`).
- Conclusion : le carrousel UI existe et lit `compareResults`, mais rien ne peuple ce champ FE → feature inerte. Le claim audit ("orphan production, jamais peuplé FE") tient.

### C3.7 — score-floor gate (`fallbackVisualThreshold`) — **STILL-OPEN**

- `env.visualSimilarity.fallbackVisualThreshold` défini : `env.ts:345` (`VISUAL_FALLBACK_VISUAL_THRESHOLD`, default 0.4) + `env.types.ts:413`.
- **Jamais lu** : grep `fallbackVisualThreshold` sur `museum-backend/src/modules/**` = vide. Le config passé à `VisualSimilarityService` (`chat-module.ts:276-282`) ne contient que `wVisual/wMeta/topN/topK/rerankTimeoutMs`.
- `MIN_TOP_N = 20` (`similarity.service.ts:49`) est un **candidate-pool floor** (R3), PAS un score floor → ne couvre pas le gap.
- Conclusion : pas de floor de score → kNN renvoie une qualité arbitraire post-seed. Bug réel.

### C6.5 — amend "503 fail-open" wording — **DONE-UNCHECKED (doc déjà corrigée)**

- La tâche était un doc-amend (le compare encoder est fail-CLOSED HTTP 503, pas fail-open).
- `docs/AI_VISUAL_SIMILARITY.md` décrit déjà correctement le compare 503 comme **"contractual 503 envelope"** / fail-closed (`:54`, `:73`, `:118`, `:155`). Aucune occurrence "fail-open" résiduelle pour le compare encoder.
- Les seules mentions "fail-open" restantes concernent (a) le **reranker** C9.13 (`AI_VISUAL_SIMILARITY.md:27,156` — légitimement fail-open, autre feature), (b) ADR-037:56 (statement UFR générique), (c) la ligne roadmap 289 elle-même (qui restate l'ancien framing).
- Conclusion : la doc cible est amendée. Seul reste à cocher l'item roadmap. → **cochable [x]** (la correction de wording demandée est faite).

### C7.5 — device TTS smoke iPhone — **STILL-OPEN (manuel, non codifiable)**

- Étape manuelle pré-TestFlight (Tim, 5-10 min). Non-automatisable.
- Gated sur soumission TestFlight, qui n'a pas eu lieu (`RELEASE_CHECKLIST.md:404-411,517` TestFlight steps tous `[ ]`).
- Conclusion : reste ouvert par nature (process item).

### C10 ChooseAnother button wiring — **STILL-OPEN**

- `ProactiveMuseumBanner` supporte `onChooseAnother` (`ProactiveMuseumBanner.tsx:46,75-81`) ; fallback sur `onDismiss` quand absent.
- `home.tsx:96-109` passe `museum`, `onStart`, `onDismiss` — **pas `onChooseAnother`**. Donc dans la bande medium-confidence (confirm sheet), "Choose another" tombe sur `handleChooseAnotherPress`→`onDismiss?.()` = silent dismiss au lieu de router vers un picker.
- Conclusion : bug exact tel que décrit. La prop existe côté composant ; le wiring côté écran manque.

### C10 FE→BE write of `audioDescriptionMode` — **STILL-OPEN**

- READ OK : `bootstrapProfile.ts:84` → `audioDescriptionStore.mergeFromServer` (`:46-50`) hydrate depuis `GET /auth/me`.
- WRITE absent : `useAudioDescriptionMode.ts:22` n'appelle que `useAudioDescriptionStore.getState().toggle()`. Le store (`audioDescriptionStore.ts:44-45`) ne fait que `set()` local + persist Zustand — **aucun PATCH vers `/auth/me` profile-preferences** sur toggle.
- L'endpoint BE existe (`openapi.ts:1162` PATCH profile preferences accepte `audioDescriptionMode?`), mais le FE ne le fire jamais pour ce champ.
- Conclusion : sync cross-device uni-directionnel (server→device au login uniquement). Les changements device ne remontent jamais. Bug confirmé.

### Accept-Language `fr-FR` strict-equals (`chat-compare.route.ts:77-82`) — **STILL-OPEN**

- Le bug est réel, mécanisme légèrement déplacé vs le texte audit :
  - `chat-compare.route.ts:79-80` lit `req.clientLocale` et teste `=== 'fr' || === 'en'`.
  - `req.clientLocale` est posé par `accept-language.middleware.ts:22` = `parseAcceptLanguageHeader(headerValue)`.
  - `parseAcceptLanguageHeader` (`locale.ts:39-49`) renvoie le **tag brut de première préférence** (`"fr-FR"`), il **n'appelle PAS** `extractLangCode` (`locale.ts:19-22`, qui ferait `"fr-FR"→"fr"`).
  - Donc `Accept-Language: fr-FR` → `clientLocale = "fr-FR"` → `"fr-FR" === 'fr'` faux → fallback `DEFAULT_LOCALE = 'en'` (`:74,81`). **Users FR reçoivent la rationale en anglais.**
- Fix le plus propre : normaliser dans `parseAcceptLanguageHeader` via `extractLangCode`, OU `.toLowerCase().startsWith('fr')` au site route. Note : `chat-message.route.ts:48` / `chat-session.route.ts:114` / `chat-media.route.ts:49` consomment aussi `req.clientLocale` brut → vérifier qu'ils n'ont pas le même mésusage (hors scope strict, mais même racine).
- Nominatim hardcoded `accept-language=fr` : confirmé `nominatim.client.ts:117` (reverse/forward geocoding toujours en français). Sous-item du même bullet, toujours présent.

### Maestro `.maestro/audio-recording-flow.yaml` cassé — **STILL-OPEN (pire que décrit — sur le shard CI)**

- `.maestro/audio-recording-flow.yaml` réfère `label: "Hold to talk"` (`:51`) et `label: "Play assistant response"` (`:74,85`).
- Ces labels **n'existent nulle part** dans le code shippé/locales (grep `Hold to talk` / `Play assistant response` sur `features/`+`app/`+`components/`+`locales/` = vide).
- **Aggravant** : ce flow cassé est **listé dans `.maestro/shards.json:34`** → tourne en CI. (Le commentaire du flow orphelin disait "not run on CI per shards.json — verified 2026-05-16" : STALE, il EST sur la shard maintenant.)
- Le remplaçant honnête `museum-frontend/maestro/voice-record-and-tts.yaml` existe, utilise des accessors vérifiés (`composer-mic-button` testID `Composer.tsx:72`, labels `Voice message`/`Stop voice recording` = `translation.json:518-519`, `Listen`/`Playing...`), MAIS n'est PAS dans `.maestro/` → pas sur les shards.
- Fix quick-win : déplacer `voice-record-and-tts.yaml` → `.maestro/` + swap l'entrée `shards.json:34`.

### `reviews.userName` FE field that BE ignores + dead 409 branch — **STILL-OPEN**

- Ghost field `userName` : FE `submitReview(rating, comment, userName)` (`useReviews.ts:94,98`) envoie `userName` ; BE route ne destructure que `{ rating, comment }` (`review.route.ts:50-53`) et **dérive userName server-side** (`:41-42` commentaire SEC ; `createReview.useCase.ts:61` `userName: derivedName`). Le `userName` FE est silencieusement ignoré.
- Dead branch `409 already_reviewed` : `useReviews.ts:110-111` branche sur `err.message.includes('409')` → `'already_reviewed'`. Le BE POST `/` **n'émet jamais 409** (grep `409|already_reviewed` sur `museum-backend/src/modules/review/` hors test = vide ; aucune dup-check). Branche morte.
- Conclusion : les deux sous-points confirmés.

### TTS audio FE cache filename `.mp3` post-Opus — **STILL-OPEN**

- BE émet **Opus** : `text-to-speech.openai.ts:46` `response_format: 'opus'`, `:148` `contentType: 'audio/ogg'`.
- FE cache sous `.mp3` : `useTextToSpeech.ts:61` + `:78` `const filePath = \`${dir}${messageId}.mp3\``, docstring `:42` "Stores per-message MP3". Aucune cache-schema-version key.
- Conclusion : le fichier `<messageId>.mp3` contient des bytes Opus/OGG → extension mensongère + risque de servir des fichiers `.mp3` de l'ère pré-Opus sans invalidation. Fix : renommer `.opus`/`.ogg` OU clé schema-version. Confirmé.

### W2.2 branding doc UFR-013 fix — **PARTIAL (corrections prose déjà là ; décision-tâche pas tranchée)**

- Confirmé : **zéro consumer mobile FE** de `config.branding` (grep `.branding` sur `features/`+`app/`+`shared/` hors test = vide). `ChatHeader.tsx:60` utilise `useTheme()` global.
- Les corrections honnêteté sont **déjà dans la roadmap prose** : `ROADMAP_PRODUCT.md:184` ("W2.2 branding (mais ZÉRO FE consumer mobile — UFR-013 doc fix V1.0.x)"), `:84` (P0-FA6 "branding W2.2 write-to-void"), KR1 `:52`/`:48` (co-branding = "démontrable"/hypothèse). `M1.3` `:432` track le consumer mobile différé (Q3 2026, 20j).
- Les autres docs (`RELEASE_CHECKLIST.md:471`, `LIGHTHOUSE_AUDIT.md:77,85`) décrivent W2.2 correctement comme la **page admin web** `/admin/museums/[id]/branding` (qui EST shippée) — pas de claim fausse "mobile consume".
- Reste : l'item décision `:301` est encore `[ ]` (trancher : ship consumer Q3 vs retirer toute claim "shipped"). Aucune claim "W2.2 shipped" non-caveatée résiduelle. → doc-only quick decision.

---

## Synthèse

| Item | Verdict | Preuve clé |
|---|---|---|
| C3.5 useCompareImage orphan | STILL-OPEN | `useCompareImage.ts:70` 0 caller ; `compareResults` set seulement en tests |
| C3.7 score-floor | STILL-OPEN | `fallbackVisualThreshold` jamais lu ; `chat-module.ts:276-282` ne le passe pas |
| C6.5 503 wording | **DONE-UNCHECKED** | `AI_VISUAL_SIMILARITY.md:54,73,118,155` déjà "contractual 503 envelope" |
| C7.5 device TTS smoke | STILL-OPEN (manuel) | gated TestFlight non soumis (`RELEASE_CHECKLIST.md:404-411`) |
| C10 ChooseAnother | STILL-OPEN | `home.tsx:96-109` ne passe pas `onChooseAnother` |
| C10 FE→BE write audioDescriptionMode | STILL-OPEN | `useAudioDescriptionMode.ts:22` toggle local-only, 0 PATCH |
| Accept-Language fr-FR | STILL-OPEN | `locale.ts:39-49` ne normalise pas ; `route.ts:80` `=== 'fr'` ; Nominatim `:117` hardcodé |
| Maestro audio-flow cassé | STILL-OPEN (+sur shard CI) | `audio-recording-flow.yaml:51,74,85` labels inexistants ; `shards.json:34` l'inclut |
| reviews.userName ghost + 409 dead | STILL-OPEN | BE `review.route.ts:50` ignore userName ; 0 émission 409 |
| TTS cache .mp3 vs Opus | STILL-OPEN | BE `text-to-speech.openai.ts:46,148` opus/ogg ; FE `useTextToSpeech.ts:61,78` `.mp3` |
| W2.2 branding doc | PARTIAL | prose déjà corrigée ; item décision `:301` pas tranché |

**Cochables [x] maintenant** : C6.5 (wording compare déjà fail-closed dans la doc cible).

**Quick-wins (≤1h chacun)** :
1. **Maestro** — `git mv museum-frontend/maestro/voice-record-and-tts.yaml museum-frontend/.maestro/` + swap `shards.json:34` (`audio-recording-flow.yaml` → `voice-record-and-tts.yaml`), supprimer le flow cassé. Le remplaçant est déjà source-vérifié.
2. **Accept-Language** — 1-ligne : faire passer `parseAcceptLanguageHeader` par `extractLangCode` (`locale.ts`) OU `startsWith('fr')` au route (`chat-compare.route.ts:80`). Attention régressions sur les 3 autres consumers de `req.clientLocale`.
3. **reviews dead code** — retirer `userName` du FE `submitReview` + la branche `409 already_reviewed` (`useReviews.ts:94,110-111`) — UFR-016 burial.
4. **TTS cache** — renommer `.mp3`→`.opus` + docstring (`useTextToSpeech.ts:42,61,78`).
5. **W2.2** — décision doc : cocher `:301` en retirant la claim (le consumer mobile est déjà tracké M1.3 Q3).

**Bugs réels nécessitant impl (>1h)** : C3.5 (wire compare pipeline FE), C3.7 (score floor), C10 ChooseAnother (router picker), C10 audioDescriptionMode write (PATCH on toggle).
