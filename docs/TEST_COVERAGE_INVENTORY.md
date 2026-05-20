# Musaium Mobile — E2E Test Coverage Inventory

**Generated:** 2026-05-17 · **Counts re-verified:** 2026-05-19  
**Codebase:** `/museum-frontend` (Expo 55 + Expo Router)  
**Scope:** Route analysis, interactive elements, testID audit, Maestro coverage map, critical gaps

> **Audit 2026-05-19 — verified actuals (via `find`/`ls`):** 26 in-scope
> `app/**/*.tsx` route screens (excl `_*.tsx`/`+*.tsx`) + 4 `features/**/*Screen.tsx`;
> 27 active `.maestro/*.yaml` flows (excl `config.yaml`) + 6 secondary `maestro/*.yaml`.
> Section counts below refreshed accordingly.

---

## 1. Routes

| Route Path | File | Auth Required | Notable Params |
|---|---|---|---|
| `/` | `app/index.tsx` | No | Redirect to `/home` or `/auth` |
| `/auth` | `app/auth.tsx` | No | Login/Register mode toggle |
| `/(tabs)/home` | `app/(tabs)/home.tsx` | Yes | Daily art, proactive museum |
| `/(tabs)/conversations` | `app/(tabs)/conversations.tsx` | Yes | Dashboard, search, bulk delete |
| `/(tabs)/museums` | `app/(tabs)/museums.tsx` | Yes | Map/List view, geolocation |
| `/(tabs)/index` | `app/(tabs)/index.tsx` | Yes | Redirect to `/conversations` |
| `/(stack)/settings` | `app/(stack)/settings.tsx` | Yes | Theme, biometric, account |
| `/(stack)/preferences` | `app/(stack)/preferences.tsx` | Yes | Language, guide level, museum mode |
| `/(stack)/discover` | `app/(stack)/discover.tsx` | Yes | Camera/Audio/Text intents |
| `/(stack)/onboarding` | `app/(stack)/onboarding.tsx` | Yes | 4-slide carousel: greeting, museum mode, camera, walk |
| `/(stack)/museum-detail` | `app/(stack)/museum-detail.tsx` | Yes | `id`, `name`, `latitude`, `longitude`, `distanceMeters` |
| `/(stack)/museums-picker` | `app/(stack)/museums-picker.tsx` | Yes | Museum selection (added since 2026-05-17) |
| `/(stack)/chat/[sessionId]` | `app/(stack)/chat/[sessionId].tsx` | Yes | `sessionId` param, text/audio/image input |
| `/(stack)/carnet` | `app/(stack)/carnet.tsx` | Yes | Artwork notebook |
| `/(stack)/carnet/[sessionId]` | `app/(stack)/carnet/[sessionId].tsx` | Yes | `sessionId` param |
| `/(stack)/tickets` | `app/(stack)/tickets.tsx` | Yes | Support tickets list |
| `/(stack)/ticket-detail` | `app/(stack)/ticket-detail.tsx` | Yes | Support ticket detail |
| `/(stack)/create-ticket` | `app/(stack)/create-ticket.tsx` | Yes | Support form submission |
| `/(stack)/reviews` | `app/(stack)/reviews.tsx` | Yes | Museum reviews |
| `/(stack)/guided-museum-mode` | `app/(stack)/guided-museum-mode.tsx` | Yes | Guided tour mode |
| `/(stack)/offline-maps` | `app/(stack)/offline-maps.tsx` | Yes | Offline map downloads |
| `/(stack)/change-email` | `app/(stack)/change-email.tsx` | Yes | Email update |
| `/(stack)/change-password` | `app/(stack)/change-password.tsx` | Yes | Password update |
| `/(stack)/privacy` | `app/(stack)/privacy.tsx` | Yes | GDPR/Privacy policy |
| `/(stack)/terms` | `app/(stack)/terms.tsx` | Yes | Terms of Service |
| `/(stack)/support` | `app/(stack)/support.tsx` | Yes | Support contact form |

**Total routes (in-scope, excl `_layout`/`+not-found`):** 26 (4 tabs + 22 stack/root, verified 2026-05-19). Plus 4 `features/**/ui/*Screen.tsx` not routed directly: `MfaChallengeScreen`, `MfaEnrollScreen`, `BiometricLockScreen`, `MuseumPickerScreen`.

---

