# ADR-003 — Auth route split (deferred)

- **Status**: Deferred (2026-04-20)
- **Owner**: Backend

## Context

`museum-backend/src/modules/auth/adapters/primary/http/auth.route.ts` contains **19 HTTP endpoints in 514 lines**:

- `POST /register`, `/login`, `/refresh`, `/logout`
- `GET /me`, `/export-data`
- `PATCH /me`, `/onboarding-complete`
- `POST /change-password`
- `DELETE /account`
- `PUT /reset-password/request`, `/reset-password/confirm`
- `POST /change-email/request`, `/change-email/confirm`
- `POST /verify-email`, `/resend-verification`
- Social: `POST /social/link`
- API keys: `POST /api-keys`, `GET /api-keys`, `DELETE /api-keys/:id`

The file breaches `max-lines-per-function`-style intuition and is hard to test in isolation. chat-message.route.ts (310 L, 5 handler factories) is NOT affected — it is already modularized.

## Decision

**Defer the split** to a dedicated session. The audit cross-validation confirmed:
- `pnpm lint` and `pnpm test` pass at current state.
- No known regression attributable to the monolith.
- Split would require re-wiring index barrel + 4+ test files referencing `authRouter` + E2E smoke test adjustments.

Split strategy to adopt when executed:

1. Create 5 sub-routers in `museum-backend/src/modules/auth/adapters/primary/http/`:
   - `register-login.router.ts` (4 endpoints, ~100 L)
   - `profile.router.ts` (4 endpoints, ~90 L)
   - `password.router.ts` (3 endpoints, ~80 L)
   - `email-verification.router.ts` (4 endpoints, ~110 L)
   - `api-keys.router.ts` (3 endpoints, ~80 L)
   - `social.router.ts` (1 endpoint + OAuth callbacks, existing)
2. Compose in `auth.router.ts` (~40 L): `router.use(registerLogin); router.use(profile); ...`
3. Move shared helpers (`pickEmailLocale`, validators) into `auth-route.helpers.ts`.
4. Impact-analysis gate: run `mcp__gitnexus__impact({target: "authRouter", direction: "upstream"})` — expect d=1 HITS in `src/app.ts` + test harness, nothing deeper.
5. Run full test suite including E2E and contract tests before commit.

## Rejected alternatives

- **Split now in current session** — rejected: large surface, high chance of subtle regression, too little time to validate full E2E chain. Risk > reward this cycle.
- **Leave as-is** — rejected long-term: breaches enterprise-grade "single responsibility per file" for a 514 L public-facing entry point.

## Consequences

### Positive
- Current code is stable, no risk incurred.
- Clear plan for future session.

### Negative
- Technical debt carried another sprint.
- Continued ESLint exception footprint on auth.route.ts.

### Reversibility
- Fully reversible — split can be redone any time.

## Links

- Audit enterprise-grade 2026-04-20 : [`docs/plans/MASTER_PLAN.md`](../plans/MASTER_PLAN.md) (Phase 4)
