# Network Security Hardening (Mobile)

**Scope:** `museum-frontend` — iOS App Transport Security (ATS) + Android Network Security Config.
**Date:** 2026-04-12
**Phase 2 · Item 12 option B** (hardening **without** public-key pinning).

---

## Threat model

Musaium is a museum assistant that sends photos of artworks + chat text to the backend. It does not process banking, health, or any ultra-sensitive data. The realistic threats we care about, in order:

1. **Passive MITM on public WiFi** (pineapples, hotel captive portals) — defeated by HTTPS + HSTS + strict ATS.
2. **Ops mistake re-enabling cleartext** (dev flag leaking into a prod build) — defeated by variant-gated config built from `APP_VARIANT`.
3. **Malicious CA issuing a valid cert for `api.musaium.com`** — rare, hard to exploit. Mitigated weakly by HSTS preload + Certificate Transparency logs that Apple/Google browsers consult.

We explicitly **do not defend against** a user who has rooted their device and added a custom CA to trust arbitrary traffic — that is not part of our threat model, and defending against it conflicts with legitimate enterprise monitoring tools.

---

## What we do

### Android — `network_security_config.xml`

Generated at prebuild time by `museum-frontend/plugins/withNetworkSecurity.js`. The production variant:

```xml
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
</network-security-config>
```

- `cleartextTrafficPermitted="false"` blocks **all** HTTP traffic (not just to our API).
- Only the system trust store is accepted — user-installed CAs are rejected for HTTPS sessions the app opens.
- The `AndroidManifest.xml` `<application>` element is patched with `android:networkSecurityConfig="@xml/network_security_config"` so the runtime enforces it.

The development variant allows cleartext to `localhost`, `10.0.2.2` (Android emulator host alias), and `127.0.0.1` so Metro / the dev backend (`http://localhost:3000`) still work inside the emulator.

### iOS — `NSAppTransportSecurity` via `withInfoPlist`

The same plugin rewrites the Info.plist ATS block on prebuild:

```xml
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoads</key><false/>
  <key>NSAllowsLocalNetworking</key><false/>   <!-- production -->
</dict>
```

In `development` / `preview` variants, `NSAllowsLocalNetworking` is set to `true` so the React Native dev server running on the Mac host can be reached via Bonjour / `localhost`.

### Backend side (already in place — verified)

- `museum-backend/deploy/nginx/site.conf.production:169` — HSTS header, `max-age=63072000; includeSubDomains; preload`.
- TLS termination at nginx; backend speaks plain HTTP on the private docker network only.

---

## Why we do NOT pin certificates

Public-key pinning was on the Phase 2 audit wishlist. We explicitly opted out after the challenge review:

| Argument for pinning | Why we didn't retain it |
|---|---|
| Defeats CA-compromise MITM | Requires a backup pin + rotation plan. Expired pins brick the app for every user until the next store update (24–48h). |
| Compliance badge for banking/health | Not our threat model. Musaium handles photos + chat, not financial or medical data. |
| Signals "security-minded product" | Audits reward real protections, not badges. And a broken pin is worse than no pin. |

We **will** revisit pinning when any of the following become true:

- The app gains biometric payment, health records, or regulated data flows.
- We invest in a remote kill-switch that can disable pinning live (feature flag fetched on app start, before any pinned connection).
- A rotation drill has been rehearsed at least once on staging.

Until then, the cost (maintenance, user risk) exceeds the marginal security benefit.

---

## Where to change things

- **Config plugin:** `museum-frontend/plugins/withNetworkSecurity.js`
- **Wiring:** `museum-frontend/app.config.ts` → `plugins` array, entry `['./plugins/withNetworkSecurity', { variant }]`
- **Regenerate native projects:** `cd museum-frontend && npx expo prebuild --clean --platform android` (and `ios`). Re-apply the Podfile fmt patch afterwards — see project memory `reference_podfile_fmt_patch.md`.

### Verifying after a prebuild

```bash
cd museum-frontend
npx expo prebuild --clean --non-interactive

# Android
cat android/app/src/main/res/xml/network_security_config.xml          # exists, cleartextTrafficPermitted="false"
grep networkSecurityConfig android/app/src/main/AndroidManifest.xml   # @xml/network_security_config

# iOS
grep -A2 NSAppTransportSecurity ios/Musaium/Info.plist                # NSAllowsArbitraryLoads=false
```

### Dev loop

Because the dev variant allows cleartext localhost, `npx expo start` with a dev client build on the emulator hits `http://10.0.2.2:3000` as before. No workaround needed.

---

## Out of scope

- DNS-over-HTTPS — relies on system configuration, not our call.
- HSTS preload submission for `musaium.com` — one-off task, outside this hardening plan.
- In-app proxy detection / "am I being MITM'd right now" warnings — not part of option B.