## 2. Screens & Interactive Elements

### 2.1 Auth Screen
**File:** `app/auth.tsx`  
**Auth Required:** No

| Interactive Component | Type | testID | accessibilityLabel | Notes |
|---|---|---|---|---|
| Face ID Restore Button | Pressable | `auth-face-id-button` | `${t('biometric.continue_with')} ${label}` | Biometric conditional |
| Login Form | Composite | — | — | Delegates to `LoginForm` |
| Register Form | Composite | — | — | Delegates to `RegisterForm` |
| Mode Switch Button | Pressable | — | — | Toggles login/register |
| Error State | ErrorState | `auth-error-state` | — | Inline error display |
| Auth Action Menu | Composite | — | — | Menu toggle, forgot password |
| Social Login Buttons | Composite | — | — | Apple/Google buttons |
| Biometric Setup Sheet | Modal | — | — | Post-registration biometric offer |

**Drilled Components (LoginForm):**
- Email Input: `testID="email-input"`, `accessibilityLabel="a11y.auth.email_input"`
- Password Input: `testID="password-input"`, `accessibilityLabel="a11y.auth.password_input"`
- Forgot Password Button: `accessibilityLabel="a11y.auth.forgot_password"`

**Drilled Components (RegisterForm):**
- Email Input: `testID="email-input"`
- Password Input: `testID="password-input"`
- First Name Input: `accessibilityLabel="a11y.auth.firstname_input"`
- Last Name Input: `accessibilityLabel="a11y.auth.lastname_input"`
- Date of Birth Input: `testID="date-of-birth-input"`
- GDPR Consent Checkbox: `accessibilityLabel="a11y.auth.gdpr_*"`
- Submit (Register): `testID="auth-submit"` (in features/auth/ui)

---

### 2.2 Home Screen
**File:** `app/(tabs)/home.tsx`  
**Auth Required:** Yes

| Interactive Component | Type | testID | accessibilityLabel | Notes |
|---|---|---|---|---|
| Daily Art Card | GlassCard | `artwork-hero-card` | — | Art of the day |
| Daily Art Image | Image | `artwork-hero-image` | — | Tap to open modal |
| Daily Art Modal | Modal | `artwork-hero-modal-image` | — | Full-screen view |
| Daily Art Save Button | Pressable | — | — | Save to carnet |
| Daily Art Skip Button | Pressable | — | — | Dismiss banner |
| Conversation Resumption Banner | Banner | `conversation-resumption-banner` | — | Resume last chat |
| Conversation Resumption Dismiss | Pressable | `conversation-resumption-dismiss` | — | Dismiss banner |
| Proactive Museum Banner | Banner | `proactive-museum-banner` | — | Nearby museum suggestion |
| Proactive Museum Dismiss | Pressable | `proactive-museum-dismiss` | — | Dismiss banner |
| Home Intent Chips | FlatList | `home-intent-chips` | — | Audio/Camera/Walk quick-starts |
| Settings Button | Pressable | `hero-settings-button` | — | Navigate to settings |
| Carnet Link | Pressable | `home-carnet-link` | — | Jump to notebook |
| Empty State | EmptyState | `daily-art-empty-state` | — | No daily art fallback |
| Error State | ErrorState | `error-notice` | — | API error display |

---

### 2.3 Conversations Screen (Dashboard)
**File:** `app/(tabs)/conversations.tsx`  
**Auth Required:** Yes

| Interactive Component | Type | testID | accessibilityLabel | Notes |
|---|---|---|---|---|
| Conversation List | FlashList | `conversation-list` | — | Swipe-to-delete, tap to open |
| Bulk Delete Bar | Pressable | — | — | Conditional toolbar |
| Skeleton Loaders | SkeletonConversationCard | — | — | Loading state |
| Empty State | EmptyState | — | — | No conversations yet |
| Search Bar | TextInput | — | — | Filter conversations |
| New Conversation Button | Pressable | — | — | Start new chat |

---

### 2.4 Museums Screen
**File:** `app/(tabs)/museums.tsx`  
**Auth Required:** Yes

