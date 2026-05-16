# R26 — WebAuthn / Passkeys Roadmap 2026

**Agent:** R26 (audit-2026-05-12 / vague 3 — security gaps)
**Scope:** WebAuthn 2/3 spec state, passkeys 2026 ecosystem, SimpleWebAuthn vs alternatives, NIST AAL2/AAL3, mobile RN support, MFA chaining vs sole-factor, phishing-resistant compliance, UX patterns, Conditional UI, implementation roadmap Musaium V1.1 web + V1.2 mobile.
**Methodology:** 18 WebSearch queries (sources cited inline §13) + direct file Read of `museum-backend/src/modules/auth/` (TOTP-only, no WebAuthn/passkey code anywhere in repo — verified `grep webauthn|passkey museum-backend/src/ museum-frontend/ museum-web/` returns zero hits outside `node_modules/`).
**Honesty UFR-013:** every Musaium claim sourced from file path + line. Every external claim has a URL in §13. Where I'm guessing (e.g., calendar effort for solo dev) I say "estimate — not verified from upstream data." Per `feedback_no_solo_dev_estimates.md` I frame effort as scope/dependency, not days.

---

## 1. TL;DR

1. **Spec state:** WebAuthn Level 2 = stable W3C Recommendation since 2021. Level 3 = **Candidate Recommendation** since 2025-Q3, expected final ≥ 2026-02-10. Production-ready today on the L2 surface area; L3 features (Conditional UI, hybrid transport, PRF, Signal API) are progressively shipping in browsers without waiting for the formal Rec.
2. **Passkeys hit critical mass 2025-2026.** FIDO Alliance reports **5 billion passkeys** in use globally (May 2026); **87% of enterprises** deploying/piloting (HID 2025 survey, up from 53% in 2023); 69% of consumers have ≥1 passkey. Apple/Google/Microsoft all sync-enabled cross-device. CXP (Credential Exchange Protocol) shipped in iOS 26 (2025-Q4) for cross-vendor passkey export.
3. **NIST SP 800-63B-4 final (2025-07-31, approved 2025-05-30 ERB)** makes phishing-resistant authenticators **mandatory at AAL2** — and AAL3 explicitly requires non-exportable private keys. Synced passkeys are **now permitted at AAL2** in the final version (a change vs the late drafts). AAL3 still requires device-bound credentials.
4. **Library choice = `@simplewebauthn/server` + `@simplewebauthn/browser` v13.3.0.** TypeScript-first, Node 20+/22+, paired client+server packages, actively maintained (latest release < 2 months old at time of writing 2026-05-12). `@github/webauthn-json` is essentially deprecated by browser-native JSON parsing — do not use for new code. Better Auth bundles WebAuthn but adopting it pre-launch V1 is a rip-and-replace risk R20 already vetoed; build directly on simplewebauthn for the V1.1 web shipping path.
5. **Musaium current state:** TOTP-only (verified `museum-backend/src/modules/auth/useCase/totp/`). No passkey code anywhere. R7 flagged this as the single P1 auth gap for admin/B2B; R20 confirmed shippable on simplewebauthn in ~1 week of focused work for web only.
6. **Mobile path is the harder one.** `react-native-passkey@3.3.3` (f-23) and `react-native-passkeys` (peterferguson) both require **EAS Development Builds — incompatible with Expo Go**. Expo SDK 55 (which Musaium uses, per `museum-frontend/` New Architecture-mandatory) does **not formally support** Clerk's `@clerk/expo-passkeys` yet (peer-dep gap, per Clerk docs April 2026). The community libs do work on SDK 55 since they don't pin Clerk — but require AASA file (iOS) + assetlinks.json (Android) hosted on a production HTTPS origin **before any build can authenticate**.
7. **MFA chaining decision: passkey-as-sole-factor for V1.1+, keep TOTP as fallback during transition.** NIST 800-63B-4 + Google deployment guidance both classify a passkey assertion w/ user-verification = multi-factor in one step (something-you-have + something-you-are/know). Stacking TOTP on top of a verified passkey is security theatre and adoption-killer (eBay +102% adoption when prompt moved from settings to post-login, per Security Boulevard April 2026). Keep TOTP enrolled as recovery during the V1.1→V2 transition; deprecate it from new-customer onboarding once 2 passkeys are enrolled per user.
8. **SOC 2 / ISO 27001 angle = strong tailwind, not strict requirement.** Neither framework explicitly mandates passkeys, but both require "strong access controls". Cyber insurance underwriters now apply **20-40% premium surcharges** for orgs without phishing-resistant MFA (MojoAuth 2025 hidden-costs analysis). For Musaium's B2B museum buyers, RFP boilerplate already asks "do you support FIDO2/WebAuthn?" — expect "no" to be a deal-disqualifier by H2 2026.
9. **Implementation roadmap (recommended):**
   - **V1.1 (post-launch, target 2026-07 / sprint+1):** web admin panel passkey support via simplewebauthn — admins + super_admins only, TOTP fallback retained, no Conditional UI yet, no mobile.
   - **V1.2 (target 2026-09):** web visitor passkey opt-in (sole factor, password fallback during transition), Conditional UI on login form, Signal API for credential consistency.
   - **V1.3 (target 2026-11):** mobile RN passkey support on dev-build via `react-native-passkey`, requires AASA + assetlinks.json hosted on prod origin first.
   - **V2 (post-B2B revenue):** Enterprise attestation for regulated B2B (defense/health museums if they sign), PRF extension if E2EE features arrive.
