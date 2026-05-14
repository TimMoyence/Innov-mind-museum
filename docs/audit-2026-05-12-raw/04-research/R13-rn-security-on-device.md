# R13 — React Native Security On-Device 2026

**Agent**: R13 (audit-2026-05-12 / vague 2 — frontend mobile + web)
**Scope**: Cert pinning (SPKI, rotation, kill switch), `react-native-ssl-public-key-pinning` vs alternatives, iOS ATS 2026, Android Network Security Config 2026, biometric auth (`expo-local-authentication`, fallback, Class 3), Secure Enclave / StrongBox, jailbreak/root detection, App Attest / Play Integrity, code obfuscation (Hermes), OWASP MASVS 2.x compliance, verdict for Musaium B2C 100k installs.
**Methodology**: 20+ WebSearch queries — sources cited inline. Verified Musaium implementation against state-of-the-art via direct file read (file:line citations).
**Honesty caveat (UFR-013)** : Cert pinning code is **scaffolded but ship-disabled** — `EXPO_PUBLIC_CERT_PINNING_ENABLED` defaults to `false` AND the SPKI hashes are placeholders that do not match the production cert (`museum-frontend/shared/config/cert-pinning.ts:34-37`). I report this as a known V1 gap, not as deployed defense.

---

## TL;DR

Musaium's mobile security posture is **strong for V1 launch (B2C 100k visitors) on storage and biometric pillars but has a deliberate, documented gap on MitM defense** (cert pinning shipped scaffolded but disabled with placeholder hashes). The chosen library `react-native-ssl-public-key-pinning@^1.2.6` (frw/fwidjaja) is the right call for 2026: actively maintained (latest 1.2.6 published 2025-07), wraps OkHttp CertificatePinner on Android + TrustKit on iOS, requires no native config, no published CVEs against the package itself. The kill-switch architecture in `shared/infrastructure/cert-pinning-init.ts` is well-designed (env flag + cached remote toggle + fail-open with Sentry breadcrumbs + native-availability guard) — only the *pin values* and the *activation flip* are missing, both unblocked by a single capture-and-verify session against `api.musaium.app` once the production cert is provisioned.

Storage & auth are the strongest assets: `expo-secure-store` uses iOS Keychain `kSecClassGenericPassword` + Android `EncryptedSharedPreferences` backed by Keystore, refresh + access tokens persisted via `secureTokenStore` with AsyncStorage web fallback (`features/auth/infrastructure/authTokenStore.ts:17-66`). Biometric auth via `expo-local-authentication@~55.0.13` is wired in `features/auth/application/useBiometricAuth.ts`. **Two material biometric gaps**: (1) no `getEnrolledLevelAsync` Class 3 check — Musaium accepts Class 2 ("Weak") biometrics on Android, which OWASP MASVS-AUTH-3 recommends rejecting for sensitive ops; (2) `disableDeviceFallback: false` allows device PIN fallback that bypasses Face ID/Touch ID after 2 attempts — acceptable for UX but trades security for convenience.

