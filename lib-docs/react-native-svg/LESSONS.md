# Lessons — react-native-svg (declared ^15.13.0, resolved 15.15.4)

Audit 2026-05-18 : **PASS** (zero direct imports).

## ⚠️ F2 LOW : Version drift — lib-docs PATTERNS.md basé sur 15.13.0, resolved 15.15.4
- **Fix TD-SVG-01** : either re-fetch lib-docs to 15.15.4 (UFR-022 cache freshness >14j OR version drift) OR pin package.json to exact 15.13.0.

## ⚠️ F3 LOW : devDep redundant (only transitively used)
- Single consumer = `react-native-qrcode-svg@6.3.21` (transitive). Direct devDep on react-native-svg could be pruned.
- **Fix TD-SVG-02** : verify peerDep coverage, remove from package.json if safe.

## 2026-05-20

Re-audit (UFR-022 bundle refresh). Verdict: **PASS** (unchanged — zero direct imports).

- **Version drift (F2) confirmed widening**: declared `^15.13.0`, resolved **15.15.4**, latest published **15.15.5**. PATTERNS.md was written against 15.13.0 release notes. No breaking API change 15.13→15.15; RN<0.78 floor still satisfied (RN 0.83.6). No 15.x security advisory (Snyk: 15.15.4 = latest non-vulnerable). TD-SVG-01 still open but low urgency — API surface stable.
- **SvgXml/SvgUri untrusted-input note**: still ZERO usage. If ever introduced, treat raw SVG markup as hostile (web target = real DOM; remote SvgUri = SSRF/DoS surface). Encapsulated QRCode (`react-native-qrcode-svg`) feeds backend `otpauth://` URI, not free user input — safe.

## ✅ Zero direct primitive usage = zero PATTERNS deviations
- ZERO `Svg`/`Path`/`Circle`/`Rect`/`G`/`Defs`/`SvgUri` imports in app code
- Single consumer = `MfaEnrollScreen.tsx:13 QRCode from 'react-native-qrcode-svg'` (encapsulated)
