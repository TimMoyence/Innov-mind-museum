# Lessons — expo-local-authentication

Project-specific gotchas for `expo-local-authentication` in Musaium (human-edited; agents append dated sections only).

## 2026-05-20 — Biometric is a LOCAL UX gate, not a backend auth claim
- **Context**: `useBiometricAuth.authenticate()` returns a boolean. It is consumed by `useFaceIdSessionRestore` / `BiometricGate` to unlock the local app UI only.
- **Why it matters**: the boolean proves nothing to the server (forgeable on a rooted device). Server-trusted re-auth still re-validates the JWT/session backend-side. Never POST "biometric: true" as an authorization claim.

## 2026-05-20 — Always `hasHardwareAsync() && isEnrolledAsync()` before showing the unlock affordance
- **Symptom**: a device with a Face ID sensor but no enrolled face passes `hasHardware` yet fails `authenticateAsync`. Showing "Unlock with Face ID" then errors.
- **Fix**: AND both, gate `isAvailable` on the combination. `useBiometricAuth.ts:27-29`.

## 2026-05-20 — `authenticateAsync` can throw — swallow to `false` at the edge
- **Fix**: the hook wraps both the availability check and `authenticate()` in try/catch returning `false` / `setIsAvailable(false)`. A biometric edge case (`invalid_context`, missing `promptMessage`) must never crash the auth screen. `useBiometricAuth.ts:47-68`.

## 2026-05-20 — Type label derived from `supportedAuthenticationTypesAsync`, compared to enum members
- **Note**: Musaium maps `FACIAL_RECOGNITION → 'Face ID'`, `FINGERPRINT → 'Touch ID'`, `IRIS → 'Iris'`, else `'Biometric'`. This reflects hardware capability, not what's enrolled — combine with the §availability check before display. `useBiometricAuth.ts:33-42`.

## 2026-05-20 — `disableDeviceFallback: false` is deliberate (convenience, not high-assurance)
- **Context**: Musaium allows device-passcode fallback so a Face ID misread doesn't lock the user out of their own app. This is a convenience re-auth gate, not a security boundary. If a future high-assurance action needs biometric-only, set `true` AND provide an explicit escape hatch for the `lockout` error.

## 2026-05-20 — Face ID needs a dev/EAS build, not Expo Go
- **Fact**: Expo Go does not support Face ID; testing the biometric path requires a development or EAS build. `NSFaceIDUsageDescription` (via the config-plugin `faceIDPermission`) is mandatory or the first prompt crashes + App Store rejects.