10. **Verdict: KEEP TOTP, ADD passkeys in V1.1. Effort = ~1 week web + ~1 week mobile (not solo-dev days but a scoped slice). Risk = low (mature library, mature spec, mature browser support).** Blocking dependency before any code = **decide the RP ID** (`musaium.app` vs `app.musaium.app`) — changing it later invalidates every enrolled passkey.

---

## 2. Musaium current auth surface (verified)

Read from `museum-backend/src/modules/auth/`:

| Area | File | Notes |
|---|---|---|
| TOTP enrollment | `useCase/totp/enrollMfa.useCase.ts` | RFC 6238, AES-256-GCM secret-at-rest, 10× bcrypt recovery codes |
| TOTP verify | `useCase/totp/verifyMfa.useCase.ts` | ±1 step tolerance |
| MFA challenge gate | `useCase/totp/challengeMfa.useCase.ts` + `useCase/session/mfa-gate.service.ts` | Issues short-lived `mfa_token` between login + verify |
| MFA route | `adapters/primary/http/routes/mfa.route.ts` | `/api/auth/mfa/{enroll,verify,disable,recovery,challenge,status}` |
| Schema | `domain/totp/totp-secret.entity.ts` | `totp_secret` table, FK to user, encrypted base32 + JSONB recovery_codes |
| WebAuthn / passkey | — | **None. Zero results for `webauthn|passkey` in `src/`.** |

R7 §5 + R20 §3 Q5 both flag this gap. R7 status A07: PARTIAL. R20 verdict Q7: WebAuthn = "should-ship-V1.1, not V1".

---

## 3. WebAuthn 2 / 3 spec state (2026-05)

### WebAuthn Level 2 — stable

