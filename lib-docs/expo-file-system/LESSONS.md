# Lessons — expo-file-system

Project-specific gotchas. Human-edited. Consumed by /team red/green/reviewer agents.

## 2026-05-20

- **Everything is on the LEGACY API (`expo-file-system/legacy`) — migration debt, not a bug.** v54+ introduced the new `File`/`Directory`/`Paths` OO API; the function API (`writeAsStringAsync`, `getInfoAsync`, `documentDirectory`, …) now lives ONLY under `expo-file-system/legacy`. Musaium prod files (`useTextToSpeech.ts`, `offlineImageStorage.ts`, `imageUploadOptimization.ts`) all import legacy. v55 does NOT remove legacy → no urgency, but when touching these files prefer migrating the touched function to the new API. Do not add NEW legacy imports for greenfield code.
- **cache vs document is chosen correctly — keep it.** TTS audio → `cacheDirectory` (`useTextToSpeech.ts:53`) because it's regenerable and the OS may purge it under storage pressure. Captured offline images → `documentDirectory` (`offlineImageStorage.ts:6`) because they must survive. Don't swap these. A "TTS cache vanished" report is expected OS purge behavior, not a defect — the code re-synthesizes on miss.
- **Path-traversal guard on delete is load-bearing.** `cleanupOfflineImage` only deletes when `uri.startsWith(getOfflineImageDirUri())` (`offlineImageStorage.ts:39`). This prevents a bug from `deleteAsync`-ing an arbitrary path. Any new delete helper MUST keep an equivalent ownership/prefix check.
- **Cache writes are best-effort and MUST NOT break playback.** `writeTtsCache` swallows errors and returns `null`; the player falls back to an in-memory `data:audio/mpeg;base64,…` URI (`useTextToSpeech.ts:169`). Preserve this: a full disk / cache write failure can never block the user from hearing TTS.
- **`cacheDirectory`/`documentDirectory` are `null` on web.** Always null-guard before building a path (`getTtsCacheDir()` returns `null` on web). The new API equivalent (`Paths.cache`) also has no web filesystem — same guard required after migration.
