# Lessons — @tanstack/react-query-persist-client (family v5.100.x)

Project-specific gotchas. Most family lessons live in `../react-query/LESSONS.md`.

## 2026-05-21 — Audit (refresh)
- ✅ `app/_layout.tsx:167` mounts `PersistQueryClientProvider` (not bare `persistQueryClient`) — correct lifecycle handling, no hydration race.
- ✅ `persistOptions` config in `shared/data/queryClient.ts`: `maxAge=24h == gcTime=24h` (satisfies gcTime ≥ maxAge), `buster=musaium-${appVersion}` (wipe on upgrade), `dehydrateOptions.shouldDehydrateQuery` blacklists PII prefixes (messages/session/admin/auth/user).
- ✅ `resetPersistedCache()` calls `queryPersister.removeClient()` BEFORE `queryClient.clear()` — correct order (avoids stale-blob rehydration on crash mid-reset).
- Note: `onSuccess: resumePausedMutations` is the canonical hook for persisted mutations — Musaium does not persist mutations (only queries), so not currently wired; fine.
- Version family unchanged (5.100.10). 5.100.11 available, safe bump. No v6, no applicable advisory.
