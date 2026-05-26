# A13 — Audit lib-docs LESSONS.md
**Date** : 2026-05-26 | **Auditeur** : read-only, aucun commit

## Tableau des 98 entrées

| Lib | État | Confiance | Dans package.json ? Version index vs pkg | Action |
|-----|------|-----------|------------------------------------------|--------|
| @maplibre/maplibre-react-native | OK | HIGH | YES — 11.0.0 == 11.0.0 | — |
| @react-native-async-storage/async-storage | OK | HIGH | YES — 2.2.0 == 2.2.0 | — |
| @react-native-community/netinfo | OK | HIGH | YES — 11.5.2 == 11.5.2 | — |
| @react-navigation/native | OK | HIGH | YES — 7.0.14 ≈ ^7.0.14 | — |
| @ronradtke/react-native-markdown-display | OK | HIGH | YES — 8.1.0 ≈ ^8.1.0 | — |
| @sentry/nextjs | OK | HIGH | YES — 10.49.0 ≈ ^10.49.0 | — |
| @sentry/node | À MODIFIER | HIGH | YES — 10.49.0 ≈ ^10.49.0. F1 + F2 HIGH en début de fichier still read as open blockers, mais refresh 2026-05-20 clôt F2 (TD-SN-02 closed) et downgrade F1 → MEDIUM. Fichier autocontradictoire — le haut induit en erreur. | Supprimer ou barrer F1/F2 HIGH initial sections devenues caduques ; garder la rectification du bas |
| @sentry/react-native | OK | HIGH | YES — 8.9.1 ≈ ^8.9.1. F1 MAJOR en début, puis ✅ F1 closed explicitement (commit d06bfd54c + TD-SRN-01 archivé). Autocontradictoire mais résolu dans le fichier. | Barrer ou supprimer la section F1 initiale (propre) |
| @shopify/flash-list | OK | HIGH | YES — 2.0.2 == 2.0.2 | — |
| @tanstack/query-async-storage-persister | OK | HIGH | YES — 5.99.2 ≈ ^5.99.2. Contenu court mais substantiel. | — |
| @tanstack/react-query-persist-client | OK | HIGH | YES — 5.100.10 ≈ ^5.100.10 | — |
| @tanstack/react-query | OK | HIGH | YES — 5.100.10 ≈ ^5.100.10 | — |
| axios | OK | HIGH | YES — 1.16.0 ≈ ^1.16.0 | — |
| babel-preset-expo | OK | HIGH | YES — ~55.0.8 ≈ 55.0.8 | — |
| bcrypt | OK | HIGH | YES — 6.0.0 ≈ ^6.0.0 | — |
| bullmq | OK | HIGH | YES — 5.74.1 ≈ ^5.74.1 | — |
| compression | OK | HIGH | YES — 1.8.1 ≈ ^1.8.1. Note : couverte par express-middleware-thin umbrella. | — |
| cors | OK | HIGH | YES — 2.8.6 ≈ ^2.8.6. Couverte par express-middleware-thin umbrella. | — |
| dotenv | OK | HIGH | YES — 17.4.1 ≈ ^17.4.1. Couverte par express-middleware-thin umbrella. | — |
| expo | OK | HIGH | YES — 55.0.11 ≈ ^55.0.11 | — |
| expo-apple-authentication | OK | HIGH | YES — ~55.0.11 | — |
| expo-asset | OK | HIGH | YES — ~55.0.12 | — |
| expo-audio | OK | HIGH | YES — ^55.0.11 | — |
| expo-blur | OK | HIGH | YES — ~55.0.12 | — |
| expo-build-properties | OK | HIGH | YES — ~55.0.11 | — |
| expo-camera | OK | HIGH | YES — ~55.0.13 | — |
| expo-clipboard | OK | HIGH | YES — ~55.0.11 | — |
| expo-constants | OK | HIGH | YES — ~55.0.14 | — |
| expo-file-system | OK | HIGH | YES — ~55.0.14 | — |
| expo-font | OK | HIGH | YES — ~55.0.6 | — |
| expo-haptics | OK | HIGH | YES — ~55.0.12 | — |
| expo-image | OK | HIGH | YES — ~55.0.10 | — |
| expo-image-manipulator | OK | HIGH | YES — ~55.0.15 | — |
| expo-image-picker | OK | HIGH | YES — ~55.0.16 | — |
| expo-linear-gradient | OK | HIGH | YES — ~55.0.11 | — |
| expo-linking | OK | HIGH | YES — ~55.0.11 | — |
| expo-local-authentication | OK | HIGH | YES — ~55.0.13 | — |
| expo-localization | OK | HIGH | YES — ~55.0.13 | — |
| expo-location | OK | HIGH | YES — ~55.1.6 | — |
| expo-router | OK | HIGH | YES — ~55.0.10 | — |
| expo-screen-capture | À MODIFIER | HIGH | YES — ~55.0.14. LESSONS.md = pur placeholder ("No lessons recorded yet"). Or CLAUDE.md contient un gotcha critique sur usePreventScreenCapture vs impératif focusEffect. | Transcrire le gotcha CLAUDE.md dans LESSONS.md (usePreventScreenCapture release-on-unmount only, useFocusEffect pattern) |
| expo-secure-store | OK | HIGH | YES — ~55.0.11 | — |
| expo-speech | OK | HIGH | YES — ~55.0.11 | — |
| expo-splash-screen | OK | HIGH | YES — ~55.0.15 | — |
| expo-status-bar | OK | HIGH | YES — ~55.0.5 | — |
| expo-store-review | OK | HIGH | YES — ~55.0.13 | — |
| expo-system-ui | OK | HIGH | YES — ~55.0.15 | — |
| expo-updates | OK | HIGH | YES — ~55.0.18 | — |
| expo-vector-icons | OK | HIGH | Naming convention : répertoire `expo-vector-icons/` sans `@`, package.json a `@expo/vector-icons: ^15.0.3`. Alias intentionnel documenté dans LESSONS. Lib utilisée. | — |
| expo-web-browser | OK | HIGH | YES — ~55.0.15 | — |
| express-middleware-thin | OK | HIGH | Umbrella doc pour cors/compression/dotenv/reflect-metadata/p-limit — tous présents dans package.json. Aucun paquet npm `express-middleware-thin` n'existe, c'est un regroupement interne délibéré. | — |
| express | OK | HIGH | YES — 5.2.1 ≈ ^5.2.1 | — |
| framer-motion | À SUPPRIMER | HIGH | NON — `framer-motion` retiré, renommé `motion`. package.json a `motion: ^12.39.0`. LESSONS.md = stub "legacy alias — do not edit". Les leçons canoniques sont dans `motion/LESSONS.md`. Ce stub n'apporte rien. | Supprimer `lib-docs/framer-motion/` entier (stub legacy, lib retirée/renommée) |
| helmet | OK | HIGH | YES — 8.1.0 ≈ ^8.1.0 | — |
| i18next | OK | HIGH | YES — 26.0.6 ≈ ^26.0.6 | — |
| intl-pluralrules | OK | HIGH | YES — ^2.0.1 | — |
| ioredis | OK | HIGH | YES — 5.10.1 ≈ ^5.10.1 | — |
| js-sha256 | OK | HIGH | YES — 0.11.1 ≈ ^0.11.1 | — |
| jsonwebtoken | OK | HIGH | YES — 9.0.3 ≈ ^9.0.3 | — |
| langchain | OK | HIGH | Umbrella doc pour @langchain/core + @langchain/openai + @langchain/google-genai — tous présents. Leçons substantielles + refresh 2026-05-20. Quelques paths référencent `art-topic-classifier.ts` (renommé en `art-topic-guardrail.ts`) → stale paths mais leçons valides. | Paths stales dans les sites : `art-topic-classifier.ts` → `art-topic-guardrail.ts` |
| langfuse | OK | HIGH | YES — 3.38.20 ≈ ~3.38.20 | — |
| linkedom | OK | HIGH | YES — 0.18.12 ≈ ^0.18.12 | — |
| maplibre-gl | OK | HIGH | YES — 5.23.0 ≈ ^5.23.0 | — |
| motion | OK | HIGH | YES — 12.39.0 ≈ ^12.39.0. C'est le nouveau nom de framer-motion. | — |
| multer | OK | HIGH | YES — 2.1.1 == 2.1.1 | — |
| next | OK | HIGH | YES — 15.5.18 ≈ ^15.5.18 | — |
| onnxruntime-node | OK | HIGH | YES — 1.26.0 ≈ ^1.26.0 | — |
| opentelemetry | OK | HIGH | Umbrella doc pour @opentelemetry/* family — tous présents. Leçons substantielles + refresh 2026-05-20. | — |
| opossum | OK | HIGH | YES — 9.0.0 ≈ ^9.0.0 | — |
| otpauth | OK | HIGH | YES — 9.4.1 ≈ ^9.4.1 | — |
| p-limit | OK | HIGH | YES — ^3 ≈ ^3. Couverte par express-middleware-thin umbrella. | — |
| pg | OK | HIGH | YES — 8.20.0 == 8.20.0 | — |
| prom-client | OK | HIGH | YES — 15.1.3 ≈ ^15.1.3 | — |
| qrcode | OK | HIGH | YES — 1.5.4 ≈ ^1.5.4 | — |
| react | OK | HIGH | YES — 19.2.6 | — |
| react-dom | OK | HIGH | YES — 19.2.6 | — |
| react-hook-form | OK | HIGH | YES — 7.74.0 ≈ ^7.74.0 | — |
| react-i18next | OK | HIGH | YES — 17.0.4 ≈ ^17.0.4 | — |
| react-native | OK | HIGH | YES — 0.83.6 | — |
| react-native-gesture-handler | OK | HIGH | YES — 2.31.0 ≈ ~2.31.0 | — |
| react-native-qrcode-svg | À MODIFIER | MEDIUM | YES — index 6.3.21 vs pkg ^6.3.15 (minor drift). F1 HIGH (ecl="H") marqué open dans LESSONS.md mais TD-QR-01 archivé 2026-05-21 + code confirmé `ecl="H"` dans MfaEnrollScreen.tsx:127. F1 stale. | Barrer F1 ou ajouter "Résolu TD-QR-01 2026-05-21, ecl='H' confirmé" |
| react-native-reanimated | OK | HIGH | YES — 4.2.1 | — |
| react-native-safe-area-context | OK | HIGH | YES — 5.7.0 ≈ ~5.7.0 | — |
| react-native-screens | OK | HIGH | YES — 4.24.0 ≈ ~4.24.0 | — |
| react-native-ssl-public-key-pinning | OK | HIGH | YES — 1.2.6 ≈ ^1.2.6 | — |
| react-native-svg | OK | HIGH | YES — 15.13.0 ≈ ^15.13.0 | — |
| react-native-web | OK | HIGH | YES — 0.21.0 ≈ ^0.21.0 | — |
| react-native-webview | OK | HIGH | YES — 13.16.0 | — |
| react-native-worklets | OK | HIGH | YES — 0.7.4 | — |
| recharts | OK | HIGH | YES — 3.8.1 ≈ ^3.8.1 | — |
| reflect-metadata | OK | HIGH | YES — 0.2.2. Couverte par express-middleware-thin umbrella. | — |
| sharp | OK | HIGH | YES — index 0.34.5 vs pkg ^0.34.0 (patch drift seulement). | — |
| swagger-ui-express | OK | HIGH | YES — 5.0.1 ≈ ^5.0.1 | — |
| typeorm | OK | HIGH | YES — 0.3.28 | — |
| uuid | OK | HIGH | YES — index 11.1.1 vs pkg ^11.1.0 (patch drift seulement). | — |
| zod | OK | HIGH | YES — ^4.4.3 | — |
| zustand | OK | HIGH | YES — ^5.0.12 | — |

---

## Findings notables

### ORPHELINE confirmée (lib retirée/renommée)

**`lib-docs/framer-motion/LESSONS.md`** — `framer-motion` n'est plus dans aucun `package.json`. Le paquet a été renommé `motion` (mid-2025). `museum-web/package.json` utilise `motion: ^12.39.0`. Le stub LESSONS.md lui-même dit "legacy alias — do not edit". Les leçons canoniques sont dans `lib-docs/motion/LESSONS.md`. L'entrée entière `lib-docs/framer-motion/` est à supprimer.

### Placeholder sans contenu (lib utilisée, leçon vide)

**`lib-docs/expo-screen-capture/LESSONS.md`** — 6 lignes, `_No lessons recorded yet._`. Or CLAUDE.md §"Pièges connus" contient un gotcha critique et détaillé sur ce module : `usePreventScreenCapture()` ne release que sur unmount (piège sur `<Stack.Screen>` host persistent), pattern correct = `preventScreenCaptureAsync`/`allowScreenCaptureAsync` impératifs via `useFocusEffect`. Ce gotcha devrait être dans LESSONS.md, pas seulement dans CLAUDE.md.

### LESSONS.md autocontradictoires (HIGH → fermé dans le même fichier)

**`lib-docs/@sentry/node/LESSONS.md`** — F1 HIGH "BLOCKER pre-V1 TD-SN-01" et F2 HIGH "tracePropagationTargets MISSING TD-SN-02" en début. La section refresh 2026-05-20 en bas clôt F2 ("État 2026-05-20 : conforme, TD-SN-02 closed") et downgrade F1 → MEDIUM STALE-BY-DESIGN. Le haut du fichier induit en erreur un agent lisant en diagonale.

**`lib-docs/@sentry/react-native/LESSONS.md`** — F1 MAJOR "metro.config.js uses getDefaultConfig" en début. Section ultérieure "✅ F1 closed — commit d06bfd54c, TD-SRN-01 archivé 2026-05-21". Idem.

### Paths de fichiers stales (leçons valides, chemins obsolètes)

**`lib-docs/langchain/LESSONS.md`** — Plusieurs entrées citent `art-topic-classifier.ts` (ex. lignes 8, 15, 22). Le fichier a été renommé `art-topic-guardrail.ts` (`museum-backend/src/modules/chat/useCase/guardrail/art-topic-guardrail.ts` vérifié). Les leçons elles-mêmes restent valides.

**`lib-docs/express-middleware-thin/LESSONS.md`** — Cite `cors.config.ts:resolveCorsOrigin(...)` avec le commentaire path `cors.config.ts`. Le fichier est maintenant à `museum-backend/src/shared/http/cors.config.ts` (déplacé de `shared/config/`). La leçon est valide, le path est stale.

### react-native-qrcode-svg — F1 HIGH stale

**`lib-docs/react-native-qrcode-svg/LESSONS.md`** — F1 HIGH "ecl='M' au lieu de 'H'" toujours marqué open. TD-QR-01 archivé 2026-05-21, `ecl="H"` confirmé dans le code (`MfaEnrollScreen.tsx:127`). Leçon stale.

---

## Résumé

**88 OK / 4 À MODIFIER / 1 À SUPPRIMER** (sur 93 entrées uniques — 5 sont des "collections" virtuelles : `compression`, `cors`, `dotenv`, `p-limit`, `reflect-metadata` couvertes dans `express-middleware-thin`).

Note : sur les 98 fichiers LESSONS.md comptés par `git ls-files`, les entrées correspondent à 93 libs distinctes car `express-middleware-thin` couvre 5 sous-libs sans LESSONS.md séparées.

### ORPHELINE (1)
- `lib-docs/framer-motion/LESSONS.md` — lib renommée `motion`, stub à supprimer

### À MODIFIER (4)
- `lib-docs/expo-screen-capture/LESSONS.md` — placeholder vide, gotcha critique non transcrit depuis CLAUDE.md
- `lib-docs/@sentry/node/LESSONS.md` — F1/F2 HIGH stales en début (TD-SN-01 STALE-BY-DESIGN, TD-SN-02 closed) ; barrer les sections initiales ou les marquer ~~résolu~~
- `lib-docs/@sentry/react-native/LESSONS.md` — F1 MAJOR stale en début (TD-SRN-01 archivé 2026-05-21) ; barrer la section initiale
- `lib-docs/react-native-qrcode-svg/LESSONS.md` — F1 HIGH stale (TD-QR-01 archivé, ecl="H" confirmé)

### Paths stales à corriger si on passe dans ces fichiers (pas bloquant, leçons valides)
- `lib-docs/langchain/LESSONS.md` — `art-topic-classifier.ts` → `art-topic-guardrail.ts` (lignes 8, 15, 22)
- `lib-docs/express-middleware-thin/LESSONS.md` — `shared/config/cors.config.ts` → `shared/http/cors.config.ts`
