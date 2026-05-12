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
- [ ] B.4 — remove google-signin
- [ ] B.5 — replace confetti-cannon with Reanimated
- [ ] B.6 — replace js-sha256 with expo-crypto
- [x] B.7 — remove cheerio ; linkedom DOM API replaces fallback ; html-scraper tests 31/31 ; lint clean.
- [ ] B.8 — align Zod v4 BE↔FE
- [ ] B.9 — align React 19.2.0 exact
- [ ] B.10 — final audit
- [ ] B.11 — Renovate config audit

## Verifs / commits

**B.1** — next@15.5.18 — pnpm audit web : `No known vulnerabilities found` (was 7 HIGH + 6 others).

READY: agents A/C/D peuvent démarrer.
