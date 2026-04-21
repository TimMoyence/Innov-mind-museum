# MUSAIUM — Master Product Roadmap & Implementation Plan

> **Date**: 2026-03-19 | **Version**: 2.0
> **Prepared by**: Product Squad (PM, PO, Tech Lead, Design Lead, Engineers)
> **Objective**: Enterprise-grade readiness for global B2B + B2C market launch
> **Score actuel**: 2.8/5 → **Cible**: 4.8/5
> **V2 Changelog**: Integrity audit applied — 23 corrections from V1 (see [Section 11](#11-v1--v2-integrity-audit-changelog))

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Squad Decisions & Strategic Alignment](#2-squad-decisions--strategic-alignment)
3. [Master Screen-by-Screen Improvement Matrix](#3-master-screen-by-screen-improvement-matrix)
4. [Cross-Cutting Features (Non-Screen)](#4-cross-cutting-features-non-screen)
5. [Backend Enterprise Upgrades](#5-backend-enterprise-upgrades)
6. [Infrastructure & DevOps Upgrades](#6-infrastructure--devops-upgrades)
7. [Sprint Planning & Phasing](#7-sprint-planning--phasing)
8. [Consistency Check vs. Existing Plan](#8-consistency-check-vs-existing-plan)
9. [KPIs & Definition of Done](#9-kpis--definition-of-done)
10. [Risk Register](#10-risk-register)
11. [V1 → V2 Integrity Audit Changelog](#11-v1--v2-integrity-audit-changelog)

---

## 1. Executive Summary

### Current State
Musaium is a conversational AI museum companion with a solid hexagonal backend and polished frosted-glass mobile UI. Sprint 1 resolved 20+ critical bugs and security issues. However, the app is **not market-ready** due to:

- **Zero i18n** — hard-coded English, no translation framework (verified: zero `react-i18next` or `expo-localization` in dependencies)
- **Zero accessibility** — 1 `accessibilityLabel` in entire app (`BrandMark.tsx` only), 0 `accessibilityRole`, 0 `accessibilityHint` (verified)
- **Zero offline** — no `@react-native-community/netinfo`, no cache, no queue, photos lost on disconnect (verified)
- **No streaming** — users wait 5-25s staring at dots; zero SSE/EventSource code in codebase (verified)
- **No analytics** — zero Sentry/PostHog/Amplitude; console logging only (verified)
- **No admin panel** — no content moderation, no B2B dashboard
- **iOS permissions missing** — no `NSCameraUsageDescription`, `photosPermission: false`, no `android.permission.CAMERA` (verified: `app.config.ts:138-149`)
- **Support page has TO_FILL placeholders** — `TO_FILL_SUPPORT_RESPONSE_TIME`, `TO_FILL_SUPPORT_OWNER` (verified: `support.tsx:129-132`)
- **No GDPR consent mechanism** — no acceptance checkbox on registration, no consent banner

> **V2 correction**: V1 stated "Privacy Policy has placeholder fields." This was **incorrect**. The privacy policy content (`privacyPolicyContent.ts`) is complete with zero `TO_FILL_` markers. The `controllerAddress` is "France" (incomplete but not a placeholder). The real placeholder issue is on the **Support page**, not Privacy Policy.

### Target State
A globally deployable, WCAG 2.1 AA compliant, fully localized (EN/FR/ES/DE/IT/JA/ZH/AR) conversational AI platform serving:
- **B2C**: Individual museum visitors worldwide
- **B2B**: Museums, cultural institutions, tour operators (white-label, analytics dashboard)

### Market Context
- Museum tech market: $412M (2024) → $2.15B (2033), CAGR 18.7%
- No competitor combines universal AI + any museum + conversational + image recognition
- First-mover advantage requires shipping within Q2 2026

---

## 2. Squad Decisions & Strategic Alignment

### PM Decision Log

| # | Decision | Rationale | Impact |
|---|----------|-----------|--------|
| D1 | i18n via `react-i18next` + `expo-localization` | Global market requires minimum 5 languages at launch | All screens |
| D2 | LLM streaming via SSE (Server-Sent Events) | 5-25s wait is the #1 UX killer — streaming reduces perceived latency to <500ms | Chat screen + backend |
| D3 | Accessibility-first rebuild of all interactive components | WCAG 2.1 AA is legal requirement in EU (EAA 2025) and US (ADA) | All screens |
| D4 | Offline-first with queue + cache | Museum environments have poor connectivity (basement galleries, thick walls) | Chat + Conversations |
| D5 | Redis for rate limiting + caching | In-memory breaks on multi-instance; required for B2B scale | Backend infra |
| D6 | Admin/analytics dashboard (web) | B2B clients need usage analytics, content moderation, billing | New module |
| D7 | Dark mode with system-preference detection | `userInterfaceStyle: 'automatic'` in app.config but `liquidTheme.ts` has only light palette; `useColorScheme` not used anywhere | All screens |
| D8 | Sentry + PostHog integration | Zero observability = flying blind in production | Cross-cutting |
| D9 | iOS/Android permissions fix + GDPR consent | Camera/photo permissions missing → store rejection; no consent mechanism → GDPR violation | Auth + app.config |
| D10 | Voice-first mode (hands-free) | Museum visitors have hands occupied (holding phone to artwork) | Chat screen |
| D11 | Consolidate `services/` → `features/` architecture | Legacy `services/` dir (6 files: authService, tokenStore, http, apiConfig, socialAuthService, index) coexists with `features/auth/` — architectural split causes confusion | Frontend architecture |

---

## 3. Master Screen-by-Screen Improvement Matrix

### Legend
- **Status**: `DONE` = Sprint 1 completed | `PARTIAL` = started | `TODO` = not started
- **Priority**: `P0` = launch blocker | `P1` = launch critical | `P2` = post-launch

---

### 3.1 AUTH SCREEN (`app/auth.tsx`)

| Dimension | Current State | Target State | Status | Priority |
|-----------|--------------|--------------|--------|----------|
| **Core Auth** | Email/password login + register, Apple + Google social | Same + email verification + CAPTCHA + GDPR consent checkbox | PARTIAL | P0 |
| **i18n** | Hard-coded English | Full i18n (labels, errors, placeholders) | TODO | P0 |
| **Accessibility** | No labels on inputs, no role declarations | accessibilityLabel on all inputs, roles, hints, VoiceOver tested | TODO | P0 |
| **Dark Mode** | Light only (liquidTheme.ts light-only palette) | Adaptive theme (light/dark) | TODO | P1 |
| **Password UX** | Basic TextInput | Show/hide toggle, strength indicator, requirements list | TODO | P1 |
| **Biometric** | Not present | Face ID / Fingerprint for returning users | TODO | P2 |
| **Error UX** | ErrorNotice banner | Inline field-level validation + banner | PARTIAL | P1 |
| **Loading States** | Basic spinner | Skeleton shimmer on form, disabled inputs while loading | TODO | P1 |
| **GDPR Consent** | Not present | Checkbox "I accept the Privacy Policy and Terms of Service" mandatory on register | TODO | P0 |

**Design Pitch — Auth Screen**:
> Moderniser l'ecran d'authentification avec une experience biometrique fluide pour les utilisateurs recurrents. Ajout d'un indicateur de force du mot de passe en temps reel, validation inline par champ, et transitions animees entre login/signup. Checkbox obligatoire pour les CGU/Politique de confidentialite. Le design doit supporter le dark mode et s'adapter a toutes les tailles d'ecran (mobile, tablet, desktop web via Expo).

**User Stories**:

| ID | User Story | Acceptance Criteria |
|----|-----------|-------------------|
| US-AUTH-01 | En tant qu'utilisateur, je veux m'inscrire avec mon email et recevoir un email de verification | Email envoye via Brevo (service existant dans `shared/email/`), lien cliquable, compte active apres verification |
| US-AUTH-02 | En tant qu'utilisateur recurrent, je veux me connecter avec Face ID / Fingerprint | Expo LocalAuthentication, fallback vers password, opt-in dans settings |
| US-AUTH-03 | En tant qu'utilisateur, je veux voir la force de mon mot de passe en temps reel | Barre coloree (rouge→orange→vert), checklist des criteres (8+ chars, majuscule, chiffre) |
| US-AUTH-04 | En tant qu'utilisateur malvoyant, je veux naviguer l'ecran auth avec VoiceOver | Tous les champs ont accessibilityLabel, accessibilityHint, role correct |
| US-AUTH-05 | En tant qu'utilisateur francophone, je veux voir l'ecran auth dans ma langue | Detection automatique du locale device, switch manuel possible |
| US-AUTH-06 | En tant qu'utilisateur, je veux un CAPTCHA invisible pour eviter les bots | hCaptcha ou reCAPTCHA v3 sur register, transparent pour l'utilisateur |
| US-AUTH-07 | En tant qu'utilisateur, je dois accepter les CGU et la politique de confidentialite pour m'inscrire | Checkbox obligatoire, lien vers chaque document, refus = pas d'inscription |

**Architecture**:

> **V2 correction**: `useAuth` lives in `context/AuthContext.tsx`, NOT in `features/auth/application/`. `authService` lives in `services/authService.ts`, NOT in `features/auth/infrastructure/`. The roadmap must acknowledge the actual locations and plan migration.

```
# ACTUAL current layout:
context/AuthContext.tsx               ← useAuth hook (provides isAuthenticated, logout)
services/authService.ts              ← API calls (login, register, refresh, delete, forgot-password)
services/socialAuthService.ts        ← Apple/Google OAuth helpers
services/tokenStore.ts               ← In-memory token cache
services/apiConfig.ts                ← URL builders, env resolution
services/http.ts                     ← Low-level HTTP wrapper
services/index.ts                    ← Barrel export
features/auth/application/useSocialLogin.ts  ← React hook wrapping socialAuthService
features/auth/infrastructure/authStorage.ts  ← Secure token persistence (expo-secure-store)

# TARGET layout (migration S2):
context/AuthContext.tsx               ← KEEP (React context must stay here)
features/auth/
├── application/
│   ├── useSocialLogin.ts            ← EXISTS (OK)
│   ├── useEmailVerification.ts      ← NEW
│   └── useBiometricAuth.ts          ← NEW (S4)
├── infrastructure/
│   ├── authService.ts               ← MIGRATE from services/authService.ts
│   ├── authStorage.ts               ← EXISTS (OK)
│   ├── socialAuthService.ts         ← MIGRATE from services/socialAuthService.ts
│   └── biometricService.ts          ← NEW (S4)
└── ui/
    ├── PasswordStrengthBar.tsx       ← NEW
    ├── InlineFieldError.tsx          ← NEW
    ├── GdprConsentCheckbox.tsx       ← NEW
    └── BiometricPrompt.tsx           ← NEW (S4)

# DEPRECATED (delete after migration):
services/authService.ts              ← DELETE (moved to features/auth/infrastructure/)
services/socialAuthService.ts        ← DELETE (moved)
services/tokenStore.ts               ← DELETE (merged into authStorage)
services/http.ts                     ← DELETE (replaced by shared/infrastructure/httpClient.ts)
services/apiConfig.ts                ← MIGRATE to shared/config/
services/index.ts                    ← DELETE
```

---

### 3.2 HOME SCREEN (`app/(tabs)/home.tsx`)

| Dimension | Current State | Target State | Status | Priority |
|-----------|--------------|--------------|--------|----------|
| **Hero** | BrandMark + settings summary + 3 quick action buttons | Personalized greeting (time-based), last artwork discussed, quick-resume | PARTIAL | P1 |
| **i18n** | Hard-coded English | Full i18n | TODO | P0 |
| **Accessibility** | No labels on Pressables or FloatingContextMenu | Full a11y on all interactive elements | TODO | P0 |
| **Dark Mode** | Light only | Adaptive | TODO | P1 |
| **Offline** | Error on network fail | Cached last session, offline indicator banner, queue action | TODO | P1 |
| **Quick Actions** | 3 buttons (start, onboarding, settings) + FloatingContextMenu (Discover, Lens, Audio) | Smart suggestions based on context (time of day, museum detected, pending session) | TODO | P2 |
| **Museum Detection** | Not present | Geolocation + museum database → auto-suggest guided mode | TODO | P2 |
| **Onboarding CTA** | Button link (always visible) | Conditional: shown only for new users or after major update | TODO | P1 |

**User Stories**:

| ID | User Story | Acceptance Criteria |
|----|-----------|-------------------|
| US-HOME-01 | En tant qu'utilisateur, je veux voir un message d'accueil personnalise | Greeting base sur l'heure + prenom du JWT, traduit |
| US-HOME-02 | En tant qu'utilisateur, je veux reprendre ma derniere conversation en un tap | Card "Resume" avec titre de session et dernier message |
| US-HOME-03 | En tant qu'utilisateur dans un musee, je veux que l'app detecte le musee | Geolocation → match base musees → suggestion mode guide |
| US-HOME-04 | En tant qu'utilisateur offline, je veux voir un indicateur clair | Banner "Offline mode" + actions disponibles en cache |

**Architecture**:

```
features/home/                    ← NEW feature module
├── application/
│   ├── useHomeContext.ts         ← NEW (greeting, last session, suggestions)
│   └── useMuseumDetection.ts    ← NEW (geolocation + museum DB) [S4]
└── ui/
    ├── PersonalizedGreeting.tsx  ← NEW
    ├── ResumeSessionCard.tsx     ← NEW
    └── OfflineBanner.tsx         ← NEW (shared/ui candidate)
```

---

### 3.3 CONVERSATIONS SCREEN (`app/(tabs)/conversations.tsx`)

| Dimension | Current State | Target State | Status | Priority |
|-----------|--------------|--------------|--------|----------|
| **List** | FlatList, 50 items max, no infinite scroll, no getItemLayout | Infinite scroll with cursor pagination, getItemLayout, memoized renderItem | PARTIAL | P0 |
| **i18n** | Partial (timestamps locale-aware via `locale` setting) | Full i18n (labels, empty state, sort options) | PARTIAL | P0 |
| **Accessibility** | No labels on session cards | accessibilityLabel per card, accessibilityRole="button" | TODO | P0 |
| **Dark Mode** | Light only | Adaptive | TODO | P1 |
| **Offline** | Error on fetch | Cached conversations list, offline indicator | TODO | P1 |
| **Search** | Not present | Search by title, museum name, artwork discussed | TODO | P1 |
| **Bulk Actions** | Not present | Multi-select + delete, export, share | TODO | P2 |
| **Empty State** | Basic text card ("No conversations yet") | Illustrated empty state with CTA "Start your first conversation" | PARTIAL | P1 |
| **Skeleton Loading** | Not present | Shimmer placeholder cards during load | TODO | P1 |
| **Swipe Actions** | Not present | Swipe-to-delete, swipe-to-save (iOS convention) | TODO | P2 |

**Architecture**:

> **V2 correction**: `features/conversation/` exists but is **hollow** (empty `application/` and `domain/` subdirs, zero files). Marking as "EXISTS (empty — populate)" instead of "EXISTS (update)".

```
features/conversation/             ← EXISTS (empty — populate)
├── application/
│   ├── useConversationList.ts     ← NEW (extract from screen, infinite scroll)
│   ├── useConversationSearch.ts   ← NEW
│   └── useConversationBulk.ts     ← NEW
└── ui/
    ├── ConversationCard.tsx        ← NEW (extract from screen)
    ├── ConversationSkeleton.tsx    ← NEW
    ├── ConversationSearchBar.tsx   ← NEW
    └── EmptyConversations.tsx      ← NEW (illustrated)
```

---

### 3.4 CHAT SCREEN (`app/(stack)/chat/[sessionId].tsx`)

| Dimension | Current State | Target State | Status | Priority |
|-----------|--------------|--------------|--------|----------|
| **Streaming** | Full response wait (no SSE, no EventSource lib) | SSE streaming token-by-token | TODO | **P0** |
| **i18n** | Partial (WelcomeCard has FR/EN suggestions) | Full i18n (all labels, suggestions, error messages) | PARTIAL | P0 |
| **Accessibility** | Zero labels on message bubbles, input, buttons | Full: message roles announced, image alt text, audio controls labeled, accessibilityLiveRegion for new messages | TODO | P0 |
| **Dark Mode** | Light only | Adaptive (dark chat bubbles, contrast-safe markdown) | TODO | P1 |
| **Offline** | Error, photo lost | Queue messages offline, send when online, persist draft | TODO | P0 |
| **Voice Mode** | Record → transcribe → text (useAudioRecorder exists) | Real-time voice conversation (speech-to-text → LLM → text-to-speech) | PARTIAL | P1 |
| **Image UX** | Camera + gallery (useImagePicker exists) | Image preview before send, crop/rotate, multi-image, progress indicator | PARTIAL | P1 |
| **Message Actions** | Long-press report (placeholder wired but basic) | Long-press menu: copy, share, report, save artwork | PARTIAL | P1 |
| **Typing Indicator** | 3 animated dots (Reanimated, staggered opacity) | Streaming eliminates need; show "thinking..." for guardrail check phase | DONE | P1 |
| **Cross-Session Memory** | None (12-message history window in backend) | Persistent user profile: preferred topics, expertise level, visited museums | TODO | P2 |
| **Haptic Feedback** | None | On send, on receive, on camera capture | TODO | P2 |
| **Image Prompt Injection** | Not detected (no OCR in codebase) | OCR-based text extraction from images → guardrail check | TODO | P1 |
| **FlatList Perf** | No getItemLayout, renderItem inline in ChatMessageList | Memoized renderItem, getItemLayout, windowSize tuning | TODO | P0 |

**Architecture**:

```
# Backend additions
modules/chat/
├── adapters/primary/http/
│   └── chat.route.ts              ← UPDATE: add SSE endpoint GET /sessions/:id/stream
├── adapters/secondary/
│   ├── tts.service.ts             ← NEW (text-to-speech via OpenAI/Google) [S3]
│   └── ocr.service.ts             ← NEW (image text extraction) [S3]
├── application/
│   ├── chat.service.ts            ← UPDATE: add streaming orchestration method
│   └── image-safety.ts            ← NEW (OCR + guardrail on image text) [S3]
└── domain/
    └── user-profile.entity.ts     ← NEW (cross-session memory) [S4]

# Frontend additions
features/chat/
├── application/
│   ├── useChatSession.ts          ← EXISTS: UPDATE for SSE streaming, offline queue
│   ├── useAudioRecorder.ts        ← EXISTS (OK)
│   ├── useImagePicker.ts          ← EXISTS (OK)
│   ├── useChatStreaming.ts        ← NEW (SSE EventSource management)
│   ├── useOfflineQueue.ts         ← NEW (message queue + sync)
│   └── useVoiceMode.ts            ← NEW (STT → LLM → TTS pipeline) [S3]
└── ui/
    ├── ChatMessageList.tsx         ← EXISTS: UPDATE for streaming
    ├── ChatInput.tsx               ← EXISTS (OK)
    ├── ChatMessageBubble.tsx       ← EXISTS: UPDATE for a11y
    ├── StreamingBubble.tsx         ← NEW (token-by-token render)
    ├── ImagePreview.tsx            ← NEW (crop/rotate modal)
    ├── MessageContextMenu.tsx      ← NEW (long-press actions)
    ├── VoiceModeOverlay.tsx        ← NEW (hands-free UI) [S3]
    └── OfflineQueueBadge.tsx       ← NEW
```

---

### 3.5 SETTINGS HUB (`app/(stack)/settings.tsx`)

| Dimension | Current State | Target State | Status | Priority |
|-----------|--------------|--------------|--------|----------|
| **i18n** | Hard-coded English | Full i18n | TODO | P0 |
| **Accessibility** | No labels on link rows | accessibilityRole="link", labels, hints | TODO | P0 |
| **Dark Mode** | Light only | Adaptive + theme toggle in settings | TODO | P1 |
| **Account Section** | Delete + logout only | Add: change password, change email, manage social accounts, export data | PARTIAL | P1 |
| **Notification Preferences** | Not present | Push notification toggles (new features, tips, marketing) | TODO | P2 |
| **App Info** | Not present | App version, build number, licenses link | TODO | P1 |
| **Data Export** | Not present | GDPR data export (JSON download of all user data) | TODO | P1 |
| **Appearance** | Not present | Theme selector (light/dark/system), font size | TODO | P1 |

**Architecture**:

```
features/settings/                 ← EXISTS (has application/ subdir)
├── application/
│   ├── useRuntimeSettings.ts      ← EXISTS (in application/ subdir)
│   ├── useAccountSettings.ts      ← NEW (change password, email, manage social)
│   ├── useDataExport.ts           ← NEW (GDPR export)
│   └── useAppearance.ts           ← NEW (theme, font size)
└── ui/
    ├── ThemeSelector.tsx           ← NEW
    ├── AccountSection.tsx          ← NEW
    └── AppVersionFooter.tsx        ← NEW
```

---

### 3.6 PREFERENCES SCREEN (`app/(stack)/preferences.tsx`)

| Dimension | Current State | Target State | Status | Priority |
|-----------|--------------|--------------|--------|----------|
| **Language Selector** | Manual text input for locale | Dropdown/picker with flag icons, 8+ languages | TODO | P0 |
| **i18n** | Hard-coded English labels | Full i18n | TODO | P0 |
| **Accessibility** | Switch accessible, rest not labeled | Full a11y on all controls | TODO | P0 |
| **Museum Mode** | Toggle switch | Visual explanation with before/after example | PARTIAL | P1 |
| **Guide Level** | Button group (beginner/intermediate/expert) | Slider or segmented control with descriptions | PARTIAL | P1 |

---

### 3.7 ONBOARDING SCREEN (`app/(stack)/onboarding.tsx`)

| Dimension | Current State | Target State | Status | Priority |
|-----------|--------------|--------------|--------|----------|
| **Format** | 3 tab-based text sections (Flow/Tips/Help) via FloatingContextMenu | Swipeable carousel with illustrations + animations | TODO | P1 |
| **i18n** | Hard-coded English | Full i18n | TODO | P0 |
| **Accessibility** | No semantic structure for bullet lists | Screen reader-friendly carousel, skip button | TODO | P0 |
| **First-Launch** | Manual access only (via Settings or Home link) | Auto-show on first app launch, skippable, flag in AsyncStorage | TODO | P1 |

---

### 3.8 DISCOVER SCREEN (`app/(stack)/discover.tsx`)

| Dimension | Current State | Target State | Status | Priority |
|-----------|--------------|--------------|--------|----------|
| **Content** | 3 static action cards (Photo/Voice/Recent) + FloatingContextMenu | Dynamic: featured museums, trending artworks, curated collections | TODO | P2 |
| **i18n** | Hard-coded English | Full i18n | TODO | P0 |
| **Accessibility** | Pressable cards, no labels | Full a11y | TODO | P0 |
| **Museum Directory** | Not present | Searchable museum list with map view (B2B partner museums highlighted) | TODO | P2 |

---

### 3.9 PRIVACY POLICY SCREEN (`app/(stack)/privacy.tsx`)

> **V2 correction**: Privacy policy **content** is complete (zero `TO_FILL_` markers in `privacyPolicyContent.ts`). `controllerAddress` is "France" (should be full address for GDPR but not a placeholder). The screen renders metadata with `isPrivacyPlaceholderValue()` checker — correctly shows zero unresolved items.

| Dimension | Current State | Target State | Status | Priority |
|-----------|--------------|--------------|--------|----------|
| **Content** | Complete — zero TO_FILL placeholders. Controller address="France" (incomplete but functional) | Full postal address for GDPR compliance, DPO designation if team grows >250 | **DONE** (minor fix needed) | P1 |
| **i18n** | English only | Minimum EN + FR (legal requirement for FR market) | TODO | P0 |
| **Versioning** | Version 1.0.0, lastUpdated: 2026-03-18 | Versioned with diff view for changes | PARTIAL | P1 |
| **Consent** | Not implemented | Consent banner on first launch, re-consent on version change | TODO | P0 |
| **Account Deletion Timeline** | Not specified | Specify "Account deleted within 30 days of request" (Apple requirement) | TODO | P0 |

---

### 3.10 TERMS OF SERVICE SCREEN (`app/(stack)/terms.tsx`)

> **V2 correction**: Terms of Service **content** is complete (structured, versioned, with proper legal sections). V1 claimed "PARTIAL" — this was inaccurate for content, though i18n and acceptance mechanism are still missing.

| Dimension | Current State | Target State | Status | Priority |
|-----------|--------------|--------------|--------|----------|
| **Content** | Complete — versioned, AI disclaimer, liability clause included | Legal review stamp | **DONE** | - |
| **i18n** | English only | EN + FR minimum | TODO | P0 |
| **Acceptance** | No mechanism | Must-accept on signup, version tracking per user | TODO | P0 |

---

### 3.11 SUPPORT SCREEN (`app/(stack)/support.tsx`)

> **V2 correction**: Support screen has active `TO_FILL_*` placeholders AND user-visible text "Replace placeholder handles before production release" (line 92-93). This is a **store blocker**.

| Dimension | Current State | Target State | Status | Priority |
|-----------|--------------|--------------|--------|----------|
| **Channels** | Instagram + Telegram (handles configured via `SUPPORT_LINKS`), "Replace placeholder handles before production release" text visible to users | Real handles + email + in-app feedback form, remove dev text | PARTIAL | **P0** |
| **Placeholders** | `TO_FILL_SUPPORT_RESPONSE_TIME` and `TO_FILL_SUPPORT_OWNER` visible in UI (lines 129, 132) | Real response time SLA, real owner name | TODO | **P0** |
| **i18n** | English only | Full i18n | TODO | P0 |
| **In-App Support** | Not present | Chat-based support or ticket system | TODO | P2 |

---

### 3.12 GUIDED MUSEUM MODE SCREEN (`app/(stack)/guided-museum-mode.tsx`)

| Dimension | Current State | Target State | Status | Priority |
|-----------|--------------|--------------|--------|----------|
| **i18n** | English only | Full i18n | TODO | P0 |
| **Interactivity** | Static info (reads museumMode + guideLevel from settings) | Interactive demo/preview of guided mode vs standard | TODO | P2 |

---

### 3.13 404 / NOT FOUND SCREEN (`app/+not-found.tsx`)

| Dimension | Current State | Target State | Status | Priority |
|-----------|--------------|--------------|--------|----------|
| **i18n** | English only | Full i18n | TODO | P0 |
| **Design** | Basic "This screen does not exist" + link to home | Illustrated 404 with navigation suggestions | TODO | P2 |

---

### 3.14 NEW SCREEN — ADMIN DASHBOARD (Web) [S4]

| Dimension | Current State | Target State | Status | Priority |
|-----------|--------------|--------------|--------|----------|
| **Existence** | Does not exist (`museum-admin/` and `modules/admin/` absent) | Full web-based admin panel | TODO | P1 (S4) |

**Architecture**:

```
# New module: admin (separate web app)
museum-admin/                      ← NEW (React + Vite + Tailwind)
├── src/
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Moderation.tsx
│   │   ├── Users.tsx
│   │   ├── Museums.tsx
│   │   └── Analytics.tsx
│   ├── api/                       ← Admin API client
│   └── components/

# Backend admin module
museum-backend/src/modules/admin/  ← NEW
├── core/
│   ├── domain/
│   │   └── admin.role.ts
│   └── useCase/
│       ├── moderation.useCase.ts
│       ├── analytics.useCase.ts
│       └── user-management.useCase.ts
├── adapters/
│   ├── primary/http/
│   │   └── admin.route.ts         ← Protected by admin role middleware
│   └── secondary/
│       └── analytics.repository.pg.ts
```

---

## 4. Cross-Cutting Features (Non-Screen)

### 4.1 Internationalization (i18n)

| Item | Current | Target | Status | Priority |
|------|---------|--------|--------|----------|
| Framework | None (`react-i18next` not in dependencies) | `react-i18next` + `expo-localization` | TODO | P0 |
| Languages | English only (hard-coded strings in all 14 screens) | EN, FR, ES, DE, IT, JA, ZH, AR | TODO | P0 |
| Backend | No locale negotiation, error messages hard-coded | `Accept-Language` header → localized error messages | TODO | P0 |
| Content | Hard-coded strings (~200+ across all screens) | Extracted to JSON resource files | TODO | P0 |
| RTL | Not supported | Arabic RTL layout support | TODO | P1 |
| Legal | English only (privacy + terms complete in EN) | EN + FR minimum (legal requirement) | TODO | P0 |

---

### 4.2 Accessibility (a11y)

| Item | Current (verified) | Target | Status | Priority |
|------|---------|--------|--------|----------|
| Labels | **1 total** (`BrandMark.tsx` image label) | 100% interactive elements labeled | TODO | P0 |
| Roles | **0 total** | All buttons, links, inputs, images have correct role | TODO | P0 |
| Hints | **0 total** | Complex interactions have accessibilityHint | TODO | P0 |
| Screen Reader | Untested | VoiceOver (iOS) + TalkBack (Android) full test suite | TODO | P0 |
| Focus Order | Default | Logical tab order, skip navigation | TODO | P0 |
| Contrast | Unchecked (frosted glass may fail) | WCAG 2.1 AA minimum contrast ratios verified | TODO | P0 |
| Motion | Uncontrolled (TypingIndicator auto-animates) | Respect `prefers-reduced-motion`, no auto-play animations | TODO | P1 |
| Font Scaling | Unchecked | Dynamic Type (iOS) + font scaling (Android) tested | TODO | P0 |
| Live Regions | None | New messages, errors, status changes announced via `accessibilityLiveRegion` | TODO | P0 |

---

### 4.3 Offline Support

| Item | Current (verified) | Target | Status | Priority |
|------|---------|--------|--------|----------|
| Network Detection | None (`@react-native-community/netinfo` not in package.json) | NetInfo + global connectivity context | TODO | P0 |
| Message Queue | None | Offline queue with retry on reconnect | TODO | P0 |
| Session Cache | None (AsyncStorage used only for settings + saved IDs) | Last 10 sessions cached | TODO | P1 |
| Image Cache | None | Downloaded images cached locally | TODO | P1 |
| Draft Persistence | None | Unsent text/image persisted | TODO | P0 |
| Sync Indicator | None | Visual sync status (synced/pending/error) | TODO | P1 |

---

### 4.4 Dark Mode

| Item | Current (verified) | Target | Status | Priority |
|------|---------|--------|--------|----------|
| Theme System | `userInterfaceStyle: 'automatic'` in app.config.ts (line 120) but `useColorScheme()` not imported anywhere; `liquidTheme.ts` has light-only palette | Full theme provider with light/dark/system tokens | TODO | P1 |
| Colors | Hard-coded in `liquidTheme.ts`: `pageGradient: ['#EAF2FF',...]`, `glassBorder: 'rgba(255,255,255,0.58)'` | Design tokens in theme file with dark variant | TODO | P1 |
| Images | Single variant (museum backgrounds) | Dark-optimized backgrounds and illustrations | TODO | P1 |
| Persistence | None | Theme preference in AsyncStorage | TODO | P1 |

---

### 4.5 Analytics & Observability

| Item | Current (verified) | Target | Status | Priority |
|------|---------|--------|--------|----------|
| Error Tracking | Console only; backend has structured JSON logging with requestId | Sentry (frontend + backend) | TODO | P0 |
| Product Analytics | None | PostHog (events, funnels, retention) | TODO | P1 |
| Performance | None | Sentry Performance (transaction tracing) | TODO | P1 |
| LLM Analytics | Structured logs only (`langchain.orchestrator.ts` logs latency, token usage) | Token usage, cost tracking, latency P50/P95/P99 dashboards | TODO | P1 |
| x-request-id | Backend generates + propagates; **frontend does NOT propagate** (verified) | Frontend sends x-request-id on all API calls for trace correlation | TODO | P1 |
| User Sessions | None | Session replay (PostHog) for UX debugging | TODO | P2 |

---

### 4.6 iOS/Android Store Compliance (NEW in V2)

| Item | Current (verified) | Target | Status | Priority |
|------|---------|--------|--------|----------|
| NSCameraUsageDescription | **MISSING** (`app.config.ts:138-142` — only microphone declared) | Add iOS camera usage description | TODO | **P0** |
| photosPermission | **Set to `false`** (`app.config.ts:165`) — gallery picker will fail | Change to usage description string | TODO | **P0** |
| Android CAMERA permission | **MISSING** (`app.config.ts:149` — only RECORD_AUDIO) | Add `android.permission.CAMERA` | TODO | **P0** |
| PrivacyInfo.xcprivacy | **MISSING** (Apple requires since Spring 2024) | Create privacy manifest declaring APIs used | TODO | **P0** |
| Data Safety (Google Play) | Not prepared | Complete Data Safety form for Play Console | TODO | **P0** |
| ATTrackingManager | Not present (no analytics = OK for now) | Required when PostHog/analytics added | TODO | P1 |
| Account Deletion Timeline | Not specified in privacy policy | Add "within 30 days" (Apple requires reasonable timeframe) | TODO | P0 |
| Cleartext Traffic (Android) | Not explicitly configured (localhost blocked in prod code) | Verify `android:usesCleartextTraffic="false"` in prod | TODO | P1 |

---

## 5. Backend Enterprise Upgrades

### 5.1 Security Hardening

| Item | Current (verified) | Target | Sprint | Priority |
|------|---------|--------|--------|----------|
| Rate Limiting | In-memory Map (`rate-limit.middleware.ts:10,31`), no Redis | Redis-backed sliding window | S2 | P0 |
| Email Verification | Brevo service EXISTS (`shared/email/brevo-email.service.ts`) but NOT wired into register flow (`register.useCase.ts` has zero email code) | Wire Brevo into registration | S2 | P0 |
| CAPTCHA | None (zero matches for captcha/hcaptcha/recaptcha in codebase) | hCaptcha on register | S2 | P1 |
| Bcrypt Cost | **10** (hard-coded in `user.repository.pg.ts:53,109` and `resetPassword.useCase.ts:22`) | 12 (OWASP recommendation) | S2 | P1 |
| JWT Claims | PII: `email`, `firstname`, `lastname` in access token (`authSession.service.ts:21-28,298-309`) | Sub + JTI only (fetch profile from DB) | S2 | P1 |
| Reset Token | SHA-256 hashed via `crypto.createHash('sha256')` (`authSession.service.ts:70-82`) | N/A | **DONE** | - |
| Social Login Verification | `emailVerified` checked (`socialLogin.useCase.ts:74`) | N/A | **DONE** | - |
| SSRF | Comprehensive IPv4/IPv6/private range blocking (`image-input.ts:9-27`: 17 regex patterns) | N/A | **DONE** | - |
| LLM Diagnostics | Conditional: `env.llm.includeDiagnostics` (default false in prod, true in dev — `env.ts:197-199`). If misconfigured, leaks provider/model/latency/retries | Hard-code `false` in production, remove env var override | S2 | P1 |
| Image Prompt Injection | Not detected (zero OCR/tesseract matches in codebase) | OCR extraction → guardrail check | S3 | P1 |
| Session Fixation | No device binding | Bind refresh token to device fingerprint | S3 | P2 |
| API Key Auth | Not present | API key for B2B integrations | S3 | P1 |
| Rate Limit Bypass (NEW-SEC-06) | Session rotation can create unlimited buckets; no eviction | Cap bucket count, add TTL cleanup | S2 | P1 |
| Login Error Oracle (NEW-SEC-09) | Login error leaks social account type (e.g., "Use Google to sign in") | Generic error message for all auth failures | S2 | P1 |
| Report Comment Length (NEW — M5) | `/messages/:id/report` has no max length on comment field | Add max 500 chars validation | S2 | P1 |
| Registration Response (NEW — M1) | Register returns full user object | Strip to id + email only | S2 | P1 |

### 5.2 API & Data

| Item | Current (verified) | Target | Sprint | Priority |
|------|---------|--------|--------|----------|
| Streaming | None (zero SSE/EventSource/stream code in chat module) | SSE endpoint `GET /sessions/:id/stream` | S2 | **P0** |
| OpenAPI Spec | `forgot-password` and `reset-password` missing from spec (verified by power-tools) | 100% complete, auto-validated in CI | S2 | P0 |
| Data Export | None | GDPR export endpoint (user data as JSON) | S2 | P1 |
| Message Retention | Indefinite | Configurable retention policy (default 1 year) | S3 | P1 |
| Expired Token Cleanup | None | Cron job (daily) to purge expired refresh tokens | S2 | P1 |
| Change Password | None | Authenticated endpoint | S2 | P1 |
| Change Email | None | Authenticated + verification endpoint | S3 | P1 |
| EXPO_PUBLIC_EAS_PROJECT_ID | Undocumented (not in any env example or CI — verified by power-tools) | Document in .env examples + CI secrets doc | S2 | P1 |

### 5.3 Scalability

| Item | Current | Target | Sprint | Priority |
|------|---------|--------|--------|----------|
| Cache Layer | None (zero Redis in codebase) | Redis cache (sessions, artwork matches, LLM responses) | S3 | P1 |
| DB Connection Pool | Dual pools (TypeORM + raw pg) | Unified single pool | S2 | P1 |
| Orphaned Files | No cleanup | S3 lifecycle rules + cron cleanup for local | S2 | P1 |
| Horizontal Scaling | In-memory state blocks it | Redis for all shared state | S3 | P1 |

### 5.4 Admin Module [S4]

| Item | Current | Target | Sprint | Priority |
|------|---------|--------|--------|----------|
| Admin Role | Not present | Role-based access (admin, moderator, museum_manager) | S4 | P1 |
| User Management | Not present | Search, suspend, delete, impersonate | S4 | P1 |
| Content Moderation | Report endpoint only (`/messages/:id/report`) | Moderation queue, actions, audit log | S4 | P1 |
| Analytics API | Not present | Usage metrics, LLM cost, session analytics | S4 | P1 |
| Audit Logging | Not present | Immutable audit trail (JSONB table) | S4 | P1 |
| Multi-Tenancy | Single DB | Tenant-scoped data for B2B museum partners | S4 | P2 |

---

## 6. Infrastructure & DevOps Upgrades

| Item | Current | Target | Sprint | Priority |
|------|---------|--------|--------|----------|
| Error Tracking | None | Sentry (free tier: 5k events/month) | S2 | P0 |
| APM | None | Sentry Performance or DataDog | S3 | P1 |
| Feature Flags | None | Unleash or PostHog flags | S3 | P1 |
| CDN | None | CloudFlare for API + S3 assets | S4 | P2 |
| Database Backup | Not documented | Automated daily backup + tested restore | S2 | P0 |
| SAST in CI | None | `npm audit` + Snyk or Dependabot | S2 | P1 |
| Uptime Monitoring | Post-deploy smoke only | BetterUptime or UptimeRobot (5-min interval) | S2 | P0 |
| Container Scanning | None | Trivy in CI for Docker base image CVEs | S3 | P1 |
| Secrets Rotation | No strategy | Documented rotation schedule (quarterly) | S2 | P1 |
| Redis | Not present (zero references in codebase) | Redis 7 in Docker Compose + production | S2 | P0 |
| Distributed Tracing | None | OpenTelemetry traces | S4 | P2 |
| Log Aggregation | stdout only | CloudWatch, Loki, or Datadog Logs | S3 | P1 |

---

## 7. Sprint Planning & Phasing

> **V2 correction**: V1 claimed S2 = "Weeks 1-2" but tasks summed to **28.5 person-days** (~5.7 weeks for 1 FTE). Estimates now assume **3 FTE** (1 frontend, 1 backend, 1 full-stack/devops). Sprint durations adjusted to be realistic.

### Sprint 2 — Foundation (Weeks 1-3, 3 FTE) — "Make it Shippable"

| # | Task | Owner | Depends On | Est. | Note |
|---|------|-------|-----------|------|------|
| 1 | Fix iOS permissions: add NSCameraUsageDescription, photosPermission, android.permission.CAMERA | Frontend | - | 0.5d | **Store blocker** |
| 2 | Fix support page: remove TO_FILL placeholders, remove "Replace placeholder" dev text | Frontend | - | 0.5d | **Store blocker** |
| 3 | Create PrivacyInfo.xcprivacy manifest | Frontend | - | 0.5d | **Apple requirement** |
| 4 | Implement SSE streaming endpoint (backend) | Backend | - | 3d | P0 — biggest UX impact |
| 5 | Add EventSource polyfill + integrate SSE in chat screen | Frontend | #4 | 2d | |
| 6 | Setup `react-i18next` + `expo-localization` + extract all strings (EN + FR) | Frontend | - | 4d | ~200+ strings |
| 7 | Add accessibilityLabel/Role/Hint to ALL interactive components (14 screens) | Frontend | - | 3d | |
| 8 | Setup Redis (Docker + prod) + migrate rate limiter | Backend | - | 2d | |
| 9 | Complete OpenAPI spec (forgot-password, reset-password + 3 bodies + 2 params) | Backend | - | 1d | |
| 10 | Add Sentry to backend + frontend | Full-stack | - | 1d | |
| 11 | Setup uptime monitoring (BetterUptime) | DevOps | - | 0.5d | |
| 12 | Setup automated DB backup | DevOps | - | 1d | |
| 13 | Wire Brevo email verification into register flow | Backend | - | 2d | Brevo service already exists |
| 14 | Implement GDPR consent banner + acceptance checkbox on register | Frontend | - | 1d | |
| 15 | FlatList performance (getItemLayout, memoized renderItem) | Frontend | - | 1d | |
| 16 | Consolidate `services/` → `features/auth/infrastructure/` | Frontend | - | 1.5d | D11 |
| 17 | Expired token cleanup cron | Backend | #8 | 0.5d | |
| 18 | Change password endpoint | Backend | - | 1d | |
| 19 | `npm audit` / Snyk in CI | DevOps | - | 0.5d | |
| 20 | Fix security items: rate limit bypass (SEC-06), login oracle (SEC-09), report length (M5), register response (M1) | Backend | - | 1d | |
| 21 | Bcrypt cost 10 → 12 | Backend | - | 0.5d | |
| 22 | Strip PII from JWT claims (email, firstname, lastname) | Backend | - | 1d | |
| 23 | Hard-code `includeDiagnostics=false` for production | Backend | - | 0.5d | |
| 24 | Add x-request-id propagation from frontend | Frontend | - | 0.5d | |
| 25 | Document EXPO_PUBLIC_EAS_PROJECT_ID | DevOps | - | 0.5d | |
| | | | **TOTAL** | **~30d** | **~10d per FTE over 2.5 weeks** |

**Sprint 2 Goal**: App passes store review (permissions, privacy, a11y basics), legally compliant (GDPR consent, complete legal docs), streaming chat, i18n framework with EN+FR, security hardened.

---

### Sprint 3 — Polish (Weeks 4-6, 3 FTE) — "Make it Delightful"

| # | Task | Owner | Depends On | Est. |
|---|------|-------|-----------|------|
| 1 | Dark mode theme system + all screens | Frontend | S2 | 3d |
| 2 | Offline support (NetInfo + message queue + cache) | Frontend | S2 | 3d |
| 3 | Onboarding carousel redesign (Lottie animations) | Design + FE | - | 3d |
| 4 | Voice mode (STT → LLM → TTS) | Full-stack | S2-#4 | 4d |
| 5 | Image preview + crop before send | Frontend | - | 2d |
| 6 | Message context menu (copy, share, report, save) | Frontend | - | 2d |
| 7 | Skeleton loading screens (conversations, chat) | Frontend | - | 1d |
| 8 | Conversation search + infinite scroll | Frontend | S2 | 2d |
| 9 | Redis cache layer (sessions, artwork) | Backend | S2-#8 | 2d |
| 10 | Image prompt injection detection (OCR) | Backend | - | 2d |
| 11 | GDPR data export endpoint | Backend | - | 2d |
| 12 | Feature flags (Unleash/PostHog) | DevOps | - | 2d |
| 13 | APM setup (Sentry Performance) | DevOps | S2-#10 | 1d |
| 14 | Add 5 more languages (ES, DE, IT, JA, ZH) | Frontend | S2-#6 | 3d |
| 15 | Haptic feedback on key interactions | Frontend | - | 0.5d |
| 16 | B2B API key authentication | Backend | - | 2d |
| 17 | Log aggregation setup | DevOps | - | 1d |
| 18 | ATTrackingManager for analytics (iOS) | Frontend | S2-#10 | 0.5d |
| | | | **TOTAL** | **~36d (~12d per FTE over 3 weeks)** |

---

### Sprint 4 — Enterprise (Weeks 7-12, 3 FTE) — "Make it Scalable"

| # | Task | Owner | Depends On | Est. |
|---|------|-------|-----------|------|
| 1 | Admin dashboard (web app) — MVP | Full-stack | S3-#16 | 10d |
| 2 | Role-based access control (admin, moderator, museum_manager) | Backend | - | 3d |
| 3 | Content moderation queue | Backend + Admin | #1, #2 | 3d |
| 4 | Analytics API + dashboard | Backend + Admin | #1 | 5d |
| 5 | Multi-tenancy (B2B museum scoping) | Backend | #2 | 5d |
| 6 | Museum directory + geolocation | Frontend + Backend | - | 5d |
| 7 | Cross-session user memory | Backend | - | 3d |
| 8 | Audit logging (immutable trail) | Backend | - | 2d |
| 9 | Arabic RTL support | Frontend | S3-#14 | 2d |
| 10 | Biometric authentication | Frontend | - | 2d |
| 11 | In-app support / ticket system | Full-stack | - | 3d |
| 12 | CDN setup (CloudFlare) | DevOps | - | 1d |
| 13 | OpenTelemetry distributed tracing | DevOps | - | 2d |
| 14 | Load testing + horizontal scaling validation | DevOps + Backend | S3-#9 | 3d |
| 15 | Comprehensive E2E test suite (auth + chat flows) | QA | - | 5d |
| 16 | Google Play Data Safety form completion | PM | - | 1d |
| | | | **TOTAL** | **~55d (~18d per FTE over 6 weeks)** |

---

## 8. Consistency Check vs. Existing Plan

### V2 Cross-Reference (verified against code, not just documents)

| Existing Plan Item | Claimed Status | Verified Against Code | Consistency |
|-------------------|----------------|----------------------|-------------|
| **Lot A — Critical Security** (SEC-01 to SEC-09) | Majority DONE Sprint 1 | SEC-01 (password policy): `shared/validation/password.ts` exists ✅; SEC-07 (email): `shared/email/brevo-email.service.ts` exists ✅; SEC-05 (rate limit): `login-rate-limiter.ts` exists ✅ | Consistent |
| **Lot B — Architectural Refactoring** | PARTIAL | ChatSessionScreen refactored (~250 lines, hooks extracted) ✅; `services/` still present (6 files) ❌ | **Gap**: services/ consolidation not planned in V1 |
| **Lot C — API Contract Alignment** | PENDING | `forgot-password` and `reset-password` still missing from OpenAPI spec ✅ | Consistent |
| **Lot D — Dead Code Cleanup** | DONE Sprint 1 | `password.service.ts` deleted ✅; `components/` files deleted ✅; `styles/` deleted ✅ | Consistent |
| **Lot E — Documentation** | PENDING | README still outdated (references `backend/` instead of `museum-backend/`); deployment doc has 19 lines marketing copy | Consistent |
| **Lot F — Tests & Observability** | PENDING | Security-critical tests partially added (`tests/unit/auth/` exists with login-rate-limiter, name/password validation) | Partially done |
| **Lot G — Performance & Scalability** | PENDING | No infinite scroll, no Redis, no streaming | Consistent |
| **NEW-SEC-01 to NEW-SEC-10** | Mixed (5 DONE, 5 PENDING) | NEW-SEC-01 (emailVerified): `socialLogin.useCase.ts:74` ✅; NEW-SEC-02 (SSRF): `image-input.ts:9-27` ✅; NEW-SEC-04/06/09: still pending ❌ | **Gap in V1**: NEW-SEC-04, NEW-SEC-06, NEW-SEC-09 were not explicitly tracked |
| **NEW-BUG-01 to NEW-BUG-07** | All DONE Sprint 1 | Verified 6/7 in code ✅; NEW-SEC-01 (emailVerified) verified ✅ | Consistent |
| **POST_MERGE_ACTIONS** | Sections 1-2 DONE, 3 manual, 6 pending | S1 (Google Client IDs): commit 58b376a confirms ✅; S2 (indexes): commit 77b4a2a confirms ✅; S6 (tests): partially done | Consistent |

### Items from Enriched Audit (11_ANALYSE_ENRICHIE.md) NOT in V1 Roadmap — Fixed in V2

| ID | Finding | V1 Status | V2 Status |
|---|---------|-----------|-----------|
| NEW-SEC-04 | PII in JWT claims | Not mentioned | Added to S2 #22 |
| NEW-SEC-06 | Rate limit bypass via session rotation | Not mentioned | Added to S2 #20 |
| NEW-SEC-09 | Login error leaks social account type | Not mentioned | Added to S2 #20 |
| M1 | Registration returns full user object | Not mentioned | Added to S2 #20 |
| M5 | Report comment without length limit | Not mentioned | Added to S2 #20 |
| iOS permissions | NSCameraUsageDescription missing | Not mentioned | Added to S2 #1 (P0) |
| PrivacyInfo.xcprivacy | Apple privacy manifest missing | Not mentioned | Added to S2 #3 (P0) |
| services/ consolidation | Legacy directory not mentioned | Not mentioned | Added to S2 #16 + D11 |
| x-request-id frontend | Frontend doesn't propagate | Not mentioned | Added to S2 #24 |
| EXPO_PUBLIC_EAS_PROJECT_ID | Undocumented env var | Not mentioned | Added to S2 #25 |

---

## 9. KPIs & Definition of Done

### Launch Readiness Criteria (Gate Review)

| # | Criteria | Metric | Gate |
|---|----------|--------|------|
| 1 | iOS Permissions | All usage descriptions declared, PrivacyInfo.xcprivacy present | S2 |
| 2 | Store Placeholders | Zero TO_FILL or dev-facing text visible to users | S2 |
| 3 | GDPR Consent | Acceptance checkbox on register, consent banner on first launch | S2 |
| 4 | Accessibility | WCAG 2.1 AA compliance on all screens (VoiceOver + TalkBack tested) | S2 |
| 5 | i18n | Minimum EN + FR with complete translations | S2 |
| 6 | Streaming | First token latency < 500ms (SSE endpoint functional) | S2 |
| 7 | Error tracking | Sentry capturing errors in production | S2 |
| 8 | Test coverage | Unit tests on all security-critical paths | S2 |
| 9 | API spec | OpenAPI 100% complete (including forgot/reset-password), contract tests green | S2 |
| 10 | Uptime | 99.9% availability (monitored) | S2 |
| 11 | Performance | Chat FlatList 60fps, no jank | S2 |
| 12 | Security | No PII in JWT, Redis rate limiting, email verification on register | S2 |
| 13 | Dark mode | Full theme support on all screens | S3 |
| 14 | Offline | Messages queued and synced without data loss | S3 |
| 15 | Languages | 7+ languages available | S3 |
| 16 | B2B | Admin panel MVP with analytics | S4 |
| 17 | Scale | Load test: 1000 concurrent users, P95 < 2s | S4 |

### Per-Screen Definition of Done

Every screen must satisfy **ALL** of the following before being marked complete:

- [ ] i18n: All user-visible strings extracted to translation files
- [ ] a11y: accessibilityLabel on all interactive elements
- [ ] a11y: accessibilityRole on all semantic elements
- [ ] a11y: VoiceOver (iOS) tested end-to-end
- [ ] a11y: TalkBack (Android) tested end-to-end
- [ ] a11y: Dynamic Type / font scaling tested
- [ ] Dark mode: Renders correctly in both themes
- [ ] Error states: All error paths display user-friendly message
- [ ] Loading states: Skeleton or spinner during async operations
- [ ] Offline: Graceful degradation or queue mechanism
- [ ] RTL: Renders correctly in RTL locale (Arabic)
- [ ] Performance: No unnecessary re-renders (React DevTools profiler)
- [ ] Tests: Snapshot test + interaction test for key flows
- [ ] Store: Zero placeholder text, zero dev-facing strings

---

## 10. Risk Register

| # | Risk | Probability | Impact | Mitigation |
|---|------|-------------|--------|------------|
| R1 | SSE streaming requires Nginx/reverse-proxy config change (buffering, timeout) | High | High | Test SSE through full stack (Docker + VPS + Nginx) early in S2 |
| R2 | i18n string extraction takes longer than estimated (200+ strings across 14 screens) | Medium | Medium | Use automated extraction tool (i18next-parser), prioritize auth+chat first |
| R3 | Apple rejects for missing PrivacyInfo.xcprivacy or incomplete accessibility | High | High | Pre-test with Apple Accessibility Inspector; submit PrivacyInfo in first build |
| R4 | Redis adds operational complexity | Low | Medium | Managed Redis (AWS ElastiCache or Railway) over self-hosted |
| R5 | OCR for image injection detection adds latency | Medium | Medium | Run OCR async, only block if text detected, timeout 3s |
| R6 | EventSource polyfill for React Native may have platform inconsistencies | Medium | High | Test on iOS + Android + Web early; have fallback to polling |
| R7 | B2B admin panel scope creep | High | Medium | Strict MVP scope: analytics + moderation only, no CMS |
| R8 | Dark mode with frosted-glass (BlurView) has platform inconsistencies | Medium | Low | Test on iOS 16+ and Android 13+ early, have fallback (opacity) |
| R9 | TTS/STT adds significant cloud cost | Medium | Medium | Start with free-tier (Google TTS), implement per-user usage caps |
| R10 | Multi-tenancy requires significant DB schema changes | Medium | High | Design tenant-scoped queries first, migrate data last |
| R11 | `services/` → `features/` migration causes import breakage | Medium | Medium | Use barrel re-exports during transition, run typecheck after each move |
| R12 | Sprint 2 effort underestimated (30 person-days for 3 FTE) | Medium | High | Daily standups, cut P1 items to S3 if behind by day 5 |

---

## 11. V1 → V2 Integrity Audit Changelog

### Summary
23 corrections applied after integrity audit using 5 parallel verification agents (architecture, security, frontend, cross-reference, store compliance) + power-tools automated checks.

### Flaw Category Breakdown

| Category | Count | Severity |
|----------|-------|----------|
| Factual errors (wrong status/location) | 6 | HIGH |
| Missing items (not in V1) | 10 | HIGH |
| Misleading claims (partial truth) | 4 | MEDIUM |
| Effort estimate errors | 1 | HIGH |
| Missing store compliance items | 5 | CRITICAL |

### Detailed Corrections

| # | V1 Claim | Reality (verified) | Correction | Section |
|---|---------|-------------------|------------|---------|
| 1 | "Privacy Policy has placeholder fields" | `privacyPolicyContent.ts` has zero TO_FILL markers | Status changed to DONE | 1, 3.9 |
| 2 | "Terms of Service — PARTIAL" | Content complete with proper legal sections | Status changed to DONE (content) | 3.10 |
| 3 | `useAuth.ts` listed in `features/auth/application/` as EXISTS | Lives in `context/AuthContext.tsx` | Architecture section rewritten with actual/target layout | 3.1 |
| 4 | `authService.ts` listed in `features/auth/infrastructure/` as EXISTS | Lives in `services/authService.ts` | Migration plan added (D11) | 3.1 |
| 5 | Legacy `services/` directory (6 files) not mentioned | 6 files: authService, tokenStore, http, apiConfig, socialAuthService, index | Consolidation task added (S2 #16) | 3.1, D11 |
| 6 | `features/conversation/` marked "EXISTS (update)" | Directory exists but is hollow (empty subdirs) | Corrected to "EXISTS (empty — populate)" | 3.3 |
| 7 | Sprint 2 = "Weeks 1-2" (17 tasks) | 28.5 person-days = 5.7 weeks for 1 FTE | Adjusted to 3 FTE, 2.5 weeks | 7 |
| 8 | Sprint 3 = "Weeks 3-4" (18 tasks) | 36 person-days | Adjusted to 3 FTE, 3 weeks | 7 |
| 9 | NSCameraUsageDescription not mentioned | MISSING from app.config.ts:138-142 | Added as P0 store blocker (S2 #1) | 4.6 |
| 10 | photosPermission not mentioned | Set to `false` (gallery picker will fail) | Added as P0 store blocker (S2 #1) | 4.6 |
| 11 | Android CAMERA permission not mentioned | MISSING from app.config.ts:149 | Added as P0 store blocker (S2 #1) | 4.6 |
| 12 | PrivacyInfo.xcprivacy not mentioned | MISSING (Apple requires since 2024) | Added as P0 (S2 #3) | 4.6 |
| 13 | Support page TO_FILL placeholders not mentioned | `TO_FILL_SUPPORT_RESPONSE_TIME`, `TO_FILL_SUPPORT_OWNER` visible to users | Added as P0 (S2 #2) | 3.11 |
| 14 | NEW-SEC-04 (PII in JWT) not tracked | email, firstname, lastname in access token claims | Added to S2 #22 | 5.1 |
| 15 | NEW-SEC-06 (rate limit bypass) not tracked | Session rotation creates unbounded buckets | Added to S2 #20 | 5.1 |
| 16 | NEW-SEC-09 (login oracle) not tracked | Error leaks social account type | Added to S2 #20 | 5.1 |
| 17 | M1 (register response) not tracked | Returns full user object | Added to S2 #20 | 5.1 |
| 18 | M5 (report comment length) not tracked | No max length validation | Added to S2 #20 | 5.1 |
| 19 | Frontend x-request-id propagation not mentioned | Frontend does not send x-request-id (verified) | Added to S2 #24 | 4.5 |
| 20 | EXPO_PUBLIC_EAS_PROJECT_ID not mentioned | Missing from all env examples and CI docs | Added to S2 #25 | 5.2 |
| 21 | GDPR consent mechanism not mentioned | No checkbox on register, no consent banner | Added US-AUTH-07 + S2 #14 | 3.1, 3.9 |
| 22 | Account deletion timeline not specified | Apple requires reasonable timeframe | Added to S2 (privacy policy update) | 3.9 |
| 23 | LLM diagnostics claim "leaked to client" | Conditional: default false in prod, true in dev | Corrected description, still needs hardening | 5.1 |

### Items Verified as Accurate (no correction needed)

- Zero i18n framework ✅
- 1 accessibilityLabel total (BrandMark.tsx) ✅
- Zero offline support ✅
- Zero streaming/SSE code ✅
- Zero Redis in codebase ✅
- Bcrypt cost = 10 ✅
- Reset token SHA-256 hashed ✅
- emailVerified checked on social login ✅
- SSRF protection comprehensive (17 patterns) ✅
- In-memory rate limiting ✅
- All 14 screens exist at documented paths ✅
- All Sprint 1 bug fixes verified (6/7 confirmed, 1 conditional) ✅
- Dead code cleanup complete ✅

---

## Appendix A — Power-Tools Verification Summary

| Check | Status | Details |
|-------|--------|---------|
| OpenAPI route parity | **KO** | `forgot-password` + `reset-password` missing from spec |
| OpenAPI typegen drift | **OK** | Frontend types synced with spec |
| Repo boundary integrity | **OK** | Clean split, no cross-references |
| Auth refresh invariants | **OK** | Handlers, retry, storage all wired correctly |
| Signed media flow coverage | **OK** | Full chain: S3 → signed URL → frontend refresh |
| Legacy docs mismatch | **KO** | README stale paths; ARCHITECTURE_MAP refs dead services |
| Stale alias / dead artifacts | **KO** | `services/` seam (6 files), `password.service.ts` deleted ✅ |
| Migration / env / CI consistency | **KO** | `EXPO_PUBLIC_EAS_PROJECT_ID` undocumented |
| Observability parity | **KO** | Frontend doesn't propagate x-request-id |

## Appendix B — Technology Decisions

| Need | Technology | Reason |
|------|-----------|--------|
| i18n | `react-i18next` + `expo-localization` | Industry standard, Expo-compatible, pluralization, interpolation |
| Streaming | Server-Sent Events (SSE) + EventSource polyfill (e.g., `react-native-sse`) | Simpler than WebSocket for unidirectional LLM output, HTTP/2 compatible |
| Offline | `@react-native-community/netinfo` + AsyncStorage queue | Expo-compatible, lightweight, proven |
| Theme | Custom ThemeProvider with context + design tokens | Full control, no heavy dependency, matches GlassCard architecture |
| Cache (backend) | Redis 7 | Rate limiting, session cache, pub/sub for future real-time features |
| Error Tracking | Sentry | Best RN integration, free tier sufficient for launch, performance monitoring included |
| Analytics | PostHog | Self-hostable (GDPR), feature flags included, session replay |
| Admin | React + Vite + TailwindCSS | Fast development, reuse backend API, separate deployment |
| OCR | Tesseract.js (client-side) or Google Vision API | Pre-filter images before LLM, no new infra for Tesseract |
| TTS | OpenAI TTS or Google Cloud TTS | Low latency, multilingual, natural-sounding |
| STT | Already using OpenAI Whisper | Extend to real-time mode |

---

*This document is the single source of truth for the Musaium product roadmap. All sprint planning, design briefs, and engineering tasks derive from this matrix.*
*V2 audited: 2026-03-19 | Next review: Sprint 2 kickoff*
