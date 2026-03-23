# Google Play Data Safety Form -- Musaium

> Reference document for completing the Google Play Console Data Safety section.
> Based on source-code audit of `museum-backend/` and `museum-frontend/` as of 2026-03-23.

---

## Overview

Musaium is an interactive museum assistant mobile app. Visitors photograph artworks or ask voice/text questions and receive AI-powered contextual responses. The app requires account creation (email/password or social login via Google/Apple). All API communication is over HTTPS. The app does **not** sell user data, does **not** use advertising SDKs, and sets `NSPrivacyTracking: false` in the Apple privacy manifest. The `expo-tracking-transparency` plugin is included but tracking is declared as disabled.

---

## Data Collection Summary Table

| Data Type | Collected | Shared | Purpose | Optional | Encrypted in Transit | User Can Delete |
|---|---|---|---|---|---|---|
| **Email address** | Yes | Brevo (transactional email) | Account creation, login, password reset, email verification | No (required for account) | Yes (TLS) | Yes (account deletion) |
| **Name (first, last)** | Yes | No | User profile display | Yes (nullable fields) | Yes (TLS) | Yes (account deletion) |
| **Password** | Yes | No | Authentication (bcrypt cost-12 hash stored; plaintext never persisted) | No (required for email accounts; not collected for social-only accounts) | Yes (TLS) | Yes (account deletion) |
| **Photos** | Yes | LLM providers (OpenAI / Deepseek / Google) | Artwork identification via AI vision models | Yes (user chooses to attach) | Yes (TLS) | Yes (account deletion deletes S3 objects) |
| **Camera** | Yes (permission requested) | No | Capture artwork photos in-app | Yes (user can use gallery instead) | N/A (local capture) | N/A |
| **Audio (microphone)** | Yes | OpenAI (Whisper transcription) | Voice question input; transcribed server-side, audio not persisted | Yes (user chooses to record) | Yes (TLS) | Yes (not stored after transcription) |
| **Approximate location** | Yes | No | Find nearby museums (`expo-location`, `Accuracy.Balanced`) | Yes (permission prompt; app works without it) | Yes (TLS) | Yes (not persisted server-side beyond request) |
| **Chat messages (text)** | Yes | LLM providers (OpenAI / Deepseek / Google) | Core functionality -- AI-powered art Q&A | No (core feature) | Yes (TLS) | Yes (account deletion cascades) |
| **Chat session metadata** | Yes | No | Session title, locale, museum mode flag, visit context | No (auto-generated) | Yes (TLS) | Yes (account deletion cascades) |
| **Crash logs & performance** | Yes | Sentry | App stability monitoring, error tracking | No (automatic via `@sentry/react-native`) | Yes (TLS) | Sentry retention policy (90 days default) |
| **Device/other IDs** | Yes | Sentry | Sentry device context for crash deduplication; request IDs in audit logs | No (automatic) | Yes (TLS) | Sentry retention policy |
| **IP address** | Yes | No | Stored in audit logs for security/compliance | No (automatic) | Yes (TLS) | Retained (see Retention section) |
| **Auth tokens** | Yes | No | JWT access token (in-memory) + refresh token (expo-secure-store on native, AsyncStorage on web) | No (required for auth) | Yes (TLS) | Yes (logout clears; account deletion removes from DB) |

---

## Data Sharing

### No data is sold to third parties.

### Third-party service providers that receive data:

| Provider | Data Received | Purpose | Data Retention by Provider |
|---|---|---|---|
| **Sentry** (`@sentry/react-native`) | Crash traces, device info, user ID (numeric), performance spans | Error monitoring, app stability | Default 90-day retention |
| **OpenAI** | Chat text, images (vision), audio (Whisper transcription), text-to-speech requests | AI response generation, speech-to-text, text-to-speech | Per OpenAI API ToS: API inputs/outputs not used for training; not retained beyond processing |
| **Deepseek** | Chat text, images (if configured as active provider) | AI response generation | Per Deepseek API ToS: not retained beyond processing |
| **Google AI** | Chat text, images (if configured as active provider) | AI response generation | Per Google API ToS: not retained beyond processing |
| **Brevo** (formerly Sendinblue) | Email addresses | Transactional emails only (verification, password reset) | Per Brevo data processing terms |

