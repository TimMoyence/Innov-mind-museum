# Lessons — expo-image-picker

Project-specific gotchas for `expo-image-picker` in Musaium (human-edited; agents append dated sections only).

## 2026-05-20 — Entry point of the CORE flow; quality is only stage 1
- **Context**: `launchImageLibraryAsync` / `launchCameraAsync` (`useImagePicker.ts`) are where the primary user flow starts (photograph artwork → upload). The picker `quality: 0.8` compresses but does NOT resize — 4000px+ photos stay huge.
- **Fix**: every picked URI MUST pass through `optimizeImageForUpload` (expo-image-manipulator) for the longest-side cap + byte-budget compression before upload. Reference `useImagePicker.ts:17-25`.

## 2026-05-20 — base64 / exif must stay OFF (memory + GDPR)
- **base64**: never enable on the picker — upload the file `uri` via multipart (`appendRnFile`). base64 doubles JS-heap memory and risks OOM on large captures.
- **exif**: never enable — EXIF carries GPS/device metadata (GDPR concern). Default off; the downstream JPEG re-encode in the manipulator pass strips it anyway.

## 2026-05-20 — Single image only; no multi-select, no in-app crop
- Multi-image upload was explicitly rejected 2026-05-08 (project memory `project_c2_ai_side_only`). Never set `allowsMultipleSelection`.
- `allowsEditing: false` is deliberate (`useImagePicker.ts:42,70`) — the AI needs the full frame; OS crop drops context. `allowsEditing` is also mutually exclusive with multi-select.

## 2026-05-20 — `MediaTypeOptions` deprecated → string array; Android storage perms blocked
- Use `mediaTypes: ['images']`, not `MediaTypeOptions.Images` (deprecated SDK 55).
- `READ/WRITE_EXTERNAL_STORAGE` are in `app.config.ts` `blockedPermissions` (lines 270-271). SDK 55 picking uses the Photo Picker / scoped storage and needs neither — do not re-add them.

## 2026-05-20 — Permission request is just-in-time + denied → Settings Alert
- Both handlers request the matching permission immediately before launch and, on non-`granted`, show an `Alert` with Cancel + Settings (`Linking.openSettings()`). Reference `useImagePicker.ts:28-36, 56-64`. `status` is string-typed at the API surface (approved `eslint-disable no-unsafe-enum-comparison` at `:29,:57`).
