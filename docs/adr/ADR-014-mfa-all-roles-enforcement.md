# ADR-014 — MFA Enforcement: All Enrolled Users (not Admin-Only)

**Status**: Accepted
**Date**: 2026-04-30
**Deciders**: Tech Lead (sec-hardening-2026-04-30 team), user gate
**Numbering note**: This decision was originally tracked as ADR-013 in the design spec. ADR-013 was concurrently taken by `ADR-013-admin-facade-kept.md` from a parallel workstream that landed mid-Phase A. Renumbered to ADR-014; commit messages from that window (e.g. `f334bf05`) still reference ADR-013 — this file is the authoritative record.

## Context

Pre-2026-04-30 the MFA gate in `museum-backend/src/modules/auth/useCase/authSession.service.ts:228-238` evaluated only admin accounts:

```ts
if (user.role === 'admin') {
  const mfaOutcome = await this.evaluateAdminMfaGate(user);
  ...
}
```

Visitors, moderators, and museum_managers who voluntarily enrolled in TOTP via `/api/auth/mfa/enroll` could still log in with password alone — their `enrolledAt` row was ignored at the gate. Audit 2026-04-30 finding **F6 (MEDIUM)**.

Coupling: this also created the F9 enumeration oracle. The gate's three response shapes (`mfaRequired` / `mfaEnrollmentRequired` / `null`) leaked admin enrollment status to anyone who could attempt a login.

## Decision

**Apply MFA gate to any user with an active TOTP enrollment, regardless of role.** Implementation: drop the role check; rename `evaluateAdminMfaGate` → `evaluateMfaGate`; the warning-window enrollment policy (anchor + soft-block) remains admin-only — non-admins keep MFA opt-in with no nudge.

Banking-grade SOC2 CC6.1 + ASVS 6.3 (Authentication) do not distinguish role for MFA enforcement once the user has elected an authenticator. Half-state would re-introduce the F9 oracle for non-admins.

## Adversarial Review (Challenger)

| Counter-argument | Response |
|---|---|
| **Visitor friction**: forcing MFA on visitors who voluntarily enrolled hurts UX. | Visitors keep the option to disable TOTP via the existing `DELETE /api/auth/mfa` flow (out of scope for this audit). The gate enforces what the user opted into; not a new requirement. |
| **Admin-only is sufficient**: threat model = admin compromise; visitor MFA = nice-to-have. | ASVS 6.3.x and SOC2 CC6.1 don't gate MFA enforcement on role. Half-state is the F9 enumeration oracle. Banking-grade = no half-states. |
| **Existing sessions**: what about active sessions of visitors who enrolled but were not gated? | Existing access tokens remain valid until natural expiry (15 min). Refresh-rotation event triggers MFA evaluation on next call. Zero-downtime — users see one extra MFA prompt at next refresh, then carry on normally. |
| **Cost: visitor recovery flows**: lost TOTP = lost account. | The recovery-codes flow (`/api/auth/mfa/recovery`) is already wired for admins. Visitors get the same flow at enrollment time. No additional cost. |

## Rejected Alternative

**Keep admin-only and document the gap.** Rejected per UFR-001 ("no minimal fix as viable option") and the F9 coupling (oracle survives if half-state remains).

## F9 Coupling — Partial Resolution

Implementing F6 dissolves the F9 oracle for non-admin roles: visitor / moderator / museum_manager always return `null` (no TOTP) or `mfaRequired:true` (with TOTP) — observationally indistinguishable.

For admins specifically, the three-shape oracle remains because the warning-window enrollment policy still produces `mfaEnrollmentRequired` past the deadline. Closing that residual oracle requires migrating to a uniform `{mfaRequired, mfaSessionToken}` envelope plus a follow-up `GET /api/auth/mfa/status` call (rate-limited). Tracked as **Phase 2 follow-up** of the hardening sweep — mobile + web admin both need to migrate to the two-call pattern, which is non-trivial UX surface.

## Consequences

**Positive**:
- MFA enforcement honours the user's stated intent across all roles.
- F9 oracle materially reduced (eliminated for non-admins; admin-only residual documented).
- No code path leaves enrolled-with-TOTP users unprotected.

**Negative**:
- Visitors / moderators / museum_managers who enrolled with TOTP and rely on a current session will see one extra MFA prompt at next refresh.
- Recovery-code support quality must match enrollment quality across all roles (existing flow, no new gap).

**Mitigations**:
- Existing recovery code flow covers all enrolled users.
- Transparent rollout: no schema migration; gate change is server-side only; clients already render the MFA challenge screen for the existing admin flow.

## References

- `docs/security/2026-04-30-banking-grade-hardening-design.md` §4 (Phase B F6) + §2 (originally numbered ADR-013)
- ASVS 6.3.x — Authentication / Authenticator Lifecycle
- SOC2 CC6.1 — Logical access controls
- Commit `f334bf05` — `feat(auth): F6+F9 — MFA enforced for all enrolled users (ADR-013)` *(commit message references ADR-013; ADR file moved to ADR-014 due to numbering collision — see Numbering note above)*
- Test contract: `museum-backend/tests/integration/auth/mfa-flow.e2e.test.ts` (`F6 — MFA enforced for all enrolled users` describe block)