| Interactive Component | Type | testID | accessibilityLabel | Notes |
|---|---|---|---|---|
| Map View | MapView | — | — | Mapbox/OSM renderer |
| List View | FlatList | — | — | Museums with distance |
| View Mode Toggle | Pressable | — | — | Switch map ↔ list |
| Museum Card | Pressable | — | — | Tap to open detail |
| Museum Sheet | BottomSheet | — | — | Preview detail panel |
| Offline Prompt | Text | `museum-map-offline-prompt` | — | Geofence not available |
| Empty State | EmptyState | `museums-empty-state` | — | No museums in range |
| Error State | ErrorState | — | — | API/geo error |

---

### 2.5 Chat Session Screen
**File:** `app/(stack)/chat/[sessionId].tsx`  
**Auth Required:** Yes  
**Notable Params:** `sessionId` (required)

| Interactive Component | Type | testID | accessibilityLabel | Notes |
|---|---|---|---|---|
| Message List | FlatList | `message-list` | — | Chat history + pagination |
| User Message Bubble | View | `chat-bubble-user` | — | User-sent messages |
| Assistant Message Bubble | View | `chat-bubble-assistant` | — | AI responses, streaming |
| Pending Indicator | ActivityIndicator | `chat-assistant-pending` | — | AI thinking/typing |
| Chat Input | TextInput | `chat-input` | — | User text compose |
| Composer Attach Button | Pressable | `composer-attach-button` | — | Image/gallery/camera picker |
| Composer Mic Button | Pressable | `composer-mic-button` | — | Audio record toggle |
| Composer Audio Pill | Pressable | `composer-audio-pill` | — | Audio recording preview |
| Send Button | Pressable | `send-button` | `Send message` | Submit text/audio/image |
| Attachment Picker Camera | Pressable | `attachment-picker-camera` | — | Take photo |
| Attachment Picker Gallery | Pressable | `attachment-picker-gallery` | — | Select from library |
| Attachment Picker Record | Pressable | `attachment-picker-record` | — | Record voice note |
| Attachment Picker Scan | Pressable | `attachment-picker-scan-cartel` | — | Cartel scanner |
| Cartel Scanner Viewfinder | View | `cartel-scanner-viewfinder` | — | OCR camera view |
| Cartel Scanner Cancel | Pressable | `cartel-scanner-cancel` | — | Exit scanner |
| Cartel Scanner Open Settings | Pressable | `cartel-scanner-open-settings` | — | Camera permission |
| Cartel Scanner Denied | Text | `cartel-scanner-permission-denied` | — | Permission error |
| Cartel Scanner Pending | Text | `cartel-scanner-permission-pending` | — | Permission prompt |
| Artwork Hero Card | GlassCard | `artwork-hero-card` | — | Museum context card |
| Artwork Hero Image | Image | `artwork-hero-image` | — | Tap to expand modal |
| Artwork Hero Modal | Modal | `artwork-hero-modal-image` | — | Full-screen art view |
| Collapsible Top Bar | View | `collapsible-top-bar` | — | Header collapse on scroll |
| Walk Suggestion Chips | View | — | — | Guided museum chips |
| Offline Banner | View | — | — | No connectivity notice |
| Bottom Sheet Backdrop | Pressable | `bottom-sheet-backdrop` | — | Dismiss sheet |
| AI Disclosure Badge | Badge | `ai-disclosure-badge` | — | AI generation indicator |
| Voice Disclosure Start | Pressable | `voice-disclosure-start` | — | Audio consent modal |
| Sotto Voce Toggle | Switch | `sotto-voce-toggle` | — | Silent mode |
| Empty State | EmptyState | `chat-empty-state` | — | No messages yet |

---

### 2.6 Settings Screen
**File:** `app/(stack)/settings.tsx`  
**Auth Required:** Yes

| Interactive Component | Type | testID | accessibilityLabel | Notes |
|---|---|---|---|---|
| Theme Card | Pressable | — | — | System/Dark/Light selection |
| Security Card | Card | — | — | Biometric, password, email |
| AI Consent Card | Card | — | — | AI data usage toggle |
| Privacy Card | Card | — | — | GDPR, data export |
| Accessibility Card | Card | — | — | Audio description, text size |
| Data Mode Section | Card | — | — | Low data / offline mode |
| Voice Preference Section | Card | — | — | TTS voice/speed |
| Compliance Links | Pressable[] | — | — | Privacy, Terms, Support |
| Danger Zone | Card | — | — | Delete account, sign out |
| Preferences Link | Pressable | — | — | Navigate to preferences |
| Onboarding Link | Pressable | — | — | Re-run onboarding |
| Reviews Link | Pressable | — | — | Navigate to reviews |
| Back to Home Button | Pressable | — | — | Return to home |

