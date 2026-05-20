# Lessons — expo-store-review

Project-specific gotchas for `expo-store-review` in Musaium (human-edited; agents append dated sections only).

## 2026-05-20 — Prompt fires after a positive moment, never on launch
- **Context**: `incrementCompletedSessions()` bumps a counter and triggers `maybeRequestReview()` only at `SESSION_THRESHOLD = 3` completed visit sessions. Reference `shared/infrastructure/inAppReview.ts:16-25`.
- **Why**: Apple HIG / Play guidelines forbid launch-time or button-triggered native prompts. The "completed a visit" moment is the organic positive trigger.

## 2026-05-20 — App-side rate-limit on top of the invisible OS cap (3/year)
- **Fact**: the OS cap (~3 prompts / 365 days on iOS) is silent and unreadable. Musaium keeps its own timestamp list in storage and bails if ≥ `MAX_PROMPTS_PER_YEAR = 3` in the trailing year, so the few allowed prompts aren't wasted on bad moments. `inAppReview.ts:28-44`.
- **Note**: timestamps live in app storage → a reinstall resets the count. Accepted.

## 2026-05-20 — `requestReview()` is fire-and-forget; no success signal exists
- **Fact**: the call may show NOTHING even when `isAvailableAsync()` is true (OS quota / TestFlight). It returns no indication the user saw or used the dialog (Apple forbids correlating). Musaium does not await it for control flow and shows no "thanks for rating" UI. Do not branch on it.

## 2026-05-20 — `isAvailableAsync()` guard avoids no-op churn on web/TestFlight
- **Fix**: `maybeRequestReview` early-returns when `isAvailableAsync()` is false (web, TestFlight). `inAppReview.ts:29-30`. For an explicit "Rate us" menu link (a separate flow), use `StoreReview.storeUrl()` — never the native prompt behind a button.
