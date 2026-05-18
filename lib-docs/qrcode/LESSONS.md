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
