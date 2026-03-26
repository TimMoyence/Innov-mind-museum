# Musaium — Store Submission Guide

> Complete checklist for submitting Musaium to Apple App Store and Google Play Store.
> Reference date: 2026-03-26

---

## 1. Prerequisites

### Accounts
- [ ] Apple Developer Program membership active ($99/year)
- [ ] Google Play Console access ($25 one-time)
- [ ] EAS CLI installed (`npm install -g eas-cli`)
- [ ] Authenticated: `eas login`

### Credentials (environment variables)
```bash
# Apple
export APPLE_ID="your-email@icloud.com"
export APPLE_TEAM_ID="XXXXXXXXXX"
export ASC_APP_ID="1234567890"                    # App Store Connect → App → General → App Information
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"  # https://appleid.apple.com

# Google
# Service account JSON at: museum-frontend/.secrets/google-service-account.json
```

### Backend
- [ ] Production backend running at `musaium.com`
- [ ] Health check passes: `curl https://musaium.com/api/health`
- [ ] Privacy policy accessible: `https://musaium.com/privacy` (or `musaium.com/fr/privacy`)

---

## 2. Build

### iOS Production Build
```bash
cd museum-frontend
eas build --platform ios --profile production
```
- EAS auto-creates Distribution Certificate + Provisioning Profile on first build
- Build takes ~15-30 minutes

### Android Production Build
```bash
cd museum-frontend
eas build --platform android --profile production
```
- Produces signed AAB for Google Play

### Verify builds
```bash
eas build:list --platform all --status finished --limit 2
```

---

## 3. Screenshots

### Required sizes

| Platform | Device | Resolution | Required |
|----------|--------|------------|----------|
| **App Store** | iPhone 6.7" (15 Pro Max) | 1290 x 2796 | Yes |
| **App Store** | iPhone 6.5" (14 Plus) | 1284 x 2778 | Yes (legacy) |
| **App Store** | iPad 12.9" (Pro) | 2048 x 2732 | Yes (if iPad supported) |
| **Google Play** | Phone | Min 320px, max 3840px, 16:9 or 9:16 | Min 2, max 8 |

### Capture screenshots

**Option A: Maestro automation** (recommended)
```bash
# Install Maestro
curl -Ls "https://get.maestro.mobile.dev" | bash

# Boot simulator
xcrun simctl boot "iPhone 15 Pro Max"

# Set production variant for clean UI
APP_VARIANT=production npx expo start --ios

# Run screenshot flow
maestro test museum-frontend/maestro/screenshots.yaml

# Screenshots saved to ~/.maestro/screenshots/
```

**Option B: Manual capture**
```bash
cd museum-frontend
APP_VARIANT=production npx expo start --ios
# In Simulator: Cmd+S to save screenshot to ~/Desktop/
```

### Screenshot content (10 screens recommended)

| # | Screen | Content |
|---|--------|---------|
| 1 | Onboarding | App branding, welcome |
| 2 | Home | Main entry screen |
| 3 | Chat | Active conversation with artwork photo + AI response |
| 4 | Chat streaming | Live typing indicator |
| 5 | Conversations | Dashboard with multiple sessions |
| 6 | Museums | Museum directory with distance badges |
| 7 | Museum Detail | Museum info + "Start Chat" CTA |
| 8 | Settings | Settings hub with dark mode + biometric |
| 9 | Dark Mode | Chat in dark mode |
| 10 | Multilingual | Chat or settings in Arabic (RTL) |

### Multi-language screenshots
Repeat for each locale: EN, FR, ES, DE.
Change device language in Simulator: Settings → General → Language & Region.

---

## 4. App Store Connect

### Store listing
- **Metadata files**: `docs/store-listing/appstore-metadata.json`
- Copy description, keywords, What's New, promotional text from the JSON for each locale

### Form fields

