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
- **QuotaUpsellModal** is driven by its **REAL production trigger** (stream H7,
  2026-06-14): `modal-paywall-quota-upsell.yaml` logs in as a dedicated account
  whose free-tier monthly session quota is pre-exhausted (CI `Boot backend` runs
  `E2E_EXHAUST_QUOTA=1 pnpm seed:e2e-maestro-account`), taps the home
  "Start a new conversation" CTA → `POST /api/sessions` → 402 → the axios
  interceptor opens the modal. The old `(dev)/paywall-preview` deeplink was
  removed: it redirected Home in a Release bundle, so the flow passed green
  VACUOUSLY (the modal never opened). The modal assertion is now HARD.
- **OfflinePackPrompt** has **no Maestro flow** (stream H7, 2026-06-14). Its only
  trigger is geo-resolved `nearestCity` + a strong-network NetInfo reading +
  MMKV "no prior choice" — non-deterministic in a Release CI binary, and the
  former `(dev)/offline-prompt-preview` route redirected Home in Release (vacuous
  green). The flow + dev route were removed rather than kept as a vacuous pass.
  Coverage of `OfflinePackPrompt` is its component-level Jest tests; a Maestro
  flow can be re-added on a debug/dev-client lane (`__DEV__===true`) if/when one
  exists. `OfflinePackPrompt.tsx` is NOT a sentinel-walked screen (a `*Prompt.tsx`
  feature component, out of `screen-test-coverage.mjs` scope), so no baseline
  change is required.
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

> **QuotaUpsellModal — real trigger (stream H7)** — `modal-paywall-quota-upsell.yaml`
> no longer deeplinks a `(dev)` route. It drives the production 402 path: login as
> the pre-exhausted `e2e-paywall@test.musaium.dev` account → home "Start a new
> conversation" CTA → `POST /api/sessions` → 402 → axios interceptor → modal.
> The `quota-upsell-modal` assertion is HARD (non-optional). The `OfflinePackPrompt`
> row + its runtime-derived anchors were dropped with the flow (no reliable Release
> trigger — see the trigger-strategy note above).

## Dev-only trigger routes

| Route | Triggers | Guard |
|---|---|---|
| `app/(dev)/force-data-mode.tsx` | sets `useDataModePreferenceStore` preference, then redirects home | `__DEV__` (in-route guard + `(dev)/_layout.tsx` `<Redirect href="/">`) |

> Removed (stream H7, 2026-06-14): `app/(dev)/paywall-preview.tsx` and
> `app/(dev)/offline-prompt-preview.tsx`. They redirected Home in a Release bundle
> (`(dev)/_layout.tsx` `<Redirect href="/">`), so the flows that deeplinked them
> passed green VACUOUSLY against the CI Release APK. The paywall flow now uses the
> real 402 trigger; the offline-pack flow was removed entirely.

`force-data-mode.tsx` is absent from release bundles (the `__DEV__` guard + the
group layout redirect), so there is no risk of a phantom dev route in production.

## W3 low-data deeplink contract (`force-data-mode`)

iOS simulators cannot have their NetInfo connection type forced, so the
low-data banner (`resolveDataMode(preference === 'low')`) never lights
deterministically in CI. The W3 netshape flows drive the **real**
`useDataModePreferenceStore` through the dev route instead:

```yaml
- openLink:
    link: "musaium:///(dev)/force-data-mode?value=low"
# the route sets preference='low' on mount, then auto-redirects to "/" so the
# next screen renders under low-data mode. Omit ?value or use ?value=normal to
# force the normal path (default when value != 'normal' is 'low').
```

Contract:
- `?value=low` (or absent) → `setPreference('low')`; `?value=normal` → `setPreference('normal')`.
- The route mutates the store on mount, then **auto-redirects** to `/`
  (`<Redirect href="/">`) — there is no UI to tap; the flow continues on the
  home screen.
- On unmount the route **self-resets** the preference to `'auto'` (R6 no-leak),
  so a forced mode never bleeds into the next flow sharing the same simulator
  session.
- Sentinel note: `force-data-mode.tsx` carries a top-of-file `// e2e-skip:`
  magic comment, so it satisfies `screen-test-coverage` on its own; any W3 flow
  whose `openLink` references `/force-data-mode` additionally references the
  route path and would satisfy the sentinel as a flow ref too.
