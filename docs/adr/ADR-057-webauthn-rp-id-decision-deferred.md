# ADR-057 — WebAuthn admin RP ID decision (deferred to V1.1)

**Status:** Proposed / Deferred
**Date:** 2026-05-17
**Deciders:** Tech Lead — decision required BEFORE any WebAuthn code lands
**Deferred to:** V1.1 scope discovery (audit `docs/audit-2026-05-12-raw/04-research/R26-web-auth-admin.md` recommendation)
**Blocking:** W9 WebAuthn admin V1.1 feature

---

## Context

The audit `R26 — Web auth admin` (2026-05-13) recommended WebAuthn / passkey authentication for the B2B admin surface (`museum-web/src/app/[locale]/admin/`) at V1.1. WebAuthn provides phishing-resistant authentication via platform authenticators (Touch ID, Face ID, Windows Hello, hardware keys), which is increasingly expected by B2B buyers performing due diligence on SaaS vendors that host their data.

The recommended library stack:

- `@simplewebauthn/server` (server-side ceremony orchestration + attestation parsing)
- `@simplewebauthn/browser` (client-side `navigator.credentials.create()` / `.get()` wrapping)

The library choice itself is straightforward — `simplewebauthn` is the de facto reference TypeScript implementation, FIDO Alliance-aligned, actively maintained.

**The non-trivial decision is the Relying Party ID (RP ID).** WebAuthn binds every credential to an RP ID at enrollment time; **the RP ID is part of the credential's cryptographic identity and CANNOT be changed later without invalidating every enrolled passkey**. Choosing the wrong RP ID at launch means either:

- (a) future migration forces every admin to re-enroll their passkey from scratch (bad B2B experience), OR
- (b) we end up locked into the wrong scope and can't extend passkeys to additional Musaium origins later.

### Musaium's origin topography (at V1 launch)

- **`musaium.com`** — apex domain. Currently serves the marketing landing (Next.js static) deployed via `museum-web`.
- **`app.musaium.com`** — admin panel + future visitor web surface (same Next.js app, distinct route tree under `museum-web/src/app/[locale]/admin/`).
- **Mobile app (iOS / Android)** — `EXPO_PUBLIC_API_BASE_URL` points at `api.musaium.com`. Mobile WebAuthn would use **Associated Domains** (iOS) / **Asset Links** (Android), not RP ID directly — but the RP ID still scopes which origin the mobile app's web view can use.

### The two viable RP ID choices

**Option A — RP ID = `musaium.com` (apex):**

Per WebAuthn spec, RP ID = `musaium.com` allows credentials to be used from any origin matching `*.musaium.com` (the spec says "the effective domain of the origin must be the RP ID OR a registrable suffix of it"). So a passkey enrolled at `app.musaium.com` could also be used from `landing.musaium.com`, `staging.musaium.com`, etc.

**Option B — RP ID = `app.musaium.com` (subdomain):**

Restricts the passkey to `app.musaium.com` only. Marketing landing (`musaium.com`) cannot use the same passkey. Operationally cleaner for admin-only authentication.

---

## Decision

**Defer. No WebAuthn code SHALL land until this ADR is updated with a final decision.**

The decision is deferred because:

1. **V1 launch (2026-06-01) does not include WebAuthn.** Admin auth uses email + password + 15-min JWT (per ADR-052). Adding WebAuthn pre-launch is out of scope.
2. **Mobile visitor passkey is not in the V1.1 roadmap, but may emerge from B2B feedback post-launch.** That feedback determines whether passkeys ever extend beyond `app.musaium.com`.
3. **The decision is irreversible.** Changing RP ID later invalidates every enrolled credential. Premature choice = forced re-enrollment campaign.

### Recommendation (non-binding, pending V1.1 scope discovery)

If B2B admins are the **only** WebAuthn population for the foreseeable future:

- Choose **Option B (`app.musaium.com`)** — tight scope, principle-of-least-privilege.

If passkey-based authentication may extend to **visitor accounts** (e.g. landing-page sign-in, mobile web sign-in from `musaium.com`):

- Choose **Option A (`musaium.com`)** — keeps the option open without forcing re-enrollment.

The Tech Lead must make this call when V1.1 scope is committed. Until then, no WebAuthn primitives, no `simplewebauthn` install, no `users.webauthn_credentials` table.

### Library stack pre-committed

When WebAuthn V1.1 ships, the library choice is:

- `@simplewebauthn/server` ≥ 10.x (current as of 2026-05-17)
- `@simplewebauthn/browser` ≥ 10.x
- Server-side ceremony state persisted in `users.webauthn_challenges` (short-lived, ~5 min TTL) + `users.webauthn_credentials` (one row per enrolled passkey, columns: `credential_id`, `public_key`, `counter`, `transports`, `attestation_format`, `created_at`).

