# Cert Pinning Runbook — Musaium mobile

> **Owner:** mobile/infra team. **Last update:** 2026-05-14.
> **Reference:** ADR-016 (library), ADR-031 (kill-switch), audit `docs/audit-2026-05-12-raw/04-research/R13-rn-security-on-device.md`.

This runbook covers the rotation lifecycle for the SPKI pinset shipped in `shared/config/cert-pinning.ts`. Mishandling a rotation locks legitimate users out of `musaium.com` — read end-to-end before touching pins.

---

## Current pinset (snapshot)

| Slot | Subject | SPKI SHA-256 (base64) | NotAfter |
|---|---|---|---|
| #1 leaf | `CN=musaium.com` (Let's Encrypt) | `ZDRgYM8cmWD/dXjUsAFfxIfU1sMuaUCykdASVIJb8MY=` | 2026-06-19 |
| #2 intermediate | `Let's Encrypt E8` (ECDSA P-384) | `iFvwVyJSxnQdyaUvUERIf+8qk7gRze3612JMwoO3zdU=` | 2027-03-12 |

The leaf cert expires every 90 days (Let's Encrypt cadence); the intermediate **E8** is stable until 2027-03-12 and absorbs leaf rotations as long as the renewed leaf is chained from E8.

---

## Why two pins (and not three)

| Threat | Defence |
|---|---|
| Server cert renewed with same keypair (`certbot --reuse-key`) | Pin #1 still matches; no app action. |
| Server cert renewed with new keypair on same intermediate | Pin #1 stops matching, Pin #2 (E8) still matches; TLS validates; no user-visible outage. |
| Let's Encrypt rotates the intermediate (E8 → E9 etc.) | Both pins stop matching. **Outage** unless an app build with the new intermediate is already shipped. → see "Pre-rotation procedure" below. |
| Misissued cert from a compromised CA | Both pins reject the chain — TLS handshake fails — user gets `cert-pinning.mismatch` Sentry event. |
| Charles / mitmproxy injection on device | Same as misissue. |

Three pins (leaf + intermediate + offline backup) would buy us an emergency-key recovery path if both the leaf keypair and the LE intermediate were lost simultaneously. For V1 (B2C cultural-content, no PCI / banking-grade), the two-pin layout matches the risk profile. If we ever ship a HSM-backed offline backup keypair, add it as Pin #3 — never replace one of the existing pins.

---

## Coverage scope

The JS-level pinning configured in `shared/config/cert-pinning.ts` and wired in `shared/infrastructure/cert-pinning-init.ts` covers the React Native Networking stack (`fetch` + `XMLHttpRequest`). Native-side networking from third-party SDKs is NOT covered — see `lib-docs/react-native-ssl-public-key-pinning/PATTERNS.md` §4 ("DON'T expect pinning to cover native-side networking from third-party SDKs that bypass `fetch`/`XMLHttpRequest`").

| SDK / path | Transport | Covered by pinning? | Notes |
|---|---|---|---|
| API client (`fetch` / `axios`) | RN Networking (`fetch` + `XMLHttpRequest`) via `shared/api/client.ts` | Yes (covered) | All `musaium.com` calls. Pinning enforced once `initializeSslPinning` resolves. `axios` ships on top of `XMLHttpRequest` in RN, so it is covered transparently. |
| `@sentry/react-native` native transport | Native HTTPS to `sentry.io` | No (bypass) | The Sentry native transport bypasses the RN Networking stack. Not a `musaium.com` host, but worth knowing if Sentry ever ingests to a self-hosted relay. |
| MapLibre tile loader | Native HTTPS to tile CDN | No (bypass) | Tile fetches happen inside the MapLibre native renderer (`@maplibre/maplibre-react-native`). Out of `musaium.com` scope. |
| `expo-image-picker` upload pipeline | Native picker → JS handler → `fetch` | No (bypass for the picker; JS-side uploads ARE covered) | The picker itself returns a local URI; any subsequent upload performed from the JS side via `fetch` IS pinned. Native pre-upload metadata calls (none expected today) would NOT be. |
| S3 audio (`audioUrl`) fetches | RN `fetch` to S3 presigned URL | Yes if hostname is `musaium.com`; otherwise N/A | Pinning is per-host. S3 buckets exposed via `*.s3.amazonaws.com` / `*.cloudfront.net` are intentionally unpinned (different hostname, presigned URL whose host can rotate). Audio served behind `musaium.com` IS covered. |
| Kill-switch endpoint `/api/config/cert-pinning-enabled` | RN `fetch` to `musaium.com` | Yes (covered after init resolves) | The bootstrap kill-switch fetch happens BEFORE `initializeSslPinning` resolves on a cold start, so the very first kill-switch call is un-pinned. This is intentional (fail-open semantics, ADR-031) — once init resolves, subsequent kill-switch fetches are pinned. |

**Implication for the threat model**: an attacker who can MitM the device's network can still intercept Sentry telemetry, MapLibre tiles, and any S3 traffic served outside `musaium.com`. The pinning posture protects `musaium.com` traffic only.

---

## Capture commands

### Leaf SPKI (current cert)

```bash
openssl s_client -connect musaium.com:443 -servername musaium.com </dev/null 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform DER \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64
```

Returns the 44-character base64 hash matching the **public key** (SPKI) of the leaf cert.

### Full chain (leaf + intermediate)

```bash
./scripts/capture-spki.sh musaium.com
```

The helper script (added 2026-05-14) prints one row per cert in the chain with its subject, expiry, and SPKI base64.

### From a `.pem` file (e.g. backup keypair)

```bash
openssl x509 -in cert.pem -pubkey -noout \
  | openssl pkey -pubin -outform DER \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64
```

For a bare key (no cert):

```bash
openssl pkey -in key.pem -pubout -outform DER 2>/dev/null \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64
```

---

## Routine rotation — when Let's Encrypt issues a new leaf (every ~60-90 days)

If the renewed leaf is signed by **E8** (current intermediate) AND uses the same keypair (`certbot --reuse-key`):

  → **no action.** Pin #1 still matches.

If the renewed leaf is signed by **E8** but uses a new keypair (default `certbot` behaviour):

  → Pin #1 will eventually fail. Pin #2 (E8) keeps TLS validating, but we lose defence-in-depth. Schedule an app update within 60 days:

  1. Capture the new leaf SPKI with the command above.
  2. Replace `PROD_SPKI_HASHES[0]` in `shared/config/cert-pinning.ts`.
  3. Keep `PROD_SPKI_HASHES[1]` (E8) untouched.
  4. Bump `package.json` version + ship via EAS Update or store release.
  5. Update the `Last update:` line + the leaf row of the snapshot table in this runbook.

If the renewed leaf is signed by a **new intermediate** (E9, R10, ...) — see "Pre-rotation procedure" below.

---

## Pre-rotation procedure — intermediate CA changes (~yearly)

Triggered by Let's Encrypt announcement of new intermediate CA (track [LE roots](https://letsencrypt.org/certificates/) page).

### T-30d : detect

Read the LE announcement. Identify the new intermediate name (e.g. `E9`, `R12`) and its CA NotAfter.

### T-21d : capture new intermediate SPKI

Let's Encrypt publishes the new intermediate cert at `https://letsencrypt.org/certs/<name>.pem`. Capture its SPKI:

```bash
curl -s https://letsencrypt.org/certs/e9.pem | \
  openssl x509 -pubkey -noout | \
  openssl pkey -pubin -outform DER | \
  openssl dgst -sha256 -binary | \
  openssl enc -base64
```

### T-21d : ship 3-pin app update

In `shared/config/cert-pinning.ts`, **add** the new intermediate as Pin #3:

```ts
export const PROD_SPKI_HASHES = [
  '<existing leaf>=',           // exp 2026-XX-XX
  'iFvwVyJSxnQdyaUvUERIf+8qk7gRze3612JMwoO3zdU=', // E8 — being retired
  '<new intermediate>=',        // new intermediate name, exp 20YY-XX-XX
] as const;
```

Bump version, ship via store + EAS Update. **Do NOT remove E8 yet.**

### T-14d : monitor adoption

Sentry release health dashboard → target ≥ 90% adoption of the 3-pin build before the server-side cert switch.

### T-0 : LE issues new leaf signed by new intermediate

Server cert chain switches automatically (certbot picks up the new intermediate on renewal). Existing 3-pin clients: TLS validates against the new intermediate pin. Old 2-pin clients (still on E8 only): TLS fails — they get `cert-pinning.mismatch` Sentry events, kill-switch can be flipped if too many.

### T+30d : drop the retired intermediate

Once adoption of the 3-pin build is ≥ 95%, ship a follow-up app update removing E8:

```ts
export const PROD_SPKI_HASHES = [
  '<latest leaf>=',
  '<new intermediate>=',
] as const;
```

Update the snapshot table in this runbook.

---

## Emergency kill-switch

If a mass-mispin event triggers (Sentry shows a spike of `cert-pinning.mismatch` events from legitimate clients), the BE config endpoint `/api/config/cert-pinning-enabled` can return `{ "pinningEnabled": false }` to disable pinning at next app boot.

Caching :
- Mobile clients cache the kill-switch verdict for 1 hour (`KILL_SWITCH_CACHE_TTL_MS` in `shared/config/cert-pinning.ts`).
- A session already running keeps its current pinning state until the next cold start.
- Fail-open: if the kill-switch endpoint is blocked (e.g. attacker), clients proceed with pinning. This is the **correct** trade-off — an attacker who can MitM the kill-switch fetch is itself protected by pinning when it's on.

Disabling the kill-switch is a **temporary patch**, not a fix. Re-enable pinning as soon as the underlying cert chain is corrected.

---

## Smoke test — physical device (manual)

Mandatory before any app store submission that touches `cert-pinning.ts`.

1. Install Charles Proxy (or mitmproxy) on a Mac connected to the same Wi-Fi as the test device.
2. Install Charles root CA into the device's system trust store (iOS: Settings → General → About → Certificate Trust Settings).
3. Build a preview app with `EXPO_PUBLIC_CERT_PINNING_ENABLED=true` via `eas build --profile preview --platform ios`.
4. Launch the app; attempt login.
   - **Expected**: Charles fails to intercept TLS (handshake fails on the device side), the app logs `cert-pinning.mismatch` to Sentry, login fails.
   - **Negative test**: set `EXPO_PUBLIC_CERT_PINNING_ENABLED=false`, repeat → Charles intercepts the auth request, login succeeds.
5. Toggle kill-switch endpoint to return `pinningEnabled: false` on the BE; restart app; verify pinning is disabled even with env flag `true`.

Document the run in `museum-frontend/docs/IOS26_CRASH_DIAG.md`-style file if anything unexpected happens.

---

## What NOT to do

- **Do NOT remove all pins** to "unblock dev". The init code is no-op when env flag is `false` — disable via the flag instead.
- **Do NOT pin the root CA** (ISRG Root X1). Roots rotate on long cycles but rotation events have historically forced emergency app updates across the industry. The intermediate is the operational sweet spot.
- **Do NOT use a single pin**. iOS TrustKit refuses single-pin configs; the app will fail to boot.
- **Do NOT capture SPKI on a device behind a TLS-inspecting corporate proxy** — you'll capture the proxy's pin, not `musaium.com`'s.
- **Do NOT commit the offline backup private key** (if one is ever generated). HSM / 1Password Business only.

---

## References

- ADR-016 — Cert pinning library selection
- ADR-031 — Kill-switch architecture
- `docs/audit-2026-05-12-raw/04-research/R13-rn-security-on-device.md` §1 — SPKI rotation
- [Let's Encrypt — Active Intermediates](https://letsencrypt.org/certificates/)
- [OWASP Pinning Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Pinning_Cheat_Sheet.html)
- [RFC 7469 — Public Key Pinning for HTTP](https://datatracker.ietf.org/doc/html/rfc7469)
