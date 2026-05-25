# B3 — Chat frontend cluster (2026-05-23 → 25) — Angle A11Y / Tests / Honnêteté / UFR-021

**Reviewer:** senior read-only fresh-context (UFR-022). Branche `dev` @ HEAD `89852f2a1`.
**Scope commits:** `c6bf75e8e` (Composer crash fix), `68e620648` (leading-column buttons + bottom-sheet outside-tap dismiss), `134abe293` (bury SSE + sendMessageSmart sync), `02a0e920f` (Maestro C2 modal coverage).

## Note : **9.0 / 10** — verdict **APPROVED**

Cluster solide sur les 4 angles. Aucun trou a11y bloquant, aucun résidu dead-code, aucune introspection d'`Animated.Value._value`, et la couverture Maestro est du vrai tap-through (pas du "s'affiche"). Le seul point notable est documenté honnêtement (biometric best-effort).

---

## ✅ Bien fait

### A11y
- **Composer leading-column buttons** (`features/chat/ui/Composer.tsx:71-107`) — mic + attach portent `accessibilityRole="button"` + `accessibilityLabel` (i18n) ; le mic ajoute `accessibilityState={{ busy: isRecording }}` (`:78`) et l'attach un `accessibilityHint` (`:99`). a11y sur le `<Pressable>` uniquement, pas de double-bag sur des inner View (commentaire `:46-49` confirme la résolution du double-a11y détecté en review du commit `68e620648`).
- **i18n keys vérifiées présentes** (UFR-013, pas supposées) : `chat.composer.a11y.{mic,mic_recording,open_attachments,open_attachments_hint,audio_pill}` existent FR (`shared/locales/fr/translation.json:514-520`) ET EN (`shared/locales/en/translation.json:516-520`). `a11y.bottomSheet.dismiss` présente FR (`fr/translation.json:1067-1068`) + EN (`en:1067`).
- **Bottom-sheet backdrop dismiss tappable par AT** (doctrine `reference_maestro_modal_backdrop_a11y`) — `BottomSheetBackdrop.tsx:72-77` rend un vrai `<Pressable accessibilityRole="button" accessibilityLabel={dismissLabel ?? accessibilityLabel}>`, et le container lui passe une `dismissLabel` distincte (`BottomSheetContainer.tsx:292,305`) pour ne pas re-annoncer le titre du dialog (spec R12). Le wrap est `pointerEvents="box-none"` (`:300,320`) + slab visible `"auto"` (`:324`) — c'est exactement le fix ADR-066 qui rend le backdrop atteignable.
- **MuseumSheet** : la doctrine (backdrop sibling derrière `accessibilityViewIsModal` = PAS un Maestro/AT target) est respectée — le backdrop reste touch-only et un **header close button a11y-reachable** a été ajouté : `museum-sheet-close` sur un `<Pressable accessibilityRole="button" accessibilityLabel>` dans `features/museum/ui/MuseumSheetHeader.tsx:38-47`. Le flow ferme via lui (`.maestro/modal-museum-sheet.yaml:68`), pas via le backdrop.
- **testIDs C2 ajoutés sur des hôtes déjà accessibles** — `source-citation-close` (`SourceCitation.tsx`, sur Pressable role+label), `artwork-hero-modal-close`, `image-fullscreen-modal-close/prev/next` : tous posés sur des `<Pressable>` portant déjà role+label, pas sur des bare `<View>`.
- **RTL** : `Composer.tsx` n'utilise aucune prop physique `marginLeft/Right`, `paddingLeft/Right`, `left/right` (vérifié grep). `dialogRole = 'dialog' as AccessibilityRole` (`BottomSheetContainer.tsx:280`) — cast string documenté (RN 0.83 type n'inclut pas "dialog"), pas `any`.
- **Pas d'emoji unicode** dans Composer / backdrop / container (grep range `\x{1F300}-\x{1FAFF}` + `\x{2600}-\x{27BF}` vide). Icônes = Ionicons.

