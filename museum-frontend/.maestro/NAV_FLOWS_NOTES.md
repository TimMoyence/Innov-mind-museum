# Navigation Flows — Notes & Gaps

Generated: 2026-05-17
Scope: `onboarding-skip-anonymous.yaml`, `onboarding-full-carousel.yaml`,
`nav-tabs-roundtrip.yaml`, `nav-stack-deep-links.yaml`.

These flows target routing regressions (screen renames, missing `_layout`,
broken back navigation, broken Skip/Get Started state machine on
onboarding) — not deep semantic behaviour.

---

## 1. Mismatch with task wording — tabs surface

The brief asked for tabs `discover`, `carnet`, `settings`. **None of
these are tabs.** The actual bottom tab bar (`app/(tabs)/_layout.tsx:44-77`)
exposes exactly 3 visible tabs:

| Tab name | Route | Screen file |
|---|---|---|
| Dashboard | `/(tabs)/conversations` | `app/(tabs)/conversations.tsx` |
| Museums | `/(tabs)/museums` | `app/(tabs)/museums.tsx` |
| Home | `/(tabs)/home` | `app/(tabs)/home.tsx` |

(`/(tabs)/index` exists but has `href: null` — invisible redirect.)

The screens the brief named are reached via **stack routes**, not tabs:
- `discover` → `/(stack)/discover.tsx` (reached via home intent chips)
- `carnet`   → `/(stack)/carnet.tsx`   (reached via home "My visit notebook" link, testID `home-carnet-link`)
- `settings` → `/(stack)/settings.tsx` (reached via home gear, testID `hero-settings-button`)

`nav-tabs-roundtrip.yaml` therefore tests the 3 real tabs only. Stack-only
screens are covered in `nav-stack-deep-links.yaml`.

---

## 2. Missing testIDs (priority order)

The 4 new flows fall back to **visible text matching** in many places.
Adding testIDs would harden the suite against i18n changes and let
Maestro target widgets directly. Recommended testIDs:

### 2.1 Tab bar (HIGH — most fragile)

File: `museum-frontend/app/(tabs)/_layout.tsx`

The `Tabs.Screen` instances at lines 50-76 do not expose `tabBarTestID`.
Maestro currently taps tab labels (`"Dashboard"`, `"Museums"`, `"Home"`)
which break the moment those keys change (already happened: the file
has `tabs.dashboard` returning "Dashboard" but the dashboard screen
title is also "Dashboard" — string collision).

Recommended add (one per `Tabs.Screen`):

```tsx
<Tabs.Screen
  name="conversations"
  options={{
    title: t('tabs.dashboard'),
    tabBarTestID: 'tab-conversations',  // ← add
    tabBarIcon: ({ color, size }) => (...),
  }}
/>
<Tabs.Screen
  name="museums"
  options={{
    title: t('tabs.museums'),
    tabBarTestID: 'tab-museums',        // ← add
    ...
  }}
/>
<Tabs.Screen
  name="home"
  options={{
    title: t('tabs.home'),
    tabBarTestID: 'tab-home',           // ← add
    ...
  }}
/>
```

Lines to modify: `app/(tabs)/_layout.tsx:51-77`.

### 2.2 Onboarding controls (HIGH — flow assertion fragility)

File: `museum-frontend/app/(stack)/onboarding.tsx`

| Component | Line | Suggested testID |
|---|---|---|
| Skip button (Pressable) | `onboarding.tsx:105-116` | `onboarding-skip` |
| Primary button (Next / Get Started) | `onboarding.tsx:141-150` | `onboarding-primary` |
| FlatList carousel | `onboarding.tsx:118-136` | `onboarding-carousel` |

Today the flows match by visible text ("Skip", "Next", "Get Started"),
which means a French-locale CI run will break unless `LANG=en` is forced.

### 2.3 Settings sub-screen entries (MEDIUM)

File: `museum-frontend/features/settings/ui/SettingsSecurityCard.tsx`

| Component | Line | Suggested testID |
|---|---|---|
| Change Password Pressable | `:60-67` | `settings-change-password` |
| Change Email Pressable | `:75-82` | `settings-change-email` |

File: `museum-frontend/features/settings/ui/SettingsComplianceLinks.tsx`

| Component | Line | Suggested testID |
|---|---|---|
| Terms of Service link | `:39-56` | `settings-terms-link` |
| Support link | `:57-74` | `settings-support-link` |
| Onboarding Help link | `:75-92` | `settings-onboarding-link` |
| Export data button | `:94-113` | `settings-export-data` |

File: `museum-frontend/app/(stack)/settings.tsx`

| Component | Line | Suggested testID |
|---|---|---|
| FloatingContextMenu "Privacy" action | `:86-92` | `settings-privacy-link` |
| FloatingContextMenu "Support" action | `:94-100` | `settings-support-quicklink` |
| FloatingContextMenu "Preferences" action | `:78-85` | `settings-preferences-link` |
| Back to Home Pressable | `:247-260` | `settings-back-home` |
| Sign Out Pressable | `:262-282` | `settings-sign-out` |

### 2.4 Dashboard & Museums (MEDIUM)

File: `museum-frontend/app/(tabs)/conversations.tsx`

| Component | Line | Suggested testID |
|---|---|---|
| Start New Conversation Pressable | `:125-143` | `start-new-conversation` |

File: `museum-frontend/features/museum/ui/MuseumSheetActions.tsx`