---

## Consequences

### Positive (of deferring)

- No premature lock-in to an RP ID we can't undo.
- V1 launch path stays narrow — admin uses password + 15-min JWT (ADR-052), no new infra.
- B2B sales cycle can probe whether enterprise customers actually demand WebAuthn before we invest implementation cost.

### Negative / accepted

- Admin auth at V1 launch lacks phishing-resistant authentication. Mitigations: short JWT TTL (15 min), refresh-token rotation, `super_admin` boundary (ADR-052), audit log on every login. These are not equivalent to WebAuthn but cover the V1 launch window.
- Some B2B prospects may flag the absence in due diligence. Response: "WebAuthn V1.1, pinned to a planning ADR (ADR-057), library stack pre-committed."

### Blocking precondition for W9

When the WebAuthn admin V1.1 feature (codename W9) opens for spec discovery, the **first task** is to update this ADR with a decision. No `/team` skill can produce spec.md / design.md / tasks.md for W9 until this ADR's status moves to `Accepted` with a final RP ID.

---

## Alternatives considered

- **Pick RP ID = `app.musaium.com` now, document the trade-off.** Rejected: locks us out of visitor-side passkeys forever (invalidates all enrolled credentials if we change later). Decision is too consequential to make in advance of the V1.1 scope discussion.
- **Pick RP ID = `musaium.com` now, broader scope as default.** Rejected for the same irreversibility reason — broader scope has its own risk (a compromised landing-page origin could exfiltrate credentials usable on admin), so it's not unambiguously safer.
- **Use Email + TOTP (RFC 6238) instead of WebAuthn.** Considered as a parallel V1.1 option. Lower phishing resistance, but no RP ID lock-in problem. Not a substitute — TOTP can ship alongside WebAuthn. Tracked separately, not blocked by this ADR.
- **Use FIDO U2F (legacy) — single-RP per credential, simpler model.** Rejected: U2F is deprecated; WebAuthn supersedes it; FIDO Alliance has moved to passkeys.
- **Outsource auth to Auth0 / Clerk / WorkOS.** Out of scope of this ADR. If considered, would supersede this ADR entirely (provider chooses the RP ID). Currently rejected by `docs/MIGRATION_GOVERNANCE.md` policy (Musaium owns its identity infrastructure).

---

## What "decided" looks like (template for V1.1 update)

When this ADR is updated to `Accepted`, the following sections will be filled:

- **Final RP ID:** `musaium.com` | `app.musaium.com`
- **Decided by:** [Tech Lead name + date]
- **Rationale:** [2–4 sentences citing the V1.1 visitor-passkey scope decision]
- **Migration plan if Option A chosen:** Mobile Associated Domains config, iOS `apple-app-site-association`, Android `assetlinks.json`.
- **Migration plan if Option B chosen:** confirm `app.musaium.com` DNS / TLS production-ready before W9 first commit.
- **Audit log scope:** `AUDIT_WEBAUTHN_ENROLLED`, `AUDIT_WEBAUTHN_AUTHENTICATED`, `AUDIT_WEBAUTHN_REVOKED` constants to add (mirror the granular consent audit pattern from ADR-053).

---

## References

- `docs/audit-2026-05-12-raw/04-research/R26-web-auth-admin.md` — original audit recommendation (B2B admin WebAuthn at V1.1)
- ADR-052 — V1 admin auth (password + 15-min JWT + super_admin guard)
- ADR-053 — granular consent audit pattern (mirror for WebAuthn enrollment audit)
- `museum-backend/src/modules/auth/` — current auth module structure (where WebAuthn use cases will live)
- `museum-web/src/lib/auth.tsx` — current `RoleGuard` (where WebAuthn challenge flow will integrate)
- [WebAuthn Level 3 spec — Relying Party Identifier](https://www.w3.org/TR/webauthn-3/#rp-id)
- [`@simplewebauthn/server` — npm](https://www.npmjs.com/package/@simplewebauthn/server)
- [`@simplewebauthn/browser` — npm](https://www.npmjs.com/package/@simplewebauthn/browser)
- [FIDO Alliance — Passkeys overview](https://fidoalliance.org/passkeys/)

---

**Honesty caveat (UFR-013):** This ADR is `Proposed/Deferred`. No WebAuthn code exists in the repo at the time of writing. The library version (`@simplewebauthn/server` ≥ 10.x) is current as of 2026-05-17 but should be re-verified at W9 spec-discovery time. The RP ID recommendations above are best-judgment under the constraints documented; they are NOT a final architectural decision and MUST NOT be treated as one.
