# Lessons — react-native-qrcode-svg (v6.3.15)

Audit 2026-05-18 : **🚨 CHANGES_REQUESTED — security/UX**.

## 🚨 F1 HIGH : 2FA otpauth QR uses default `ecl='M'` (15%) instead of `'H'` (30%)
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
