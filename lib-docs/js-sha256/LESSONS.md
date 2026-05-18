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
