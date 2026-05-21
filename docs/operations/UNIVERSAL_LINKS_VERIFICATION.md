# Universal Links / App Links — Verification Runbook (musaium.com)

> **Scope:** TD-RNAV-01 — post-deploy verification of the iOS Universal Links + Android App Links domain association for `musaium.com`, plus the in-app routing that consumes the magic-link tokens.
> **Created:** 2026-05-21 (cycle 1 run `/team` `2026-05-21-universal-links-td-rnav-01`, APPROVED). **Updated:** 2026-05-21 (cycle 2 run `/team` `2026-05-21-universal-links-inapp-routing`, APPROVED — in-app routing added, §0 + §3.1).
> **Honesty (UFR-013):** Every check below is a **real-device / live-network** verification executed by the operator **after** a prod deploy. Results are reported verbatim. None of these are run in CI — the codebase delivers only the association declarations + static files; "the link opens the app on a real device" is NOT automatable and MUST NOT be claimed as CI-verified.

---

## 0. What was shipped (the two cycles)

**Cycle 1 — OS-level domain-association plumbing:**
- `museum-frontend/app.config.ts` — iOS `associatedDomains: ['applinks:musaium.com']` + Android `autoVerify` `https`/`musaium.com` intent filter, **production variant only**.
- `museum-web/public/.well-known/apple-app-site-association` (AASA, extensionless) — appID `RB3F9L6GUD.com.musaium.mobile`, 6 magic-link components (FR/EN × verify-email / reset-password / confirm-email-change), `?token` matcher, no blind `*`.
- `museum-web/public/.well-known/assetlinks.json` — package `com.musaium.mobile`, Google Play App Signing SHA256 fingerprint.
- `museum-web/next.config.ts` — `headers()` rule forcing `Content-Type: application/json` on the AASA path.

**Cycle 2 — in-app deep-link routing (now shipped, run `2026-05-21-universal-links-inapp-routing`):** the gap cycle 1 explicitly deferred is closed. Once association succeeds the OS hands `https://musaium.com/...` to the app; the app now resolves those URLs to the right screen and consumes the token:
- `museum-frontend/app/+native-intent.tsx` — `redirectSystemPath` strips the optional `/fr|/en` prefix, maps to `/(stack)/{verify-email,reset-password,confirm-email-change}`, preserves `?token` byte-for-byte, and passes every other path (incl. `musaium://`) through unchanged (try/catch returns the input path on error).
- `museum-frontend/app/(stack)/{verify-email,confirm-email-change,reset-password}.tsx` + the shared `features/auth/ui/TokenExchangeFlow.tsx` — consume the token (`authApi.verifyEmail` / `confirmEmailChange` / `resetPassword`) and render `loading → success | invalidToken | error`.

> Establishing association (cycle 1) was necessary but not sufficient; the in-app routing (cycle 2) makes the end-to-end magic-link-opens-app experience work. See §3.1 for the post-deploy in-app check.

---

## 1. Pre-deploy — iOS provisioning profile capability (BLOCKING for the iOS half)

`associatedDomains` is an **iOS entitlement**. The `app.config.ts` change is **inert** unless the EAS **production** provisioning profile carries the **Associated Domains** capability for `applinks:musaium.com`.

Verify before (or alongside) the next prod EAS build:
- Apple Developer portal > Certificates, Identifiers & Profiles > Identifiers > `com.musaium.mobile` > the **Associated Domains** capability is enabled.
- The production provisioning profile used by the EAS `production` profile includes that capability (regenerate the profile if it predates enabling the capability).
- Confirm the next prod build embeds the `applinks:musaium.com` entitlement (the build will fail / strip the entitlement if the profile lacks the capability).

> If the capability is absent, enable it in the Apple Developer portal and rebuild. This is a manual operator step — not covered by the config edit.

> Native-project regeneration note (CLAUDE.md iOS build chain): if `expo prebuild --clean` is ever re-run, re-apply the documented `Podfile post_install` patches (fmt-consteval, entry-file, MapLibre signature) and keep `ios/Pods/` committed. This run did NOT regenerate native projects (it only edited `app.config.ts`), but the entitlement lands in the native project at prebuild/build time.

---

## 2. Deploy gate (mirrors the existing PGP-key placeholder gate)

Both `.well-known` files MUST ship to prod **and** be placeholder-free. This mirrors the PGP-key deploy gate doctrine (CLAUDE.md: `pgp-key.txt` must not contain `PGP_KEY_PLACEHOLDER_DO_NOT_SHIP` in prod). The web association test (`museum-web/src/lib/well-known-association.test.ts`) already asserts no `$`-token / `PLACEHOLDER` / empty fingerprint, but the deploy pipeline should also gate on it.

**Risk #1 — AASA Content-Type.** Next.js serves an extensionless `public/` file as `application/octet-stream` by default; Apple **silently** invalidates an AASA that is not `application/json` or that sits behind any redirect. This is resolved in-code via the `next.config.ts` `headers()` rule (no route handler, no redirect). The `/.well-known/*` i18n-redirect passthrough is already in `museum-web/src/middleware.ts`. The post-deploy `curl -I` in §3 is the live confirmation that the header is actually served in prod.

---

## 3. Post-deploy — iOS verification

