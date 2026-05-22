# Lessons — qrcode (v1.5.4)

Audit 2026-05-18 : **COMPLIANT**. Single site `museum-web/src/app/[locale]/admin/mfa/page.tsx:26`.

## ⚠️ F1 MEDIUM : `errorCorrectionLevel` omitted → defaults 'M' (15%) for admin 2FA TOTP
- Bumping à 'Q' ou 'H' = UX-resilience improvement (failed scan = enrollment restart).
- **Fix TD-QRW-01** : add `errorCorrectionLevel: 'H'` to `QRCode.toString({type:'svg',margin:1,width:220})`.

## ⚠️ F4 INFO : `margin: 1` below QR spec recommend ≥4
- Some strict scanners (older Authy, enterprise MDM) may fail to lock on.
- **Fix optional** : bump to margin:2 or 4 if support tickets emerge.

## ⚠️ F3 LOW : `.then(setQrSvg)` missing `.catch`
- Silent swallow on rare rejection → qrSvg stays null, role=img renders empty.
- **Fix** : add `.catch((e) => setError(...))`.

## ✅ Positives : toString({type:'svg'}) over toDataURL/toCanvas correct, @types/qrcode installed, no deprecated APIs.

## 2026-05-20 — re-audit (2 call sites, BE scope discovered)

Re-scan revealed qrcode is used in **two** apps, not one. Prior audit (2026-05-18) wrongly scoped it to museum-web only.

### Call sites
- `museum-web/src/app/[locale]/admin/mfa/page.tsx:26` — `QRCode.toString(otpauthUrl, { type:'svg', margin:1, width:220 })` (TOTP enrollment).
- `museum-backend/scripts/generate-qr-cartels.cjs:104` — `QRCode.toBuffer(deeplink, { type:'png', errorCorrectionLevel:'M', margin:1, width:240 })` (printed A4 cartel deeplinks).

### 🚨 F-MFA-01 HIGH (security/UX, web) : MFA QR omits `errorCorrectionLevel` → defaults `M` (15%)
- `admin/mfa/page.tsx:26` has no `errorCorrectionLevel`. The QR encodes a sensitive `otpauth://totp/...?secret=<base32>`. Default `M` minimises one-shot decode reliability; a failed scan forces the user to retype the 32-char base32 manualSecret.
- **Fix TD-QRW-01** : add `errorCorrectionLevel: 'H'` (otpauth ~80-150 chars, well within `H` Byte cap 1273). Bump `margin` to `>=2`.
- Same finding flagged 2026-05-18 (F1); still open as of this re-audit.

### ⚠️ F-MFA-02 MEDIUM (security hygiene, web) : raw secret in DOM via `dangerouslySetInnerHTML`
- The SVG (containing the TOTP secret) is injected with `dangerouslySetInnerHTML`. Acceptable (locally generated from a trusted backend URI, no user HTML), but it is secret material: must never be logged, persisted, sent to Sentry/analytics, or screenshot-captured. State is ephemeral in-component (good). Keep `toString({type:'svg'})` over `toDataURL` so the secret is not base64'd into an `<img src>`.

### ⚠️ F-CARTEL-01 LOW (UX-resilience, backend) : printed cartels use `errorCorrectionLevel:'M'`
- `generate-qr-cartels.cjs:104-109` renders to PRINTED A4 at `M` (15%). Printed QR can degrade (handling, sun, smudge). Doctrine for print = `Q`/`H`.
- **Fix optional TD-QRB-01** : bump to `H` for print durability. `margin:1` also below QR-spec quiet-zone ≥4; printed scan tolerances are looser so lower priority.
- Input is UUID-v4 validated (`validateRow`) before encoding — good (no injection into deeplink).

### ✅ Positives
- Both apps on `1.5.4` = latest stable (no upgrade due). No CVE for 1.5.4 (Snyk, 2026-05-21).
- `toBuffer({type:'png'})` correct server-only API choice for PDF embedding.
- `@types/qrcode ^1.5.5` present in museum-web; backend uses `.cjs` (no types needed).
- F3 (2026-05-18) `.then(setQrSvg)` missing `.catch` — still applicable, see PATTERNS §3 DO.
