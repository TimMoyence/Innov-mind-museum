# Lessons — js-sha256 (v0.11.1)

Audit 2026-05-18 : **PASS** — single usage `museum-frontend/features/chat/application/computeLocalCacheKey.ts` for **cache key short digest only** (NOT password, NOT cert pinning, NOT MAC).

## ✅ Configuration exemplaire
- Named import `import { sha256 } from 'js-sha256'`
- One-shot hex via `sha256(components.join('|')).slice(0, 16)` — 64-bit collision space acceptable pour cache (collision = stale answer, not security boundary)
- Backend parity contract (computeLocalCacheKey ↔ `chat-cache-key.util.ts`) load-bearing
- Synchronous pure-JS chosen for isomorphic byte-identical hash (RN 0.83 expo-crypto async would break parity)

## ⚠️ Advisory
- Toute bump beyond 0.11.x → re-run parity tests sur BOTH apps simultaneously (load-bearing contract)
- 64-bit truncation = if MAX_CACHE_KEY_BYTES ever shrinks, document

## Anti-patterns à éviter (jamais appliqués actuellement)
- ❌ Password storage (use Argon2/bcrypt) 
- ❌ MAC verification (use HMAC-SHA256 with crypto.subtle)
- ❌ Cert pinning (use SPKI hash via OpenSSL pipeline per CLAUDE.md cert-pinning runbook)

## Status : NO TD entry. Pattern de référence pour cache-key derivation.

---

## 2026-05-20

Re-audit (lib-doc-curator, UFR-022 refresh). **Verdict unchanged: PASS.**

### Verified state
- Resolved version **0.11.1** = registry `latest` (verified `npm view js-sha256 dist-tags` → `{ latest: '0.11.1' }`). No newer release. **No GitHub security advisories** (2024–2026, empty result set). Correctness floor (≥ 0.11.0, fix #43) satisfied.
- **Single consumer** confirmed: `features/chat/application/computeLocalCacheKey.ts:106` — `sha256(components.join('|')).slice(0,16)`, non-secret 64-bit cache-key digest. Covered by `__tests__/features/chat/computeLocalCacheKey.test.ts`. No other repo usage (only package.json + lockfile + coverage report).

### expo-crypto removability assessment (task-requested)
- `expo-crypto` is **NOT installed** (verified `ls node_modules/expo-crypto` → absent; not in package.json).
- `expo-crypto.digestStringAsync` is **async** → would break the synchronous, byte-identical backend-parity contract (`computeLocalCacheKey` ↔ `chat-cache-key.util.ts`) and ripple async through sync call sites, plus add a native Pod for a 16-char non-secret digest.
- **Verdict: js-sha256 is NOT removable / NOT worth replacing.** The pure-JS *synchronous* property is the load-bearing requirement. Keep it.

### Advisory (carried forward)
- Any bump beyond 0.11.x → re-run cache-key parity test on BOTH apps simultaneously.
- 64-bit truncation acceptable BY DESIGN (collision = stale answer, not a security boundary).

### No new TD entry. No security action required.
