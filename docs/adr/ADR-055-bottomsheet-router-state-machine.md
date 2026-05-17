# ADR-055 — BottomSheetRouter: in-house state machine over `@gorhom/bottom-sheet`

**Status:** Accepted — implemented
**Date:** 2026-05-17
**Deciders:** Chat UX refonte worktree, /team C4 spec author
**Implemented in:** commits `67a49a280` + `e91cb34db`, merged via PR #284
**Source preserved:** This ADR is the canonical home for the C4 architectural rationale; `docs/chat-ux-refonte/specs/C4.md` is deleted 2026-05-17, retrieve via `git log`.

---

## Context

The chat session screen (`museum-frontend/app/(stack)/chat/[sessionId].tsx`) had grown to render **7 overlay surfaces** as siblings:

1. `InAppBrowser` — `<Modal>` full-page WebView
2. `MessageContextMenu` — `<Modal transparent>` bottom-sheet pattern
3. `AiConsentModal` — `<Modal>` fullscreen (GDPR / Apple 5.1.2(i) gate)
4. `VisitSummaryModal` — `<Modal>` centred card
5. `DailyLimitModal` — `<Modal>` centred card
6. `VoiceSessionIntro` — `<Modal>` fullscreen (EU AI Act Art. 50)
7. `AiDisclosureModal` — `<Modal>` fullscreen

5 lived inside a `<ChatSessionModals>` orchestrator; 2 were rendered as direct screen siblings. Each had its own `visible` boolean, its own `<Modal>` wrapper, its own close handlers. Z-order during concurrent opens was undefined — the last mounted modal won focus, which left the chat session vulnerable to legitimate ordering bugs (e.g. consent + voice-intro both pending).

The C4 refonte (worktree `worktree-feat+chat-ux-refonte`) consolidated these into a single `BottomSheetRouter` primitive. The question was **which router**: adopt `@gorhom/bottom-sheet` v5 (the industry-standard third-party library), or roll our own state machine.

### Verified facts at decision time (museum-frontend)

- `@gorhom/bottom-sheet` — **NOT installed**.
- `react-native-gesture-handler` — `~2.31.0` installed (peer req for `@gorhom/bottom-sheet` v5).
- `react-native-reanimated` — `4.2.1` installed.
- `GestureHandlerRootView` — referenced ONLY in `features/museum/ui/MuseumSheet.tsx`; **not wrapped at the root layout** (`app/_layout.tsx`).
- 3 of the 7 modals (consent, voice-intro, in-app-browser) are full-screen, not bottom sheets — bottom-sheet's "snap-points" idiom doesn't fit them.
- Existing modals had test suites passing (`AiConsentModal.test.tsx`, `VisitSummaryModal.test.tsx`, `MessageContextMenu.test.tsx`, `InAppBrowser.test.tsx`, `chat-session-deep.test.tsx`).

---

## Decision

**Roll an in-house state machine + RN `<Modal>` + Reanimated 4 + `react-native-gesture-handler` (for swipe-down only).**

Public API exposed to consumers:

```ts
const router = useBottomSheetRouter();
router.open('consent', { /* params */ });
router.close();
```

The reducer is pure (testable under Node test runner) with explicit state shapes:

```ts
type BottomSheetState =
  | { kind: 'idle' }
  | { kind: 'opening'; route: BottomSheetRouteId; params: unknown }
  | { kind: 'open'; route: BottomSheetRouteId; params: unknown }
  | { kind: 'closing'; route: BottomSheetRouteId; params: unknown;
      nextQueued: { route: BottomSheetRouteId; params: unknown } | null };
```

Routes declare their `presentation` (`'sheet' | 'fullscreen' | 'card'`) and `blocking: boolean` flag. Blocking routes (consent, daily-limit, voice-intro) refuse backdrop tap, swipe-down dismiss, and Android hardware back; only the primary CTA closes them.

### Decision matrix

| Criterion | `@gorhom/bottom-sheet` v5 | In-house state machine (chosen) |
|---|---|---|
| Bundle weight | +~50 KB (`@gorhom/portal` + types) | 0 KB (RN built-in `<Modal>`) |
| Setup at root | Requires `GestureHandlerRootView` at `app/_layout.tsx` — **not wrapped today**. Adds a regression surface for iOS gesture handlers globally. | No root setup. RN `<Modal>` already battle-tested in `MuseumSheet.tsx`. |
| Reanimated 4 compat | v5 supports Reanimated 3+; 4.2.1 works but peer alignment is fragile | Zero dependency on Reanimated for the router itself |
| API surface | `BottomSheetModal` + `BottomSheetModalProvider` + `useBottomSheetModal` + portal — more layers | Provider + hook + switch on `activeRoute` — ~150 LOC, 1 module |
| Fullscreen vs sheet | Bottom-sheet pushes "sheet" idiom — wrong for InAppBrowser WebView, consent fullscreen, voice-intro fullscreen | Route declares `presentation: 'sheet' \| 'fullscreen' \| 'card'`; router applies the shape |
| Blocking modal (EU AI Act Art. 50, Apple 5.1.2(i)) | Requires `enableContentPanningGesture={false}` + `enablePanDownToClose={false}` + custom backdrop component | Route-level `blocking: true` flag, handled by the router state machine |
| Test migration | Tests need `@gorhom/bottom-sheet/__mocks__/` (officially provided but adds a mock surface) | Existing tests render `*SheetContent` directly — no mocks added |
| Maintenance | Third-party dep in a repo already carrying `expo-image-manipulator` deprecated (C5) — minimise surface | 100% in-house, no external maintenance window |
| Future migration to `@gorhom/bottom-sheet` | N/A | **Public API `useBottomSheetRouter().open(...)` is library-agnostic** — swap drop-in possible if a future feature demands snap-points |

