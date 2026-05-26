# expo-screen-capture — Lessons (Musaium)

> Human-edited gotchas learned in production. Agents MUST NOT auto-fill this file.
> Add dated, verified incidents only (e.g. "2026-MM-DD: <what broke> → <fix>").

## 2026-05-26 — `usePreventScreenCapture()` releases on unmount ONLY — use imperative API with `useFocusEffect`

`usePreventScreenCapture()` calls `allowScreenCaptureAsync` only on component **unmount**. A `<Stack.Screen>` that stays mounted when you navigate away (host-persistent) never unmounts → protection leaks to screens that should NOT be protected, and is never released on blur.

**Correct pattern** (use imperative calls driven by `useFocusEffect`):
```ts
useFocusEffect(
  useCallback(() => {
    preventScreenCaptureAsync(key);
    return () => allowScreenCaptureAsync(key); // release on blur AND unmount
  }, [key])
);
```

**Never use** `usePreventScreenCapture()` on screens displaying secrets (TOTP QR, recovery codes). Use `preventScreenCaptureAsync`/`allowScreenCaptureAsync` with a dedicated `key`.

**Additional rules:**
- `require()` lazy/web-safe (native module, absent on web/Jest). Errors via `reportError` without logging secret payload.
- `expo-screen-capture` is a native dep → `pod install` + `git add -f ios/Pods/...` + Podfile.lock + ExpoModulesProvider.swift committed.
- Reference implementation: `features/auth/hooks/usePreventScreenCapture.ts`. Tech debt: TD-SEC-01/02.
