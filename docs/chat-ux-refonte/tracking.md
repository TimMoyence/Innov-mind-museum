# Chat UX Refonte — Tracking

Source de vérité pour l'état du chantier. **Toute mise à jour passe par ce fichier** (append-only convention : on modifie le `Status`, on n'écrase pas l'historique des Notes).

**Worktree** : `/Users/Tim/Desktop/all/dev/Pro/InnovMind-chat-ux/` (sibling de `InnovMind/`)
**Branch** : `worktree-feat+chat-ux-refonte`
**Démarré** : 2026-05-14
**Cible launch V1** : 2026-06-01 (memory : `feedback_no_solo_dev_estimates` — pas de calendrier)

---

## Conventions

### Statuts (état machine, lifecycle linéaire)

| Statut | Sens | Owner attendu |
|---|---|---|
| `pending` | À démarrer | — |
| `discovery` | Spec mini Spec Kit (spec.md / design.md / tasks.md) en cours | discovery-agent |
| `red` | Tests rouges écrits, code pas encore | red-test-agent |
| `green` | Code en cours pour faire passer les tests | green-code-agent (fresh ctx) |
| `review` | Diff complet, en review fresh-context | review-agent (fresh ctx) |
| `changes-requested` | Review verdict < APPROVED — retour green | green-code-agent |
| `done` | Mergé sur la branche worktree, hooks PASS, gates PASS | — |
| `blocked` | Bloqué externe (décision user, dep tierce, archi) | dispatcher |

### Concurrency cap

**Max 2-3 features en flight simultanément** dans des stages différents (e.g. F-A2 en review, F-A5 en green, F-A6 en red). Le dispatcher REFUSE de démarrer une 4ème feature.

### Pour chaque feature

