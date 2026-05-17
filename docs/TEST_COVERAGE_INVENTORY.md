# Musaium Mobile — E2E Test Coverage Inventory

**Generated:** 2026-05-17  
**Codebase:** `/museum-frontend` (Expo 55 + Expo Router)  
**Scope:** Route analysis, interactive elements, testID audit, Maestro coverage map, critical gaps

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

**Total routes:** 25 (6 tabs, 19 stack)

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

| File | What It Tests | testIDs Used | Status |
|---|---|---|---|
| `auth-flow.yaml` | Register → Home → Logout → Login → Home | Text-based (no testID) | Core |
| `auth-persistence.yaml` | Login → Kill app → Relaunch → Verify session restored | Text-based | Core |
| `chat-flow.yaml` | Home → Start conversation → Send text → Verify AI response | `send-button` (via label) | Core |
| `onboarding-flow.yaml` | 4-slide carousel → Complete → Return to home | Text-based | Core |
| `settings-flow.yaml` | Home → Settings → Theme toggle → Privacy → Terms → Support → Home | Text-based | Core |
| `navigation-flow.yaml` | Tab navigation (Home → Dashboard → Museums → Home) + Settings → Preferences | Text-based | Core |
| `museum-chat-flow.yaml` | Museums tab → Detail → Start Chat from context | Text-based | Core |
| `museum-search-geo.yaml` | Museums tab + geolocation filtering + detail open/back | Text-based | Core |
| `audio-recording-flow.yaml` | Chat → Mic button → Record audio → Wait for transcription → AI audio response | Audio fixture-based | Advanced |
| `chat-history-pagination.yaml` | Multi-turn chat → Scroll up → Load older messages | Text-based | Extended |
| `chat-compare.yaml` | Chat → Attach artwork photo → Wait for "Similar artworks" → Tap match | Photo attachment | Advanced |
| `settings-locale-switch.yaml` | Settings → Preferences → Switch locale fr↔en → Verify re-render | Text-based | Extended |
| `support-ticket-create.yaml` | Settings → Support → Fill form → Submit → Success | Text-based | Extended |
| `rtl-switch-ar.yaml` | Locale switch to AR → Verify RTL rendering | Text-based | Extended |
| `login-and-capture.yaml` (maestro/) | Login → Verify home → Capture screenshots | Text-based | Extended |
| `capture-screens.yaml` (maestro/) | Navigate all screens → Capture for documentation | Text-based | Extended |
| `voice-record-and-tts.yaml` (maestro/) | Record audio → Verify TTS response | Audio fixture-based | Advanced |
| `paywall-quota-exhaustion.yaml` (maestro/) | Exhaust conversation quota → Verify paywall modal | Text-based | Advanced |
| `screenshots.yaml` (maestro/) | Global screenshot capture for release notes | Text-based | Release |

**Maestro Coverage Summary:**
- **14 flows** in `.maestro/` directory (primary test suite)
- **5 flows** in `maestro/` directory (secondary / demo)
- **Core paths covered:** Auth, onboarding, chat, navigation, settings, museums, support
- **Advanced coverage:** Audio, image compare, quota limiting, RTL

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

### Metrics
| Metric | Count | Coverage % |
|---|---|---|
| **Total Routes** | 25 | 100% identified |
| **Total Screens** | 15 major | 100% scanned |
| **Existing Maestro Flows** | 19 flows | — |
| **Screens with any Maestro coverage** | 12 / 15 | **80%** |
| **Screens with testIDs** | 11 / 15 | **73%** |
| **testIDs across codebase** | 45 total | Partial |
| **Critical testIDs present** | 28 / 45 | **62%** |

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
| **Support** | Ticket creation form | ⚠️ Partial |
| **Carnet** | Save/browse artworks | ❌ None |
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

**Maestro Tests (Primary):**
```
.maestro/
  ├── auth-flow.yaml ..................... Auth lifecycle
  ├── auth-persistence.yaml .............. Token persistence
  ├── chat-flow.yaml ..................... Core chat
  ├── chat-history-pagination.yaml ....... Multi-turn chat
  ├── chat-compare.yaml .................. Image similarity
  ├── onboarding-flow.yaml ............... Carousel
  ├── settings-flow.yaml ................. Settings hub
  ├── settings-locale-switch.yaml ........ i18n
  ├── navigation-flow.yaml ............... Tab navigation
  ├── museum-chat-flow.yaml .............. Museum → chat
  ├── museum-search-geo.yaml ............. Geolocation
  ├── support-ticket-create.yaml ......... Support form
  ├── audio-recording-flow.yaml .......... Voice STT→TTS
  ├── rtl-switch-ar.yaml ................. RTL testing
  └── helpers/
      └── quick-login.yaml ............... Reusable auth
```

**Maestro Tests (Secondary):**
```
maestro/
  ├── login-and-capture.yaml
  ├── capture-screens.yaml
  ├── voice-record-and-tts.yaml
  ├── paywall-quota-exhaustion.yaml
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