---

### 2.7 Preferences Screen
**File:** `app/(stack)/preferences.tsx`  
**Auth Required:** Yes

| Interactive Component | Type | testID | accessibilityLabel | Notes |
|---|---|---|---|---|
| Language Dropdown | FloatingContextMenu | — | — | en/fr/es selection |
| Museum Mode Toggle | Switch | — | — | Guided / Free Explore |
| Guide Level Picker | FloatingContextMenu | — | — | Beginner/Intermediate/Expert |

---

### 2.8 Discover Screen
**File:** `app/(stack)/discover.tsx`  
**Auth Required:** Yes

| Interactive Component | Type | testID | accessibilityLabel | Notes |
|---|---|---|---|---|
| Lens (Camera) Button | Pressable | — | — | Start camera conversation |
| Voice (Audio) Button | Pressable | — | — | Start voice conversation |
| Ask (Text) Button | Pressable | — | — | Start text conversation |

---

### 2.9 Onboarding Screen
**File:** `app/(stack)/onboarding.tsx`  
**Auth Required:** Yes (first-launch context)

| Interactive Component | Type | testID | accessibilityLabel | Notes |
|---|---|---|---|---|
| Slide Carousel | FlatList | — | — | 4 slides, horizontal scroll |
| Slide 1: Greeting | View | — | — | Welcome message |
| Slide 2: Museum Mode | View | — | — | Guided vs Free mode |
| Slide 3: Camera Intent | View | — | — | Visual search explanation |
| Slide 4: Walk Intent | View | — | — | Guided tour explanation |
| Next Button | Pressable | — | — | Advance slide |
| Skip Button | Pressable | — | — | Jump to home |
| Get Started Button | Pressable | — | — | Complete onboarding |
| Step Indicator | View | — | — | Progress dots |

---

### 2.10 Museum Detail Screen
**File:** `app/(stack)/museum-detail.tsx`  
**Auth Required:** Yes  
**Notable Params:** `id`, `name`, `slug`, `latitude`, `longitude`, `address`, `description`, `distanceMeters`

| Interactive Component | Type | testID | accessibilityLabel | Notes |
|---|---|---|---|---|
| Museum Hero Image | Image | — | — | Museum photo |
| Museum Name | Text | — | — | Display only |
| Address Text | Text | — | — | Display only |
| Distance Badge | Text | — | — | Conditional, if geolocation available |
| Opening Hours | Text | — | — | Formatted hours |
| Enrichment Panel | Card | — | — | AI description (if available) |
| Start Chat Button | Pressable | — | — | Initialize conversation with museum context |
| Map Button | Pressable | — | — | Open native maps |
| Error State | ErrorState | — | — | Failed to load enrichment |

---

### 2.11 Carnet (Notebook) Screen
**File:** `app/(stack)/carnet.tsx`  
**Auth Required:** Yes

| Interactive Component | Type | testID | accessibilityLabel | Notes |
|---|---|---|---|---|
| Artwork List | FlatList | — | — | Saved artworks |
| Artwork Card | Pressable | — | — | Tap to open detail |
| Empty State | EmptyState | `carnet-empty-state` | — | No saved artworks |
| Error State | ErrorState | `carnet-error-state` | — | Failed to fetch |
| Continue Button | Pressable | `carnet-continue-button` | — | Resume chat with artwork |

---

### 2.12 Carnet Detail Screen
**File:** `app/(stack)/carnet/[sessionId].tsx`  
**Auth Required:** Yes  
**Notable Params:** `sessionId`

| Interactive Component | Type | testID | accessibilityLabel | Notes |
|---|---|---|---|---|
| Artwork Image | Image | — | — | Full-screen view |
| Artwork Metadata | Text | — | — | Title, artist, museum |
| Related Chat Link | Pressable | — | — | Jump to chat session |
| Delete Button | Pressable | — | — | Remove from carnet |
| Error State | ErrorState | `carnet-detail-error-state` | — | Failed to load |

---

### 2.13 Support Ticket Creation
**File:** `app/(stack)/create-ticket.tsx`  
**Auth Required:** Yes

