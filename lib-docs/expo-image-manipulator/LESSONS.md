# Lessons — expo-image-manipulator

Project-specific gotchas for `expo-image-manipulator` in Musaium (human-edited; agents append dated sections only).

## 2026-05-20 — Both consumers still on DEPRECATED `manipulateAsync` (migration owed)
- **Symptom**: `imageUploadOptimization.ts:1` and `useImageManipulation.ts:1` both carry `/* eslint-disable @typescript-eslint/no-deprecated -- expo-image-manipulator API migration pending */`. SDK 55 deprecates the flat `manipulateAsync(uri, actions[], saveOptions)`.
- **Fix (owed before SDK 56)**: migrate to the context API `ImageManipulator.manipulate(uri).resize(...).renderAsync()` then `ref.saveAsync({ compress, format })`. New code MUST NOT add a fresh `no-deprecated` disable — use the context API directly.
- **Why it matters**: legacy API is expected to be removed in SDK 56; the context API also keeps a native `ImageRef` between transforms (fewer intermediate file writes when chaining).

## 2026-05-20 — Resize FIRST then compress; progressive quality to a byte budget
- **Symptom**: a single fixed `compress` value can't hit a target size across varied source photos; compress alone never shrinks dimensions (4000px stays 4000px).
- **Fix**: cap longest side to 1600px on the first pass only, then iterate descending quality `[0.82…0.42]` re-checking on-disk size vs `TARGET_IMAGE_BYTES = 2.7MB`. Reference `imageUploadOptimization.ts:56-86`.
- **Resilience**: the caller (`useImagePicker.setOptimizedImage`, `:17-25`) falls back to the original URI if manipulate throws — upload flow stays functional.

## 2026-05-20 — Re-encode strips EXIF (the GDPR win) + avoid base64
- The JPEG re-encode through this pipeline drops GPS/device EXIF — this is intentional privacy hygiene and the reason the picker `exif` flag stays off.
- Never pass `base64: true` to `saveAsync` on an upload path — return the `uri` and upload via multipart (memory).

## 2026-05-20 — Dimensions read via expo-image, size via expo-file-system/legacy
- `getImageDimensions` uses `expo-image` `Image.loadAsync({ uri })` → `{ width, height }` (logical px), NOT RN `Image.getSize`. `getFileSize` uses `expo-file-system/legacy` `getInfoAsync`. Reference `imageUploadOptimization.ts:15-35`. The `/legacy` subpath is itself a transitional SDK 55 surface (see `expo/LESSONS.md` 2026-05-18).