### Trade-off accepted

We lose `@gorhom/bottom-sheet`'s natural snap-to-snap-points (multi-position sheet). None of the 7 current surfaces need it:

- Consent / voice-intro / browser = fullscreen
- Context-menu = single bottom position
- Summary / daily-limit / ai-disclosure = centered card

If a future feature (e.g. A1 unified composer media sheet) requires snap-points, the `useBottomSheetRouter()` public API allows a drop-in replacement of the internal state machine with `@gorhom/bottom-sheet` without touching call sites.

---

## Consequences

### Positive

- **Zero new dependency.** `package.json` unchanged.
- **Single mount point.** `<BottomSheetRouter />` is rendered once at the bottom of the chat screen tree; when `activeRoute === null` the router renders `null` (no modals mounted, no parent re-renders).
- **Now powers 9 routes** (the original 7 + 2 added during subsequent work). Foundational FE primitive — any future overlay opens via `router.open(...)` rather than spawning another `<Modal>`.
- **Pure-reducer testability.** `bottomSheetReducer` runs under Node test runner without React; transition exhaustiveness covered (idle → opening → open → closing → idle, replace, queued-after-close).
- **Single-slot policy** eliminates the "last-mounted modal wins" Z-order bug class.
- **A11y baseline.** Every route gets `accessibilityRole="dialog"` + `accessibilityViewIsModal` + `AccessibilityInfo.announceForAccessibility` on mount + best-effort focus restore on unmount.
- **Reduced motion respected** (WCAG 2.3.3) via existing `useReducedMotion()` hook.
- **`ChatSessionModals.tsx` deleted** in the same commit — per `feedback_bury_dead_code` doctrine, no DEPRECATED marker.

### Negative / accepted

- We own the swipe-down `PanResponder` implementation. If RN gesture handling changes in 0.84+, we own the fix.
- Reduced-motion testing is shouldered by us — `@gorhom/bottom-sheet` would have provided this out of the box.
- Future snap-points need either an in-house extension OR migration to `@gorhom/bottom-sheet` (the latter remains possible thanks to the API shape).

---

## Alternatives considered

- **Adopt `@gorhom/bottom-sheet` v5 directly.** Rejected: requires `GestureHandlerRootView` at root layout (not wrapped today, adds iOS gesture handler regression surface), ~50 KB bundle cost, wrong idiom for 3 of the 7 surfaces (fullscreen), third-party maintenance dependency in a repo already carrying one deprecated native module.
- **Keep the 7 sibling `<Modal>`s + add a Z-order coordinator.** Rejected: doesn't solve the "5 modals stacked in `ChatSessionModals.tsx`" code smell; doesn't give us a uniform a11y / reduced-motion baseline; leaves the `<Modal>` proliferation pattern in place for future contributors to copy.
- **Use Expo Router's modal presentation.** Rejected: Expo Router modals are screen-level (route in the URL); our modals are component-level (state-driven within one screen). Different concern.

---

## Rollback

Per UFR-015 (no feature flags pre-launch), the change is hard-flipped. If a critical regression appears:

1. Revert commits `67a49a280` + `e91cb34db`.
2. The 7 `*SheetContent` components revert to `<Modal>`-wrapped originals.
3. `ChatSessionModals.tsx` is restored.
4. No persistence or migration to undo (router state is in-memory only).

---

## References

- `docs/chat-ux-refonte/specs/C4.md` — full discovery spec (deleted 2026-05-17, retrieve via `git log`; rationale preserved here)
- `museum-frontend/features/chat/ui/bottom-sheet-router/` — implementation directory
  - `BottomSheetRouter.tsx`, `useBottomSheetRouter.ts`, `routes.ts`, `bottomSheetMachine.ts`, `BottomSheetContainer.tsx`, `BottomSheetBackdrop.tsx`
- ADR-053 — Apple Guideline 5.1.2(i) granular consent (consumes this router for the consent sheet)
- ADR-001 — SSE deprecated (the chat screen no longer juggles SSE-driven UI state; router emerged from the same simplification wave)
- `feedback_bury_dead_code` — same-commit deletion of `ChatSessionModals.tsx`
- `feedback_no_feature_flags_prelaunch` — no `BOTTOM_SHEET_ROUTER_ENABLED` flag
- WCAG 2.2 AA — 2.4.6 Headings and Labels, 4.1.2 Name/Role/Value, 2.4.3 Focus Order, 4.1.3 Status Messages, 2.3.3 Animation