| Interactive Component | Type | testID | accessibilityLabel | Notes |
|---|---|---|---|---|
| Email Input | TextInput | — | — | Pre-filled from profile |
| Subject Input | TextInput | — | — | Ticket subject |
| Message Input | TextInput | — | — | Multiline message |
| Category Picker | Pressable | — | — | Bug/Feature/Other |
| Submit Button | Pressable | — | — | Create ticket |

---

### 2.14 Reviews Screen
**File:** `app/(stack)/reviews.tsx`  
**Auth Required:** Yes

| Interactive Component | Type | testID | accessibilityLabel | Notes |
|---|---|---|---|---|
| Review List | FlatList | — | — | User's submitted reviews |
| Confetti Animation | LottieView | `reviews-confetti` | — | Visual celebration |
| Empty State | EmptyState | `reviews-empty-state` | — | No reviews yet |

---

### 2.15 Secondary Screens (Low Priority)
- **Privacy** (`privacy.tsx`): GDPR/privacy info, static content
- **Terms** (`terms.tsx`): ToS, static content
- **Support** (`support.tsx`): Contact form, email integration
- **Change Password** (`change-password.tsx`): Password update form
- **Change Email** (`change-email.tsx`): Email verification flow
- **Tickets** (`tickets.tsx`): Support ticket list
- **Ticket Detail** (`ticket-detail.tsx`): Support ticket view
- **Guided Museum Mode** (`guided-museum-mode.tsx`): Tour controller
- **Offline Maps** (`offline-maps.tsx`): Download manager

---

## 3. Existing Maestro Coverage

**Primary suite — `.maestro/*.yaml` (27 active flows, excl `config.yaml`; verified 2026-05-19):**

| File | What It Tests | Status |
|---|---|---|
| `auth-flow.yaml` | Register → Home → Logout → Login → Home | Core |
| `auth-login-happy.yaml` | Login happy path | Core |
| `auth-login-invalid-credentials.yaml` | Login → INVALID_CREDENTIALS error state | Core |
| `auth-register-happy.yaml` | Register happy path | Core |
| `auth-register-duplicate-email.yaml` | Register → CONFLICT (dup email) | Core |
| `auth-register-minor-dob.yaml` | Register → MINOR_PARENTAL_CONSENT (minor DOB) | Core |
| `auth-register-password-breached.yaml` | Register → PASSWORD_BREACHED (HIBP) | Core |
| `auth-submit-invalid-email.yaml` | Submit invalid email format → validation error | Core |
| `auth-account-delete.yaml` | Account deletion flow | Core |
| `auth-persistence.yaml` | Login → kill app → relaunch → session restored | Core |
| `onboarding-flow.yaml` | 4-slide carousel → complete → home | Core |
| `onboarding-full-carousel.yaml` | Walk all 4 slides + complete | Core |
| `onboarding-skip-anonymous.yaml` | Skip-anonymous (regression guard, markOnboardingComplete pre-auth) | Core |
| `navigation-flow.yaml` | Tab navigation + Settings → Preferences | Core |
| `nav-tabs-roundtrip.yaml` | home → discover → carnet → settings → home | Core |
| `nav-stack-deep-links.yaml` | Each (stack) screen reachable + back nav | Core |
| `chat-flow.yaml` | Home → start conversation → send text → AI response | Core |
| `chat-history-pagination.yaml` | Multi-turn → scroll up → load older | Extended |
| `chat-compare.yaml` | Attach artwork photo → "Similar artworks" → tap match | Advanced |
| `chat-cartel-deeplink.yaml` | Cartel scanner deeplink path | Advanced |
| `museum-chat-flow.yaml` | Museums tab → detail → start chat from context | Core |
| `museum-search-geo.yaml` | Museums tab + geolocation filtering + detail open/back | Core |
| `audio-recording-flow.yaml` | Chat → mic → record → transcription → AI audio response | Advanced |
| `settings-flow.yaml` | Settings hub → theme/privacy/terms/support → home | Core |
| `settings-locale-switch.yaml` | Settings → Preferences → fr↔en → re-render | Extended |
| `support-ticket-create.yaml` | Settings → Support → fill form → submit → success | Extended |
| `cert-pinning-smoke.yaml` | Cert-pinning runtime smoke | Advanced |

Helper subflow (not an entry point): `.maestro/helpers/quick-login.yaml`.