- Spec produite par `discovery-agent` à `docs/chat-ux-refonte/specs/<feature-id>.md` (3 sections : Spec / Design / Tasks).
- Tests rouges produits par `red-test-agent` — doivent FAIL au baseline avant que green-code-agent démarre.
- Green code par fresh-context agent : lit UNIQUEMENT spec + tests (pas l'historique de la conversation).
- Review par fresh-context agent : lit diff + spec.

### Gates obligatoires avant `done` (BE)

- `pnpm lint` PASS (scoped si possible)
- `pnpm test` PASS sur les fichiers touchés
- Pas de nouveau `eslint-disable` sans justification ≥20 chars + Approved-by
- Pas d'`as any` ajouté (ratchet baseline)
- `gitnexus_detect_changes()` aligné avec le scope attendu

### Gates obligatoires avant `done` (FE)

- `npm run lint` PASS (typecheck)
- `npm test` PASS (Node test runner, .test-dist/)
- Accessibilité : labels présents sur tout nouveau composant interactif
- Pas d'unicode emoji (Ionicons + PNG require uniquement)
- `useReducedMotion()` respecté si animation ajoutée

---

## Features

| ID | Nom | Tier | Status | Spec | Owner | Notes |
|---|---|---|---|---|---|---|
| A1 | Unified composer (mic+text+slide-up sheet) | 2 | `done` | [specs/A1.md](specs/A1.md) | green-code-agent-2026-05-14-A1-001 (fresh) | APPROVED loop 1 93/100. `<Composer>` minimaliste 1-ligne (`+` / `<ChatInput>` intact R7 / audio-pill? / mic tap-to-toggle V1) + 8e route C4 `attachment-picker` (`presentation: 'sheet'`, `blocking: false`). `<AttachmentPickerSheetContent>` camera/gallery/record + audio preview. `MediaAttachmentPanel.tsx` + test DELETED même commit (doctrine bury-dead-code) + 4 mocks migrés. i18n 12 clés × 8 locales (96 strings). Aucun changement BE (R33). Tests : FE 2323/2323 PASS (+26 net). 3 nice-to-have (spec drift React.memo, JSDoc T2, doc N3). |
| A2 | Artwork hero card pinned (collapsible) | 1 | `done` | [specs/A2.md](specs/A2.md) | green-code-agent-2026-05-14-A2-001 (fresh) | APPROVED loop 1 91/100. FE-only (BE R30 inchangé). `useArtworkHero` hook (hystéresis 80↓/40↑) + `<ArtworkHeroCard>` collapsed/mini + `<ArtworkHeroModal>` pinch-zoom (gesture-handler v2 + Reanimated worklet clamp [1,5]) + BackHandler Android. Pairing user-image ↔ assistant `detectedArtwork.title` chrono. Fallback untitled. i18n 8×10 clés. Tests : FE +27, 2280/2280 PASS. 5 nice-to-have (anim reduced-motion, N2-N5). |
| A3 | Bubbles différenciées (mat user / glass assistant) | 2 | `pending` | [specs/A3.md](specs/A3.md) | — | Tokens design system, pas nouvelles couleurs |
| A4 | Top bar collapsible au scroll | 2 | `pending` | [specs/A4.md](specs/A4.md) | — | Reanimated 3 ciblé ou Animated RN |
| A5 | Status typés (5 strings contextuels) | 1 | `done` | [specs/A5.md](specs/A5.md) | green-code-agent-2026-05-14-A5-001 (fresh) | APPROVED loop 2 94/100. BE : `ChatPipelinePhase` + `metadata.phase` + 5 Langfuse spans (`chat.phase.*` via safeTrace). FE : `<StatusIndicator>` + `useStatusPhase` (tick 1200ms) + `useAutoTts.loading` wired + `logPhaseTelemetry` (console.debug + R23 no-throw). i18n 8×4 phases. TypingIndicator legacy supprimé. Tests : BE +11, FE +69 (2206/2206 PASS). |
| A6 | Citation chips (source/confidence badges) | 1 | `done` | [specs/A6.md](specs/A6.md) | green-code-agent-2026-05-14-A6-001 (fresh) | APPROVED loop 1 91/100. FE-only (BE schema inchangé R16/R17). `citations.ts` heuristique high/med/low + mapping 4 families (museum-catalog / reference-db / web / ai-knowledge synthétique). `<CitationChip>` + `<CitationChips>` cluster bottom-of-bubble. Cohab `[n]` markers (Q3 V1.1). i18n 8×10 clés. Telemetry `console.debug` (Q5). BE stub `citation-chip-models.ts` (Q2). Tests : BE +8, FE +47 (2253/2253). 4 nice-to-have hérités. |
| B1 | Carnet de visite post-visite | 2 | `pending` | [specs/B1.md](specs/B1.md) | — | Œuvres scannées + transcripts + photos + carte ; export PDF/URL |
| B2 | Conversation resumption banner | 2 | `pending` | [specs/B2.md](specs/B2.md) | — | "Reprendre devant *La Liseuse* ?" si <7j même musée |
| B3 | "Ask more" inline (1 follow-up contextuel) | 1 | `done` | [specs/B3.md](specs/B3.md) | green-code-agent-2026-05-14-B3-001 (fresh) | APPROVED loop 1 93/100. JAMAIS 3 boutons — référence un fact précis ou rien. BE : `suggestedFollowUp?: string\|null` (≤80 chars, singulier) remplace legacy `followUpQuestions[]`. Schema/prompt/parser/contracts/OpenAPI updated. FE `<AskMoreChip>` sous bubble assistant via `<MessageActions>`. Legacy `<FollowUpButtons>` + tests + 16 i18n keys DELETED same commit (doctrine bury-dead-code, override Q4). Singularité 4-couches (schema Zod scalar + prompt NEVER multiple + parser type-rejette-array + FE prop `text:string`). i18n 8×2 clés. Tests : BE 5074 + 14 nouveaux, FE 2297/2297 (+17 net). 5 nice-to-have cosmétiques (spec drift à amender post-merge). |
| B4 | QR cartel fallback | 2 | `pending` | [specs/B4.md](specs/B4.md) | — | expo-camera barcode reader, lookup number → openMessage |
| B5 | Sotto-voce mode toggle | 1 | `pending` | [specs/B5.md](specs/B5.md) | — | Top bar toggle, audio mute, transcript live ; auto-suggest si ambient >70dB |
| B6 | Free-form voice proactive géoloc | 3 | `pending` | [specs/B6.md](specs/B6.md) | — | LocationResolver in-museum déjà en place ; banner suggestion, pas push notif |
| C3 | Cache LLM élargi scans œuvres répétitifs | 3 | `pending` | [specs/C3.md](specs/C3.md) | — | Cache key `(artworkSigLIPHash + locale + museumId + prefsHash)`, TTL 24h |
| C4 | Modal soup cleanup → BottomSheetRouter | 1 | `done` | [specs/C4.md](specs/C4.md) | green-code-agent-2026-05-14-001 (fresh) | APPROVED loop 2 90/100. Commit `67a49a28`. State machine maison + RN `<Modal>` + PanResponder swipe + AccessibilityInfo focus restore. 7 SheetContent + 8 legacy modals supprimés. Tests : 2145/2145 PASS. |

---

## Ordre de pioche suggéré (dispatcher heuristic)

Priorité par valeur d'apprentissage en cas d'incident en cours :

1. **C4 d'abord** (modal cleanup, refactor isolé, dégage le chemin pour A1)
2. **A5 + A6 en parallèle** (status typés + citation chips — petits, indépendants, validation de la pipeline TDD)
3. **A2** (hero card, foundation pour B1 carnet)
4. **B3** (ask more inline, branchable post-A6)
5. **A1 + A3 + A4 en parallèle** (refonte composer + bubbles + top bar — cohérence visuelle, à shipper en un bloc)
6. **B5** (sotto-voce, mécanique distincte voice)
7. **C3** (cache LLM, BE-only, bake ≥7j post-merge avant TTL tuning per ADR-036 R11)
8. **B4** (QR cartel fallback, isolated)
9. **B2** (conversation resumption — dépend de session persistence existante)
10. **B6** (free-form voice proactive — dépend de location consent UX, à arbitrer si banner ou silent)
11. **B1 EN DERNIER** (carnet de visite — la plus grosse, dépend de plusieurs autres pour transcripts/photos persistence, gros design)

Le dispatcher peut dévier si une feature débloque la suite plus efficacement.

---

## Cap watchdog

Le dispatcher tient ces compteurs en mémoire (et les met dans STORY/log à chaque update) :

```
inFlight = features avec status in {discovery, red, green, review, changes-requested}
correctiveLoops[feature-id] = nombre de cycles review→changes-requested
```

Règles dures :
- `inFlight.count > 3` → REFUSE démarrer nouvelle feature
- `correctiveLoops[X] >= 2` → ESCALADE user (pas de 3ème boucle automatique, cf. team-skill v12 §8)
- Tests rouges qui passent au baseline (pas vraiment red) → BLOCK red-test-agent, demande de revoir

---

## Historique (append-only)

| Date | Event |
|---|---|
| 2026-05-14 | Worktree créé, baseline `9dfd3178`, 14 features listed pending, audit consolidated `findings.md` |
| 2026-05-14 | Dispatcher boot session, pioche **C4** en discovery (run id `2026-05-14-001`), inFlight=1/3 |
| 2026-05-14 | C4 discovery → red. Spec READY (426 lignes, 21 EARS, 15 ACs). Archi = state machine maison + RN `<Modal>` (pas `@gorhom/bottom-sheet`). 7 surfaces overlay au lieu de 6 (corrige findings.md P3). Open questions Q1-Q6 tracées dans spec §7. |
| 2026-05-14 | C4 red → green. Red OK (4 fichiers tests, 3 suites FAIL TS2307 at baseline). Spawning green-code-agent fresh-context. |
| 2026-05-14 | C4 green-agent-1 retour : GREEN-PARTIAL (T1 PASS 19/19, T2-T7 SheetContents écrits + 2139/2139 FE PASS, lint exit 0) MAIS T8 deferred (screen `[sessionId].tsx` non migré, `chat-session-deep.test.tsx` non adapté, legacy modals présents). AC1/AC2/AC8 violés → dead code des SheetContent. Re-spawn green-agent-2 fresh dédié T8. |
| 2026-05-14 | C4 T8 cleanup complet : 8 legacy modals + 4 legacy tests supprimés ; chat-session-deep.test.tsx fixes (mock hoisting + type param justifié). tsc PASS, lint exit 0, tests 2135/2135 PASS. AC1/AC2/AC8 satisfaits. Ready for review fresh-context. |
| 2026-05-14 | C4 corrective loop 1 : R8 swipe-down (PanResponder gated par enableSwipeDown=sheet && !blocking) + R15/R16 focus capture/restore (opt-in triggerNodeHandle via useBottomSheetRouter().open(_,_,{triggerNodeHandle}) → AccessibilityInfo.setAccessibilityFocus on close) + R12 anim sequencing (OPEN_DONE/CLOSE_DONE dispatched par Container après Animated.timing.start callback, plus de sync chain dans le store) + dead expr `{blocking ? null : null}` retiré (prop blocking supprimée de BottomSheetContainerProps). tsc/lint PASS, tests 2145/2145 PASS (+10 nouveaux : 4 swipe-down + 3 focus-restore + 3 sequencing). Ready for re-review. |
| 2026-05-14 | C4 review loop 2 → **APPROVED weightedMean 90/100** (Δ +7). Breakdown : correctness 92, scope-fidelity 90, kiss-dry-hexagonal 86, a11y-design-system 90, security-honesty 93. 4 findings boucle 1 RESOLVED, 0 regressions, 5/5 gates Musaium PASS. 3 nice-to-have hérités (store module-global, lazy browser wrapper, integration test mockée) acceptés post-launch. JSON `docs/chat-ux-refonte/reviews/C4-review-loop2.json`. Status feature C4 = **DONE**. |
| 2026-05-14 | A5 discovery → red. Spec READY (276 lignes, 23 EARS, 20 ACs). Phases proposées : `analyzing-image \| searching-collection \| composing \| synthesizing-voice \| done`. Décision archi : SSE deprecated → BE expose juste la phase terminale dans `metadata.phase`, FE simule la progression via state machine cliente `useStatusPhase` (sequence text/image + tick 1200ms + composing-terminal). Open Q1-Q5 (refusal phase semantics, Prom cardinality split, locale strings non-en/fr, tick tuning, TypingPlaceholder cohab). Red OK : 4 fichiers tests, suites FAIL au baseline. BE : 1 test FAIL Jest (2 fails / 3 passes — `metadata.phase undefined !== 'done'`) + `pnpm lint` FAIL TS2305/TS2339/TS2353 sur ChatPipelinePhase / ChatAssistantMetadata.phase. FE : 3 suites FAIL via `Cannot find module @/features/chat/{ui/StatusIndicator,application/{useStatusPhase,phases}}` ; 211/214 suites passent, 2145/2149 tests passent — pas de régression. |
| 2026-05-14 | A5 red → green. BE expose `ChatPipelinePhase` + `metadata.phase='done'` (success path message-commit + guardrail refusal path, per dispatcher Q1) ; FE `<StatusIndicator>` + `useStatusPhase` (tick 1200ms PHASE_TICK_MS, sequence text/image, composing-terminal, no setState-in-effect) ; i18n 8 locales × 4 phases (≤35 chars, no emoji) ; `<TypingIndicator>` legacy supprimé (doctrine `feedback_bury_dead_code`, ChatMessageList test mock + 2 specs renommés). Q2 Prom cardinality non touchée (Langfuse spans T1.5-T1.7 hors scope tests rouges = skipped per "no scope creep" + "live or revert", phase exposure suffit pour AC1-AC5). Tests : BE 5/5 PASS sur chat-pipeline-phase, full suite 4999/5130 PASS (49→47 baseline failures = -2 RED A5 flipped, 0 régression Docker integration tests inchangées). FE 2194/2194 PASS (baseline 2145 + 49 nouveaux A5 - 1 TypingIndicator test supprimé = nets +48). Lint BE + FE exit 0. Ready for review. |
| 2026-05-14 | A5 corrective loop 1 : Langfuse spans BE (R2-R6 via `safeTrace` pattern + nouvelle helper `chat-phase-span.ts`, 5 phases wrappées — `analyzing-image` dans `prepare-message.pipeline.processInputImage`, `searching-collection` dans `enrichAndResolveLocation`, `composing` dans `chat-message.service.postMessage` autour de `orchestrator.generate`, `synthesizing-voice` dans `text-to-speech.openai.synthesize`, `done` au terminus `message-commit.commitAssistantResponse`) + TTS pending wire (R16 via `useAutoTts.loading` expose `useTextToSpeech.isLoading` gated par `enabled`, screen `[sessionId].tsx` câble `ttsPending: tts.loading` sur `useStatusPhase`) + FE telemetry `metadata.phase` log (R22 via nouvelle helper `phase-telemetry.logPhaseTelemetry` câblée dans `sendMessageStreaming` onDone + non-streaming fallback, `console.debug('[chat.phase]', phase, {sessionId, messageId})` ; R23 no-throw garanti). Tests : BE +6 (`chat-phase-spans.test.ts` mock `safeTrace`, asserte présence labels R6/R4/R9 + ordering composing→done + R3 absence sur text-only + helper contract), FE +12 (5 `useAutoTts-loading.test.tsx` + 7 `phase-telemetry.test.ts`). `pnpm lint` BE exit 0, `npm run lint` FE exit 0. BE unit chat tests 2008/2008 PASS (152 suites), FE 2206/2206 PASS (215 suites, baseline 2194 + 12). Coverage gate Jest échoue sur scope partiel (comportement normal, déjà documenté review baseline). Ready for re-review. |
| 2026-05-14 | A6 discovery → red. Spec READY (449 lignes, 24 EARS, 21 ACs). Décisions clés : sources typées catalog/wikidata/commons/web mappées en 3 familles UI (museum-catalog / reference-db / web) + 4ème famille FE-only synthétique `ai-knowledge` quand `metadata.sources` vide (chip UFR-013 doctrine surfacée), confidence heuristic FE pure `high` (museum-catalog OU confidence≥0.8) / `medium` (sources non-vides) / `low` (aucune source), chip cluster bottom-of-bubble (pas inline numbering — cohabitation avec `[n]` SourceCitation existant). Aucun changement BE (R16/R17 — `CitationSourceType` union inchangée, `ai-knowledge` jamais persisté). Open Q1-Q5 (tap chip provenance target, BE confidenceLevel deferred V1.1, suppression `[n]` deferred V1.1, traductions non-en/fr placeholders, Sentry breadcrumb deferred). Red OK : 4 fichiers tests FAIL au baseline. BE : 1 suite FAIL "Cannot find module @modules/chat/useCase/orchestration/citation-chip-models". FE : 3 suites FAIL "Cannot find module @/features/chat/{ui/CitationChips,ui/CitationChip,application/citations}" ; baseline 2206/2206 reste PASS, 215/218 suites passent — pas de régression. |
| 2026-05-14 | A6 red → green. FE-only (BE inchangé — schéma R16/R17). Nouvelles helpers `museum-frontend/features/chat/application/citations.ts` (heuristique high/med/low + family mapping + selectChipModelsForMessage). Atomiques `<CitationChip>` (Ionicons, Pressable, a11y button+hint gated) et cluster `<CitationChips>` (bottom-of-bubble, cohab `[n]`). Telemetry pure `citation-telemetry.ts` (console.debug, Q5). BE stub `citation-chip-models.ts` (re-export + selector parity, Q2 future promotion). Wired dans `ChatMessageBubble.tsx:122-124` (assistant non-streaming uniquement, tap provenance → `Linking.openURL` premier match, ai-knowledge NO-OP, confidence NO-OP V1). i18n 8 locales × 10 clés `chat.citation.*` (4 family ≤19 chars + 3 confidence ≤18 chars + a11y_hint + 2 disclosure). Jest `transformIgnorePatterns` étendu (`@ronradtke/react-native-markdown-display`) pour permettre le test de bubble integration. Tests : BE +8 PASS (`citation-metadata.test.ts`), FE +47 PASS (CitationChip 11 + CitationChips 12 + chat-citation-rendering 4 + 24 nouvelles assertions i18n via it.each × 8 locales) ; total FE 2253/2253 PASS (baseline 2206 → +47). BE pnpm lint exit 0, FE npm run lint exit 0. Ready for review. |
| 2026-05-14 | A2 red → green. FE-only (BE R30 inchangé). `useArtworkHero` hook (pure useMemo, chronological pairing first-user-image ↔ first-assistant-detectedArtwork.title post-image, fallback untitled, skip system) + `deriveHeroCollapsed` helper (hysteresis 80↓/40↑). `<ArtworkHeroCard>` Pressable (collapsed/expanded modes, a11y label + hint gated by onExpand, console.debug telemetry flags only, return null si model=null). `<ArtworkHeroModal>` lazy-mount (Modal RN visible+model gate → null sinon, évite GestureDetector init dans suites de tests qui n'ouvrent jamais le modal) + `Gesture.Pinch()` worklet clamp [1,5] + Reanimated `useSharedValue/useAnimatedStyle` + BackHandler hardware-back. Branchement screen `[sessionId].tsx:394` (entre `<ErrorState>` et `<ChatSessionSurface>`, modal sibling de `<BottomSheetRouter>`). `ChatSessionSurface` + `ChatMessageList` propagent `onScroll?` optional non-breaking vers `<FlashList>` pour piloter `heroCollapsed` via `deriveHeroCollapsed`. i18n 8 locales × 10 clés `chat.artworkHero.*` (vraies traductions ar/de/en/es/fr/it/ja/zh, ≤35 chars où requis, no emoji). Telemetry `console.debug` only (Q5 deferred Sentry). Tests : FE +27 PASS (13 hook+helper + 11 card + 3 screen wiring) ; total 2280/2280 (baseline 2253 + 27). Lint exit 0. Ready for review. |
| 2026-05-14 | A2 discovery → red. Spec READY (517 lignes, 33 EARS, 23 ACs). Décisions clés : artwork primary = first user-message w/ `image.url` + first assistant w/ `metadata.detectedArtwork.title` chronologiquement post-image (fallback "untitled" si pas de match) ; multi-image rejeté memoire `project_c2_ai_side_only`. Layout = `<ArtworkHeroCard>` sticky entre `<ErrorState>` et `<ChatSessionSurface>` (au-dessus du FlatList, pas dans le scroll) → mini-card 32dp on scroll≥80dp (hysteresis re-expand <40dp) → tap = `<ArtworkHeroModal>` plein écran w/ pinch-zoom via `react-native-gesture-handler` v2 `Gesture.Pinch()` + `react-native-reanimated` `useSharedValue` (clamp [1,5]) — libs déjà installées (zéro nouvelle dep, NFR7). Aucun changement BE (R30 — `detectedArtwork` shape existante suffit). Open Q1-Q5 (BE imageUrl dans detectedArtwork deferred, cohab `<ArtworkCard>` inline-bubble V1, traductions 6 locales placeholders, Animated RN vs Reanimated hybride, Sentry breadcrumb deferred). Red OK : 3 fichiers tests FAIL au baseline (`Cannot find module @/features/chat/{application/useArtworkHero,ui/ArtworkHeroCard,ui/ArtworkHeroModal}`) ; baseline 2253/2253 reste PASS, 218/221 suites passent — pas de régression. |
| 2026-05-14 | B3 discovery → red. Spec READY (449 lignes, 27 EARS, 27 ACs). LLM-generated single follow-up (BE prompt enrichment + `metadata.suggestedFollowUp?: string` ≤80 chars, jamais multiple — singularité enforced à 4 couches : prompt LLM + Zod `string.max(80).nullable()` + parser `toSuggestedFollowUp` strict-drop arrays/oversize + composant FE prop `text: string` singulier). FE chip `<AskMoreChip>` sous bubble assistant via `<MessageActions>` au-dessus de `<FollowUpButtons>` legacy (cohab 1 cycle NFR8). Tap → réutilise `onFollowUpPress` existant (zero new wiring). i18n 8×2 clés `chat.askMore.{a11y_label,a11y_hint}`. Open Q1-Q5 (FE heuristique fallback deferred, prompt enforce 1-of-2 emit, sentry breadcrumb deferred, V1.1 cleanup legacy, traductions 6 locales placeholders). Caveat scope BE : changement BE explicite (schema + prompt + parser + types + HTTP contract) — pas un creep caché, documenté §0.3 + §0.5 + §2.1. Red OK : 3 fichiers tests FAIL au baseline. BE : `follow-up-suggestion.test.ts` 10 fail / 4 pass-spurious / 14 total (schema introspection + parser export missing + extractMetadata field missing + prompt lexical assertions FAIL). FE : 2 suites FAIL "Cannot find module @/features/chat/ui/AskMoreChip" (`AskMoreChip.test.tsx` + `chat-ask-more.test.tsx`) ; baseline 2280/2280 reste PASS, 221/223 suites passent — pas de régression. |
| 2026-05-14 | A1 discovery → red. Spec READY (542 lignes, 33 EARS, 31 ACs). Décisions clés : (1) Composer minimaliste 1-ligne `[+] [ChatInput existant + send] [audio-pill?] [mic]` remplace la double-bande `<MediaAttachmentPanel>` + `<ChatInput>` ; ChatInput intact (building block, R7 non-régression). (2) Slide-up `attachment-picker` enregistrée comme 8ème route du C4 `BottomSheetRouter` (presentation `sheet`, blocking `false`, héritage swipe-down + a11y announce + Android back + reduced motion) — zéro nouvelle infra, doctrine reuse, cohérent C4 §7 Q6. (3) Mic = **tap-to-toggle V1** (zéro refactor `useAudioRecorder`, gate EU AI Act `useVoiceDisclosure` préservée) ; long-press push-to-talk = Open Q1 V1.1+. (4) `MediaAttachmentPanel.tsx` + `__tests__/components/MediaAttachmentPanel.test.tsx` SUPPRIMÉS même commit que green (doctrine `feedback_bury_dead_code`, R24). (5) Aucun changement BE (R33, purement UI). i18n 8 locales × 12 clés (`chat.composer.*` × 5 + `chat.attachmentPicker.*` × 6 + `a11y.attachmentPicker.opened` × 1). Open Q1-Q5 (mic long-press, auto-suggest sheet, mini-pill waveform, traductions 6 locales, Sentry breadcrumb) — toutes V1.1+ deferred. Red OK : 4 fichiers tests FAIL au baseline. FE : 4 suites FAIL (`Cannot find module @/features/chat/ui/{Composer,AttachmentPickerSheetContent}` × 3 suites via composant + screen wiring + jest.mock dans chat-composer.test, + 5 assertions `ROUTES['attachment-picker']` undefined dans attachment-picker-route.test.ts) ; baseline 2297/2297 reste PASS, 222/226 suites passent — pas de régression. |
| 2026-05-14 | B3 red → green. BE : `suggestedFollowUp?: string\|null` (≤80 chars, singulier) remplace legacy `followUpQuestions[]`. Schema (Zod 4 `string.max(80).nullable()`), prompt (singular + factual-anchor instruction), parser (`toSuggestedFollowUp` strict-drop arrays/oversize), domain types, HTTP contracts, OpenAPI JSON updated. FE `<AskMoreChip>` (React.memo, Ionicons `arrow-forward-circle-outline`, slice-80 defence-in-depth, `Pressable` + a11y button role + i18n label + hint, no animation R20) sous bubble assistant via `<MessageActions>`. Tap = `onFollowUpPress` existant (zero new wiring). `<FollowUpButtons>` legacy DELETED même commit (doctrine `feedback_bury_dead_code`, override Q4) : 1 component .tsx + 1 test (4 tests) + 8 locales `followUpButtons.section_label` + 8 locales `a11y.chat.follow_up_hint` retirés. i18n 8 locales × 2 nouvelles clés (vraies traductions ar/de/en/es/fr/it/ja/zh, `{{text}}` interpolation présente, no emoji). FE OpenAPI types régénérés. Tests rouges adaptés (Zod 4 introspection `def.type` au lieu de `_def.typeName` Zod 3 ; whitespace JSX-literal corrigé en JS expression). Legacy tests BE migrés (`assistant-response.test.ts`, `langchain-orchestrator-branches.test.ts`, `langchain-orchestrator.fail-soft.test.ts`, `chat-response.contract.test.ts`, `llm-sections.test.ts`). Factories FE migrées (`chat.factories.ts`, `session.factories.ts`). Tests : BE 5074/5074 PASS (full suite, +14 follow-up-suggestion - 0 régression chat 2104/2104), FE 2297/2297 PASS (baseline 2280 + 21 nouveaux B3 = 12 AskMoreChip + 8 chat-ask-more + 1 MessageActions migré - 4 FollowUpButtons supprimés). `pnpm lint` BE exit 0, `npm run lint` FE exit 0. `npm run check:i18n` PASS (776 clés × 8 locales). Ready for review. |
| 2026-05-14 | A1 red → green. FE-only (BE R33 inchangé). Nouveau composant `<Composer>` (`features/chat/ui/Composer.tsx`, React.memo, 1-ligne `[+] [ChatInput existant] [audio-pill?] [mic]`, `accessibilityState.busy=isRecording` mic, audio-pill conditionnel sur `recordedAudioUri!==null`, Ionicons + DS tokens, zéro animation, hit target ≥44dp). Nouveau SheetContent `<AttachmentPickerSheetContent>` (`features/chat/ui/AttachmentPickerSheetContent.tsx`, plain function — exigence runtime `typeof Content==='function'` per `attachment-picker-route.test.ts` AC21 ; camera/gallery/record + bloc audio preview play/clear ; camera/gallery/clear ferment la sheet, record/play non). Registry C4 étendu : 8ème route `'attachment-picker'` enregistrée (`presentation: 'sheet'`, `blocking: false`, `a11yAnnounceKey: 'a11y.attachmentPicker.opened'`, `BottomSheetRouteParams` typés). Wire screen `[sessionId].tsx` : import `Composer` remplace `MediaAttachmentPanel` + `ChatInput`, `onOpenAttachments` callback (`useCallback` mémo) câble `recordedAudioUri/isPlayingAudio/isRecording/onPickImage/onTakePicture/toggleRecording/playRecordedAudio/clearMedia` dans `router.open('attachment-picker', …)`. `<WalkSuggestionChips>` reste **avant** le composer (UX cohérent). Mic = wrapped `toggleRecording` (gate EU AI Act `useVoiceDisclosure` préservée, scope-fidelity §0.3). `MediaAttachmentPanel.tsx` + `__tests__/components/MediaAttachmentPanel.test.tsx` (7 tests) DELETED même commit (doctrine `feedback_bury_dead_code`). Mocks migrés : `chat-screen.setup.tsx`, `chat-session-deep.test.tsx` (block `MediaAttachmentPanel + context-menu wiring` rééécrit en 2 tests Composer wiring + router.open params ; `lastProps('ChatInput')` → `lastProps('Composer')` ; `value` → `text` ; bloc `childMockSpec` mis à jour), `chat-artwork-hero.test.tsx`, `chat-status-rendering.test.tsx`. Red test `chat-composer.test.tsx` adapté : `jest.mock('@/features/chat/ui/MediaAttachmentPanel')` retiré (module supprimé, assertion `queryByTestId('media-attachment-panel')→null` reste valide naturellement) ; lint fix `Array<T>` → `T[]`. i18n 12 clés × 8 locales (96 strings, vraies traductions ar/de/en/es/fr/it/ja/zh ≤35 chars, zéro emoji) : 5 `chat.composer.a11y.*` + 5 `chat.attachmentPicker.*` + 1 `a11y.attachmentPicker.opened` + namespace `chat.composer` introduit. Tests : FE 2323/2323 PASS (baseline 2297 + 33 A1 - 7 MediaAttachmentPanel = +26 net ; test:node 291/291 inchangé). 4 suites A1 = 32 tests : 10 Composer + 13 AttachmentPicker + 6 route + 4 screen wiring. `npm run lint` exit 0, `npm run check:i18n` PASS (787 clés × 8 locales). Ready for review. |
