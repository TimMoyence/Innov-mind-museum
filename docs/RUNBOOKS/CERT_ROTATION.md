# Cert rotation + cert-pinning kill-switch runbook

**Audience**: Ops on call when the production TLS cert for `api.musaium.app` rotates, **or** when a pin-mismatch incident is paging.

**Reference design**: [ADR-031](../adr/ADR-031-mobile-cert-pinning-kill-switch.md). Library: [`react-native-ssl-public-key-pinning`](https://github.com/frw/react-native-ssl-public-key-pinning) selected in [ADR-016](../adr/ADR-016-mobile-cert-pinning-deferred.md).

This runbook covers three operations:

1. [Capturing SPKI hashes for a new cert](#1-capture-the-spki-hash-of-the-new-cert)
2. [Planned cert rotation (no incident)](#2-planned-cert-rotation)
3. [Mass-mispin emergency response (incident)](#3-mass-mispin-emergency-response)

> **Pre-requisite for any of the below**: confirm `EXPO_PUBLIC_CERT_PINNING_ENABLED` is `true` in the build profile under audit. While the V1 launch ships with the flag at `false`, the scaffold is otherwise inert; rotation work is only needed once the flag flips.

## 1. Capture the SPKI hash of the new cert

A pin is the base64-encoded SHA-256 of the certificate's Subject Public Key Info (SPKI). Capture both the leaf cert and a backup CA you trust to issue the next cert:

```bash
HOST=api.musaium.app

openssl s_client -servername "$HOST" -connect "$HOST":443 -showcerts < /dev/null 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64
```

Repeat with `-showcerts` parsed for the **issuer** cert to capture the backup CA pin. Keep the resulting two base64 strings together; both go into `museum-frontend/shared/config/cert-pinning.ts -> PLACEHOLDER_SPKI_HASHES_TBD_PROD` (rename the constant when you replace the placeholders).

**Verification**: confirm both hashes are 44 characters long, end in `=`, and are not all zeros / placeholder bytes. Compare against the cert's `openssl x509 -fingerprint -sha256` output to make sure the chain matches.

## 2. Planned cert rotation

Sequence (each step must complete before the next):

1. **Generate the new leaf cert + capture both pins** at least 14 days before the old cert expires. Keep the previous leaf pin available - clients on stale builds still verify against it.
2. **Update** `museum-frontend/shared/config/cert-pinning.ts` so the pin array contains **the new leaf, the new backup CA, AND the old leaf** (3 pins for the transition window). This guarantees clients who haven't yet picked up the OTA / store update keep validating until the old cert is actually retired.
3. **Cut a release** through the normal mobile release path. Do not flip the kill-switch.
4. **Wait** for the bulk of users to be on the new build (target 95% on store-connect / play-console rollout dashboards).
5. **Rotate the cert** at the LB / CDN. Old TLS material is now invalid.
6. **Cut a follow-up release** that prunes the old leaf pin, leaving the 2-pin steady state.

Roll-back path: if step 5 fails (the new cert misissues, the LB rejects), revert the cert change. Clients still have the old leaf pin so traffic resumes.

## 3. Mass-mispin emergency response

Trigger: Sentry alert on `cert-pinning.mismatch` events spiking from production traffic, or user reports of "can't connect" on iOS while the API is healthy from un-pinned clients (web / curl).

```mermaid
flowchart TD
  A[Sentry alert: cert-pinning.mismatch spike] --> B{Confirm volume<br/>+ duration?}
  B -- transient noise --> C[Triage to mobile;<br/>collect SPKI hashes from<br/>handful of failing requests]
  B -- broad outage --> D[Flip BE kill-switch:<br/>/api/config/cert-pinning-enabled<br/>-> { pinningEnabled: false }]
  D --> E[Within 1h cache TTL,<br/>clients un-pin]
  E --> F[Confirm Sentry mismatch<br/>volume drops to 0]
  F --> G[Capture new SPKI hashes<br/>per Section 1]
  G --> H[Patch cert-pinning.ts;<br/>cut OTA / release]
  H --> I[Flip kill-switch back to true<br/>once rollout > 95%]
```

Step-by-step:

1. **Confirm the incident is real**. Cross-check the Sentry mismatch volume against the BE health dashboard - if the API is also returning errors, the cert-pinning failure is downstream of a connectivity issue and the kill-switch is irrelevant.
2. **Flip the kill-switch on the BE**. The endpoint `/api/config/cert-pinning-enabled` must start returning `{ pinningEnabled: false }`. Mechanism is BE-team-specific (env flag, feature-flag service, hard-coded constant - whichever the BE config layer uses).
3. **Validate the kill-switch propagation**. Sentry mismatch volume should drop to zero within 60 minutes (cache TTL); on cold launches, immediately. If it does not, double-check the BE response shape matches `{ pinningEnabled: boolean }` (see `parseKillSwitchPayload` in `museum-frontend/shared/config/cert-pinning.ts` - any other shape resolves to fail-open, i.e. **clients keep pinning**).
4. **Capture the new pin set** per Section 1.
5. **Ship the patched build**. OTA where possible (faster); store update where OTA is not in scope.
6. **Re-enable the kill-switch** once the new build's rollout exceeds 95%.

## Telemetry the runbook relies on

| Signal | Where | What it tells you |
|---|---|---|
| Sentry event `cert-pinning.mismatch` | Sentry mobile project | Each pin failure surfaces as an error event tagged with `cert-pinning.host`. Dashboard query: `event.message:"cert-pinning.mismatch"`. |
| Sentry breadcrumb `category=cert-pinning, message=initialized` | Mobile breadcrumbs trail | The pin set actually engaged on a given session. Crucial when investigating "should this client even be pinning?" questions. |
| Sentry breadcrumb `category=cert-pinning, message=kill-switch-resolved` | Same | Whether the kill-switch was hit, served from cache, or fell open. `data.source` distinguishes the three. |

## Out-of-scope

- Public CA root pinning (we only pin SPKI of leaf + backup CA, not roots).
- Per-environment pin sets (only `api.musaium.app` is currently configured).
- Network library variants outside the OS-stock TLS stack (e.g. WebSocket libs that bypass URLSession / OkHttp). Inventory them and add explicit handling if and when they ship.
