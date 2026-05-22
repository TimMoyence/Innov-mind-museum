# Lessons — expo-updates (Musaium)

Project gotchas for `expo-updates@~55.0.18` in Musaium. Human-edited; agents do not touch.

## 2026-05-20 — OTA intentionally disabled (ADR-009); `reloadAsync` = soft reset only
- **Cause**: `app.config.ts:349-354` sets `updates.enabled: false`, `checkAutomatically: 'NEVER'`, `fallbackToCacheTimeout: 0`. Two prod call-sites invoke `Updates.reloadAsync()` purely to remount the JS bundle — `ErrorBoundary.handleReload` (`shared/ui/ErrorBoundary.tsx:38-48`) and post-locale-change (`shared/i18n/I18nContext.tsx:80`) — NOT OTA-coupled.
- **Anti-pattern à éviter**: `useUpdates()` polling, `Updates.checkForUpdateAsync()`, `fetchUpdateAsync()`. The parent expo PATTERNS OTA pipeline does NOT apply here.
- **À appliquer**: any reload must be wrapped in try/catch (throws in dev/bare) with a non-OTA fallback (state reset). Re-introducing OTA requires revisiting ADR-009.

## 2026-05-20 — `runtimeVersion: '1.0.0'` is a custom literal, not bumped per release
- **Cause**: `app.config.ts:126` pins a custom-literal runtimeVersion. Consistent with OTA disabled — no fingerprint/appVersion policy. Do not introduce a runtimeVersion policy without an OTA strategy.

## 2026-05-20 — `url` kept configured despite `enabled:false`
- **Cause**: `updates.url` is set (when projectId present) so EAS Build metadata stays consistent, but `enabled:false` guarantees no fetch at app start. Don't "clean up" the url thinking it's dead config — it documents the channel.
