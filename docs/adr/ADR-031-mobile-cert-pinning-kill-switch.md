# ADR-031 — Mobile cert pinning kill-switch architecture

- **Status**: Accepted (scaffold landed; production activation pending real SPKI capture)
- **Date**: 2026-05-05
- **Deciders**: Mobile (sprint mobile-hardening-cert-pinning-ios26-2026-05-05), security review, ops
- **Amends**: [ADR-016](ADR-016-mobile-cert-pinning-deferred.md)

## Context

[ADR-016](ADR-016-mobile-cert-pinning-deferred.md) selected `react-native-ssl-public-key-pinning` and explicitly deferred production wire-up. The dominant deferred risk was operational: a single-pin configuration that ships without a kill-switch can mass-mispin the entire user base if the production cert rotates unexpectedly. Pinning is defense-in-depth, not a primary control - it is **not allowed to make availability worse**.

This ADR records the kill-switch architecture so the Phase 2 scaffold (also landed on 2026-05-05 in the same sprint) can be activated post-launch by flipping a single env flag without revisiting the design.

## Decision

### Activation gate (env-first, kill-switch-second)

Activation is gated by **two** signals, evaluated in order:

1. `EXPO_PUBLIC_CERT_PINNING_ENABLED` — Expo build-time env. Default `false`. When `false`, the cert pinning module is not even queried; the V1 launch ships with this default so a missing kill-switch endpoint cannot brick users on day one.
2. **Kill-switch RPC** — `GET ${apiBaseUrl}/api/config/cert-pinning-enabled` returning `{ pinningEnabled: boolean }`. Only consulted when (1) is `true`. Cached in AsyncStorage for 1 hour. Resolves to **fail-open** (i.e. allow pinning to proceed) on any of: network error, non-2xx HTTP status, malformed JSON, schema mismatch.

When both signals agree the app should pin, the client calls `initializeSslPinning(buildPinningOptions())` and registers an error listener that ships any pin mismatch to Sentry as `cert-pinning.mismatch`.

The "fail-open" semantics here are **scoped narrowly**: they cover network errors, non-2xx HTTP responses, and malformed JSON payloads only. **A well-formed forged `{ pinningEnabled: false }` payload returned over a MITM TLS connection during a cold launch (no cache yet) DOES neutralise pinning** — that is the same threat the open-work item below tracks. The fail-open path's value is preventing a flapping or partially-deployed BE from flipping clients between pinned and un-pinned states, not blocking a competent active attacker. See Adversarial Review row 2 + Consequences/Negative for the honest scope of this trade-off.

### Two-pin requirement

iOS TrustKit refuses single-pin configurations; OkHttp does not. We follow the iOS-stricter rule for both platforms so prod and Android stay in lock-step:

- pin #1: SHA-256(SPKI) of the **production leaf cert**;
- pin #2: SHA-256(SPKI) of the **backup CA** (signing trust line we are willing to fail over to);
- both pins live in `museum-frontend/shared/config/cert-pinning.ts` as `PLACEHOLDER_SPKI_HASHES_TBD_PROD`. The placeholders are syntactically valid base64 but **do not match any real cert** - flipping the env flag without replacing them would soft-brick every release build that hits a real TLS endpoint.

Capture procedure: see [`docs/RUNBOOKS/CERT_ROTATION.md`](../RUNBOOKS/CERT_ROTATION.md).

### Mass-mispin recovery flow

If a future cert rotation slips past the runbook and clients start failing pin validation in production:

1. Ops flips the BE flag so `/api/config/cert-pinning-enabled` returns `{ pinningEnabled: false }`.
2. Within 1 hour (cache TTL), or immediately on the next app launch with a stale cache, the kill-switch fetch picks this up and the next pinning check is skipped. The client silently un-pins on the subsequent boot - **no app update required**.
3. Once the new cert is captured and the SPKI hashes updated in `cert-pinning.ts`, an OTA / store update + a kill-switch flip back to `true` re-engages pinning.