```bash
# Expect: HTTP/2 200, content-type: application/json, NO 30x redirect (no Location header)
curl -sI https://musaium.com/.well-known/apple-app-site-association
```

Then confirm Apple's CDN has fetched and cached the file (Apple crawls the domain; allow propagation time after deploy / after the app version that declares the entitlement is installed):

```bash
# Expect: the published AASA JSON (appIDs RB3F9L6GUD.com.musaium.mobile + the 6 components)
curl -s https://app-site-association.cdn-apple.com/a/v1/musaium.com
```

On-device sanity check: with a prod build installed (the build whose provisioning profile carries the Associated Domains capability, §1), tapping a real magic-link `https://musaium.com/fr/verify-email?token=...` should be handed to the app by iOS, which then routes in-app (cycle 2 — see §3.1).

**Report:** paste the verbatim `curl` headers + the Apple CDN response. Do not summarise as "works" without the raw output.

---

## 3.1 Post-deploy — in-app routing (cycle 2)

With association working (§3/§4) **and** a prod build that includes the cycle-2 in-app routing installed, tapping a real transactional-email magic-link must open the matching screen and consume the one-time token — **not** land on `+not-found`.

For each of the three flows, request a fresh real email and tap its link on a device with the app installed:

- **verify-email** — `https://musaium.com/{fr|en}/verify-email?token=...` → opens the verify-email screen → shows the success state (email verified). A bad/expired token → `invalidToken` state (not a crash, not `+not-found`).
- **reset-password** — `https://musaium.com/{fr|en}/reset-password?token=...` → opens the reset-password screen → enter a new password (≥8 chars, matching confirm) → submit → success → CTA to login.
- **confirm-email-change** — `https://musaium.com/{fr|en}/confirm-email-change?token=...` → opens the confirm screen → shows success.

**Failure signatures:** the link lands on `+not-found` (in-app routing not in this build, or `+native-intent` not mapping the route); or the screen opens but the token is rejected when it should be valid (token dropped/re-encoded across the rewrite — the byte-for-byte `?token` preservation, NFR-1).

**CI-local coverage (not CI cloud):** three Maestro happy-path flows ship with cycle 2 — `museum-frontend/.maestro/magic-link-{verify-email,confirm-email-change,reset-password}.yaml`. They satisfy `pnpm sentinel:screen-test-coverage` (UFR-021) and are runnable on-device (they reach the screens via the `musaium://` scheme, which `+native-intent` passes through unchanged). **Maestro does NOT run in the CI cloud here** — these flows do not substitute for the real-device HTTPS hand-off check above; they only exercise the in-app screen behaviour. A live Maestro run needs a seeded backend test account/token (same caveat as `mfa-enroll-flow.yaml`).

**Report:** for each flow, state the link tapped, the screen reached, and the final state. Do not assert "works" without naming the screen + outcome state per flow.

---

## 4. Post-deploy — Android verification

```bash
# Expect: HTTP 200, valid JSON array (package com.musaium.mobile + the App Signing SHA256 fingerprint)
curl -s https://musaium.com/.well-known/assetlinks.json
```

On a device/emulator with the prod build installed:

```bash
adb shell pm verify-app-links --re-verify com.musaium.mobile
adb shell pm get-app-links com.musaium.mobile
```

**Expect:** the output of `get-app-links` shows `musaium.com` in the `verified` state (e.g. `Domain verification state: musaium.com: verified`). A `legacy_failure` / `1024` / non-`verified` state means the assetlinks fetch failed (wrong Content-Type, redirect, wrong fingerprint, or the App Signing cert differs from the one in `assetlinks.json`).

**Report:** paste the verbatim `adb` output. Do not assert `verified` without the raw line.

---

## 5. Honesty checklist (UFR-013)

- [ ] `curl -I` AASA output pasted verbatim (status + content-type + absence of redirect).
- [ ] Apple CDN response pasted verbatim.
- [ ] `curl` assetlinks.json output pasted verbatim.
- [ ] `adb shell pm get-app-links` output pasted verbatim showing the actual verification state.
- [ ] iOS provisioning-profile Associated Domains capability confirmed present (§1) — or flagged as missing/blocking.
- [ ] In-app routing (§3.1) verified for all three flows (verify-email / reset-password / confirm-email-change): screen opened + token consumed, NOT `+not-found`. Per-flow screen + outcome stated verbatim.

If any check fails, report the exact failing output and stop — do not paper over it.

---

## References

- TD-RNAV-01 entry: [`docs/TECH_DEBT.md`](../TECH_DEBT.md).
- Cycle 1 run artefacts (spec / design / decisions D1-D5): `.claude/skills/team/team-state/2026-05-21-universal-links-td-rnav-01/`.
- Cycle 2 run artefacts (spec / design / decisions D1-D8, in-app routing): `.claude/skills/team/team-state/2026-05-21-universal-links-inapp-routing/`.
- PGP-key deploy-gate analogue: [`docs/operations/PGP_KEY_GENERATION.md`](PGP_KEY_GENERATION.md) + CLAUDE.md § Pièges connus.
- Apple AASA spec: https://developer.apple.com/documentation/xcode/supporting-associated-domains
- Android App Links / Digital Asset Links: https://developer.android.com/training/app-links/verify-android-applinks
