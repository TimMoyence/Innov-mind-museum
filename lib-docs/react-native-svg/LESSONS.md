# Lessons — react-native-svg (declared ^15.13.0, resolved 15.15.4)

Audit 2026-05-18 : **PASS** (zero direct imports).

## ⚠️ F2 LOW : Version drift — lib-docs PATTERNS.md basé sur 15.13.0, resolved 15.15.4
- **Fix TD-SVG-01** : either re-fetch lib-docs to 15.15.4 (UFR-022 cache freshness >14j OR version drift) OR pin package.json to exact 15.13.0.

## ⚠️ F3 LOW : devDep redundant (only transitively used)
- Single consumer = `react-native-qrcode-svg@6.3.21` (transitive). Direct devDep on react-native-svg could be pruned.
- **Fix TD-SVG-02** : verify peerDep coverage, remove from package.json if safe.

## ✅ Zero direct primitive usage = zero PATTERNS deviations
- ZERO `Svg`/`Path`/`Circle`/`Rect`/`G`/`Defs`/`SvgUri` imports in app code
- Single consumer = `MfaEnrollScreen.tsx:13 QRCode from 'react-native-qrcode-svg'` (encapsulated)
