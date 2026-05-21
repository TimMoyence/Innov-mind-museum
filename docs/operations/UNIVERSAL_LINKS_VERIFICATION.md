# Universal Links / App Links — Verification Runbook (musaium.com)

> **Scope:** TD-RNAV-01 — post-deploy verification of the iOS Universal Links + Android App Links domain association for `musaium.com`.
> **Created:** 2026-05-21 (run `/team` `2026-05-21-universal-links-td-rnav-01`, APPROVED).
> **Honesty (UFR-013):** Every check below is a **real-device / live-network** verification executed by the operator **after** a prod deploy. Results are reported verbatim. None of these are run in CI — the codebase delivers only the association declarations + static files; "the link opens the app on a real device" is NOT automatable and MUST NOT be claimed as CI-verified.

---

## 0. What this run shipped (and what it did NOT)

**Shipped — OS-level domain-association plumbing only:**
- `museum-frontend/app.config.ts` — iOS `associatedDomains: ['applinks:musaium.com']` + Android `autoVerify` `https`/`musaium.com` intent filter, **production variant only**.
- `museum-web/public/.well-known/apple-app-site-association` (AASA, extensionless) — appID `RB3F9L6GUD.com.musaium.mobile`, 6 magic-link components (FR/EN × verify-email / reset-password / confirm-email-change), `?token` matcher, no blind `*`.
- `museum-web/public/.well-known/assetlinks.json` — package `com.musaium.mobile`, Google Play App Signing SHA256 fingerprint.
- `museum-web/next.config.ts` — `headers()` rule forcing `Content-Type: application/json` on the AASA path.

**NOT shipped (separate follow-up):** in-app deep-link routing. Once association succeeds the OS hands `https://musaium.com/...` to the app, but Expo Router has no `Linking.prefixes` / `getStateFromPath` mapping yet, so the app will not resolve those URLs to a screen. Establishing association is necessary but not sufficient for the end-to-end magic-link-opens-app experience.

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

On-device sanity check: with a prod build installed (the build whose provisioning profile carries the Associated Domains capability, §1), tapping a real magic-link `https://musaium.com/fr/verify-email?token=...` should be handed to the app by iOS. (If in-app routing is not yet wired — see §0 — the app receives the URL but may not navigate; that is the expected follow-up gap, not an association failure.)

**Report:** paste the verbatim `curl` headers + the Apple CDN response. Do not summarise as "works" without the raw output.

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
- [ ] In-app routing gap (§0) acknowledged as a known, separate follow-up — NOT silently treated as "association broken".

If any check fails, report the exact failing output and stop — do not paper over it.

---

## References

- TD-RNAV-01 entry: [`docs/TECH_DEBT.md`](../TECH_DEBT.md).
- Run artefacts (spec / design / decisions D1-D5): `.claude/skills/team/team-state/2026-05-21-universal-links-td-rnav-01/`.
- PGP-key deploy-gate analogue: [`docs/operations/PGP_KEY_GENERATION.md`](PGP_KEY_GENERATION.md) + CLAUDE.md § Pièges connus.
- Apple AASA spec: https://developer.apple.com/documentation/xcode/supporting-associated-domains
- Android App Links / Digital Asset Links: https://developer.android.com/training/app-links/verify-android-applinks