**Secondary / demo suite — `maestro/*.yaml` (6 flows, not counted by the UFR-021 sentinel which only walks `.maestro/`):**

| File | What It Tests | Status |
|---|---|---|
| `login-and-capture.yaml` | Login → home → capture screenshots | Extended |
| `capture-screens.yaml` | Navigate all screens → capture for docs | Extended |
| `voice-record-and-tts.yaml` | Record audio → verify TTS response | Advanced |
| `paywall-quota-exhaustion.yaml` | Exhaust quota → paywall modal | Advanced |
| `rtl-switch-ar.yaml` | Locale switch to AR → verify RTL rendering | Extended |
| `screenshots.yaml` | Global screenshot capture for release notes | Release |

**Maestro Coverage Summary (2026-05-19):**
- **27 active flows** in `.maestro/` (primary suite; `config.yaml` excluded, `helpers/` not entry points)
- **6 flows** in `maestro/` (secondary / demo / screenshot capture)
- **Core paths covered:** Auth (incl. all error codes + account delete), onboarding, navigation (tabs + deep links), chat, museums, settings, support
- **Advanced coverage:** Audio STT→TTS, image compare, cartel deeplink, cert-pinning smoke, quota/paywall, RTL

---

## 4. GAPS — Critical Untested Flows & Missing testIDs

### 4.1 Missing testIDs by Impact (Top 10)

| Priority | Component | Current Status | Add testID | Rationale |
|---|---|---|---|---|
| 🔴 CRITICAL | Register Submit Button | No testID | `register-submit` | DOB validation blocker (issue noted) |
| 🔴 CRITICAL | Forgot Password Submit | No testID | `forgot-password-submit` | Reset flow hard to test |
| 🔴 CRITICAL | Social Login (Apple) | No testID | `auth-apple-button` | OAuth flow verification |
| 🔴 CRITICAL | Social Login (Google) | No testID | `auth-google-button` | OAuth flow verification |
| 🔴 CRITICAL | Biometric Enable Button | No testID | `biometric-enable` | Face ID setup hard to automate |
| 🔴 CRITICAL | Chat Attachment Modal Backdrop | Has testID | `bottom-sheet-backdrop` | ✓ Already covered |
| 🟠 HIGH | GDPR Checkbox | No testID | `gdpr-consent-checkbox` | Consent gating hard to verify |
| 🟠 HIGH | Home Intent Chips | Has partial | `home-intent-chips` | Need individual chip testIDs |
| 🟠 HIGH | Start Conversation Button | No testID | `start-conversation-button` | CTA is critical |
| 🟠 HIGH | Close Chat Button | No testID | `close-conversation-button` | Exit flow verification |

### 4.2 Critical Untested Flows (Top 10)

| Flow | Risk | Why Untested | Recommendation |
|---|---|---|---|
| **Signup with invalid DOB** | 🔴 CRITICAL | No testID on date-of-birth input; register button doesn't disable on regex mismatch (the exact regression that occurred) | Add `date-of-birth-input` testID + add `register-submit` testID; write test that submits invalid DOB format and asserts button stays disabled |
| **Signup with rejected password** | 🔴 CRITICAL | No error state testID for password validation feedback | Add `password-validation-error` testID to FormInput strength indicator |
| **Social login → Biometric setup** | 🔴 CRITICAL | BiometricSetupSheet not tested; users might hit it on signup or login | Write test: Apple login → detect biometric availability → assert setup sheet → tap enable → verify home reached |
| **Forgot password → Email sent** | 🔴 CRITICAL | No testID on forgot flow submit; success/error messages not identified | Add `forgot-password-submit` testID + `forgot-password-success` testID |
| **Session timeout → Re-auth** | 🔴 CRITICAL | No test for token refresh failure fallback; user should see re-login prompt | Simulate expired token, verify auth screen appears, user can re-login |
| **Offline → Online transition** | 🔴 CRITICAL | OfflineBanner present but untested; queue behavior not verified | Disconnect network → send message → verify offline queue indicator → reconnect → verify message sends |
| **Chat with image + text** | 🔴 CRITICAL | Audio and text tested separately; combined flow (image + caption) not tested | Write test: attach image → type question → send → verify both included in request |
| **Carnet save + open from chat** | 🟠 HIGH | No testID on save button; flow requires jumping back to carnet session | Add `carnet-save-button` testID to chat UI; test: save artwork → navigate to carnet → open detail → verify correct session opened |
| **Biometric auth on cold start** | 🟠 HIGH | BiometricGate and FaceIdSessionRestore not Maestro-tested | Test: delete app cache (keep secure-store token) → launch → assert Face ID button → tap → verify home without re-entering password |
| **Language switch → Chat persistence** | 🟠 HIGH | Locale switch tested, but chat context language not verified | Test: start chat in FR → switch to EN → verify chat UI translates, message language intent unclear |
| **Museum detail enrichment fail** | 🟠 HIGH | ErrorState in museum detail, but flow not tested | Test: open museum detail → simulate 404 on enrichment → verify error card + "Start Chat Here" still works |
| **Support ticket attachment** | 🟠 HIGH | No test for file upload; form submission incomplete | Test: create ticket → attach screenshot → submit → verify success modal |
| **Accessibility: voice labels** | 🟠 HIGH | accessibilityLabel props present but not tested in Maestro (uses text matching) | Write accessibility-specific flow: enable screen reader → navigate via voice → verify labels read correctly |
| **Data export from settings** | 🟠 HIGH | Data export button exists but untested; async operation, no success indicator testID | Add `data-export-success` testID; test: tap export → wait for file → verify download initiated |
| **Theme change persists** | 🟠 HIGH | Theme toggle present, but persistence after relaunch not tested | Test: set dark theme → kill app → relaunch → verify theme persisted |

