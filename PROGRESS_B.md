# PROGRESS_B — Agent B (security CVE + orphan libs)

Sprint cleanup-2026-05-12. Worktree shared with A/C/D.

## État initial (2026-05-12)

- BE pnpm audit : 4 (3 HIGH) ; OTel 0.75.0 déjà mergé (commit dd584e34)
- Web pnpm audit : 13 (7 HIGH next 15.5.15)
- FE npm audit : 0
- B.2 déjà fait (OTel 0.75.0 en hotfix prod)

## Actions

- [x] B.1 — next 15.5.15 → 15.5.18 (advisory GHSA-26hh-7cqf-hhc6 patched in 15.5.18, not 15.5.16 — bumped to actual fix). pnpm audit web = `No known vulnerabilities found`.
- [x] B.2 — OTel 0.75.0 (commit dd584e34, hotfix prod déjà landed)
- [x] B.3 — uuid override ^11.1.1 — `pnpm list uuid -r` → 11.1.1 ; `pnpm audit` BE = `No known vulnerabilities found`.
- [x] B.4 — remove google-signin ; uninstall + clean app.config.ts (plugin + dead Google client-id config + extras) + comments trimmed in socialAuthProviders/useSocialLogin ; `expo prebuild` + `pod install` ; iOS Pods/GoogleSignIn, GoogleUtilities, AppAuth, GTM*, RNGoogleSignin gone ; Info.plist com.googleusercontent URL scheme removed.
- [x] B.5 — new `shared/ui/Confetti.tsx` (Reanimated 4) drop-in replaces ConfettiCannon in `app/(stack)/reviews.tsx` ; npm uninstall ; tsc clean on Confetti.tsx + reviews.tsx.
- [~] B.6 — **DEFERRED to V1.1 / dedicated PR**. Reason: `js-sha256` carries no CVE (orphan-cleanup goal only). The migration requires `Crypto.digestStringAsync` (async) which cascades through `computeLocalCacheKey` → `chatLocalCache` store API (`lookup`/`store`/`bulkStore` sync→async) → `useChatSession` → `sendMessageCache` / `sendMessageStreaming` → `useMuseumPrefetch` + 4 tests. Additionally, `expo-crypto` is **not in deps** today (the brief assumed it was a transitive of Expo SDK 55, but `npm list expo-crypto` returns empty). Trade-off rejected pre-launch: bundle saving (~10KB) ≪ regression risk on chat cache hot path. Open ADR-046 covers this. Coordinate with D for tracking.
- [x] B.7 — remove cheerio ; linkedom DOM API replaces fallback ; html-scraper tests 31/31 ; lint clean.
- [x] B.8 — BE zod ^3.25.76 → ^4.4.1 (resolved 4.4.3) ; FE 4.4.1. Single breaking change touched : `z.record(z.unknown())` → `z.record(z.string(), z.unknown())` in 3 files (museum.schemas.ts, content-classifier.service.ts). BE typecheck clean on Zod-touched code ; 201 unit tests pass.
- [x] B.9 — Web react/react-dom pinned to `19.2.0` exact (caret dropped) ; FE already exact. `pnpm list react` Web = 19.2.0 ; `npm list react` FE = 19.2.0.
- [x] B.10 — final audit ALL apps : BE `pnpm audit` = No known vulnerabilities found ; FE `npm audit --audit-level=high` = found 0 vulnerabilities ; Web `pnpm audit` = No known vulnerabilities found.
- [x] B.11 — Renovate config audit. `vulnerabilityAlerts` had `enabled: true` + `schedule: at any time` but **no `automerge`/`platformAutomerge`** — security PRs fell through to per-package rules, which for major bumps (next, OTel) defaulted to `automerge: false`. Patched: added `automerge: true` + `platformAutomerge: true` on `vulnerabilityAlerts` so CVE PRs land automatically once CI green. `dependencyDashboard` already enabled via `:dependencyDashboard` preset. `gh pr list --label=dependencies` returns 4 open PRs (top 270/269/268/267) — backlog to merge manually post-sprint once the new policy takes effect.

## Verifs / commits

**B.1** — next@15.5.18 — pnpm audit web : `No known vulnerabilities found` (was 7 HIGH + 6 others).

READY: agents A/C/D peuvent démarrer.