| Component | Line | Suggested testID |
|---|---|---|
| Start Chat button | `:38-52` | `museum-sheet-start-chat` |
| Open in Maps button | `:64-73` | `museum-sheet-open-maps` |
| View Details button | `:81-90` | `museum-sheet-view-details` |

### 2.5 Museum directory list rows (LOW — but useful for `nav-stack-deep-links`)

File: `museum-frontend/features/museum/ui/MuseumDirectoryList.tsx`

No testID on individual rows. A pattern like
`testID={`museum-row-${museum.id}`}` on the Pressable wrapper would let
Maestro target a specific seeded museum (e.g. `id=1`) deterministically
rather than hoping geolocation returns at least one row.

---

## 3. Screens skipped & why

### 3.1 `/(stack)/ticket-detail` and `/(stack)/tickets`

**Skipped.** Reasons:
- No UI entry point exists from Settings or Support. Only path is
  `router.push('/(stack)/tickets')` invoked from `support.tsx` ticket
  list section (if visible). Reaching it from Settings → Support → Ticket
  list requires the user to have at least one ticket pre-seeded.
- `ticket-detail` requires a valid `ticketId` param — Maestro cannot
  fabricate one without seeding.

Already covered by `.maestro/support-ticket-create.yaml` (creates a ticket
end-to-end). Adding back-navigation assertions there would be a cleaner
addition than a separate flow.

### 3.2 `/(stack)/discover`

**Skipped.** Reached only by tapping a home intent chip with an
ambiguous intent. The chip tap immediately calls
`useStartConversation()` → server creates a session → router navigates
to `chat/[sessionId]`. The discover screen seems to be reachable from
the home intent chips but in current flow `home.tsx:48-50` routes
directly to chat. Need clarification on whether `discover.tsx` is dead
code or if there's a missing tap path.

Manual recipe: open `app/(tabs)/home.tsx` and trace `HomeIntentChips` —
if the discover screen is supposed to render between chip tap and chat
session, this is a routing bug worth its own ticket.

### 3.3 `/(stack)/guided-museum-mode` and `/(stack)/offline-maps`

**Skipped.** Reachable via Settings → "Guided Museum Mode" and Settings →
"Offline maps" buttons. Both are static info screens with no
interesting interactive behaviour beyond back navigation. Low-ROI
coverage; would add ~30 lines for a near-static screen.

Manual recipe: 
1. Login, go to Settings.
2. Scroll to "Guided Museum Mode" card → tap "Guided mode info".
3. Assert visible "Guided Museum Mode" title.
4. Back.
5. Scroll to "Offline maps" → assert title visible → back.

### 3.4 `/(stack)/carnet/[sessionId]`

**Skipped.** Requires a saved artwork session pre-state. Reachable via
Home → "My visit notebook" link → tap a saved artwork card. CI account
has no carnet entries by default.

Manual recipe: chat with the day's artwork → tap "Save" on the daily
art card → navigate to carnet (home → "My visit notebook") → tap the
saved card → assert artwork detail visible.

### 3.5 `/(stack)/reviews`

**Skipped.** Reachable via Settings → "Open reviews" CTA. No nav-routing
concern (single static screen with confetti); see `settings-flow.yaml`
for partial coverage if needed.

---

## 4. Known-fragile assertion strings

The new flows rely on these English strings. **Forcing the
device/emulator to `LANG=en` is required** until testIDs land on the
buttons:

| Flow | String | Source key |
|---|---|---|
| onboarding-skip-anonymous | "Welcome back" | `auth.welcome_back` |
| onboarding-skip-anonymous | "Your museum companion" | `home.hero_title` |
| onboarding-full-carousel | "Welcome to Musaium" | `onboarding.v2.greeting.title` |
| onboarding-full-carousel | "Museum mode" | `onboarding.v2.museumMode.title` |
| onboarding-full-carousel | "Photograph artworks" | `onboarding.v2.cameraIntent.title` |
| onboarding-full-carousel | "Guided walks" | `onboarding.v2.walkIntent.title` |
| onboarding-full-carousel | "Get Started" | `onboarding.get_started` |
| onboarding-full-carousel | "Onboarding Help" | `settings.onboarding_help` |
| nav-tabs-roundtrip | "Your recent museum sessions" | `conversations.subtitle` |
| nav-tabs-roundtrip | "Nearby Museums" | `museumDirectory.title` |
| nav-stack-deep-links | "Start Chat Here" | `museumDirectory.start_chat` |
| nav-stack-deep-links | "Start New Conversation" | `conversations.start_new` |
| nav-stack-deep-links | "Change Password" / "Change Email" | `change_password.title` / `change_email.title` |
| nav-stack-deep-links | "Contact support" | `privacy.open_support` |
| nav-stack-deep-links | "Privacy Policy" | `terms.privacy_policy` |
| nav-stack-deep-links | "Instagram" | `support.instagram` |

---

## 5. Recommended ratchet (post-testID adoption)

Once the testIDs from section 2 land:

1. Replace every `tapOn: { text: "..." }` in these 4 flows with
   `tapOn: { id: "..." }`.
2. Drop `assertNotVisible` on the auth-required strings (becomes
   purely a positive assertion on home).
3. Add a 5th flow `nav-deep-link-onboarding.yaml` that asserts the
   onboarding screen is reachable via Settings → Onboarding Help from
   any starting screen (currently mixed into `onboarding-full-carousel`).
4. Wire all 4 new flows into `.maestro/shards.json` so they run in CI
   matrix alongside the existing `core` shard.