Without the kill-switch the only recovery is a forced app update, which iOS users may decline indefinitely.

## Adversarial review (challenger)

| Counter-argument | Response |
|---|---|
| **"The kill-switch is a single point of failure - if the BE config endpoint is down, pinning either flaps or stays."** | Fail-open + 1h cache means a flapping endpoint reaches a stable-pinned state quickly. A persistently-down endpoint leaves clients pinned on the cached decision (or fail-open if no cache yet) - which is the safer default. |
| **"`pinningEnabled: true` from the server isn't authenticated - what stops an attacker from forging it?"** | A MITM attacker controlling the kill-switch response on a cold launch (no cache) can return well-formed `{ pinningEnabled: false }` and keep that client un-pinned indefinitely. The fail-open path only catches malformed responses - it does NOT defend against well-formed forgeries. Mitigation requires the open-work item below: the client must treat the bundled `cert-pinning.ts` pin set as the authoritative floor and only allow the kill-switch to *widen* trust (e.g. add an emergency backup pin), never narrow it. Until that lands, the kill-switch is an availability lever, not an integrity one. |
| **"Why not bundle the kill-switch into Expo OTA instead of a separate endpoint?"** | OTA has its own update lifecycle (we currently have OTA disabled per ADR-009). The dedicated endpoint gives ops a simpler lever and decouples kill-switch from app-bundle lifecycle. |
| **"Two pins is the iOS minimum but is one pin really inadequate on Android?"** | One pin works on Android (OkHttp), but maintaining two configurations (one per platform) doubles operational complexity for marginal benefit. Iso-pin both ways. |

## Consequences

**Positive**
- Activation is a 1-line env flip post-launch + an SPKI placeholder swap - no logic to revisit.
- Mass-mispin recovery does not require an app update.
- Pin mismatches surface as Sentry errors tagged `cert-pinning.mismatch` so a real attack would page someone.

**Negative**
- The cold-launch attacker scenario (above) is partially open. To close it, a follow-up should ship the production SPKI hashes at compile time and only allow the kill-switch to *widen* trust (e.g. add an emergency backup pin), never *narrow* the configured pin set. Tracked as future work.
- The BE config endpoint (`/api/config/cert-pinning-enabled`) does not exist yet. The mobile scaffold tolerates this (fail-open on 404), but the endpoint must ship before the env flag is flipped to `true` in production.

**Reversibility**
- Fully reversible: env flag back to `false` -> pinning is a no-op on the next boot.

## Implementation reference

| File | Role |
|---|---|
| `museum-frontend/shared/config/cert-pinning.ts` | SPKI placeholders, kill-switch types, payload parser, pinning options builder. |
| `museum-frontend/shared/infrastructure/cert-pinning-init.ts` | `initCertPinning()` boot wiring + `resolveKillSwitchState()` (cache + fetch + fail-open). |
| `museum-frontend/app/_layout.tsx` | Fire-and-forget call to `initCertPinning()` PRE-axios first request. |
| `museum-frontend/__tests__/infrastructure/cert-pinning-init.test.ts` | 14 unit tests covering parse / cache / fail-open / 4 init outcomes. |
| `docs/RUNBOOKS/CERT_ROTATION.md` | Cert rotation + kill-switch flip + mass-mispin recovery playbook. |

## Links

- [ADR-016 — Mobile Cert Pinning: Library Selected, Production Wire-up Deferred](ADR-016-mobile-cert-pinning-deferred.md)
- [react-native-ssl-public-key-pinning](https://github.com/frw/react-native-ssl-public-key-pinning)
- [OWASP Mobile Top 10 - M3 Insufficient Cryptography](https://owasp.org/www-project-mobile-top-10/2014-risks/m6-broken-cryptography)
- [TrustKit (iOS) configuration](https://github.com/datatheorem/TrustKit#getting-started)
- [OkHttp CertificatePinner (Android)](https://square.github.io/okhttp/4.x/okhttp/okhttp3/-certificate-pinner/)