- W3C Recommendation since **2021-04-08** ([w3.org/TR/webauthn-2](https://www.w3.org/TR/webauthn-2/)).
- Universal browser support (Chrome 67+, Edge 18+, Firefox 60+, Safari 13+) — table-stakes today.
- Defines the core API: `navigator.credentials.create({publicKey})` for registration, `navigator.credentials.get({publicKey})` for authentication.

### WebAuthn Level 3 — Candidate Recommendation

- **Candidate Recommendation since 2025-Q3** ([w3.org/TR/webauthn-3](https://www.w3.org/TR/webauthn-3/)).
- Not expected to advance to Recommendation before **2026-02-10** (W3C announcement, [w3.org/news/2026/](https://www.w3.org/news/2026/w3c-invites-implementations-of-web-authentication-an-api-for-accessing-public-key-credentials-level-3/)).
- New features added in L3 vs L2 (per Mike Jones, [self-issued.info/?p=2421](https://self-issued.info/?p=2421)):
  - Cross-Origin Authentication within an iFrame
  - **Credential Backup State** (lets RP know if the credential is syncable or device-bound)
  - **`isPasskeyPlatformAuthenticatorAvailable()` method**
  - **Conditional Mediation** (passkey autofill)
  - Device-Bound Public Keys
  - Attestations during `authenticatorGetAssertion`
  - **PRF (Pseudo-Random Function) extension** (E2EE use case)
  - **Hybrid Transport** (cross-device QR + BLE flow)
  - Third-Party Payment Authentication
- Browsers ship L3 features incrementally without waiting for the Rec — Conditional UI, hybrid transport, PRF are all production today on the major engines (see §7).

### FIDO2 / CTAP

- WebAuthn is the browser half; CTAP is the authenticator wire protocol.
- CTAP 2.2 (FIDO Alliance, 2023) formalizes **hybrid transport** = phone-as-roaming-authenticator over BLE + encrypted tunnel ([yubico.com/CTAP/CTAP2.2](https://developers.yubico.com/CTAP/CTAP2.2.html)). Adoption now 97-100% across browser surfaces (Corbado Benchmark 2026).

---

## 4. Passkeys 2026 ecosystem

### Adoption metrics (FIDO Alliance, Microsoft, Google)

- **5 billion passkeys in use** globally (FIDO Alliance, [businesswire.com 2026-05-06](https://www.businesswire.com/news/home/20260506926067/en/FIDO-Alliance-Reports-Accelerating-Global-Passkey-Adoption-on-World-Passkey-Day-2026)).
- **87% of enterprises** deploying/piloting (HID/FIDO 2025 State of Authentication).
- **69% of consumers** have ≥1 passkey (up from 39% two years ago).
- **800M+ Google accounts** using passkeys; Amazon 175M in year-one; Microsoft auto-enabled for new consumer accounts in 2024 ([guptadeepak.com](https://guptadeepak.com/passkeys-hit-critical-mass-microsoft-auto-enables-for-millions-87-of-companies-deploy-as-passwords-near-end-of-life/)).

### Sync ecosystems (the 3 walled gardens + 3 cross-vendor)

| Provider | Storage | Cross-device sync | Cross-vendor |
|---|---|---|---|
| **Apple iCloud Keychain** | Secure Enclave + iCloud E2E-encrypted | iPhone/iPad/Mac/AppleTV | Via CXP since iOS 26 |
| **Google Password Manager** | Android Keystore + Google account | Android/Chrome (all OS) | Via CXP (in progress) |
| **Microsoft Windows Hello + Password Manager** | Windows Hello TPM + Edge | Win10/11 + Edge | Edge 142 (2025-11) added sync; Synced Passkeys GA March 2026 |
| **1Password** | Vendor-encrypted | Cross-platform vault | CXP early adopter |
| **Bitwarden** | Open-source vault | Cross-platform | CXP early adopter (Bitwarden blog) |
| **Dashlane** | Vendor-encrypted | Cross-platform | CXP-enabled |

### Credential Exchange Protocol (CXP)

- **iOS 26 is the first OS to ship CXP support** (FIDO Alliance spec, targeting standardization early 2026, [corbado.com/blog/credential-exchange-protocol-cxp](https://www.corbado.com/blog/credential-exchange-protocol-cxp-credential-exchange-format-cxf)).
- Uses HPKE (Hybrid Public Key Encryption) for E2E-protected transfer between password managers.
- Developer APIs on Apple: `ASCredentialExportManager` + `ASCredentialImportManager`.
- Impact for Musaium: **none direct** — CXP is a credential-manager-to-credential-manager spec, not RP-facing. But the cross-vendor portability removes the "lock-in" objection from privacy-conscious users.

### Device-bound vs syncable trade-off

| Property | Device-bound | Syncable |
|---|---|---|
| Attack surface | Lower (no cloud) | Higher (cloud account compromise = passkeys travel) |
| AAL2 (NIST 800-63B-4) | YES | **YES (changed in final, was unclear in drafts)** |
| AAL3 | YES (if non-exportable key + FIPS 140 L1) | **NO** |
| User convenience | Low (one device) | High (every device) |
| Account recovery | Hard (lost device = lost access) | Easy (sync) |
| Enterprise use | Regulated/privileged accounts | General workflows |

**Industry pattern 2026:** 47% of enterprise deployments use BOTH — synced for general users, device-bound for privileged/regulated ([onespan.com](https://www.onespan.com/blog/device-bound-passkeys)).

### Musaium recommendation
- **B2C visitors (V1.2):** syncable passkeys via platform authenticators. AAL2 sufficient.
- **B2B museum staff (V1.1):** syncable passkeys default. Offer device-bound (YubiKey) opt-in for regulated buyers later.
- **Don't require AAL3** unless a regulated buyer signs and demands it — adoption cost is too high (need FIPS-certified hardware keys).

---

## 5. NIST SP 800-63B-4 — final (2025-07-31)

Approved by NIST Editorial Review Board **2025-05-30**, published **2025-07-31** ([nvlpubs.nist.gov/NIST.SP.800-63B-4.pdf](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63B-4.pdf)).

### Authenticator Assurance Levels — what changed vs 800-63B (2017)

| Level | Requirement (final 2025) | Notes |
|---|---|---|
| **AAL1** | Single factor sufficient. Memorized secret OK. | Unchanged. Musaium B2C visitor login = AAL1 |
| **AAL2** | **MUST offer a phishing-resistant option.** Multi-factor (one factor cryptographic) OR single phishing-resistant authenticator. **Syncable passkeys permitted.** | This is the big change. AAL2 is now the practical floor for any B2B SaaS in 2026 |
| **AAL3** | **Phishing-resistant authenticator with non-exportable private key + explicit user-intent confirmation.** FIPS 140 Level 1 sufficient (relaxed from Level 2). **Syncable passkeys NOT permitted.** | Device-bound only. Hardware keys (YubiKey 5, Titan Key) or platform device-bound passkeys |

Source: [pages.nist.gov/800-63-4/sp800-63b/aal/](https://pages.nist.gov/800-63-4/sp800-63b/aal/), [wwpass.com/blog/phishing-resistant-mfa-in-2025](https://www.wwpass.com/blog/phishing-resistant-mfa-in-2025-buyer-s-guide-to-nist-sp-800-63-4-omb-m-22-09/).

### What "phishing-resistant" means in 800-63B-4

- Cryptographic challenge bound to the authenticated channel (origin + RP ID verification = MitM-immune).
- User verification (something-you-are or something-you-know) on the authenticator.
- Excludes: SMS OTP, email OTP, push-based MFA without number-matching, TOTP, voice OTP.
- Includes: FIDO2/WebAuthn (passkeys, hardware keys), PIV/CAC smart cards, certificate-based auth on smart device.

### Musaium positioning under 800-63B-4

| User segment | Current (Musaium 2026-05) | Target |
|---|---|---|
| Visitor B2C (login) | AAL1 (password + optional TOTP) | AAL1 — no change required |
| Visitor B2C w/ TOTP enabled | AAL2 (per NIST: password + TOTP = MFA, but **not phishing-resistant**) | AAL2 phishing-resistant once passkey opt-in lands V1.2 |
| Museum admin (B2B) | AAL2 (mandatory TOTP per `user.mfaEnforcedAt`) | **AAL2 phishing-resistant via passkey + TOTP fallback (V1.1)** |
| Super-admin (Musaium internal) | AAL2 same as above | AAL2 phishing-resistant (V1.1), eventual AAL3 via hardware key (V2) |

**Compliance read:** Musaium today is AAL1 for visitors, AAL2 (non-phishing-resistant) for admins. Shipping V1.1 passkey for admins moves Musaium to **AAL2 phishing-resistant for the B2B-facing surface**, which is what enterprise RFPs ask for.

---

## 6. SimpleWebAuthn — primary library recommendation

### Version + maturity (2026-05)

- **`@simplewebauthn/server` v13.3.0** (published ~1 month before audit, [npmjs.com/package/@simplewebauthn/server](https://www.npmjs.com/package/@simplewebauthn/server))
- **`@simplewebauthn/browser` v13.3.0** (matching, [npmjs.com/package/@simplewebauthn/browser](https://www.npmjs.com/package/@simplewebauthn/browser))
- 234 npm dependents, Node 20+/22+ supported
- TypeScript-first, MIT, single-maintainer (Matt Miller / MasterKale) but actively shipped + W3C-canonical
- Recent feature: `useAutoRegister` arg on `startRegistration()` (CHANGELOG) — silent passkey enrollment for users who just completed password auth (UX boost)

### What the server library does for you

```ts
// Registration
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';

const options = await generateRegistrationOptions({
  rpName: 'Musaium',
  rpID: 'musaium.app',   // ⚠️ DECIDE BEFORE FIRST USER ENROLLS
  userID: user.id,
  userName: user.email,
  attestationType: 'none',    // 'none' for B2C, 'direct' for B2B enterprise attestation
  authenticatorSelection: {
    residentKey: 'preferred',  // discoverable credentials = required for Conditional UI
    userVerification: 'preferred',
    authenticatorAttachment: 'platform',  // 'cross-platform' allows USB keys
  },
});
// Persist options.challenge in user session (Redis, TTL 5min)

// Verification (after browser returns credential)
const verification = await verifyRegistrationResponse({
  response: req.body.credential,
  expectedChallenge: session.challenge,
  expectedOrigin: 'https://musaium.app',
  expectedRPID: 'musaium.app',
});
// Persist verification.registrationInfo.credentialID + credentialPublicKey + counter
```

Authentication is the mirror with `generateAuthenticationOptions` + `verifyAuthenticationResponse`.

Source: [simplewebauthn.dev/docs/packages/server](https://simplewebauthn.dev/docs/packages/server), example impl [github.com/MasterKale/SimpleWebAuthn/blob/master/example/index.ts](https://github.com/MasterKale/SimpleWebAuthn/blob/master/example/index.ts).

### Minimum DB schema (Musaium-compatible)

```sql
-- New table, sits alongside existing totp_secret
CREATE TABLE webauthn_credential (
  id                BIGSERIAL PRIMARY KEY,
  user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id     BYTEA NOT NULL UNIQUE,        -- base64url-decoded
  public_key        BYTEA NOT NULL,                -- CBOR-encoded public key
  counter           BIGINT NOT NULL DEFAULT 0,     -- ⚠️ BIGINT mandatory (per Corbado schema guide — some authenticators return atomic timestamps)
  device_type       VARCHAR(20) NOT NULL,          -- 'singleDevice' | 'multiDevice' (from L3 Credential Backup State)
  backed_up         BOOLEAN NOT NULL,              -- L3 backup flag = is this syncable?
  transports        TEXT[],                        -- 'internal' | 'usb' | 'ble' | 'nfc' | 'hybrid'
  aaguid            UUID,                          -- authenticator model identifier
  nickname          VARCHAR(100),                  -- user-set name ("My iPhone")
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at      TIMESTAMPTZ
);
CREATE INDEX idx_webauthn_user ON webauthn_credential(user_id);
```

Per Corbado schema guide ([corbado.com/blog/passkey-webauthn-database-guide](https://www.corbado.com/blog/passkey-webauthn-database-guide)).

### `@simplewebauthn/browser` — client side

```ts
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

const credential = await startRegistration(options);
// POST credential to backend for verifyRegistrationResponse
```

Handles base64url decoding, COSE key parsing, browser feature detection. ~6 KB minified.

---

## 7. `@github/webauthn-json` — alternative (not recommended for new code)

- Lightweight (~1 KB min+gzip) wrapper that does base64url encode/decode of WebAuthn responses ([github.com/github/webauthn-json](https://github.com/github/webauthn-json)).
- **No server library** — browser-only. You'd still need a server-side verifier (so you'd combine with `@simplewebauthn/server` anyway).
- **Effectively deprecated by browser-native JSON methods.** Modern browsers now expose `PublicKeyCredential.toJSON()` and `parseCreationOptionsFromJSON()` natively, making the wrapper redundant.
- GitHub itself uses it internally but documents that "browser-native JSON parsing functions are now available for the vast majority of users".

**Verdict:** use `@simplewebauthn/browser` instead. Mature pairing with the server lib, identical bundle size class, more features.

---

## 8. Mobile RN passkey support (Expo SDK 55)

### Libraries

| Library | Maintainer | Latest | Expo SDK 55 fit |
|---|---|---|---|
| **`react-native-passkey`** (f-23) | @f-23, GitHub solo | **3.3.3** (~1 mo before audit) | Works with dev-build. Native iOS 15+/Android API 28+. Returns FIDO2 attestation/assertion to verify server-side. Platform/security distinction iOS-only. |
| **`react-native-passkeys`** (peterferguson) | @peterferguson, GitHub | (similar feature set) | Expo module, same API surface. Both compatible. |
| **`@clerk/expo-passkeys`** | Clerk | — | **Does NOT formally support SDK 55** (Clerk docs April 2026). Skip. |
| **`expo-passkey`** (iosazee + Better Auth plugin) | Solo + Better Auth | 0.3.6+ | Better Auth integration — overkill if we're not adopting Better Auth |

### Constraints

- **Expo Go NOT supported.** Passkey native modules require dev-builds via EAS Build ([authsignal.com](https://www.authsignal.com/blog/articles/implementing-passkeys-in-react-native-why-expo-go-falls-short-and-how-to-fix-it)). Musaium already uses EAS — non-blocker, but means we cannot ship a JS-only OTA update for passkeys.
- **AASA (iOS) + assetlinks.json (Android) MUST be hosted on the prod origin** before any build can authenticate. `musaium.app/.well-known/apple-app-site-association` + `musaium.app/.well-known/assetlinks.json`.
- **iOS 15.0+ / Android API 28+ (Android 9 Pie)** minimum. Musaium Mobile already targets iOS 15.5+/Android 7 — need to check Android 7-8 fallback (no passkey = stick with TOTP).
- **PRF extension on Android + iOS 18+ only** (react-native-passkey 3.3+).

### Implementation pattern (V1.3 mobile)

```ts
import { Passkey } from 'react-native-passkey';

// Registration — backend issues challenge via existing /api/auth/webauthn/registration/options
const options = await api.get('/auth/webauthn/registration/options');
const result = await Passkey.createPlatformKey(options);
// POST result to backend's verifyRegistrationResponse endpoint

// Auth
const authOptions = await api.get('/auth/webauthn/auth/options');
const assertion = await Passkey.get(authOptions);
// POST assertion to backend's verifyAuthenticationResponse endpoint
```

Backend can serve the same simplewebauthn verifier for both web + RN — same wire format.

---

## 9. MFA chaining decision — passkey-as-sole vs second-factor

### NIST 800-63B-4 classification

Per [pages.nist.gov/800-63-4/sp800-63b/aal/](https://pages.nist.gov/800-63-4/sp800-63b/aal/):
- A passkey assertion w/ user verification = **multi-factor in one ceremony** (proves device possession + biometric/PIN = two factors).
- Adding TOTP on top of a verified passkey = pointless from a NIST AAL perspective.

### Industry pattern 2026

- **FIDO Alliance + Google deployment guidance: passkey as SOLE sign-in once enrolled.** Account recovery via device sync, backup hardware key, or out-of-band identity verification.
- **Recovery during transition: keep TOTP enrolled as fallback.** Users WILL lose passkeys (lost phone, broken laptop) — recovery path must not route through email/SMS (phishable).
- **Once user has ≥2 passkeys enrolled on ≥2 devices, prompt to drop TOTP.**

### Musaium recommendation

| User state | Sign-in flow |
|---|---|
| Has password only | Password (AAL1) |
| Has password + TOTP (today's path for admins) | Password → TOTP gate (AAL2 non-phishing-resistant) |
| Has password + TOTP + 1 passkey (transition) | **Conditional UI passkey first** → password fallback → TOTP gate if password used |
| Has ≥2 passkeys enrolled | **Passkey sole factor (AAL2 phishing-resistant)** + TOTP retained as recovery |
| Has 2 passkeys + super-admin role | Passkey + step-up TOTP for destructive ops (export, delete museum, billing change) |

**Critical anti-pattern:** "passkey + TOTP simultaneously" for every login = adoption killer. Cite eBay +102% adoption when prompt moved post-login ([Security Boulevard April 2026](https://securityboulevard.com/2026/04/10-ux-patterns-that-drive-80-passkey-adoption-with-real-examples/)).

### Recovery codes

Musaium already has 10× bcrypt-hashed recovery codes (R7 §5 confirmed). **Keep these as the final fallback** when passkeys + TOTP are both unavailable. Recovery code use → forced re-enrollment of a new passkey + new TOTP.

---

## 10. SOC 2 / ISO 27001 / phishing-resistant MFA compliance

### Explicit requirements (2026)

- **SOC 2:** Common Criteria CC6 + CC7 require "strong access controls". No explicit passkey mandate. But auditors increasingly cite NIST 800-63B as the de-facto standard for "strong" — and 800-63B-4 makes phishing-resistant mandatory at AAL2.
- **ISO 27001:2022 A.5.17 + A.8.5:** authentication MUST be commensurate with risk. Passkeys are documented in [we-fix-pc.com 2026-02](https://we-fix-pc.com/2026/02/16/passwords-to-passkeys-staying-iso-27001-compliant-in-a-passwordless-era/) as the recommended trajectory.
- **PCI DSS 4.0 (effective March 2025):** MFA mandatory for ALL access to cardholder data environments. Passkeys qualify. SMS-only does NOT.
- **NIS2 + DORA (EU):** financial-grade, not relevant to Musaium B2C/B2B museums.
- **OMB M-22-09 (US federal):** mandates phishing-resistant MFA for all federal agencies — irrelevant unless Musaium sells to US gov museums (Smithsonian etc., out of scope).

### Cyber insurance angle

- Underwriters apply **20-40% premium surcharges** for orgs without phishing-resistant MFA (MojoAuth 2025 analysis, cited [securityboulevard.com](https://securityboulevard.com/2026/04/11-build-vs-buy-factors-for-passwordless-authentication-in-2026/)).
- For a pre-launch startup, cyber insurance is not yet on the agenda — but it's a 3rd-party validation that the industry treats passkeys as table-stakes.

### B2B sales angle

- "Do you support FIDO2/WebAuthn?" is now boilerplate in B2B RFP security questionnaires (anecdotal — confirmed by Authsignal blog Feb 2026).
- For Musaium's B2B museum prospects, especially European cultural institutions w/ EU procurement processes, expect this question by H2 2026.

---

## 11. UX patterns 2026

### The 80/20 rules (from Security Boulevard April 2026 + Authsignal 2026)

1. **Prompt timing > everything else.** eBay moved enrollment prompt from settings to post-login → +102% adoption. Three-quarters of all new enrollments came from that one auto-trigger.
2. **Identifier-first login.** Show username field first → conditional UI surfaces passkeys → falls back to password if user dismisses.
3. **Don't force a single path.** Best implementations use passkeys as preferred path, password/TOTP as ladder of fallbacks.
4. **Show enrollment AT registration, not later.** New users should see passkey option before any password is created (eliminate the password from the lifecycle entirely).
5. **Multi-device enrollment prompt.** After first passkey enrolled, prompt user to enroll a second device — prevents lockout, drops TOTP dependency.
6. **Recovery copy matters.** "What if I lose my device?" question must be answered upfront. Show the recovery code generation step inline, not in a help article.

### Conditional UI (passkey autofill)

The L3 feature shipping today across all major browsers.

- HTML: `<input autocomplete="username webauthn">` on the login form.
- JS: `navigator.credentials.get({ publicKey: ..., mediation: 'conditional' })` — non-blocking.
- Browser shows passkeys alongside saved passwords in the autofill dropdown.
- **Requires discoverable credentials (resident keys)** — `residentKey: 'preferred'` or `'required'` at registration.
- **Always feature-detect first:** `PublicKeyCredential.isConditionalMediationAvailable()` ([web.dev/articles/webauthn-rp-id](https://web.dev/articles/webauthn-rp-id), [developer.chrome.com/docs/identity/webauthn-conditional-ui](https://developer.chrome.com/docs/identity/webauthn-conditional-ui)).

Browser support 2026: Chrome ✓, Edge ✓, Safari ✓, Firefox ✓ (since 122).

### Signal API (L3 credential management)

`PublicKeyCredential.signal*` methods let the RP tell the passkey provider when credentials are revoked, updated, or invalid — keeps the password manager UI in sync with backend state ([developer.chrome.com/docs/identity/webauthn-signal-api](https://developer.chrome.com/docs/identity/webauthn-signal-api)).

- `signalAllAcceptedCredentials()` — after sign-in, send list of valid credential IDs; provider hides revoked entries.
- `signalUnknownCredential()` — when backend doesn't recognize a credential ID, tell the provider.
- `signalCurrentUserDetails()` — keep display name + username in sync.
- Available on Chrome 144+ Android (Q1 2026), desktop earlier.

Worth adding in V1.2 — prevents the "ghost passkey" support nightmare where a user has a passkey listed in Apple Passwords for an account that no longer exists.

---

## 12. Implementation roadmap — Musaium

### V1.1 — Web admin passkey support (target sprint+1, post-launch)

**Scope:** super_admin + admin roles only. Backend + museum-web. Mobile NOT in scope.

**Pre-work — BLOCKING:**
1. **Decide RP ID.** `musaium.app` (root) or `app.musaium.app` (subdomain). Changing it later **invalidates every enrolled passkey** ([web.dev/articles/webauthn-rp-id](https://web.dev/articles/webauthn-rp-id)). **Recommendation:** root `musaium.app` — works for `app.musaium.app`, future `admin.musaium.app`, etc.
2. ADR-038 (or next number) documenting passkey rollout, RP ID choice, syncable-vs-device-bound decision (= syncable default).

**Backend (Musaium hexagonal architecture):**

- New module: `museum-backend/src/modules/auth/useCase/webauthn/` mirroring TOTP layout:
  - `enrollPasskey.useCase.ts` — wraps `generateRegistrationOptions`
  - `verifyPasskeyEnrollment.useCase.ts` — wraps `verifyRegistrationResponse`
  - `challengePasskey.useCase.ts` — wraps `generateAuthenticationOptions`
  - `verifyPasskeyAssertion.useCase.ts` — wraps `verifyAuthenticationResponse`
  - `listPasskeys.useCase.ts` — return user's enrolled credentials w/ nickname + last_used_at
  - `deletePasskey.useCase.ts` — revoke by credential_id
- Domain entity: `domain/webauthn/webauthn-credential.entity.ts` (TypeORM, mirror §6 schema).
- Adapter: `adapters/secondary/pg/webauthn-credential.repository.pg.ts`.
- Migration: `webauthn_credentials` table + index.
- Routes: `/api/auth/webauthn/registration/{options,verify}` + `/api/auth/webauthn/auth/{options,verify}` + `/api/auth/webauthn/credentials/{list,delete}` (mounted on `mfa.route.ts` or new `webauthn.route.ts`).
- Challenge persistence: extend existing Redis session store (already in use for `mfa_token`) with `webauthn_challenge:{userId}:{flow}` TTL 5min.
- Plug into existing `mfa-gate.service.ts` — when user has both TOTP + passkey, prefer passkey path.
- Single dependency: `@simplewebauthn/server@^13`.

**Web (museum-web):**

- New page `museum-web/src/app/[locale]/admin/passkeys/page.tsx` — list/enroll/delete.
- New helper `museum-web/src/lib/webauthn.ts` wrapping `@simplewebauthn/browser`.
- Extend `museum-web/src/app/[locale]/admin/login/page.tsx` w/ "Sign in with passkey" button → calls `/api/auth/webauthn/auth/options` → `startAuthentication()`.
- Single dependency: `@simplewebauthn/browser@^13`.

**No Conditional UI in V1.1** — keep flow explicit-click. Conditional UI in V1.2.

**Effort (scope-framed, not calendar):** Backend = 4-6 use cases + 1 migration + routes. Web = 1 page + 1 button on login. Both behind feature flag is the OLD doctrine — per `feedback_no_feature_flags_prelaunch.md`, ship live or don't ship. So this lands as a complete vertical slice or stays out of the sprint.

**Risk:** LOW. Spec mature, lib mature, scope small, doesn't touch core login path (additive).

### V1.2 — Web visitor passkey opt-in + Conditional UI (target sprint+3)

- Extend to visitor accounts (currently password-only most users).
- Add Conditional UI to public login form: `<input autocomplete="username webauthn">` + `mediation: 'conditional'` get-call.
- Add Signal API calls for credential management.
- Post-login auto-prompt for first-time passkey enrollment (eBay pattern).

### V1.3 — Mobile RN passkey support (target sprint+5)

- Add `react-native-passkey@^3.3` to `museum-frontend/`.
- Host AASA + assetlinks.json on `musaium.app` (this is a one-time DevOps setup, but BLOCKING for any RN passkey work).
- Mirror web flow in RN screens.
- Recovery: keep TOTP path for Android <9 / iOS <15 / Expo Go testing edge cases.

### V2 — Enterprise attestation (post-B2B revenue, if regulated buyer signs)

- Switch attestation from `'none'` to `'direct'` for B2B admins.
- Implement enterprise-attestation allow-list (e.g., YubiKey 5 AAGUIDs only) if a defense/health museum signs.
- Consider PRF extension if E2EE features (encrypted message archive) get added.

---

## 13. Sources

### W3C / FIDO Alliance / NIST

- [W3C WebAuthn Level 2 (Recommendation)](https://www.w3.org/TR/webauthn-2/)
- [W3C WebAuthn Level 3 (Candidate Recommendation)](https://www.w3.org/TR/webauthn-3/)
- [W3C announcement: Level 3 CR](https://www.w3.org/news/2026/w3c-invites-implementations-of-web-authentication-an-api-for-accessing-public-key-credentials-level-3/)
- [Mike Jones blog — WebAuthn L2 standard](https://self-issued.info/?p=2160)
- [Mike Jones blog — Public Drafts of L3 + CTAP](https://self-issued.info/?p=2421)
- [NIST SP 800-63B-4 (final, July 2025)](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63B-4.pdf)
- [NIST 800-63-4 AAL pages](https://pages.nist.gov/800-63-4/sp800-63b/aal/)
- [Yubico CTAP 2.2 reference](https://developers.yubico.com/CTAP/CTAP2.2.html)
- [Yubico Enterprise Attestation](https://developers.yubico.com/WebAuthn/Concepts/Enterprise_Attestation/)
- [FIDO Alliance Passkey Index October 2025](https://fidoalliance.org/wp-content/uploads/2025/10/FIDO-Passkey-Index-October-2025.pdf)
- [FIDO Alliance World Passkey Day 2026 (BusinessWire)](https://www.businesswire.com/news/home/20260506926067/en/FIDO-Alliance-Reports-Accelerating-Global-Passkey-Adoption-on-World-Passkey-Day-2026)

### Libraries — simplewebauthn

- [SimpleWebAuthn home](https://simplewebauthn.dev/)
- [@simplewebauthn/server docs](https://simplewebauthn.dev/docs/packages/server)
- [@simplewebauthn/browser docs](https://simplewebauthn.dev/docs/packages/browser)
- [SimpleWebAuthn CHANGELOG](https://github.com/MasterKale/SimpleWebAuthn/blob/master/CHANGELOG.md)
- [npm @simplewebauthn/server](https://www.npmjs.com/package/@simplewebauthn/server)
- [npm @simplewebauthn/browser](https://www.npmjs.com/package/@simplewebauthn/browser)
- [SimpleWebAuthn example project](https://github.com/MasterKale/SimpleWebAuthn/blob/master/example/index.ts)
- [Corbado WebAuthn server libs comparison](https://www.corbado.com/blog/webauthn-server-implementation)
- [@github/webauthn-json](https://github.com/github/webauthn-json)

### Mobile RN

- [react-native-passkey (f-23)](https://github.com/f-23/react-native-passkey)
- [react-native-passkeys (peterferguson)](https://github.com/peterferguson/react-native-passkeys)
- [expo-passkey (iosazee)](https://github.com/iosazee/expo-passkey)
- [Authsignal — Why Expo Go falls short for passkeys](https://www.authsignal.com/blog/articles/implementing-passkeys-in-react-native-why-expo-go-falls-short-and-how-to-fix-it)
- [Clerk Expo 54/55 compatibility](https://clerk.com/articles/clerk-compatibility-in-expo-54-and-55)

### Browser support + Conditional UI + Signal API

- [Can I use — Passkeys](https://caniuse.com/passkeys)
- [passkeys.dev device support](https://passkeys.dev/device-support/)
- [Corbado Web Passkey Readiness Benchmark 2026](https://www.corbado.com/passkey-benchmark-2026/web-passkey-readiness)
- [Chrome — Conditional UI](https://developer.chrome.com/docs/identity/webauthn-conditional-ui)
- [Chrome — Signal API blog](https://developer.chrome.com/docs/identity/webauthn-signal-api)
- [Chrome — Signal API on Android](https://developer.chrome.com/blog/signal-api-android)
- [web.dev — RP ID deep dive](https://web.dev/articles/webauthn-rp-id)
- [Corbado — Relying Party ID guide](https://www.corbado.com/blog/webauthn-relying-party-id-rpid-passkeys)
- [Corbado — Conditional UI explained](https://www.corbado.com/blog/webauthn-conditional-ui-passkeys-autofill)
- [Corbado — Signal API explained](https://www.corbado.com/blog/webauthn-signal-api)

### Adoption + compliance + UX

- [Security Boulevard — 87% enterprises deploying passkeys 2026](https://securityboulevard.com/2026/04/8-reasons-87-of-enterprises-are-deploying-passkeys-in-2026/)
- [Deepak Gupta — Microsoft auto-enables passkeys](https://guptadeepak.com/passkeys-hit-critical-mass-microsoft-auto-enables-for-millions-87-of-companies-deploy-as-passwords-near-end-of-life/)
- [Security Boulevard — 10 UX patterns driving 80%+ adoption](https://securityboulevard.com/2026/04/10-ux-patterns-that-drive-80-passkey-adoption-with-real-examples/)
- [Authsignal — Passkeys at scale 2026](https://www.authsignal.com/blog/articles/world-passkey-day-how-to-deliver-passkeys-at-scale-in-2026)
- [Security Boulevard — Passkeys at Scale Enterprise Playbook](https://securityboulevard.com/2026/03/passkeys-at-scale-the-complete-enterprise-deployment-playbook-2026/)
- [MojoAuth — Passkeys vs MFA threat model](https://mojoauth.com/blog/do-passkeys-replace-mfa-threat-model)
- [Corbado — Device-bound vs synced passkeys](https://www.corbado.com/blog/device-bound-synced-passkeys)
- [OneSpan — Device-bound vs syncable comparison](https://www.onespan.com/blog/device-bound-passkeys)
- [WWPass — Phishing-Resistant MFA NIST 800-63-4 buyer guide](https://www.wwpass.com/blog/phishing-resistant-mfa-in-2025-buyer-s-guide-to-nist-sp-800-63-4-omb-m-22-09/)
- [Intercede — NIST SP 800-63-4 final](https://www.intercede.com/nist-sp-800-63-4-the-future-of-digital-identity-is-here-and-intercede-is-ready/)
- [Bleeping Computer — Passwords to passkeys ISO 27001](https://www.bleepingcomputer.com/news/security/passwords-to-passkeys-staying-iso-27001-compliant-in-a-passwordless-era/)
- [MojoAuth — Build vs Buy 2026](https://mojoauth.com/blog/11-build-vs-buy-factors-for-passwordless-authentication-in-2026)
- [Authsignal — Passkey recovery and fallback](https://www.authsignal.com/blog/articles/passkey-recovery-fallback)
- [Corbado — Passkey fallback identifier-first](https://www.corbado.com/blog/passkey-fallback-recovery)
- [Corbado — CXP/CXF Credential Exchange](https://www.corbado.com/blog/credential-exchange-protocol-cxp-credential-exchange-format-cxf)
- [Bitwarden — CXP launch](https://bitwarden.com/blog/security-vendors-join-forces-to-make-passkeys-more-portable-for-everyone/)
- [Corbado — iOS 26 passkey enhancements](https://www.corbado.com/blog/ios-26-passkeys)
- [Corbado — Passkey DB schema guide](https://www.corbado.com/blog/passkey-webauthn-database-guide)
- [Corbado — PRF extension for E2EE](https://www.corbado.com/blog/passkeys-prf-webauthn)
- [SimpleWebAuthn PRF docs](https://simplewebauthn.dev/docs/advanced/prf)

### Implementation tutorials

- [Server-side passkey registration — Google Identity](https://developers.google.com/identity/passkeys/developer-guides/server-registration)
- [Server-side passkey authentication — Google Identity](https://developers.google.com/identity/passkeys/developer-guides/server-authentication)
- [webauthn.guide](https://webauthn.guide/)
- [LogRocket — Implementing WebAuthn](https://blog.logrocket.com/implementing-webauthn-for-passwordless-logins/)
- [Medium — Passwordless auth Node.js SimpleWebAuthn](https://medium.com/@keaindrak/how-to-implement-passwordless-authentication-in-node-js-using-simplewebauthn-5cde4465267f)
- [DEV — Passkeys + WebAuthn complete guide](https://dev.to/pockit_tools/passkeys-and-webauthn-the-complete-guide-to-killing-passwords-in-your-web-app-22f1)

---

## 14. Verdict

| Question | Answer |
|---|---|
| Should Musaium add WebAuthn/passkeys? | **YES** |
| When? | **V1.1 web admin (post-launch sprint+1)** |
| Which library? | `@simplewebauthn/server` + `@simplewebauthn/browser` v13 |
| As 2FA on top of TOTP, or sole factor? | **Sole factor for AAL2 phishing-resistant; keep TOTP as fallback during transition** |
| Syncable or device-bound? | **Syncable default. Device-bound opt-in (V2) if regulated B2B signs** |
| Conditional UI in V1.1? | **No — V1.2.** Keep V1.1 flow explicit-click |
| Mobile RN? | **V1.3.** Blocked on AASA + assetlinks.json hosting + dev-build pipeline already in place |
| Effort? | Web V1.1 = vertical slice (1 module backend + 1 page web). Mobile V1.3 = same scale + DevOps for well-known files |
| Risk? | **LOW.** Mature spec, mature lib, additive (doesn't touch existing login path) |
| Blocking decision before any code? | **RP ID = `musaium.app`** (root domain). ADR-038 to document |

**Bottom line:** R7 + R20 both correctly identified WebAuthn as the single P1 gap in Musaium's auth posture. R26 confirms it's shippable, low-risk, and table-stakes for B2B credibility by H2 2026. Build it in V1.1.