### Data NOT shared:
- Location data is not sent to any third party
- User names are not shared externally
- Passwords (hashed) never leave the backend database
- Chat history is not shared beyond the LLM call that generates the response

---

## Data Security

| Measure | Implementation |
|---|---|
| **Password hashing** | bcrypt with cost factor 12 (`BCRYPT_ROUNDS = 12`) |
| **Access tokens** | JWT with configurable short TTL (default 15 minutes), held in-memory only (never persisted to disk) |
| **Refresh tokens** | JWT with 30-day TTL; SHA-256 hashed before database storage; stored on-device via `expo-secure-store` (hardware-backed keychain on iOS/Android) |
| **API transport** | All communication over HTTPS/TLS |
| **Image URLs** | Pre-signed S3 URLs with configurable TTL (default 900 seconds); HMAC-SHA256 signed local image endpoint |
| **Token storage on device** | `expo-secure-store` on native platforms (iOS Keychain / Android Keystore); falls back to AsyncStorage on web |
| **Input sanitization** | Unicode normalization, zero-width character stripping, truncation on user-controlled prompt fields |
| **Content filtering** | Layered guardrails: keyword-based input/output filter, structural prompt isolation, boundary markers |
| **Rate limiting** | Backend rate limiter on authentication and chat endpoints |
| **Audit logging** | Immutable audit log entries (INSERT-only) for security-sensitive actions |

---

## Data Deletion

| Action | What Happens |
|---|---|
| **Account deletion** (`DELETE /api/auth/account`) | User record, all chat sessions, all chat messages, all refresh tokens, all social account links, and all S3 images (user-scoped prefix) are permanently deleted in a single transaction. Orchestrated by `DeleteAccountUseCase` (GDPR right-to-erasure). |
| **GDPR data export** (`GET /api/auth/export-data`) | Returns all user data (profile, sessions, messages, metadata) in JSON format for portability. |
| **Logout** | Refresh token cleared from device (`expo-secure-store`), access token cleared from memory, server-side refresh token invalidated, Sentry user context cleared. |
| **Audit logs after deletion** | Audit log entries are retained but contain only the numeric `actorId`. No FK constraint to `users` table -- after account deletion, the user record is gone but the audit entry's `actorId` remains as an orphaned integer for compliance purposes. No PII (name, email) is stored in audit logs. |

---

## Retention

| Data | Retention Period | Notes |
|---|---|---|
| **User account** | Until user deletes | Account persists until explicit deletion via app or API |
| **Chat sessions & messages** | Until user deletes account | Cascade-deleted with user account |
| **Uploaded images** | Until user deletes account | Stored in S3 under user-scoped prefix; deleted by `DeleteAccountUseCase` |
| **Audio recordings** | Not retained | Transcribed server-side (OpenAI Whisper) and discarded; never persisted to database or object storage |
| **Refresh tokens** | 30 days (TTL) or until logout/deletion | SHA-256 hashed in DB; expired tokens cleaned by `tokenCleanup.service` |
| **Audit logs** | Indefinite | Compliance requirement; no PII stored (only numeric actor ID, action type, IP, timestamp) |
| **Crash logs (Sentry)** | 90 days (Sentry default) | Configurable in Sentry organization settings |
| **Location data** | Not retained | Used transiently for nearby-museum queries; never persisted server-side |

---

## Form Answers Quick Reference

Use the answers below when filling out each section of the Google Play Console Data Safety form.

### 1. Data collection and security

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (all API calls over HTTPS/TLS) |
| Do you provide a way for users to request that their data is deleted? | **Yes** (`DELETE /api/auth/account` available in-app settings) |

### 2. Data types

#### Location

