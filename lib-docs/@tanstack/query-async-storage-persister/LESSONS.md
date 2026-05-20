# Lessons — @tanstack/query-async-storage-persister (family v5.99.x)

Project-specific gotchas. Family lessons live in `../react-query/LESSONS.md`.

## 2026-05-21 — Audit (refresh)
- ✅ `shared/data/queryClient.ts:102` creates `queryPersister` with `storage: AsyncStorage`, `key: 'musaium.query.cache'`, `throttleTime: 1000` — idiomatic.
- ✅ Sensitive data NEVER hits the persister: handled at the dehydrate gate (`shouldDehydrateQuery` blacklist) rather than via encryption — preferred (data isn't written at all). No `serialize`-based encryption needed because no sensitive key is persisted.
- ⚠️ Watch blob size: persisted keys are non-sensitive lists (museum directory, enrichment). Single-blob, non-chunked. If a large catalog ever gets persisted, the Android ~6 MB soft cap applies — implement the `retry` shrink callback before that becomes a problem (no `removeOldestQuery` helper exists for async-storage).
- Version 5.99.2; family latest 5.100.11 (safe align). No v6, no applicable advisory.
