# Musaium — Release Checklist & Remaining Work

> Last updated: 2026-03-23 | Sprint 4 complete (16/16) | Overall: 111/112 tasks (99%)

---

## 1. Remaining Task

| ID | Description | Status | Priority |
|----|-------------|--------|----------|
| S2-02 | Support page Instagram handle | Deferred — Instagram handle not yet created | LOW |

---

## 2. App Store Screenshots Required

### iOS (iPhone 6.7" — required for App Store)
Device: iPhone 15 Pro Max (6.7") or 6.5" alternative

| # | Screen | Content | Notes |
|---|--------|---------|-------|
| 1 | **Onboarding** | First slide with app branding | Show the carousel entry point |
| 2 | **Home** | Home tab with welcome message | Show the main entry screen |
| 3 | **Chat** | Active conversation with artwork photo | Show image + AI response with metadata |
| 4 | **Chat (streaming)** | Message being streamed | Show the live typing indicator |
| 5 | **Conversations** | Dashboard with multiple sessions | Show the conversation list with titles |
| 6 | **Museums** | Museum directory with distance badges | Show the geolocation-sorted list |
| 7 | **Museum Detail** | Museum info + "Start Chat Here" CTA | Show the museum-to-chat flow |
| 8 | **Settings** | Settings hub with dark mode + biometric | Show Security + Appearance cards |
| 9 | **Dark Mode** | Chat in dark mode | Show theme versatility |
| 10 | **Multilingual** | Chat or settings in Arabic (RTL) | Show RTL layout + Arabic text |

### iOS (iPad 12.9" — required if supporting iPad)
Same 10 screens, captured on iPad Pro 12.9" simulator.

### Google Play
| Size | Requirement |
|------|-------------|
| Phone | Min 2, max 8 screenshots. 16:9 or 9:16 ratio. Min 320px, max 3840px. |
| 7" tablet | Optional but recommended |
| 10" tablet | Optional but recommended |

**Recommended: same 8-10 screenshots as iOS**, adapted to Android device frames.

### Feature Graphic (Google Play)
- Size: 1024 x 500 px
- Content: App logo + tagline + museum imagery
- Required for Google Play listing

### App Icon
- iOS: 1024x1024 (no alpha, no transparency) — already configured in `app.config.ts`
- Google Play: 512x512 with 32-bit color — same asset

---

## 3. Screenshot Capture Process

```bash
# iOS Simulator (iPhone 15 Pro Max)
cd museum-frontend
npx expo start --ios
# In Simulator: Cmd+S to capture screenshot
# Screenshots saved to ~/Desktop/

# Android Emulator
npx expo start --android
# In Emulator: click camera icon or Cmd+S

# Automated (optional)
npx expo start --ios --device "iPhone 15 Pro Max"
# Use Maestro or Detox for automated screenshot capture
```

**Tip**: Set `APP_VARIANT=production` for screenshots (hides dev indicators).

---

## 4. Apple Deployment — Current Status & Next Steps

### Completed
- [x] Etape 1.1: App created on App Store Connect
- [x] Etape 1.2: App finalized on ASC (Musaium, com.musaium.mobile)

### Next Steps

#### Etape 2 — Collect Credentials
- [ ] Note your **Apple ID** (email)
- [ ] Note your **Apple Team ID** (developer.apple.com → Membership → Team ID)
- [ ] Note your **ASC App ID** (App Store Connect → app → General → App Information)

#### Etape 3 — App-Specific Password
- [ ] Go to https://appleid.apple.com
- [ ] Sign-In and Security → App-Specific Passwords
- [ ] Generate, name it "EAS Submit", copy the `xxxx-xxxx-xxxx-xxxx` password

#### Etape 4 — Set Environment Variables
```bash
export APPLE_ID="your-email@icloud.com"
export APPLE_TEAM_ID="XXXXXXXXXX"
export ASC_APP_ID="1234567890"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
```

#### Etape 5 — Build iOS Production
```bash
cd museum-frontend
eas build --platform ios --profile production
```
EAS auto-creates Distribution Certificate + Provisioning Profile on first build.

#### Etape 6 — Submit to TestFlight
```bash
eas submit --platform ios --profile production --latest
```

#### Etape 7 — Test on TestFlight
- [ ] Wait ~5-15 min for Apple processing
- [ ] Install TestFlight on iPhone
- [ ] Test all flows: auth, chat, camera, museums, biometric, RTL

#### Etape 8 — App Store Review Preparation
- [ ] Upload 10 screenshots (6.7" iPhone required)
- [ ] Write app description (FR + EN)
- [ ] Write "What's New" text
- [ ] Set age rating (4+ — no objectionable content)
- [ ] Set pricing (Free)
- [ ] Fill privacy policy URL (in-app at /privacy)
- [ ] Submit for review

---

## 5. Google Play Deployment

### Prerequisites
- [ ] Google Play Console access (https://play.google.com/console)
- [ ] App already created (internal testing track)
- [ ] Service account JSON key for EAS submit

### Steps

#### Build Android Production
```bash
cd museum-frontend
eas build --platform android --profile production
```

#### Submit to Internal Testing
```bash
eas submit --platform android --profile production --latest
```

#### Prepare Store Listing
- [ ] Upload 8 screenshots (phone)
- [ ] Upload feature graphic (1024x500)
- [ ] Write short description (80 chars max)
- [ ] Write full description (4000 chars max)
- [ ] Complete Data Safety form (reference: `docs/GOOGLE_PLAY_DATA_SAFETY.md`)
- [ ] Set content rating (IARC questionnaire)
- [ ] Set target audience (general)
- [ ] Set pricing (Free)

#### Promote to Production
- [ ] Internal testing → Closed testing → Open testing → Production
- [ ] Each stage requires review (~1-3 days)

---

## 6. Backend Deployment

### Current State
- Backend runs on VPS OVH via Docker + GHCR
- CI/CD: `deploy-backend.yml` auto-deploys on push to main

### Pre-Release Checklist
- [ ] Run all 20 migrations on production DB: `pnpm migration:run`
- [ ] Set new env vars:
  - `FEATURE_FLAG_MULTI_TENANCY=true` (when ready)
  - `FEATURE_FLAG_USER_MEMORY=true` (when ready)
  - `OTEL_ENABLED=true` + `OTEL_EXPORTER_ENDPOINT` (when collector is set up)
- [ ] Update `CORS_ORIGINS` to include admin dashboard URL
- [ ] CloudFlare DNS migration (follow `docs/CDN_CLOUDFLARE_SETUP.md`)
- [ ] Verify health endpoint through CloudFlare
- [ ] Test SSE streaming through CloudFlare

### Admin Dashboard Deployment
- [ ] Choose hosting: Vercel / Netlify / CloudFlare Pages / VPS static
- [ ] Build: `cd museum-admin && npm run build`
- [ ] Deploy `dist/` to static hosting
- [ ] Set `VITE_API_BASE_URL` to production backend URL
- [ ] Add admin URL to backend `CORS_ORIGINS`

---

## 7. Post-Release Monitoring

- [ ] Verify Sentry captures errors (backend + frontend)
- [ ] Check OTel traces arriving at collector (if OTEL_ENABLED)
- [ ] Run k6 smoke test against production: `k6 run -e BASE_URL=https://musaium.com tests/perf/k6/auth-flow.k6.js`
- [ ] Monitor CloudFlare analytics
- [ ] Check audit logs populating: `GET /api/admin/audit-logs`