### 4.3 Secondary Screens (Low Priority — Quick Coverage)
- **Privacy/Terms/Support screens:** Static content, low test ROI. Minimal coverage: tap from Settings → assert content visible → back.
- **Change Email/Password:** Low usage, integration with backend not mocked. Add coverage if user feedback indicates issues.
- **Guided Museum Mode:** Niche feature, defer to integration tests.

---

## 5. Test Coverage Summary

### Metrics (re-verified 2026-05-19)
| Metric | Count | Coverage % |
|---|---|---|
| **Total in-scope routes** (`app/**/*.tsx`, excl `_*`/`+*`) | 26 | 100% identified |
| **Feature `*Screen.tsx`** (not directly routed) | 4 | 100% identified |
| **Active Maestro flows** (`.maestro/`, excl `config.yaml`) | 27 | — |
| **Secondary Maestro flows** (`maestro/`) | 6 | — |
| **Screens with any Maestro coverage** | ~14 / 15 major | — |
| **Screens with testIDs** | 11 / 15 | **73%** |

### Coverage by Feature (Maestro flows)

| Feature | Coverage | Status |
|---|---|---|
| **Auth** | Signup, Login, Logout, Session Persistence | ✓ Core |
| **Home** | Hero display, intent chips, banners | ⚠️ Partial (no testIDs for CTA buttons) |
| **Chat** | Text, audio, image, pagination, cartel scan | ✓ Comprehensive |
| **Navigation** | Tab switcher, stack navigation | ✓ Good |
| **Settings** | Theme, locale, preferences, compliance | ✓ Good |
| **Museums** | Map/List view, search, detail, geolocation | ✓ Good |
| **Onboarding** | 4-slide carousel, skip/complete | ✓ Good |
| **Support** | Ticket creation form (`support-ticket-create.yaml`) | ✓ Core |
| **Carnet** | Save/browse artworks | ⚠️ Partial (reachable via `nav-stack-deep-links`, no dedicated flow) |
| **Biometric** | Setup modal, cold-start restore | ❌ None |
| **Accessibility** | Voice labels, screen reader | ❌ None |
| **Offline** | Queue, retry, network transitions | ❌ None |
| **Social Auth** | Apple/Google login flows | ❌ None |
| **Quota/Paywall** | Limit enforcement, upgrade prompt | ⚠️ Partial (maestro/ only) |

---

## 6. Recommendations for Next Agents

### Phase 1: Add Critical testIDs (Before Test Writing)
1. Register submit button → `register-submit`
2. Forgot password submit → `forgot-password-submit`
3. Social login buttons → `auth-apple-button`, `auth-google-button`
4. Biometric enable button → `biometric-enable`
5. GDPR checkbox → `gdpr-consent-checkbox`
6. Home: Start Conversation CTA → `start-conversation-button`
7. Carnet save button → `carnet-save-button`
8. Data export success indicator → `data-export-success`

