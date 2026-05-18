# Lessons — react-native-ssl-public-key-pinning (v1.2.6)

Project-specific gotchas. Audit enterprise-grade 2026-05-18.

## 🚨 2026-05-18 — F1 HIGH : `networkInspector: false` MISSING dans `app.config.ts`
- **Symptôme** : Expo dev-client builds iOS avec `EXPO_PUBLIC_CERT_PINNING_ENABLED=true` exhibent unpredictable pinning behavior (snapshot README + issue #223). Smoke test RUNBOOK §Smoke step 3 relies on preview build comportant comme prod — actuellement FALSE on iOS dev.
- **Cause** : `museum-frontend/app.config.ts:276-284` expo-build-properties ios block set seulement `buildReactNativeFromSource:true`, manque `networkInspector: false`.
- **Fix** : voir TD-SSL-01. Add `networkInspector: false` to existing ios object. Rerun `npx expo prebuild`.

## ⚠️ 2026-05-18 — F2 MEDIUM : `expirationDate` failsafe absent
- **Symptôme** : si app version stops being shipped (acquisition, freeze) → tous clients brick at TLS handshake après 2027-03-12 (E8 intermediate expiration). Kill-switch ne mitige que si network reachable.
- **Cause** : `cert-pinning.ts:63-66 buildPinningOptions` emits no expirationDate.
- **Fix** : voir TD-SSL-02. Add `expirationDate` matching E8 NotAfter (2027-03-12) — unrefreshed clients fall back to OS trust store.

## ⚠️ 2026-05-18 — F3 MEDIUM : `addSslPinningErrorListener` subscription discarded, no `.remove()`
- **Cause** : `cert-pinning-init.ts:133` discards return value (EmitterSubscription). Acceptable at app boot (single subscription, app-lifetime) MAIS violation pattern PATTERNS.md L170, duplicate Sentry events on dev hot-reload, prevents tests d'assert teardown.
- **Fix** : voir TD-SSL-03. Capture subscription in module-scoped let, export disposeCertPinning() pour tests, call `.remove()` in __DEV__ HMR hook.

## ⚠️ 2026-05-18 — F4 LOW : Third-party native SDK pinning bypass surface NON-auditée
- **Symptôme** : library instrumente seulement RN Networking (fetch/XHR). Native-side HTTP de @sentry/react-native native transport, MapLibre tile loader, expo-image-picker uploads, audioUrl S3 GETs peut bypass pinning silently.
- **Fix** : voir TD-SSL-04. Add 'Coverage scope' section au RUNBOOK enumerant les paths pinned vs unpinned + audit chaque native SDK.

## ⚠️ 2026-05-18 — F5 LOW : iOS TLS session cache gotcha non codifié en tests auto
- **Cause** : cache invalidation requires full app process restart on iOS. Documenté RUNBOOK manual smoke only. Maestro flows do NOT assert cold-restart entre pin-flip scenarios.
- **Fix** : voir TD-SSL-05. Add Maestro flow with `launchApp clearState:true` entre config mutations OR add RUNBOOK reminder header to cert-pinning.test.ts.

## 2026-05-18 — Configuration security (positive)
- ✅ 2-pin strategy : LE leaf (musaium.com exp 2026-06-19) + LE E8 intermediate (exp 2027-03-12) — matches CLAUDE.md MEMORY
- ✅ `initializeSslPinning` called BEFORE first network request (`_layout.tsx:69` module-eval avant React mount)
- ✅ `isSslPinningAvailable` guard (cert-pinning-init.ts:112-119)
- ✅ Listener BEFORE init (cert-pinning-init.ts:133-139 prior to :141 await)
- ✅ Listener wired to Sentry capture
- ✅ Kill-switch via `/api/config/cert-pinning-enabled` (fail-open)
- ✅ Runbook + `scripts/capture-spki.sh` documented (CLAUDE.md gotcha)

## 2026-05-18 — INFO : V1 ships UNPINNED per ADR-031
- `EXPO_PUBLIC_CERT_PINNING_ENABLED` defaults false → 2026-06-01 launch sans pinning. Intentional posture risk per ADR-031.
