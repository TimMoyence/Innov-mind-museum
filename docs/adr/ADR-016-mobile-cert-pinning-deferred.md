# ADR-016 — Mobile Cert Pinning: Library Selected, Production Wire-up Deferred

**Status**: Accepted — Phase 2 scaffolded (V1 ship-disabled). Production activation deferred to post-launch SPKI capture. See [ADR-031](ADR-031-mobile-cert-pinning-kill-switch.md) for the kill-switch architecture.
**Date**: 2026-04-30 (initial), 2026-05-05 (Phase 2 scaffold landed)
**Deciders**: Tech Lead (sec-hardening-2026-04-30 team), user gate; Mobile (sprint mobile-hardening-cert-pinning-ios26-2026-05-05) for Phase 2 scaffolding

## Context

Audit 2026-04-30 §8 Phase F flagged the absence of TLS / SPKI pinning on the React Native mobile client. Without pinning, the app trusts any system-trusted CA — a compromised CA, a corporate MITM proxy installed on the device, or a hostile network segment can transparently intercept traffic.

Pinning is **defense-in-depth**, not a primary control: HTTPS + HSTS already prevents passive interception; pinning adds protection against active CA-level attacks. For a museum chat app the threat model is moderate (no payment data, no health records); pinning is **valuable but not blocking**.

## Decision

1. **Library selected**: `react-native-ssl-public-key-pinning` (frw fork). Justification per Phase 0 web research:
   - Active maintenance through Apr 2026 (last release: 1.2.6, July 2025).
   - TrustKit-based on iOS, OkHttp `CertificatePinner` on Android — both production-grade.
   - JS-only configuration surface (no native code edits).
   - Compatible with RN 0.83 + Expo 55 (the current Musaium stack) when the Expo Dev Client network inspector is disabled in dev.
   - Alternatives considered:
     - `react-native-app-security` (bamlab) — broader toolkit (also covers jailbreak detection); heavier dependency surface.
     - `react-native-cert-pinner` (approov) — **archived**, do not use.
     - `MaxToyberman/react-native-ssl-pinning` — older, custom fetch wrapper; less idiomatic.

2. **Production wire-up DEFERRED** to a subsequent release. Reasons:
   - Pinning a single SPKI hash creates a soft-bricking risk: if the cert rotates without an OTA update, the app refuses to connect. Mitigation = pin TWO SPKIs (current leaf + backup CA), but this requires ops coordination on the cert-issuance pipeline.
   - A **kill-switch** must be wired via remote config so pinning can be disabled in a mass-mispin event WITHOUT shipping a new app build. The current Expo over-the-air update path works, but the kill-switch design is its own ADR.
   - Dev/CI/staging build profiles must not pin (different cert) — env-gated configuration is straightforward but needs validation.

3. **Phase 2 deliverables** (status update 2026-05-05):
   - [x] Add `react-native-ssl-public-key-pinning` to `package.json` (sprint mobile-hardening 2026-05-05).
   - [x] Pin set scaffold lives in `museum-frontend/shared/config/cert-pinning.ts`. **Hashes are placeholders** named `PLACEHOLDER_SPKI_HASHES_TBD_PROD` and must be replaced per [`docs/RUNBOOKS/CERT_ROTATION.md`](../RUNBOOKS/CERT_ROTATION.md) before flipping the env flag.
   - [x] Kill-switch architecture published as [ADR-031](ADR-031-mobile-cert-pinning-kill-switch.md). Implementation in `museum-frontend/shared/infrastructure/cert-pinning-init.ts` — BE endpoint `GET /api/config/cert-pinning-enabled` is a soft dependency (fail-open on 404 / network error). Activation gated by `EXPO_PUBLIC_CERT_PINNING_ENABLED` (default `false` for V1 launch).
   - [x] Unit coverage: 14 cases under `museum-frontend/__tests__/infrastructure/cert-pinning-init.test.ts` (parse, cache, fail-open, 4 init outcomes).
   - [ ] E2E validation under `museum-frontend/__tests__/integration/cert-pinning.test.ts` — pending; activation work pairs it with the real SPKI capture and a staging environment TLS endpoint.
   - [x] Cert rotation runbook published at [`docs/RUNBOOKS/CERT_ROTATION.md`](../RUNBOOKS/CERT_ROTATION.md).

## Adversarial Review (Challenger)

| Counter-argument | Response |
|---|---|
| **"Just pin now — defense-in-depth is always good."** | Pinning without a kill-switch is more dangerous than no pinning: a mass-mispin (e.g. unexpected cert rotation) bricks the entire user base until they manually update the app. The kill-switch is the bare minimum prerequisite, and that's a real Expo + remote-config integration, not a one-line change. |
| **"The threat model is low — skip it entirely."** | We document the gap and ship the runbook so the TODO is visible to future audits. The library is selected so the next dev who picks this up has zero discovery cost. |
| **"What about Sentry RN? It already proxies HTTPS."** | Sentry events go to a different host (`sentry.io`) and are not on the `api.musaium.app` data path. Pinning the API host does not affect Sentry traffic. |

## Consequences

**Positive**:
- Library choice is locked — no rehash needed when Phase 2 lands.
- Operations team can pre-stage the cert-rotation procedure now.

**Negative**:
- Active CA-level MITM remains undetected on the data path. Acceptable for a museum chat app's threat model; would not be acceptable for a banking app.

## References

- banking-grade hardening design (deleted 2026-05-03 — see git commit history)
- [OWASP Mobile Top 10 — M3 Insufficient Cryptography](https://owasp.org/www-project-mobile-top-10/2014-risks/m6-broken-cryptography)
- [react-native-ssl-public-key-pinning](https://github.com/frw/react-native-ssl-public-key-pinning)
- [TrustKit (iOS)](https://github.com/datatheorem/TrustKit) — underlying iOS implementation
- [OkHttp CertificatePinner](https://square.github.io/okhttp/4.x/okhttp/okhttp3/-certificate-pinner/) — underlying Android implementation