### Tests
- **Suppression SSE sans tests morts** (`134abe293`) — `sseParser.ts`, `chatApi/stream.ts`, `tests/sse-parser.test.ts` supprimés ; aucun import orphelin (grep `sseParser|postMessageStream` = 0 hors le test-guard intentionnel). `chatApi.test.ts:421-449` ajoute un **régression-guard fort** : set `EXPO_PUBLIC_CHAT_STREAMING='true'` + `onToken` supplied → asserte que le path reste sync (`mockHttpRequest` appelé, onToken jamais déclenché). C'est de la preuve, pas du résidu.
- **Composer.test.tsx exerce la vraie interaction** (pas mock-away) : `fireEvent.press` sur mic/attach/audio-pill → asserte `toggleRecording`/`onOpenAttachments` appelés (`:48-89`) ; `fireEvent.changeText` réel + assert `onChangeText` (`:91-100`). Évite le piège DOB-2026-05-17.
- **Determinism Maestro prouvé** (`__tests__/maestro/modal-testid-wiring.test.tsx`) — 22 `fireEvent`, rend chaque modal avec RNTL, prouve (1) le testID **résolt au runtime** (`getByTestId`) et (2) qu'il **fire le bon handler**. Adresse explicitement la classe false-green "testID = string morte sur le mauvais élément" (header doc `:1-23`). Le frozen oracle `modal-coverage.test.ts` (`.toContain`) reste séparé et non auto-modifié.
- **Maestro = vrai tap-through (UFR-021)** : artwork-hero / image-fullscreen / source-citation / quota-upsell / offline-pack / museum-sheet font tous `open → assertVisible → tap close (id) → assertNotVisible`, pas juste "s'affiche". Source-citation tape même un input + send réel (`inputText:56`).
- **Animated.Value._value** : aucune introspection dans les tests du cluster (grep vide sur Composer.layout/test, backdrop-dismiss, dismiss-harness, wiring). La seule occurrence repo (`ImageCompareCardSkeleton.test.tsx`) est **pré-existante** (commit `f2c14c9eb`/PR #255), hors cluster — à noter pour un autre lot, pas imputable ici.

### Honnêteté / dead-code (UFR-013/016)
- Flag `EXPO_PUBLIC_CHAT_STREAMING` retiré des `.env.example` / `.env.local.example` (grep `CHAT_STREAMING` vide). `isChatStreamingEnabled()` supprimé (grep 0). `sendMessageSmart` (`send.ts:159-169`) collapse honnêtement vers sync, callbacks `onToken/onDone` conservés en no-op documenté (preserve l'API publique sans branche morte).
- Le commit `c6bf75e8e` documente honnêtement la régression `createElement('View')` runtime crash du commit précédent (review loop 2 APPROVED sur jest-mock vert / runtime non testé) — exactement le pattern UFR-021 reconnu, pas caché.
- Dev routes `app/(dev)/` correctement gated `__DEV__` avec `<Redirect href="/">` en release (`_layout.tsx:21-24`) — zéro risque phantom paywall/offline en prod.

---

## ⚠️ Risques a11y / tests

- **(FAIBLE) Biometric flow = best-effort, pas un vrai tap-through du modal** — `.maestro/modal-auth-biometric-setup.yaml:48-50` tape `biometric-setup-skip` en `optional: true` ; sur un device sans biométrie enrôlée, le sheet n'apparaît jamais et le flow valide uniquement le login + un assert "landed past auth" (`:55`). C'est honnêtement documenté (`:8-14`) et le login submit EST un vrai happy path, mais le *modal cible* n'est pas garanti exercé en CI. Mitigé par : le wiring-test RNTL prouve `biometric-setup-skip` résolt + fire son handler. Acceptable, pas un faux-vert (le flow ne prétend pas couvrir le sheet de façon déterministe).

- **(INFO) `museum-sheet-close` vit dans `MuseumSheetHeader.tsx`, pas `MuseumSheet.tsx`** — vérifié : pas un mensonge de commit, juste une décomposition composant. Le testID est bien posé sur un Pressable role+label (`MuseumSheetHeader.tsx:38-47`). Aucune action.

- **(INFO) Le backdrop expose `onPress` comme prop custom sur la View testID** (`BottomSheetBackdrop.tsx:64,71`) pour permettre `backdrop.props.onPress?.()` en test. Hack test-stable documenté (`:57-63`), RN ignore la prop sur la vraie view native. Le vrai Pressable interne (`:72`) garde l'a11y. Pas un risque a11y (l'AT voit le Pressable), juste à connaître.

---

## 🔧 Reste à faire (hors-scope cluster, à tracker)

- Migrer `ImageCompareCardSkeleton.test.tsx` (`_value` introspection, pré-existant PR #255) vers une assertion sur du state observable, conformément à `feedback_opaque_animated_value_test_contract`. Hors ce cluster.
- Le biometric Maestro flow restant en best-effort : si un device iOS nightly avec biométrie enrôlée devient dispo en CI, durcir le tap (retirer `optional`) pour un vrai tap-through déterministe du sheet. Tracké comme TD R6 4/6 coverage (cf. commit `68e620648` body).