### Phase 2: Write Flows for CRITICAL Gaps
1. **Signup with invalid DOB** — Catch regressions like the one just fixed
2. **Social login → Biometric setup** — Full OAuth → biometric enrollment path
3. **Offline → Online transition** — Queue reliability
4. **Session timeout** — Token expiry recovery
5. **Biometric auth (cold start)** — Face ID resume without re-login

### Phase 3: Extend Carnet & Accessibility
1. Carnet: save artwork in chat → open carnet → verify session
2. Accessibility: enable screen reader → navigate via voice labels
3. Data export: initiate export → verify file download

### Phase 4: Monitor & Iterate
- Run maestro suite in CI (Nightly for advanced flows, PR-blocking for core)
- Track testID adoption: target 90%+ coverage on critical paths
- Log any new regression patterns for next iteration

---

## Appendix: File Locations

**Maestro Tests (Primary — 27 active flows, see §3 table for the full list):**
```
.maestro/                              (27 *.yaml, excl config.yaml)
  ├── auth-*.yaml ........................ 8 auth flows (lifecycle + all error codes + delete)
  ├── onboarding-*.yaml .................. flow / full-carousel / skip-anonymous
  ├── nav-*.yaml + navigation-flow.yaml .. tabs roundtrip + stack deep-links
  ├── chat-*.yaml + audio-recording ...... chat / pagination / compare / cartel-deeplink / audio
  ├── museum-*.yaml ...................... museum-chat / museum-search-geo
  ├── settings-*.yaml .................... settings-flow / settings-locale-switch
  ├── support-ticket-create.yaml ......... Support form
  ├── cert-pinning-smoke.yaml ............ cert-pinning runtime smoke
  ├── config.yaml ........................ (excluded from sentinel)
  └── helpers/
      └── quick-login.yaml ............... Reusable auth subflow
```

**Maestro Tests (Secondary — 6 flows, not counted by UFR-021 sentinel):**
```
maestro/
  ├── login-and-capture.yaml
  ├── capture-screens.yaml
  ├── voice-record-and-tts.yaml
  ├── paywall-quota-exhaustion.yaml
  ├── rtl-switch-ar.yaml
  └── screenshots.yaml
```

**Route Files:**
```
app/
  ├── index.tsx .......................... Root redirect
  ├── auth.tsx ........................... Auth screen
  ├── (tabs)/
  │   ├── index.tsx ...................... Redirect
  │   ├── home.tsx ....................... Home tab
  │   ├── conversations.tsx .............. Dashboard tab
  │   └── museums.tsx .................... Museums tab
  └── (stack)/
      ├── settings.tsx ................... Settings hub
      ├── preferences.tsx ................ Preferences
      ├── discover.tsx ................... Intent launcher
      ├── onboarding.tsx ................. Carousel
      ├── museum-detail.tsx .............. Museum view
      ├── museums-picker.tsx ............. Museum selection
      ├── chat/[sessionId].tsx ........... Chat session
      ├── carnet.tsx ..................... Artwork notebook
      ├── carnet/[sessionId].tsx ......... Artwork detail
      ├── create-ticket.tsx .............. Support form
      ├── tickets.tsx .................... Ticket list
      ├── ticket-detail.tsx .............. Ticket view
      ├── reviews.tsx .................... User reviews
      ├── privacy.tsx .................... GDPR info
      ├── terms.tsx ...................... ToS
      ├── support.tsx .................... Contact
      ├── change-email.tsx ............... Email update
      ├── change-password.tsx ............ Password reset
      ├── guided-museum-mode.tsx ......... Tour mode
      └── offline-maps.tsx ............... Map downloads
```

**UI Components with testIDs:**
```
features/auth/ui/
  └── LoginForm.tsx ...................... email-input, password-input

features/chat/ui/
  ├── ChatSessionSurface.tsx ............. chat-bubble-user, chat-bubble-assistant
  ├── Composer.tsx ....................... composer-attach-button, composer-mic-button, send-button
  ├── ArtworkHeroCard.tsx ................ artwork-hero-card, artwork-hero-image
  └── (others) ........................... 30+ chat-related testIDs

features/home/ui/
  └── HomeIntentChips.tsx ................ home-intent-chips
```

---

**End of Inventory**

Generated for: Maestro e2e test suite development  
Next steps: See Recommendations (Section 6) for test-writing agents