| Field | Value |
|-------|-------|
| App Name | Musaium |
| Subtitle | AI Museum Guide & Art Chat |
| Category | Education |
| Secondary Category | Travel |
| Age Rating | 4+ |
| Price | Free |
| Privacy Policy URL | `https://musaium.com/en/privacy` |
| Support URL | `https://musaium.com/en/support` |
| Marketing URL | `https://musaium.com` |

### Keywords (EN, 100 chars max)
```
museum,art,AI,guide,artwork,chat,culture,history,painting,sculpture,gallery,heritage,photo
```

### Review information
```
Demo account:
  Email: reviewer@musaium.com
  Password: ReviewerPass123!

Notes for reviewer:
  - The app requires a backend connection. The production server is at musaium.com
  - Camera feature requires a physical device; in simulator, use the photo library instead
  - The app supports 8 languages (change device language to test)
```

### Submit
```bash
eas submit --platform ios --profile production --latest
```

---

## 5. Google Play Console

### Store listing
- **Metadata files**: `docs/store-listing/googleplay-metadata.json`
- Copy short description, full description from the JSON for each locale

### Feature Graphic (1024x500)
1. Open `docs/store-listing/feature-graphic.html` in a browser
2. Set viewport to 1024x500 (DevTools → Device toolbar)
3. Take screenshot → save as `feature-graphic.png`
4. Or: `npx capture-website-cli docs/store-listing/feature-graphic.html --width=1024 --height=500 --output=feature-graphic.png`

### Data Safety Form
- **Reference**: `docs/GOOGLE_PLAY_DATA_SAFETY.md`
- Complete form answers are documented in section "Form Answers Quick Reference"
- Key declarations:
  - Collects: email, name, photos, audio, location, chat messages, crash logs, device IDs
  - Shares with: Sentry, OpenAI, Deepseek, Google AI, Brevo
  - Does NOT sell data
  - Does NOT use advertising SDKs
  - Users can request deletion

### Content rating
- Complete IARC questionnaire
- Expected rating: Everyone / PEGI 3 (no violence, no gambling, no user-generated objectionable content)

### Submit
```bash
eas submit --platform android --profile production --latest
```

For internal testing track:
```bash
eas submit --platform android --profile internal --latest
```

---

## 6. Privacy Policy URL

The privacy policy is hosted at:
- **French**: `https://musaium.com/fr/privacy`
- **English**: `https://musaium.com/en/privacy`

Both URLs serve a full GDPR-compliant privacy policy rendered server-side (Next.js 15).
The content mirrors `museum-frontend/features/legal/privacyPolicyContent.ts` (in-app version).

**Requirements for stores:**
- Must be publicly accessible (no login required) ✓
- Must be hosted on HTTPS ✓
- Must cover data collection, usage, sharing, deletion ✓

---

## 7. Release Flow

### First release (recommended order)

1. **Deploy museum-web** to VPS (privacy + landing pages live)
2. **Build iOS** production via EAS
3. **Submit to TestFlight** → test all flows on real device
4. **Upload screenshots** to App Store Connect
5. **Fill store listing** (description, keywords, What's New)
6. **Submit for App Store review** (~1-3 days)
7. **Build Android** production via EAS
8. **Submit to Google Play internal testing** track
9. **Complete Data Safety form**
10. **Upload screenshots + feature graphic** to Google Play
11. **Promote to production** (after internal testing validation)

### CI/CD automation
The `mobile-release.yml` workflow handles automated EAS builds on push to main.
Manual submission via `eas submit` is recommended for first release.

---

## 8. Post-Submission Checklist

- [ ] App Store review status monitored (email notifications)
- [ ] Google Play review status monitored
- [ ] Sentry capturing errors from production builds
- [ ] Privacy policy URL accessible from both stores
- [ ] Support URL accessible from both stores
- [ ] Test in-app purchase flow (N/A for v1.0 — free app)
- [ ] Monitor crash-free rate in App Store Connect / Play Console
- [ ] Respond to any reviewer questions within 24h