| Question | Answer |
|---|---|
| Approximate location | **Collected** |
| Is it shared? | **No** |
| Is it processed ephemerally? | **Yes** (never stored server-side) |
| Is this data required or can users choose? | **Optional** (permission prompt; app fully functional without it) |
| Purpose | App functionality (find nearby museums) |

#### Personal info

| Question | Answer |
|---|---|
| Name | **Collected** (first name, last name -- optional fields) |
| Is it shared? | **No** |
| Purpose | App functionality (profile display) |
| Email address | **Collected** |
| Is it shared? | **Yes** -- with Brevo for transactional emails (verification, password reset) |
| Purpose | Account management |

#### Photos and videos

| Question | Answer |
|---|---|
| Photos | **Collected** |
| Is it shared? | **Yes** -- with LLM providers (OpenAI/Deepseek/Google) for artwork identification |
| Purpose | App functionality (AI artwork analysis) |
| Is this data required or can users choose? | **Optional** (user explicitly attaches photos) |

#### Audio

| Question | Answer |
|---|---|
| Voice or sound recordings | **Collected** |
| Is it shared? | **Yes** -- with OpenAI (Whisper) for transcription |
| Is it processed ephemerally? | **Yes** (audio discarded after transcription; only text retained) |
| Purpose | App functionality (voice input for questions) |
| Is this data required or can users choose? | **Optional** (user explicitly records) |

#### Messages

| Question | Answer |
|---|---|
| Other in-app messages | **Collected** (chat messages with AI assistant) |
| Is it shared? | **Yes** -- with LLM providers for response generation |
| Purpose | App functionality (core chat feature) |

#### App activity

| Question | Answer |
|---|---|
| Other user-generated content | **Collected** (chat session metadata: title, locale, museum mode) |
| Is it shared? | **No** |
| Purpose | App functionality |

#### App info and performance

| Question | Answer |
|---|---|
| Crash logs | **Collected** (via Sentry SDK) |
| Is it shared? | **Yes** -- with Sentry |
| Purpose | Analytics (app stability and performance monitoring) |
| Diagnostics | **Collected** (performance traces via Sentry) |
| Is it shared? | **Yes** -- with Sentry |
| Purpose | Analytics |

#### Device or other IDs

| Question | Answer |
|---|---|
| Device or other IDs | **Collected** (Sentry device context, request UUIDs in audit logs) |
| Is it shared? | **Yes** -- Sentry receives device identifiers |
| Purpose | Analytics (crash deduplication), App functionality (request tracing) |

### 3. Data usage and handling -- purposes

For each collected data type, select the applicable purpose(s):

| Data Type | App functionality | Analytics | Account management | Developer communications |
|---|---|---|---|---|
| Email address | | | Yes | |
| Name | Yes | | | |
| Photos | Yes | | | |
| Audio | Yes | | | |
| Approximate location | Yes | | | |
| Chat messages | Yes | | | |
| Chat session metadata | Yes | | | |
| Crash logs | | Yes | | |
| Diagnostics | | Yes | | |
| Device IDs | | Yes | | |

### 4. Not applicable categories

The following Google Play data types are **not collected** by Musaium:

- Financial info (payment info, purchase history) -- no in-app purchases
- Health and fitness -- not applicable
- Contacts -- not accessed
- Calendar -- not accessed
- Web browsing history -- not tracked
- SMS or MMS -- not accessed
- Files and docs -- not accessed (only camera/gallery images via dedicated pickers)
- Precise location -- only approximate location collected (`Accuracy.Balanced`)
- Advertising ID -- not collected (`NSPrivacyTracking: false`)

### 5. Additional declarations

| Declaration | Answer |
|---|---|
| Does your app sell user data? | **No** |
| Does your app use advertising or marketing SDKs? | **No** |
| Does your app use tracking/analytics beyond Sentry? | **No** (`expo-tracking-transparency` is included but `NSPrivacyTracking` is set to `false`; no advertising trackers) |
| Does your app comply with the Families Policy? | N/A (app is not targeted at children) |
| Does your app handle data for purposes other than those disclosed? | **No** |
