# Lessons — expo-camera

Project-specific gotchas for `expo-camera` in Musaium (human-edited; agents append dated sections only).

## 2026-05-20 — `expo-camera` = QR scanner only, NOT artwork capture
- **Context**: easy to assume Musaium captures artwork photos via `CameraView`. It does NOT. The artwork capture flow uses `expo-image-picker.launchCameraAsync`. `expo-camera` is used solely for the QR-cartel scanner (`features/chat/ui/CartelScannerSheetContent.tsx`).
- **Implication**: changes to artwork capture belong in `useImagePicker.ts`, not the camera component. The scanner's only output is a sanitized code/deeplink, never an image upload.

## 2026-05-20 — `useCameraPermissions` does not auto-request; needs explicit kick + re-trigger guard
- **Symptom**: a bare `useCameraPermissions()` leaves status `undetermined` forever (no native prompt) and an unguarded `requestPermission()` in render/effect re-fires every render.
- **Fix**: `useEffect` that calls `requestPermission()` once when `status === 'undetermined'`, guarded by a `requestedRef` boolean. Reference `CartelScannerSheetContent.tsx:77-84`.

## 2026-05-20 — `onBarcodeScanned` fires repeatedly → idempotence guard mandatory
- **Symptom**: the callback fires on every frame a code is visible → duplicate `onScanned` dispatch, double navigation, double LLM context push.
- **Fix**: `scannedRef.current` boolean set true on first valid scan, early-return otherwise. Reference `CartelScannerSheetContent.tsx:69,88`. Treat `data` as untrusted (parse deeplink, then sanitize) before routing.

## 2026-05-20 — Mock module does not re-export `PermissionStatus` enum
- **Symptom**: comparing `permission.status` to the enum fails under the test mock (mock omits `PermissionStatus`).
- **Fix**: compare to the string literals (`'undetermined'`/`'denied'`/`'granted'`) — they are the enum's runtime values. Carries an approved `eslint-disable no-unsafe-enum-comparison` (`CartelScannerSheetContent.tsx:79,113,129`).
- **Note**: this screen is UFR-021 in scope — keep its Maestro happy-path flow (permission granted → scan → dispatch) when modifying.
