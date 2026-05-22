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

## 2026-05-20 — Remediation status of F1-F5 (all CLOSED in code)
Re-verified against current source (curator UFR-022). The 5 findings opened 2026-05-18 are all fixed:
- ✅ **F1 (TD-SSL-01)** `networkInspector: false` present — `museum-frontend/app.config.ts:289` (cites PATTERNS §5.3). Dev/preview iOS builds now behave like prod for the smoke test.
- ✅ **F2 (TD-SSL-02)** `expirationDate` failsafe present — `cert-pinning.ts:70` `PINSET_EXPIRATION_DATE='2027-03-12'` (= E8 NotAfter), wired in `buildPinningOptions` `cert-pinning.ts:83`.
- ✅ **F3 (TD-SSL-03)** subscription captured + `.remove()` — `cert-pinning-init.ts:51` module-scoped `activeListener`, HMR guard `:150-153`, `disposeCertPinning()` `:185-195`.
- ✅ **F4 (TD-SSL-04)** Coverage-scope table added to runbook — `museum-frontend/docs/CERT_PINNING_RUNBOOK.md:35-48` (per-SDK pinned/bypass).
- ✅ **F5 (TD-SSL-05)** iOS TLS-cache gotcha codified — runbook §Smoke + PATTERNS §5.2; tests reference cold-restart contract.

## 2026-05-20 — 🚨 HIGH (operational, time-boxed) : leaf pin expires 18 days AFTER launch
- **Symptôme** : Pin #1 (leaf `ZDRgYM8cmWD/...`) NotAfter = **2026-06-19**. Launch = 2026-06-01. If pinning is ever flipped ON at/after launch, the leaf pin starts failing ~2026-06-19 unless `certbot --reuse-key` keeps the keypair. Pin #2 (E8 intermediate, exp 2027-03-12) absorbs it → no TLS outage, but defence-in-depth on the leaf is lost silently 18 days in.
- **Cause** : LE 90-day cadence; the captured leaf was already mid-life on 2026-05-14.
- **Impact** : NOT a brick (E8 covers) but a degradation that goes unnoticed without telemetry. Higher risk if anyone later "simplifies" to a leaf-only pin (would brick at 2026-06-19).
- **Fix / discipline** : if cert pinning is enabled for V1, re-capture the leaf SPKI right before flip-on (`scripts/capture-spki.sh musaium.com`) so Pin #1 reflects the THEN-current leaf, and schedule a leaf-swap review for ~2026-06-15. Co-edit runbook snapshot table. The intermediate pin is what makes this survivable — keep it.

## 2026-05-20 — Rotation operational lessons (general)
- **Intermediate pin = rotation shock absorber.** The whole reason the 2-pin set survives LE's 90-day churn is Pin #2 (E8). Any reviewer seeing a PR shrink the set to 1 pin must BLOCK — it re-arms the 90-day brick clock.
- **Intermediate rotation (E8→E9) is the real outage scenario.** Both pins stop matching at once. The only safe path is add-then-remove: ship a 3-pin transition build (leaf + E8 + E9), reach ≥90% adoption, let the server switch, then drop E8 at ≥95% (runbook §Pre-rotation). NEVER replace E8 in a single release.
- **`expirationDate` MUST track the pinned intermediate NotAfter.** If E8 (2027-03-12) is rotated, bump `PINSET_EXPIRATION_DATE` in the SAME commit, else the failsafe outlives a chain it no longer pins.
- **iOS TLS session cache lies in QA.** Every device pin test must cold-restart between configs (`launchApp clearState:true`); an in-session flip-and-retry will report a stale success.
- **Version: 1.2.6 is latest (verified 2026-05-21 via gh releases/tags).** No upgrade due; SECURITY.md upstream is stale (lists 1.0.x only) but the lib is maintained. No advisory.
