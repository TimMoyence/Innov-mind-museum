# Modal flow contract anchors (C2)

UFR-021 Maestro coverage for the 7 previously-uncovered user-facing modals.
This file is the **downstream contract** (REQ-C2-011 / AC-8): the migrations
C3/C4/C8/C9 (BottomSheetRouter, gesture/Reanimated PoCs) rewrite these modal
sources. They **MUST preserve the `testID` anchors below** — deleting or
renaming one breaks the corresponding Maestro flow in the CI matrix.

> Scope note (honest): the 7 modals are NOT walked by
> `scripts/sentinels/screen-test-coverage.mjs` (it scopes `app/**/*.tsx` +
> `features/**/ui/*Screen.tsx` only — these are `*Modal.tsx`/`*Sheet.tsx`/
> `Prompt.tsx`/`Citation.tsx`). Coverage here is intentional latent protection,
> not sentinel-enforced. Enforcement = the flows + this contract.

## Trigger strategy

- **chat modals** (ArtworkHeroModal, ImageFullscreenModal, SourceCitation) and
  **MuseumSheet** are tap-through from their parent screen. The chat ones depend
  on a live backend (detected artwork / enriched images / sourced answer) →
  **nightly**, not PR-blocking.
- **QuotaUpsellModal** and **OfflinePackPrompt** are deeplink-driven through
  **dev-only** Expo routes under `app/(dev)/` (gated on `__DEV__`, redirected in
  release) because their prod triggers (axios-402 interceptor / geo + MMKV
  state) are non-deterministic in CI.
- **BiometricSetupSheet** is best-effort: the flow tap-throughs a real login
  happy path, then taps the sheet CTA `optional: true` (Android emulators often
  lack enrolled biometrics).

## Anchor table

| Modal | Flow file | testID anchors (DO NOT remove) | i18n a11y labels |
|---|---|---|---|
| **ArtworkHeroModal** | `modal-chat-artwork-hero.yaml` | `artwork-hero-card` (parent), `artwork-hero-modal-image`, `artwork-hero-modal-close` | `chat.artworkHero.modal.close` |
| **ImageFullscreenModal** | `modal-chat-image-fullscreen.yaml` | `image-fullscreen-modal-close`, `image-fullscreen-modal-prev`, `image-fullscreen-modal-next` | `a11y.chat.fullscreen_close`, `a11y.chat.previous_image`, `a11y.chat.next_image` |
| **SourceCitation** | `modal-chat-source-citation.yaml` | `source-citation-marker`, `source-citation-close`, `source-citation-open-url` | `chat.sources.viewSource`, `chat.sources.closeSheet`, `chat.sources.openLink` |
| **BiometricSetupSheet** | `modal-auth-biometric-setup.yaml` | `biometric-setup-activate`, `biometric-setup-skip` | `auth.biometric_setup.activate`, `auth.biometric_setup.later` |
| **MuseumSheet** | `modal-museum-sheet.yaml` | `museum-card` (parent, `MuseumCard.tsx`), `museum-sheet-close` (header close — Maestro dismiss target), `museum-sheet-start-chat`, `museum-sheet-open-maps`, `museum-sheet-view-details` (`MuseumSheetActions.tsx`), `museum-sheet-backdrop` (touch-only, a11y-hidden — NOT a Maestro target) | `museumDirectory.close_sheet_a11y`, `museumDirectory.start_chat` |

> **`museum-sheet-backdrop` caveat (verified on a live iOS 26.4 sim run, 2026-05-25)** —
> the backdrop `<Pressable>` sits behind the sheet content, whose host carries
> `accessibilityViewIsModal`, so it is excluded from the accessibility hierarchy
> Maestro queries. It dismisses on a real touch but `tapOn: { id: museum-sheet-backdrop }`
> resolves to nothing. The flow dismisses via `museum-sheet-close` (header button)
> instead. C3/C4 must keep `museum-sheet-close` reachable inside the modal subtree.
| **QuotaUpsellModal** | `modal-paywall-quota-upsell.yaml` | `quota-upsell-modal`, `quota-upsell-dismiss`, `quota-upsell-email`, `quota-upsell-consent`, `quota-upsell-submit` | `paywall.dismiss`, `paywall.fieldEmail`, `paywall.consent` |
| **OfflinePackPrompt** | `modal-museum-offline-pack.yaml` | `museum-map-offline-prompt-accept`, `museum-map-offline-prompt-decline`, `museum-map-offline-prompt-retry` (runtime-derived from the `museum-map-offline-prompt` literal in `MuseumMapView.tsx`) | `museum.offlinePack.accept`, `museum.offlinePack.decline` |

## Runtime-derived anchors (OfflinePackPrompt)

`OfflinePackPrompt` adds **no** new literal: it builds its button testIDs as
`` `${testID}-accept` `` / `` `${testID}-decline` `` / `` `${testID}-retry` ``
from the parent `testID` prop. The prod call-site passes
`testID="museum-map-offline-prompt"` (`MuseumMapView.tsx`), and the dev preview
route (`app/(dev)/offline-prompt-preview.tsx`) passes the **same** literal, so
the runtime DOM exposes the identical `museum-map-offline-prompt-*` anchors in
both prod and the Maestro flow. C3/C4 must keep that template + parent-literal
contract intact.

## Dev-only trigger routes

| Route | Triggers | Guard |
|---|---|---|
| `app/(dev)/paywall-preview.tsx` | `usePaywall().open(...)` → QuotaUpsellModal | `__DEV__` + `(dev)/_layout.tsx` `<Redirect href="/">` |
| `app/(dev)/offline-prompt-preview.tsx` | mounts OfflinePackPrompt directly | `__DEV__` + `(dev)/_layout.tsx` `<Redirect href="/">` |

These routes are absent from release bundles (the `__DEV__` guard + the group
layout redirect), so there is no risk of a phantom paywall/offline prompt in
production.
