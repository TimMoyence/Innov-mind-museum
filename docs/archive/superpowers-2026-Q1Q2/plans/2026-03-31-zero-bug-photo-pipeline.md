# Zero-Bug Photo Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all remaining bugs identified by 5-agent audit (code review, QA, security, explorer, PM) to reach 0 defects on the photo pipeline and related systems.

**Architecture:** Surgical fixes across frontend (React Native/Expo) and backend (Node/Express). No refactoring — only bug fixes with tests. Each sprint produces a verified green build.

**Tech Stack:** TypeScript, React Native, Express, Jest, node:test

---

## Triage Summary

| # | Bug | Severity | Sprint |
|---|-----|----------|--------|
| A1 | HTTP retry on timeout causes duplicate image uploads | MUST_FIX | A |
| A2 | Offline queue stores temp file URIs that OS cleans up | MUST_FIX | A |
| B1 | Gallery permission denial is silent (no Alert) | SHOULD_FIX | B |
| B2 | No try/catch around expo-image-picker launch calls | SHOULD_FIX | B |
| C1 | s3-path-utils: 4 raw `throw new Error` → AppError | SHOULD_FIX | C |
| C2 | image-storage.s3: 3 raw `throw new Error` → AppError | SHOULD_FIX | C |
| C3 | social-token-verifier: 6 raw `throw new Error` → AppError | SHOULD_FIX | C |

**WONT_FIX (verified safe):** ChatMessageBubble memo (fixed), rotate/crop error handling (has try/finally), user image display (correct), Instagram TODO (intentional placeholder with `ready: false`).

---

## Sprint A — Critical: Duplicate Uploads + Offline Image Loss

### Task A1: Don't retry POST with FormData on timeout

**Files:**
- Modify: `museum-frontend/shared/infrastructure/httpClient.ts` (line ~193)
- Test: `museum-frontend/tests/http-client-retry.test.ts` (new or existing)

**Problem:** `ECONNABORTED` triggers retry for ALL requests including POST with FormData. The backend may have already processed the upload → duplicate messages.

**Fix:** Skip retry when method is POST/PUT and body is FormData (non-idempotent upload).

- [ ] **Step 1:** In `httpClient.ts` response error interceptor (~line 191), add a guard before the retry logic:

```typescript
const isNonIdempotent =
  config.method?.toUpperCase() === 'POST' || config.method?.toUpperCase() === 'PUT';
const hasFileBody = !!(axiosError.config as { data?: unknown })?.data &&
  typeof FormData !== 'undefined' &&
  (axiosError.config as { data?: unknown }).data instanceof FormData;

// Never retry non-idempotent file uploads — server may have already processed
if (isNonIdempotent && hasFileBody) {
  const mapped = mapAxiosError(error);
  reportError(mapped);
  return Promise.reject(mapped);
}
```

Place this BEFORE the `retryable` check.

- [ ] **Step 2:** Verify existing tests still pass: `npm test`
- [ ] **Step 3:** Verify lint: `npm run lint`

### Task A2: Drop images from offline queue with notification

**Files:**
- Modify: `museum-frontend/features/chat/application/useOfflineQueue.ts`
- Modify: `museum-frontend/features/chat/application/useChatSession.ts` (offline enqueue path)

**Problem:** `imageUri` in the queue is a temporary `file://` URI. OS cleans temp files → upload fails silently on reconnect.

**Fix:** When offline and image is present, don't queue the image — queue text only and show a user-facing message. This is the safest approach (no base64 storage bloat, no stale URIs).

- [ ] **Step 1:** In `useChatSession.ts` offline path (~line 80-92), strip imageUri before enqueue and adjust optimistic message text:

```typescript
if (isOffline) {
  // Images can't be queued offline (temp file URIs expire). Queue text only.
  const queueText = params.imageUri && !trimmedText
    ? undefined  // Image-only message can't be queued
    : trimmedText;

  if (!queueText) {
    setError('Images cannot be sent while offline. Please reconnect and try again.');
    return false;
  }

  const queued = enqueue({ sessionId, text: queueText });
  // ...existing optimistic message logic...
}
```

- [ ] **Step 2:** Verify tests: `npx jest --testPathPattern=useChatSession`
- [ ] **Step 3:** Verify lint clean

---

