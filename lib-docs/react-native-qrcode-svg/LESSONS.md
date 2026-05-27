# Lessons — react-native-qrcode-svg (v6.3.15)

Audit 2026-05-18 : **🚨 CHANGES_REQUESTED — security/UX**.

## ~~🚨 F1 HIGH~~: 2FA otpauth QR default ecl — CLOSED TD-QR-01 2026-05-21 (`ecl="H"` confirmed at MfaEnrollScreen.tsx:127)
- **Cause** : `museum-frontend/features/auth/screens/MfaEnrollScreen.tsx:109` `<QRCode value={otpauthUrl} size={200} />` no `ecl` prop.
- **Impact** : sensitive 2FA secret scanned ONCE in suboptimal light/angles. Failed decode = user retypes 32-char base32 manualSecret (manualHint fallback line 110 mitigates but UX cost).
- **Fix TD-QR-01** : Add `ecl="H"` per PATTERNS §3 DO doctrine 'Q/H when reliability > size'. otpauth URLs (80-150 chars) well within 'H' capacity (~1273 alphanumeric).

## ⚠️ F2 MEDIUM : `onError` prop missing → uncaught render exception
- PATTERNS §3 DO mandates `onError` on production screens.
- **Fix TD-QR-02** : `onError={(err) => logger.warn('mfa.qr.generation.failed', { err: err.message })}`. Render fallback manualSecret-only.

## ✅ Positives
- Canonical default import `from 'react-native-qrcode-svg'` ✅
- RN 0.83 → no textEncodingTransformation Babel block needed ✅
- No logo prop → Android logoBorderRadius gotcha N/A ✅
- Default black/white = max contrast for camera decode ✅

## Recommended diff
```tsx
<QRCode value={otpauthUrl} size={200} ecl="H" onError={(err) => logger.warn('mfa.qr.generation.failed', { err: err.message })} />
```

## 2026-05-20 — re-audit (still CHANGES_REQUESTED, + screen-capture finding)

Single call site unchanged: `museum-frontend/features/auth/screens/MfaEnrollScreen.tsx:13` import, `:109` `<QRCode value={otpauthUrl} size={200} />`. Both F1 + F2 from 2026-05-18 remain OPEN. New finding F-SEC-03.

### Version drift
- Declared `^6.3.15`, **installed `6.3.21`** (latest 6.3 patch — no action needed, but note the drift; API stable across 6.3.x).
- Peer `react-native-svg`: declared `^15.13.0`, installed `15.15.4` (latest `15.15.5`). Clean.

### ~~🚨 F1 HIGH~~ — CLOSED (TD-QR-01 archivé 2026-05-21) : MFA otpauth QR ecl fix
- **RESOLVED** : `MfaEnrollScreen.tsx:127` now has `ecl="H"` (confirmed 2026-05-26). TD-QR-01 closed.

### ⚠️ F2 MEDIUM — still open : `onError` prop missing → uncaught render exception on capacity failure
- **Fix TD-QR-02** : `onError={(err) => logger.warn('mfa.qr.generation.failed', { err: err.message })}`, render manualSecret-only fallback.

### 🚨 F-SEC-03 HIGH (NEW, screen-capture) : MFA secret QR + manualSecret displayed with no screen-capture protection
- `MfaEnrollScreen.tsx` renders the live TOTP shared secret (QR `:109` + `manualSecret` `:111`) with no `FLAG_SECURE` / capture detection. A screenshot, screen-recording, or app-switcher snapshot of this screen leaks the second factor. The library provides NO protection (upstream documents none).
- **Fix TD-QR-03** :
  - Android — set `FLAG_SECURE` on screen focus, clear on blur (blocks screenshot + recording + recents thumbnail).
  - iOS — blur the secret on `resignActive` (app-switcher) + optionally detect screenshot notification and warn.
  - Hygiene — never log `otpauthUrl`/`manualSecret`, never to Sentry breadcrumbs/analytics; keep ephemeral in `useState` (current — good); clear on navigate-away.
- Scope: enrollment screen only.

### ⚠️ F-A11Y-04 LOW (NEW) : QR has no accessibility label
- `<QRCode>` renders a bare `<Svg>` with no a11y semantics. Wrap in `<View accessible accessibilityRole="image" accessibilityLabel="...">` (FE a11y doctrine).

### ✅ Positives
- Canonical default import ✅; RN 0.83 → no textEncodingTransformation needed ✅; no `logo` → Android `logoBorderRadius` gotcha N/A ✅; default black/white = max camera-decode contrast ✅; manualSecret fallback present ✅; no CVE for the package (2026-05-21) ✅.

### Recommended diff (2026-05-20)
```tsx
// + Android FLAG_SECURE on focus / clear on blur (TD-QR-03), e.g. via expo-screen-capture or a native module
<View accessible accessibilityRole="image" accessibilityLabel="TOTP enrollment QR code">
  <QRCode
    value={otpauthUrl}
    size={200}
    ecl="H"
    onError={(err) => logger.warn('mfa.qr.generation.failed', { err: err.message })}
  />
</View>
```