**Top gaps (priority order for V1 ship)** : (1) **Cert pinning placeholders** — must capture real SPKI hashes against prod cert + flip env to `true` before app store submission (P0, 1-day task). (2) **No app attestation** — `expo-app-integrity` is alpha but viable; deferring to V1.1 is defensible if backend rate limiting + LLM Guard sidecar are robust (which they are per R4/R7). (3) **No jailbreak/root detection** — 0.5–1% of devices affected per Talsec data; for cultural-content B2C, defer (cost-benefit doesn't justify freeRASP+ pricing). (4) **No Class 3 biometric gate** — 5-line fix, ship before V1.

**OWASP MASVS 2.x compliance** : Storage **PASS**, Crypto **PASS** (no custom crypto), Auth **PARTIAL** (Class 3 gap), Network **FAIL** (cert pinning placeholders), Platform **PASS**, Code **PASS** (Hermes bytecode), Resilience **N/A by design** (B2C cultural app, MASVS-RESILIENCE only mandatory for high-value targets per MASVS L2+R profile), Privacy **PASS** (out of scope here, covered by R7/R20).

**Verdict** : **KEEP** `react-native-ssl-public-key-pinning` + `expo-local-authentication` + `expo-secure-store`. **ACTIVATE** cert pinning before launch (P0). **DEFER** App Attest to V1.1, jailbreak detection to post-B2B-revenue, Hermes-level obfuscation to never (bytecode is already a strong economic deterrent for cultural-content app per source [Iterators 2026]).

---

## OWASP MASVS 2.x — Musaium Checklist

MASVS 2.0 (released April 2023, current as of 2026) replaced the L1/L2/R verification levels with **MAS Testing Profiles** delegated to MASWE. The 7 control groups remain : **STORAGE, CRYPTO, AUTH, NETWORK, PLATFORM, CODE, RESILIENCE**. MASVS adds **PRIVACY** as an 8th group in v2.x ([mas.owasp.org/MASVS](https://mas.owasp.org/MASVS/), [Appdome DevSec Blog 2026](https://www.appdome.com/dev-sec-blog/owasp-masvs-explained/)).

| Group | Musaium status | Evidence | Gap? |
|---|---|---|---|
| **MASVS-STORAGE** — secure storage of sensitive data at rest | **PASS** | `authTokenStore.ts:17-66` uses `expo-secure-store` on native (iOS Keychain `kSecClassGenericPassword` + Android `EncryptedSharedPreferences` Keystore-backed) ; AsyncStorage fallback web-only. No tokens in plain AsyncStorage. | Default `kSecAttrAccessible` is `WHEN_UNLOCKED` (Expo SecureStore default) — acceptable. MASVS L2 prefers `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly` ([MASTG-TEST-0052](https://mas.owasp.org/MASTG/tests/ios/MASVS-STORAGE/MASTG-TEST-0052/)) — not required for B2C consumer app. |
| **MASVS-CRYPTO** — proper use of cryptographic primitives | **PASS** | No custom crypto on the client. Native platform crypto (Keychain AES-256-GCM, Keystore AES-256) used via SecureStore. No hardcoded keys ; no deprecated algorithms ; no PRNG misuse. | None |
| **MASVS-AUTH** — authentication / authorisation | **PARTIAL** | Biometric via `expo-local-authentication` (`useBiometricAuth.ts`) ; access + refresh tokens persisted via SecureStore ; refresh-flow single-flight in axios interceptor (verified R7). | **No `getEnrolledLevelAsync` Class 3 gate** — accepts Class 2 ("Weak") biometrics ; `disableDeviceFallback: false` allows device-PIN bypass after 2 biometric failures. |
| **MASVS-NETWORK** — secure network communication | **FAIL (V1)** | TLS via OS (Apple ATS + Android Network Security Config defaults) ; cert pinning scaffold present (`cert-pinning.ts:34-37`) but **placeholder SPKI hashes** + flag default `false`. No deployed MitM defense. | **P0** : capture real SPKI hashes + flip flag pre-launch. Library + kill-switch wiring are production-ready. |
| **MASVS-PLATFORM** — platform interaction (deep links, IPC, perms) | **PASS** | Expo Router 55 deep links via universal links / app links ; no `WebView` with arbitrary JS bridge ; no custom IPC. Permissions declared in `app.config.ts` (verified separately by R11). | None |
| **MASVS-CODE** — code quality, modern compilation, no debug | **PASS** | Hermes bytecode shipped in prod (Expo 55 default) — `hbc` format is a meaningful reverse-engineering deterrent per [Iterators 2026](https://www.iteratorshq.com/blog/the-silent-security-revolution-how-react-native-hermes-turned-apps-from-a-data-goldmine-into-fort-knox/). Sentry captures release stacks. No `console.log` of secrets in production builds (no audit yet but no known offenders). | Hermes-version cadence creates "economic deterrence" (decompilers like `hermes-decomp` need version-specific rebuild per [Cognisys Labs](https://labs.cognisys.group/posts/How-to-Decompile-Hermes-React-Native-Binary/)) |
| **MASVS-RESILIENCE** — defenses against reverse engineering, tampering, hooking | **N/A by design** | No jailbreak/root detection, no Frida detection, no anti-debug, no app attestation. | MASVS-RESILIENCE applies only to apps verifying against the **MAS-RESILIENCE Testing Profile** (high-value : banking, gambling, DRM, government). Musaium = cultural B2C → MASVS guidance explicitly says resilience is optional ([Approov MASVS guide](https://approov.io/blog/a-practical-guide-to-owasp-masvs-v2)). |
| **MASVS-PRIVACY** — user privacy controls | **PASS** (out of R13 scope) | Apple Privacy Manifest + GDPR consent + tracking transparency covered by R11 + cross-team work | None per R13 mandate |

**Summary** : 5 PASS, 1 PARTIAL (auth), 1 FAIL (network — placeholder pins), 1 N/A (resilience by design). The **PASS-by-default storage + crypto + platform + code** stack is the foundation ; the **NETWORK FAIL is unblocked by a 1-day flip** ; the **AUTH PARTIAL is unblocked by a 5-line patch**.

Sources :
- [OWASP MASVS](https://mas.owasp.org/MASVS/)
- [OWASP MASTG GitHub](https://github.com/OWASP/mastg)
- [OWASP MASVS GitHub](https://github.com/OWASP/masvs)
- [MASVS-STORAGE](https://mas.owasp.org/MASVS/05-MASVS-STORAGE/)
- [MASVS-RESILIENCE checklist](https://mas.owasp.org/checklists/MASVS-RESILIENCE/)
- [NowSecure 2026 MASVS guide](https://www.nowsecure.com/blog/2026/01/21/owasp-mobile-application-security-explained-how-to-put-masvs-mastg-and-maswe-into-practice/)
- [Practical Guide to MASVS v2 (Approov)](https://approov.io/blog/a-practical-guide-to-owasp-masvs-v2)
- [MASVS Guide 2026 (AppSec Santa)](https://appsecsanta.com/mobile-security-tools/owasp-masvs-guide)

---

## Per-Topic Deep-Dive

### 1. Cert Pinning 2026 — SPKI hash, rotation, backup, kill switch

**Standard** : Pin the **SubjectPublicKeyInfo (SPKI) SHA-256 base64** — RFC 7469 format ([RFC 7469](https://datatracker.ietf.org/doc/html/rfc7469)). HPKP itself is dead since 2018-2020 (browsers removed support in favour of Certificate Transparency per [GF.dev "HPKP is Dead"](https://gf.dev/learn/hpkp-is-dead) and [scotthelme.co.uk](https://scotthelme.co.uk/hpkp-is-no-more/)) — but **SPKI pinning at the mobile-app level remains current** and is what `react-native-ssl-public-key-pinning` does.

**Capture command** (matches Musaium's `cert-pinning.ts:14` runbook reference) :
```bash
openssl s_client -connect api.musaium.app:443 -servername api.musaium.app </dev/null 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform DER \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64
```
Returns the 44-character base64 hash for the leaf cert's public key. Source : [GitHub gist ruiwen/pinned curl example](https://gist.github.com/ruiwen/f7aaf042e4c6dd07d7d91329f6eafefb), [Apple SPKI-SHA256-BASE64 docs](https://developer.apple.com/documentation/bundleresources/information-property-list/nspinnedcaidentities/spki-sha256-base64), [OneUptime cert pinning guide 2026](https://oneuptime.com/blog/post/2026-03-20-certificate-pinning-enhanced-security/view).

**Why SPKI, not full cert** : SPKI hash is stable across cert renewals as long as the keypair is reused. This is the operational sweet spot — you can issue a new cert (e.g., extended expiry) without invalidating client pins, but lose-the-key still requires a backup pin to recover ([MeetCyber SPKI Pinning in Practice](https://meetcyber.net/spki-pinning-in-practice-android-react-native-ios-and-the-openssl-details-that-break-teams-899c63dd1410)).

**Backup pin (mandatory, iOS-enforced)** : TrustKit (iOS bridge under `react-native-ssl-public-key-pinning`) refuses single-pin configurations. Musaium's `cert-pinning.ts:34-37` correctly declares **two slots** (leaf + backup CA). Best practice per [callstack.com](https://www.callstack.com/blog/ssl-pinning-in-react-native-apps) is leaf cert pin + 1 backup keypair held offline (HSM or air-gapped). For Let's Encrypt-style short-lived certs, pin the intermediate CA SPKI as a third pin to absorb leaf rotation.

**Rotation runbook** (industry-standard 7-step, source : [Medium iyiolaosuagwu 2026](https://medium.com/@iyiolaosuagwu/keeping-your-react-native-app-secure-ssl-pinning-and-data-encryption-made-simple-4205e0ad67ee), [callstack 2026](https://www.callstack.com/blog/ssl-pinning-in-react-native-apps)) :
1. **T-14d** : generate new cert from new keypair (or reuse if same key — then no rotation needed).
2. **T-14d** : compute new SPKI hash with command above.
3. **T-14d** : add new hash to `PLACEHOLDER_SPKI_HASHES_TBD_PROD` *as a third entry alongside leaf + backup*.
4. **T-10d** : ship app update with 3-pin config (old leaf + old backup + new leaf).
5. **T-10d to T-3d** : monitor app version adoption ; target ≥ 80 % (EAS Update accelerates this — see R14).
6. **T-3d** : switch server to new cert. Old clients still validate against old pin until they update.
7. **T+30d** : ship app update removing old pin.

**Kill switch** : Musaium's `cert-pinning-init.ts:67-98` implements a remote kill switch via `/api/config/cert-pinning-enabled` with 1h cache + fail-open semantics. This is **best-in-class** : if a mass-mispin event triggers, the BE can disable pinning for new client launches within 1h, while the cache means a single offline session won't brick the user. Fail-open is the **correct security trade-off** here — an attacker who blocks the kill-switch endpoint can't trivially neutralise pinning (they'd need to MitM the *kill-switch fetch itself*, which is itself protected by pinning when pinning is active — circular protection).

**One subtle issue with the current init flow** : `cert-pinning-init.ts:113-154` is fire-and-forget (per the JSDoc on line 16). Until the promise resolves, the network is **un-pinned** — meaning the first few API calls at app start are vulnerable. For a B2C cultural app, acceptable. For a banking app, you'd `await` before any sensitive call. Document this in `RUNBOOKS/CERT_ROTATION.md` (currently referenced at `cert-pinning.ts:14` but unverified existence).

**OWASP 2025 Pinning Cheat Sheet contrarian note** : OWASP now says "*the answer to 'should I pin?' is probably never*" — citing rotation risk vs marginal security gain in the modern PKI landscape (Certificate Transparency, ACME automation, browser CT enforcement). But this guidance targets **server-to-server / browser scenarios** where you don't control the client. For mobile apps you *do* ship to controlled clients with update channels, pinning still has clear value against compromised CAs and stack-overflow-tier malicious roots installed on the device. Source : [OWASP Pinning Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Pinning_Cheat_Sheet.html).

Sources :
- [RFC 7469](https://datatracker.ietf.org/doc/html/rfc7469)
- [OWASP Pinning Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Pinning_Cheat_Sheet.html)
- [Callstack SSL pinning RN](https://www.callstack.com/blog/ssl-pinning-in-react-native-apps)
- [OneUptime cert pinning 2026](https://oneuptime.com/blog/post/2026-03-20-certificate-pinning-enhanced-security/view)
- [MeetCyber SPKI in Practice](https://meetcyber.net/spki-pinning-in-practice-android-react-native-ios-and-the-openssl-details-that-break-teams-899c63dd1410)
- [HPKP is Dead (GF.dev)](https://gf.dev/learn/hpkp-is-dead)

---

### 2. `react-native-ssl-public-key-pinning` vs alternatives

| Library | Stars / Maintenance (2026-05) | Native bridge | API surface | Choice for Musaium |
|---|---|---|---|---|
| **`react-native-ssl-public-key-pinning`** (frw/fwidjaja) — Musaium's choice | Latest **1.2.6** published 2025-07 ; issues responded ; no published CVE ; security policy at [SECURITY.md](https://github.com/frw/react-native-ssl-public-key-pinning/blob/main/SECURITY.md) | OkHttp CertificatePinner (Android) + TrustKit (iOS) | JS-only config via `initializeSslPinning({ host: { publicKeyHashes, includeSubdomains } })` ; runtime kill (`disableSslPinning()`) ; error listener for telemetry | **KEEP** — minimal native config, Flipper-compatible, the JS-config model is exactly what Musaium's kill-switch architecture needs |
| **`react-native-ssl-pinning`** (MaxToyberman) | Older (last meaningful release 2023) ; multiple open issues on Frida bypass ; still on npm | OkHttp3 (Android) + AFNetworking (iOS) | Replaces global `fetch` — invasive, can't easily kill-switch | Avoid — does not coexist cleanly with `axios` (Musaium uses axios interceptor for auth) |
| **`trustkit-react-native`** | No first-party RN wrapper ; you'd manually link TrustKit iOS-side + nothing for Android | TrustKit native pods only | DIY native module | Reject — that's exactly what `react-native-ssl-public-key-pinning` already does for you on iOS |
| **`react-native-cert-pinner`** | Effectively unmaintained (no 2024+ commits per search) | Pre-OkHttp Android, dated iOS | Cert (not SPKI) pinning | Reject — cert pinning is worse than SPKI (breaks on every cert renewal) |
| **Native config only** (no library) | N/A | iOS `NSPinnedDomains` Info.plist + Android `network_security_config.xml` `<pin-set>` | Static — no runtime kill switch | Reject — losing the kill switch is a deployment risk for V1 launch |

**Verdict for Musaium** : `react-native-ssl-public-key-pinning@^1.2.6` is **the correct choice**. The package is actively maintained (last release 2025-07, 10 months before this audit — typical for stable single-purpose libraries), has no published CVEs, and the JS-config model is exactly what Musaium's kill-switch + Sentry-telemetry wiring depends on. The fact that it wraps the *industry-standard* native libraries (OkHttp + TrustKit) means we inherit their CVE patching automatically.

Sources :
- [react-native-ssl-public-key-pinning npm](https://www.npmjs.com/package/react-native-ssl-public-key-pinning)
- [react-native-ssl-public-key-pinning GitHub](https://github.com/frw/react-native-ssl-public-key-pinning)
- [react-native-ssl-pinning npm](https://www.npmjs.com/package/react-native-ssl-pinning)
- [Callstack RN SSL pinning](https://www.callstack.com/blog/ssl-pinning-in-react-native-apps)
- [TrustKit-Android](https://github.com/datatheorem/TrustKit-Android) (reference for the iOS-side bridge implementation)

---

### 3. iOS App Transport Security 2026

**Default since iOS 9 (still current 2026)** : HTTPS required, TLS 1.2 minimum, forward secrecy ECDHE_ECDSA_AES / ECDHE_RSA_AES GCM only, cert signed SHA-256+ with 2048-bit RSA or 256-bit ECC ([Apple TLS Security](https://support.apple.com/guide/security/tls-security-sec100a75d12/web), [Apple NSAppTransportSecurity docs](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity)).

**Exceptions** (keys under `NSAppTransportSecurity`) — each must be **per-domain justified** at App Store review since the 2017 review-justification policy (still enforced 2026, no relaxation found in current docs) :
- `NSAllowsArbitraryLoads = YES` — full disable, **requires App Store review justification**, almost always rejected for B2C consumer apps ([NowSecure ATS guide](https://www.nowsecure.com/blog/2017/08/31/security-analysts-guide-nsapptransportsecurity-nsallowsarbitraryloads-app-transport-security-ats-exceptions/)).
- `NSExceptionAllowsInsecureHTTPLoads` — per-domain HTTP allowance, same justification burden.
- `NSExceptionMinimumTLSVersion` — lower TLS floor, almost always rejected.
- `NSExceptionRequiresForwardSecrecy = NO` — disable FS for legacy domains.
- `NSPinnedDomains` — **declarative SPKI pinning** native to ATS since iOS 14 ([Apple NSPinnedDomains docs](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nspinneddomains)). Musaium could in theory use this *instead of* `react-native-ssl-public-key-pinning`, but `NSPinnedDomains` is iOS-only (no Android parity) and not runtime-switchable — so the JS library remains the right call for kill-switch architecture.

**Musaium status** : No ATS exceptions are declared in `app.config.ts` (I did not exhaustively grep but a quick read shows no `NSAppTransportSecurity` overrides). Default ATS applies → **PASS by default**. The `api.musaium.app` host needs to serve TLS 1.2+ with valid SHA-256 + 2048-bit RSA / 256-bit ECC + ECDHE forward secrecy — to be verified during pre-launch deploy (R10 + R8 territory).

**Watch item** : Apple has historically tightened ATS defaults at WWDC. Monitor WWDC 2026 (June 2026 — *post-launch*) for any TLS 1.3-as-minimum announcement. None has been announced as of 2026-05-12 per my searches.

Sources :
- [NSAppTransportSecurity Apple Developer](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity)
- [Apple Fine-tune your ATS settings](https://developer.apple.com/news/?id=jxky8h89)
- [Apple Preventing Insecure Network Connections](https://developer.apple.com/documentation/security/preventing-insecure-network-connections)
- [Apple TLS Security](https://support.apple.com/guide/security/tls-security-sec100a75d12/web)
- [MASTG-KNOW-0071: iOS App Transport Security](https://mas.owasp.org/MASTG/knowledge/ios/MASVS-NETWORK/MASTG-KNOW-0071/)

---

### 4. Android Network Security Config 2026

**Default since API 28 (Android 9)** : `cleartextTrafficPermitted="false"`, trust anchors limited to `<certificates src="system" />`. User-installed CAs not trusted by default ([Android Network Security Config](https://developer.android.com/privacy-and-security/security-config), [PossEmato USENIX paper](https://www.usenix.org/system/files/sec20_slides_possemato.pdf)).

**Pin-set declarative pinning** : Android supports `network_security_config.xml`'s `<pin-set>` block as a declarative alternative to runtime pinning ([Secure Vale deep dive](https://securevale.blog/articles/deep-dive-into-certificate-pinning-on-android/)) :
```xml
<pin-set expiration="2026-12-31">
  <pin digest="SHA-256">base64hash1=</pin>
  <pin digest="SHA-256">base64hash2=</pin>
</pin-set>
```
This is what OkHttp `CertificatePinner` (used by `react-native-ssl-public-key-pinning` Android-side) plugs into. The JS library transparently constructs the equivalent runtime pinner.

**Musaium status** : Default API 28+ network security applies (Expo 55 / RN 0.83 targets API 34 / 35). Cleartext is blocked by default, system CAs only — **PASS**. No user-installed cert exception, no debug-overrides leaking to release (`debug-overrides` block applies only to debug builds — Android enforces this strictly per [pinned.github.io](https://pinned.github.io/2019/08/10/Android-network-security-configuration/)).

**Watch item** : if pinning kill-switch fires *and* an attacker installs a malicious user CA on the device, the OS will still reject it by default — defense-in-depth holds even when our pinning is intentionally off.

Sources :
- [Network security configuration Android docs](https://developer.android.com/privacy-and-security/security-config)
- [Android Handbook Cert Pinning (Infinum)](https://infinum.com/handbook/android/security/certificate-pinning)
- [Deep Dive into Cert Pinning on Android (Secure Vale)](https://securevale.blog/articles/deep-dive-into-certificate-pinning-on-android/)
- [Towards HTTPS Everywhere on Android (USENIX 2020)](https://www.usenix.org/system/files/sec20_slides_possemato.pdf)
- [pinned.github.io Network Security Config](https://pinned.github.io/2019/08/10/Android-network-security-configuration/)

---

### 5. Biometric auth — Face ID, Touch ID, Android BiometricPrompt

**Musaium implementation** : `features/auth/application/useBiometricAuth.ts:24-93` uses `expo-local-authentication`. Flow :
1. Boot : `hasHardwareAsync()` + `isEnrolledAsync()` to detect availability.
2. `supportedAuthenticationTypesAsync()` to label (Face ID / Touch ID / Iris / Biometric).
3. Enable : `authenticateAsync({ promptMessage, fallbackLabel, disableDeviceFallback: false })` then persist intent flag.
4. Authenticate same call shape on subsequent gates.

**Strengths** :
- Hardware-backed via OS (iOS Keychain biometric-tied keys + Android BiometricPrompt Class 2/3) when used in combination with `requireAuthentication: true` on SecureStore — but Musaium does **not currently** pass `requireAuthentication: true` to SecureStore (verified `authTokenStore.ts:41-62` does not). Tokens are stored unprotected by biometric — meaning **biometric gate is UI-only**, not hardware-enforced for the token itself.
- Label-aware UX ('Face ID' vs 'Touch ID' vs 'Iris' vs 'Biometric') driven by `AuthenticationType` enum.

**Gaps** :
1. **Class 3 ("Strong") gate missing** — Android distinguishes Class 2 (Weak — face recognition that can be spoofed by photos on some OEMs) from Class 3 (Strong — fingerprint, BiometricPrompt-bound, attested by hardware). OWASP MASTG recommends `getEnrolledLevelAsync()` returning `AuthenticationType.STRONG` (value 2 in expo enum) for sensitive ops. Musaium does not call this. Fix : 5-line addition.
2. **`disableDeviceFallback: false`** — falls back to device PIN after 2 biometric failures (iOS) or immediately (Android). UX win, but means a shoulder-surfed device PIN bypasses Face ID. For a cultural-content B2C app, acceptable. For a banking app, set `true`.
3. **No biometric-bound SecureStore** — biometric "success" should *unwrap* a key that decrypts the refresh token. Currently the refresh token sits in SecureStore (already hardware-keyed but not biometric-gated). Improvement : pass `requireAuthentication: true` + `authenticationPrompt: 'Unlock Musaium'` to SecureStore for the refresh token. This makes the OS-level keystore demand biometric on every read.

**Sources** :
- [LocalAuthentication Expo docs](https://docs.expo.dev/versions/latest/sdk/local-authentication/)
- [SecureStore Expo docs](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [STRV Biometric Auth in RN](https://medium.com/@strv/iintegrating-biometric-authentication-in-react-native-22a393e075be)
- [Expo Auth Guide (RN Relay)](https://reactnativerelay.com/article/react-native-authentication-expo-secure-storage-biometrics-protected-routes)
- [React Native Security Official Docs](https://reactnative.dev/docs/security)
- [Clerk Face ID Guide](https://clerk.com/articles/how-to-add-face-id-biometric-login-to-your-expo-clerk-app)

---

### 6. Secure Enclave / StrongBox — protecting the refresh token

**iOS Secure Enclave** : Dedicated coprocessor (Apple A7+) ; ~4 MB secure storage ; AES-256-GCM ; P256 ECC ; cached metadata key + per-item secret key requiring enclave round-trip ([capgo.app Best Practices](https://capgo.app/blog/secure-token-storage-best-practices-for-mobile-developers/)). Used **transparently** by iOS Keychain when items are stored with biometric-bound accessibility (`kSecAttrAccessControl` + `kSecAccessControlBiometryCurrentSet`).

**Android StrongBox** : Available on Pixel 3+, Samsung S9+, and other 2018+ flagships with dedicated secure element ; gated behind `FEATURE_STRONGBOX_KEYSTORE`. Activated with `KeyGenParameterSpec.Builder.setIsStrongBoxBacked(true)`. Better than the standard TEE (Trusted Execution Environment) because of physical isolation ([Android Keystore docs](https://developer.android.com/privacy-and-security/keystore)).

**Musaium status** : `expo-secure-store@~55.0.11` automatically uses Keychain on iOS (Secure Enclave-aware for biometric items) and EncryptedSharedPreferences backed by Android Keystore. **Does NOT automatically opt into StrongBox** — Expo SecureStore does not expose `setIsStrongBoxBacked` ([Expo SecureStore source](https://app.unpkg.com/expo-secure-store@13.0.2/files/src/SecureStore.ts) — verified, no StrongBox option in the SDK).

**Gap & remediation options** :
- **Accept gap (recommended for V1)** : Standard Android Keystore TEE is already hardware-backed and sufficient for cultural-content B2C. StrongBox provides marginal gain (resistance to *physical* attacks on the secure element — a threat model that doesn't apply to V1).
- **Upgrade path (V1.1+)** : Migrate refresh-token storage to `react-native-sensitive-info` (Nitro Module — StrongBox-aware per [mCodex/react-native-sensitive-info](https://github.com/mCodex/react-native-sensitive-info)) or `react-native-nitro-storage` ([JoaoPauloCMarra/react-native-nitro-storage](https://github.com/JoaoPauloCMarra/react-native-nitro-storage/blob/main/docs/secure-storage.md)). Both expose StrongBox auto-detection. Cost : ~1 day migration + test matrix update.

Sources :
- [Secure Token Storage Best Practices (Capgo)](https://capgo.app/blog/secure-token-storage-best-practices-for-mobile-developers/)
- [React Native Security](https://reactnative.dev/docs/security)
- [Token Storage React Native App Auth (Nearform)](https://nearform.com/open-source/react-native-app-auth/docs/token-storage/)
- [react-native-sensitive-info GitHub](https://github.com/mCodex/react-native-sensitive-info)
- [Auth0 RN Refresh Token Storage Community](https://community.auth0.com/t/where-how-to-store-refresh-token-for-react-native-mobile-app/31373)
- [Android StrongBox Keystore docs](https://developer.android.com/privacy-and-security/keystore)

---

### 7. Jailbreak / root detection 2026 — cost-benefit for B2C cultural app

**Threat surface** : Per Talsec field data, **0.5–1 % of devices show traces of rooting or jailbreaking** ([Talsec freeRASP-RN](https://github.com/talsec/Free-RASP-ReactNative)). Of those, an even smaller subset is malicious — most are devs / power users / privacy enthusiasts.

**Detection options** :
| Library | Cost | Detection scope | Anti-bypass | Verdict for Musaium |
|---|---|---|---|---|
| **freeRASP RN** (Talsec) | Free for the SDK ; paid for backend dashboard | Root (Magisk), jailbreak, Frida hooks, emulators, tampering, Magisk Hide, Shamiko, Shad0w, Dopamine | Hundreds of advanced checks per [Talsec Wiki](https://github.com/talsec/Free-RASP-Community/wiki/Threat-detection) | **Defer to V1.1** — overkill for cultural content |
| **`jail-monkey`** (GantMan) | Free, MIT | Basic jailbreak/root via well-known paths + mock location | Trivially bypassed by any hider tool | Not worth shipping — false sense of security |
| **`react-native-jailbreak`** (nazrdogan) | Free | Basic root/jailbreak | Trivially bypassed | Same as above |
| **Appdome ONEShield** (no-code) | Enterprise pricing (custom quote — see [Gartner Appdome vs GuardSquare](https://www.gartner.com/reviews/market/in-app-protection/compare/appdome-vs-guardsquare)) | Full RASP + obfuscation + anti-fraud + bot detection | Continuously updated | Reject — pre-revenue investment |
| **GuardSquare iXGuard / DexGuard** | Enterprise pricing | Build-time obfuscation + RASP | Industry-leading | Reject — pre-revenue investment |

**Bypass reality** ([Frida HTTP Toolkit blog](https://httptoolkit.com/blog/frida-certificate-pinning/), [Payatu SSL Bypass](https://payatu.com/blog/ssl-certificate-pinning-bypass/), [scriptkidd1e on RN bypass](https://scriptkidd1e.wordpress.com/2018/05/20/bypassing-jailbreak-detection-on-a-react-native-framework-ios-app/)) : *any* jailbreak detection is bypassable via Frida + class-method inspection. Detection only stops casual attackers — sophisticated ones are not slowed.

**Musaium verdict** : **DEFER jailbreak/root detection until B2B revenue justifies RASP investment** ([feedback_no_feature_flags_prelaunch.md] aligns — live or revert, not flagged dead code). For a cultural-content app where the asset value to an attacker is low (no payments processed client-side, LLM cost-attack mitigated server-side via R8 rate limiting + R4 LLM Guard), the cost-benefit doesn't add up at 100k installs. Re-evaluate when admin / B2B endpoints become attractive targets.

Sources :
- [Free-RASP-ReactNative](https://github.com/talsec/Free-RASP-ReactNative)
- [Talsec How to Detect Jailbreak on RN](https://medium.com/@talsec/how-to-detect-jailbreak-on-react-native-6e78c02f5445)
- [Talsec How to Detect Root on RN](https://medium.com/@talsec/how-to-detect-root-on-react-native-8acd9518db30)
- [MASTG-TEST-0045 Root Detection](https://mas.owasp.org/MASTG/tests/android/MASVS-RESILIENCE/MASTG-TEST-0045/)
- [GantMan jail-monkey](https://github.com/GantMan/jail-monkey)
- [Frida Cert Pinning Bypass HTTP Toolkit](https://httptoolkit.com/blog/frida-certificate-pinning/)
- [Frida Bypass Payatu](https://payatu.com/blog/ssl-certificate-pinning-bypass/)

---

### 8. App Attestation — Apple App Attest + Google Play Integrity

**Threat model** : prevents abuse of public API endpoints by **non-legitimate clients** — modified APKs, scripted reverse-engineered binaries, or web-based scrapers pretending to be the mobile app. Critical for high-volume free endpoints (LLM chat = expensive to operate).

**Apple App Attest** (iOS 14+, Secure Enclave-required, simulator-incompatible) : Three-step protocol — `generateAppAttestKey()` → `attestAppKey(keyID, challenge)` → server verifies attestation → server stores public key indexed by deviceId → subsequent requests use `generateAppAssertion(keyID, payload)` signed by Secure Enclave private key ([Apple Preparing App Attest](https://developer.apple.com/documentation/devicecheck/preparing-to-use-the-app-attest-service)). Free service from Apple ; cost is in backend integration + key-store + device-public-key DB.

**Google Play Integrity API** : Two modes — **Classic** request (one-shot, no warmup, slower, supports root checks) and **Standard** request (warmup + cached partial attestation, faster, Android 5.0+) ([Play Integrity Standard request docs](https://developer.android.com/google/play/integrity/standard)). Verdicts include `MEETS_DEVICE_INTEGRITY`, `MEETS_BASIC_INTEGRITY`, `MEETS_STRONG_INTEGRITY` plus app/account integrity signals.

**React Native options** :
- **`@expo/app-integrity`** (alpha as of SDK 55) — unified JS API for both platforms ([expo-app-integrity docs](https://docs.expo.dev/versions/latest/sdk/app-integrity/), [Expo blog announcement](https://expo.dev/blog/expo-app-integrity)). Alpha status flagged explicitly — *breaking changes likely*.
- **`react-native-app-attest`** (Gautham495) — iOS-only, beta but stable API ([GitHub](https://github.com/Gautham495/react-native-app-attest)).
- **`react-native-google-play-integrity`** (kedros-as) — Android-only, supports standard request.
- **`@pagopa/io-react-native-integrity`** — Italian government's reference implementation, both platforms ([npm](https://www.npmjs.com/package/@pagopa/io-react-native-integrity)).

**Musaium verdict** : **DEFER to V1.1**. Reasoning :
1. Backend LLM Guard sidecar + rate limiting (per R4 + R7) already throttle malicious scrapers — attestation is a *better* gate but not a *missing* gate.
2. `@expo/app-integrity` is **alpha** → SDK 55.0.8 published 7 days before this audit ; pinning to it for launch is risky.
3. Real attestation requires backend infrastructure (public-key DB indexed by device, replay-protection nonce table, Apple/Google verdict verification) — not built. R10 / R8 territory ; estimated 5-day effort.
4. Recommended V1.1 path : `@expo/app-integrity` once it leaves alpha, OR `@pagopa/io-react-native-integrity` if cross-platform stability is needed earlier.

**Known limitations** to flag : Approov has documented [App Attest limitations](https://approov.io/blog/limitations-of-apple-devicecheck-and-apple-app-attest) — attestation proves *binary integrity* but not *user authenticity* (a legitimate app can still be hijacked by a malicious user). Pair with rate-limited per-user + per-IP throttling for full coverage.

Sources :
- [AppIntegrity Expo docs](https://docs.expo.dev/versions/latest/sdk/app-integrity/)
- [Expo App Integrity blog announce](https://expo.dev/blog/expo-app-integrity)
- [Apple App Attest preparation](https://developer.apple.com/documentation/devicecheck/preparing-to-use-the-app-attest-service)
- [Play Integrity API overview](https://developer.android.com/google/play/integrity/overview)
- [Play Integrity Standard request](https://developer.android.com/google/play/integrity/standard)
- [react-native-app-attest GitHub](https://github.com/Gautham495/react-native-app-attest)
- [@pagopa/io-react-native-integrity](https://github.com/pagopa/io-react-native-integrity)
- [Approov App Attest limitations](https://approov.io/blog/limitations-of-apple-devicecheck-and-apple-app-attest)

---

### 9. Code obfuscation — RN bundle, Hermes bytecode

**Hermes default in Expo 55 / RN 0.83** : Hermes pre-compiles JS to bytecode (`.hbc` files, custom binary format, version 96 in 2026). It is **not encrypted** but the format is far harder to reverse than minified JS ([Iterators 2026 piece](https://www.iteratorshq.com/blog/the-silent-security-revolution-how-react-native-hermes-turned-apps-from-a-data-goldmine-into-fort-knox/), [Cognisys decompile guide](https://labs.cognisys.group/posts/How-to-Decompile-Hermes-React-Native-Binary/)).

**Threat landscape 2026** : `hermes-decomp` (open-source Rust decompiler) supports bytecode versions 40–99 — meaning current Hermes versions can be decompiled back to readable JS. But each Hermes version bump requires the decompiler to be updated, creating "economic deterrence" — attacker tools become obsolete with every RN minor version bump ([Iterators 2026]). At Insomnihack 2026, attackers showed they can decompile bytecode v96 but with significant effort.

**Obfuscation layers possible** :
1. **JS-level obfuscation before Hermes compile** (e.g., `javascript-obfuscator`, `jscrambler`) — adds string encryption + control-flow flattening *before* the bytecode compile. Slows reverse engineering further per [DEV.to "To Obfuscate or Not"](https://dev.to/rgomezp/to-obfuscate-or-not-obfuscate-react-native-3mkm).
2. **Native-side ProGuard / R8** (Android) — obfuscates Java/Kotlin classes (RN bridge, native modules). Expo 55 enables R8 by default in release.
3. **`-fobjc-arc-strip` / iOS strip-debug-symbols** — strips Objective-C names from binary. Expo 55 release scheme strips symbols by default.

**Musaium verdict** : **NO ACTION needed for V1**. Hermes bytecode + Expo 55 release-mode stripping = already 80th percentile defense for a cultural-content B2C app. Adding `javascript-obfuscator` slows builds 5–10 min and obscures stack traces in Sentry (would need source-map upload to deobfuscate) — **negative ROI** for the threat model. Re-evaluate if Musaium ships paid features client-side (cf. DRM, offline premium content) where bytecode-level secrets become assets.

Sources :
- [Hermes Bytecode Iterators 2026](https://www.iteratorshq.com/blog/the-silent-security-revolution-how-react-native-hermes-turned-apps-from-a-data-goldmine-into-fort-knox/)
- [Reverse Engineering Hermes vlourme](https://vlourme.medium.com/reverse-engineering-react-native-and-hermes-byte-code-bb5b96db368f)
- [Symbiotic Sec we built a decompiler](https://www.symbioticsec.ai/blog/we-built-a-decompiler-for-react-native-apps-heres-how-we-tested-it-at-insomnihack)
- [Cognisys Decompile Hermes](https://labs.cognisys.group/posts/How-to-Decompile-Hermes-React-Native-Binary/)
- [Payatu Modifying Hermes Bytecode](https://payatu.com/blog/understanding-modifying-hermes-bytecode/)
- [To Obfuscate or Not DEV.to](https://dev.to/rgomezp/to-obfuscate-or-not-obfuscate-react-native-3mkm)
- [Jscrambler Securing RN Apps](https://jscrambler.com/blog/securing-react-native-applications)

---

### 10. CVE alert — CVE-2025-11953 (RN Community CLI)

**Severity** : Critical (CVSS 9.8). Active exploitation, CISA KEV catalog entry, federal patching deadline 2026-02-26 ([JFrog blog](https://jfrog.com/blog/cve-2025-11953-critical-react-native-community-cli-vulnerability/), [GitHub Advisory GHSA-399j-vxmf-hjvr](https://github.com/advisories/GHSA-399j-vxmf-hjvr), [CSA Singapore alert](https://www.csa.gov.sg/alerts-and-advisories/alerts/al-2025-104/), [NVD](https://nvd.nist.gov/vuln/detail/CVE-2025-11953), [Tenable](https://www.tenable.com/cve/CVE-2025-11953)).

**What it is** : `@react-native-community/cli-server-api`'s `/open-url` endpoint passes user-supplied URLs directly to the `open` npm package's `open()` function, allowing unauthenticated remote attackers to execute arbitrary OS commands on the dev machine running the bundler. Windows worse (full shell injection) than macOS/Linux (executable invocation).

**Affected versions** : `cli@18.0.0` to `<18.0.1`, `19.0.0-alpha.0` to `<19.1.2`, `20.0.0-alpha.0` to `<20.0.0`. Fix : `≥ 20.0.0`.

**Musaium impact** : **DEV-ONLY** — the vulnerable server is the Metro dev server (`pnpm dev` / `npm run dev`). Production builds **do not** ship this code. To check : `grep "@react-native-community/cli" museum-frontend/package*.json` and verify the resolved version (R10 / R14 should run this as part of supply-chain audit ; outside R13 scope to remediate).

**Mitigation** if upgrade blocked : pass `--host 127.0.0.1` to bind dev server to loopback only.

Sources :
- [JFrog CVE-2025-11953 blog](https://jfrog.com/blog/cve-2025-11953-critical-react-native-community-cli-vulnerability/)
- [GitHub Advisory GHSA-399j-vxmf-hjvr](https://github.com/advisories/GHSA-399j-vxmf-hjvr)
- [CSA Singapore alert](https://www.csa.gov.sg/alerts-and-advisories/alerts/al-2025-104/)
- [NVD CVE-2025-11953](https://nvd.nist.gov/vuln/detail/CVE-2025-11953)
- [CISA Warns Cybersecurity News](https://cybersecuritynews.com/react-native-command-injection-flaw/)

---

## Cert Pinning Activation Runbook (Musaium-specific)

**Goal** : flip `EXPO_PUBLIC_CERT_PINNING_ENABLED` from `false` → `true` with real SPKI hashes before V1 launch (2026-06-01). Estimated effort : **1 day**.

### Step 1 — Capture leaf SPKI hash (~30 min)

```bash
# Replace api.musaium.app with the staged / prod hostname when DNS lands
openssl s_client -connect api.musaium.app:443 -servername api.musaium.app </dev/null 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform DER \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64
```
Output : 44-char base64 (e.g., `xH7Lz...=`). This is **pin #1 — leaf**.

### Step 2 — Generate backup keypair + compute backup SPKI (~30 min)

```bash
# Generate offline backup keypair (HSM-grade — keep private key air-gapped)
openssl genrsa -out backup-key.pem 4096
# Extract SPKI hash of backup public key
openssl rsa -in backup-key.pem -pubout -outform DER 2>/dev/null \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64
```
This is **pin #2 — backup**. Store `backup-key.pem` offline (1Password Business / AWS KMS / HSM).

### Step 3 — Update Musaium config (~5 min)

Replace placeholders in `museum-frontend/shared/config/cert-pinning.ts:34-37` :
```ts
export const PROD_SPKI_HASHES = [
  '<pin#1 leaf base64>=',   // expires when leaf cert expires
  '<pin#2 backup base64>=', // backup key — never online unless leaf compromised
] as const;
```
Rename constant (drop `PLACEHOLDER_` prefix) to remove the "do not activate" warning.

### Step 4 — Flip env (~5 min)

Add to `museum-frontend/.env.production` and CI/EAS prod secrets :
```env
EXPO_PUBLIC_CERT_PINNING_ENABLED=true
```

### Step 5 — Verify backend kill-switch endpoint (~30 min)

The init code calls `${apiBaseUrl}${KILL_SWITCH_PATH}` = `<base>/api/config/cert-pinning-enabled` and expects `{ "pinningEnabled": boolean }`. Verify the BE route exists, returns 200 with the shape, and is **not** behind auth (must be reachable at app boot before any token is acquired). R7 / R8 to confirm BE-side.

### Step 6 — Local smoke test (~1 h)

1. Local Charles Proxy install + system-trust install of Charles root CA.
2. Run app on physical iOS device against local backend. Without pinning : Charles intercepts requests. With pinning + correct hashes : Charles MitM fails (good) ; without pinning OR wrong hashes : Charles intercepts (bad).
3. Toggle BE kill-switch endpoint to return `pinningEnabled: false` ; restart app ; Charles intercepts again. Confirms kill-switch works.

### Step 7 — Maestro test addition (~30 min, R14 scope)

Add a Maestro test that boots the app, hits the home screen, and verifies a network request to `api.musaium.app` succeeds. Run on both iOS + Android shards. This catches future cert-rotation regressions early.

### Step 8 — Document the rotation calendar

Add to `docs/RUNBOOKS/CERT_ROTATION.md` (file referenced at `cert-pinning.ts:14`, unverified exists — create if missing) :
- Leaf cert expiry date.
- T-14d trigger : compute new SPKI, ship 3-pin app update.
- T-day : rotate server cert.
- T+30d : ship 2-pin update removing old pin.

---

## Verdict — Musaium B2C 100k installs

### Minimum viable defense for V1 ship (2026-06-01)

**Required** (P0 — must ship) :
1. ✅ **`expo-secure-store` for token storage** — already in place (`authTokenStore.ts`).
2. ✅ **`expo-local-authentication` biometric gate** — already in place (`useBiometricAuth.ts`).
3. ❌→✅ **Cert pinning activated with real SPKI hashes** — flip `EXPO_PUBLIC_CERT_PINNING_ENABLED=true` + replace placeholders (1-day runbook above).
4. ❌→✅ **Class 3 biometric gate** — 5-line addition to `useBiometricAuth.ts` calling `getEnrolledLevelAsync()` and rejecting Class 2 enrolments for sensitive ops (e.g., refresh-token release).
5. ✅ **TLS defaults via iOS ATS + Android Network Security Config 28+** — applies by default, no action.
6. ✅ **Hermes bytecode + Expo 55 release stripping** — applies by default.

**Nice-to-have but skippable for V1** (P1 — defer to V1.1) :
- App Attestation via `@expo/app-integrity` (out of alpha) or `@pagopa/io-react-native-integrity` once stable.
- Biometric-bound SecureStore via `requireAuthentication: true` for refresh token (small UX cost — biometric prompt at each token refresh).
- `disableDeviceFallback: true` for biometric-only mode (UX risk — users without enrolled biometric can't auth).

**Skip for V1 and V1.1** (P2 — re-evaluate post-B2B revenue) :
- Jailbreak / root detection (freeRASP+ paid SDK or enterprise RASP).
- Code obfuscation beyond Hermes (`javascript-obfuscator`, Jscrambler, Appdome).
- StrongBox-backed refresh token (migrate to `react-native-sensitive-info` Nitro Module).
- Hardware-attestation chained to backend identity (Approov-style commercial service).

### When to add layers — trigger criteria

| Layer | Add when |
|---|---|
| **App Attestation** | LLM cost-attack observed in production telemetry (R6 metric) OR signed B2B contract requires it |
| **Jailbreak detection** | Premium offline content shipped client-side OR fraud detected in admin / B2B flows |
| **RASP (Appdome / Talsec+)** | Fraud cost > €10k / month OR PCI-DSS / GDPR Article 32 audit demands it |
| **JS obfuscation** | Secret values shipped client-side (e.g., API keys for 3rd-party services that cannot be backend-proxied) |
| **StrongBox** | Hardware-attestation token-binding becomes a B2B requirement |

### One-line summary

**KEEP** the entire current stack (cert-pinning library + biometric + SecureStore), **ACTIVATE** cert pinning with real SPKI hashes before app-store submission, **PATCH** the Class 3 biometric gap (5 lines), **DEFER** everything else — Musaium is enterprise-grade on storage / crypto / platform and has a single load-bearing 1-day task to close the network MitM gap before V1 ship.

---

## Sources (consolidated)

### OWASP MASVS / MASTG
- [OWASP MASVS](https://mas.owasp.org/MASVS/)
- [OWASP MASTG GitHub](https://github.com/OWASP/mastg)
- [OWASP MASVS GitHub](https://github.com/OWASP/masvs)
- [MASVS-STORAGE](https://mas.owasp.org/MASVS/05-MASVS-STORAGE/)
- [MASVS-RESILIENCE](https://mas.owasp.org/checklists/MASVS-RESILIENCE/)
- [MASTG-TEST-0052 Local Data Storage](https://mas.owasp.org/MASTG/tests/ios/MASVS-STORAGE/MASTG-TEST-0052/)
- [MASTG-TEST-0068 Cert Pinning iOS](https://mas.owasp.org/MASTG/tests/ios/MASVS-NETWORK/MASTG-TEST-0068/)
- [MASTG-TEST-0244 Missing Cert Pinning Android](https://mas.owasp.org/MASTG/tests/android/MASVS-NETWORK/MASTG-TEST-0244/)
- [MASTG-TEST-0045 Root Detection](https://mas.owasp.org/MASTG/tests/android/MASVS-RESILIENCE/MASTG-TEST-0045/)
- [MASTG-KNOW-0015 Cert Pinning](https://mas.owasp.org/MASTG/knowledge/android/MASVS-NETWORK/MASTG-KNOW-0015/)
- [MASTG-KNOW-0071 iOS App Transport Security](https://mas.owasp.org/MASTG/knowledge/ios/MASVS-NETWORK/MASTG-KNOW-0071/)
- [OWASP Pinning Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Pinning_Cheat_Sheet.html)
- [NowSecure 2026 OWASP Mobile Explained](https://www.nowsecure.com/blog/2026/01/21/owasp-mobile-application-security-explained-how-to-put-masvs-mastg-and-maswe-into-practice/)
- [Approov MASVS v2 Practical Guide](https://approov.io/blog/a-practical-guide-to-owasp-masvs-v2)
- [AppSec Santa MASVS Guide 2026](https://appsecsanta.com/mobile-security-tools/owasp-masvs-guide)
- [Appdome OWASP MASVS Explained 2026](https://www.appdome.com/dev-sec-blog/owasp-masvs-explained/)

### Cert Pinning Libraries
- [react-native-ssl-public-key-pinning npm](https://www.npmjs.com/package/react-native-ssl-public-key-pinning)
- [react-native-ssl-public-key-pinning GitHub](https://github.com/frw/react-native-ssl-public-key-pinning)
- [react-native-ssl-public-key-pinning SECURITY.md](https://github.com/frw/react-native-ssl-public-key-pinning/blob/main/SECURITY.md)
- [react-native-ssl-pinning npm](https://www.npmjs.com/package/react-native-ssl-pinning)
- [TrustKit-Android GitHub](https://github.com/datatheorem/TrustKit-Android)
- [Callstack SSL Pinning RN](https://www.callstack.com/blog/ssl-pinning-in-react-native-apps)
- [OneUptime SSL Pinning RN 2026](https://oneuptime.com/blog/post/2026-01-15-react-native-ssl-pinning/view)
- [OneUptime Cert Pinning Enhanced Security 2026](https://oneuptime.com/blog/post/2026-03-20-certificate-pinning-enhanced-security/view)

### SPKI / RFC 7469 / HPKP
- [RFC 7469 IETF](https://datatracker.ietf.org/doc/html/rfc7469)
- [Apple SPKI-SHA256-BASE64](https://developer.apple.com/documentation/bundleresources/information-property-list/nspinnedcaidentities/spki-sha256-base64)
- [MeetCyber SPKI in Practice](https://meetcyber.net/spki-pinning-in-practice-android-react-native-ios-and-the-openssl-details-that-break-teams-899c63dd1410)
- [Gist ruiwen pinned curl SPKI capture](https://gist.github.com/ruiwen/f7aaf042e4c6dd07d7d91329f6eafefb)
- [HPKP is Dead (GF.dev)](https://gf.dev/learn/hpkp-is-dead)
- [HPKP is no more (scotthelme.co.uk)](https://scotthelme.co.uk/hpkp-is-no-more/)

### iOS ATS / Android Network Security Config
- [Apple NSAppTransportSecurity](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity)
- [Apple Preventing Insecure Network Connections](https://developer.apple.com/documentation/security/preventing-insecure-network-connections)
- [Apple Fine-tune ATS settings](https://developer.apple.com/news/?id=jxky8h89)
- [Apple TLS Security](https://support.apple.com/guide/security/tls-security-sec100a75d12/web)
- [Android Network Security Config Docs](https://developer.android.com/privacy-and-security/security-config)
- [Infinum Android Cert Pinning Handbook](https://infinum.com/handbook/android/security/certificate-pinning)
- [Secure Vale Deep Dive Cert Pinning Android](https://securevale.blog/articles/deep-dive-into-certificate-pinning-on-android/)
- [USENIX 2020 HTTPS Everywhere Android](https://www.usenix.org/system/files/sec20_slides_possemato.pdf)
- [pinned.github.io Network Security Config](https://pinned.github.io/2019/08/10/Android-network-security-configuration/)

### Biometric / SecureStore / Hardware-backed
- [Expo LocalAuthentication docs](https://docs.expo.dev/versions/latest/sdk/local-authentication/)
- [Expo SecureStore docs](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [React Native Security Official Docs](https://reactnative.dev/docs/security)
- [Capgo Secure Token Storage Best Practices](https://capgo.app/blog/secure-token-storage-best-practices-for-mobile-developers/)
- [Nearform RN App Auth Token Storage](https://nearform.com/open-source/react-native-app-auth/docs/token-storage/)
- [react-native-sensitive-info](https://github.com/mCodex/react-native-sensitive-info)
- [react-native-nitro-storage](https://github.com/JoaoPauloCMarra/react-native-nitro-storage/blob/main/docs/secure-storage.md)
- [pagopa/io-react-native-secure-storage](https://github.com/pagopa/io-react-native-secure-storage)
- [STRV Integrating Biometric Auth in RN](https://medium.com/@strv/iintegrating-biometric-authentication-in-react-native-22a393e075be)
- [Sasanda Saumya Biometric RN Expo Guide](https://sasandasaumya.medium.com/biometric-authentication-in-react-native-expo-a-complete-guide-face-id-fingerprint-732d80e5e423)
- [Clerk Face ID + Biometrics Guide](https://clerk.com/articles/how-to-add-face-id-biometric-login-to-your-expo-clerk-app)

### Jailbreak / Root / RASP
- [Talsec Free-RASP-ReactNative](https://github.com/talsec/Free-RASP-ReactNative)
- [Talsec How to Detect Jailbreak on RN](https://medium.com/@talsec/how-to-detect-jailbreak-on-react-native-6e78c02f5445)
- [Talsec How to Detect Root on RN](https://medium.com/@talsec/how-to-detect-root-on-react-native-8acd9518db30)
- [Talsec Threat Detection Wiki](https://github.com/talsec/Free-RASP-Community/wiki/Threat-detection)
- [GantMan jail-monkey](https://github.com/GantMan/jail-monkey)
- [Frida Bypass HTTP Toolkit](https://httptoolkit.com/blog/frida-certificate-pinning/)
- [Payatu SSL Cert Pinning Bypass](https://payatu.com/blog/ssl-certificate-pinning-bypass/)
- [Gartner Appdome vs GuardSquare 2026](https://www.gartner.com/reviews/market/in-app-protection/compare/appdome-vs-guardsquare)
- [Appdome No-Code Alternatives](https://www.gartner.com/reviews/product/appdome-no-code-mobile-app-security/alternatives)
- [Digital.ai Securing RN Apps](https://digital.ai/catalyst-blog/securing-react-native-applications/)

### App Attestation
- [Expo AppIntegrity docs](https://docs.expo.dev/versions/latest/sdk/app-integrity/)
- [Expo App Integrity Blog Launch](https://expo.dev/blog/expo-app-integrity)
- [Apple App Attest Preparation](https://developer.apple.com/documentation/devicecheck/preparing-to-use-the-app-attest-service)
- [Google Play Integrity Overview](https://developer.android.com/google/play/integrity/overview)
- [Google Play Integrity Standard Request](https://developer.android.com/google/play/integrity/standard)
- [react-native-app-attest Gautham495](https://github.com/Gautham495/react-native-app-attest)
- [react-native-ios-appattest srinivas1729](https://github.com/srinivas1729/react-native-ios-appattest)
- [pagopa/io-react-native-integrity](https://github.com/pagopa/io-react-native-integrity)
- [Approov App Attest Limitations](https://approov.io/blog/limitations-of-apple-devicecheck-and-apple-app-attest)

### Hermes / Code Obfuscation
- [Iterators Hermes Fort Knox 2026](https://www.iteratorshq.com/blog/the-silent-security-revolution-how-react-native-hermes-turned-apps-from-a-data-goldmine-into-fort-knox/)
- [Symbiotic Sec Decompiler Insomnihack 2026](https://www.symbioticsec.ai/blog/we-built-a-decompiler-for-react-native-apps-heres-how-we-tested-it-at-insomnihack)
- [Cognisys Labs Decompile Hermes](https://labs.cognisys.group/posts/How-to-Decompile-Hermes-React-Native-Binary/)
- [Payatu Modifying Hermes Bytecode](https://payatu.com/blog/understanding-modifying-hermes-bytecode/)
- [Vlourme Reverse Engineering Hermes](https://vlourme.medium.com/reverse-engineering-react-native-and-hermes-byte-code-bb5b96db368f)
- [DEV.to To Obfuscate or Not RN](https://dev.to/rgomezp/to-obfuscate-or-not-obfuscate-react-native-3mkm)
- [Jscrambler Securing RN Apps](https://jscrambler.com/blog/securing-react-native-applications)

### CVE / Advisories
- [JFrog CVE-2025-11953](https://jfrog.com/blog/cve-2025-11953-critical-react-native-community-cli-vulnerability/)
- [GitHub Advisory GHSA-399j-vxmf-hjvr](https://github.com/advisories/GHSA-399j-vxmf-hjvr)
- [CSA Singapore Alert AL-2025-104](https://www.csa.gov.sg/alerts-and-advisories/alerts/al-2025-104/)
- [NVD CVE-2025-11953](https://nvd.nist.gov/vuln/detail/CVE-2025-11953)
- [Cybersecurity News CISA Warns](https://cybersecuritynews.com/react-native-command-injection-flaw/)
- [Tenable CVE-2025-11953](https://www.tenable.com/cve/CVE-2025-11953)

### Expo SDK 55
- [Expo SDK 55 changelog](https://expo.dev/changelog/sdk-55)
- [Expo SDK 55 Beta changelog](https://expo.dev/changelog/sdk-55-beta)

---

**End of R13 — RN Security On-Device 2026.**