## Sprint B — UX Robustness: Image Picker

### Task B1: Add gallery permission denied Alert

**Files:**
- Modify: `museum-frontend/features/chat/application/useImagePicker.ts` (lines 13-29)

**Fix:** Mirror camera's Alert UX for gallery permission denial.

- [ ] **Step 1:** In `onPickImage`, replace silent return with Alert:

```typescript
if (status !== 'granted') {
  Alert.alert(
    t('chat.gallery_permission_title'),
    t('chat.gallery_permission_body'),
    [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.settings'), onPress: () => void Linking.openSettings() },
    ],
  );
  return;
}
```

- [ ] **Step 2:** Add i18n keys to all 8 locale files (en, fr, es, de, it, ja, zh, ar)
- [ ] **Step 3:** Verify lint + tests

### Task B2: Wrap picker launches in try/catch

**Files:**
- Modify: `museum-frontend/features/chat/application/useImagePicker.ts`

**Fix:** Wrap both `launchImageLibraryAsync` and `launchCameraAsync` in try/catch to prevent unhandled rejections.

- [ ] **Step 1:** Wrap gallery picker:

```typescript
let result;
try {
  result = await ImagePickerLib.launchImageLibraryAsync({...});
} catch {
  return; // Picker cancelled or crashed — fail silently
}
```

- [ ] **Step 2:** Wrap camera picker identically
- [ ] **Step 3:** Verify tests + lint

---

## Sprint C — Backend Error Consistency

### Task C1: s3-path-utils → AppError (4 instances)

**Files:**
- Modify: `museum-backend/src/modules/chat/adapters/secondary/s3-path-utils.ts`
- Test: existing tests in `museum-backend/tests/unit/chat/image-storage.s3.test.ts`

- [ ] **Step 1:** Import `badRequest` from `@shared/errors/app.error`
- [ ] **Step 2:** Replace 4 `throw new Error(...)` with `throw badRequest(...)` (lines ~28, 32, 71, 74)
- [ ] **Step 3:** Run backend tests: `pnpm test`

### Task C2: image-storage.s3 → AppError (3 instances)

**Files:**
- Modify: `museum-backend/src/modules/chat/adapters/secondary/image-storage.s3.ts`

- [ ] **Step 1:** Import `AppError` from `@shared/errors/app.error`
- [ ] **Step 2:** Replace 3 `throw new Error(...)` with appropriate AppError:
  - Line ~116 (upload fail): `throw new AppError({ message: ..., statusCode: 502, code: 'S3_UPLOAD_FAILED' })`
  - Line ~438 (list fail): `throw new AppError({ message: ..., statusCode: 502, code: 'S3_LIST_FAILED' })`
  - Line ~501 (delete fail): `throw new AppError({ message: ..., statusCode: 502, code: 'S3_DELETE_FAILED' })`
- [ ] **Step 3:** Run backend tests: `pnpm test`

### Task C3: social-token-verifier → AppError (6 instances)

**Files:**
- Modify: `museum-backend/src/modules/auth/adapters/secondary/social-token-verifier.ts`

- [ ] **Step 1:** Import `AppError, badRequest, unauthorized` from `@shared/errors/app.error`
- [ ] **Step 2:** Replace 6 instances:
  - Line ~51 (JWKS fetch): `new AppError({ message: ..., statusCode: 502, code: 'JWKS_FETCH_FAILED' })`
  - Line ~81 (no key): `unauthorized('No matching signing key found')`
  - Line ~91 (invalid JWT): `unauthorized('Invalid JWT format')`
  - Line ~110 (Apple no kid): `unauthorized('Apple ID token missing kid')`
  - Line ~139 (Google no kid): `unauthorized('Google ID token missing kid')`
  - Line ~180 (bad provider): `badRequest('Unsupported social provider')`
- [ ] **Step 3:** Run backend tests: `pnpm test`

---

## Post-Sprint: Final Verification Gate

- [ ] Backend: `pnpm test` — 0 failures
- [ ] Backend: `pnpm lint` — 0 errors
- [ ] Frontend: `npm test` — 0 failures
- [ ] Frontend: `npm run lint` — 0 errors
- [ ] Code review agent — 0 Critical/Important issues
- [ ] Push + GH Actions — all green
- [ ] Sentinel report
