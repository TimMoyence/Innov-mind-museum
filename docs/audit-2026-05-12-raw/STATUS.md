# Audit 2026-05-12 RAW — STATUS tracker

> **Companion file** to `FINAL-REPORT.md`. The audit report stays **immutable as historical record** — closure tracking lives here.
>
> **Last update :** 2026-05-14 — Tim (/team run `2026-05-14-mobile-infra-hardening-batch` closed P0 #4 + #5 + #10 + #11 ; previously `2026-05-14-security-batch-p0-typeorm-sharp` closed P0 #2 + #3)
> **Scope :** 14 P0 launch blockers identifiés dans FINAL-REPORT §3.1 + Risk Heat Map §9.

## P0 closure status

| # | Finding | Statut | Date | Source / commit |
|---|---|---|---|---|
| 1 | iOS 26 / A18 Pro crash | ✅ **RESOLVED** | 2026-05-14 | Expo SDK upgrade tenté → downgrade vers version known-good. App fonctionnelle iOS 26.x. Instrumentation conservée jusqu'au 2026-06-15 bake (`AppDelegate.swift:93`, `IOS26_CRASH_DIAG.md`, ADR-004). Memory `project_ios26_crash_investigation` mise à jour. |
| 2 | TypeORM `.set({ undefined })` replayable tokens | ✅ **RESOLVED** | 2026-05-14 | /team run `2026-05-14-security-batch-p0-typeorm-sharp`. 3 sites patched (`consumeResetTokenAndUpdatePassword`, `consumeEmailChangeToken`, `updatePassword`) → `() => 'NULL'`. Unit tests updated (49/49 pass), 2 e2e replay regression tests added (`auth-reset-password.e2e.test.ts`, `auth-change-email.e2e.test.ts`), new ESLint rule `musaium-test-discipline/no-typeorm-set-undefined` blocks future regressions. Reviewer verdict APPROVED (weightedMean 92.6/100). |
| 3 | Sharp `limitInputPixels` DoS | ✅ **RESOLVED** | 2026-05-14 | /team run `2026-05-14-security-batch-p0-typeorm-sharp`. 6 sharp() sites in `image-processing.service.ts` (5) + `image-preprocess.ts` (1) now carry `{ limitInputPixels: 24_000_000, failOn: 'error' }` via shared `SHARP_DECODE_OPTIONS` constant. Unit tests added (oversize PNG → `ImageDecodeError`, normal JPEG → pass). |
| 4 | Cert pinning `PLACEHOLDER_SPKI_HASHES_TBD_PROD` | ✅ **RESOLVED** | 2026-05-14 | /team run `2026-05-14-mobile-infra-hardening-batch`. Hostname corrigé `api.musaium.app` → `musaium.com` (le placeholder pointait vers un domaine inexistant). SPKI réels capturés via openssl contre `musaium.com:443` : leaf `ZDRgYM8cmWD/…=` (LE, exp 2026-06-19) + intermediate `iFvwVyJSxnQdyaUvUERIf+…=` (LE E8, exp 2027-03-12, absorbe rotations LE 90 j). `EXPO_PUBLIC_CERT_PINNING_ENABLED=true` flippé dans `.env`, `.env.production.example`, `.env.preview.example`. Runbook 7-step + script `scripts/capture-spki.sh` ajoutés (`museum-frontend/docs/CERT_PINNING_RUNBOOK.md`). Tests intégration adaptés. Smoke device manuel à exécuter avant store-submission. |
| 5 | `chatSessionStore` plaintext AsyncStorage | ✅ **RESOLVED** | 2026-05-14 | /team run `2026-05-14-mobile-infra-hardening-batch`. Option (a) appliquée per audit R12 §8.4 : `persist` middleware retiré, store in-memory only. Cold-start chat re-hydrate via `useSessionLoader.ts:30` → `chatApi.getSession()` (acceptable online-first V1, +200-400ms). PII messages plus jamais sur disque plaintext. Eviction cap (10 sessions) préservée comme borne mémoire. Test mock AsyncStorage retiré ; tous tests passent (chatSessionStore 14/14, useSessionLoader, useChatSession). V1.1 path : encrypted-persister via expo-secure-store / encrypted MMKV si offline chat devient feature ask. |
| 6 | AiConsentModal AI provider non nommé (AI Act 5.1.2(i)) | 🔴 OPEN | — | Session 3 AppStore-Compliance |
| 7 | UIBackgroundModes mismatch | 🔴 OPEN | — | Session 3 AppStore-Compliance |
| 8 | StoreButton `href='#'` | 🔴 OPEN | — | Session 3 AppStore-Compliance |
| 9 | `admin/users/[id]` stub `---` | 🔴 OPEN | — | Session 5 Web-Admin |
| 10 | `expo-image` absent (10 sites `<Image>` RN) | ✅ **RESOLVED** | 2026-05-14 | /team run `2026-05-14-mobile-infra-hardening-batch`. `expo-image@55.0.10` installé via `npx expo install` (SDK 55 compat) + plugin déclaré dans `app.config.ts`. Codemod sur **7 sites réels** (audit overestimait à 10) : `ImageCompareCard`, `ImageCarousel`, `ChatInput`, `VisitSummaryModal`, `ImageSection`, `MuseumSheetEnrichmentBody` + `imageUploadOptimization.ts`. `resizeMode="cover"` → `contentFit="cover"` ; `recyclingKey` ajouté sur tous les sites en liste/recyclage FlashList ; `cachePolicy="memory-disk"` (memory pour preview locale) ; transition fade-in 150ms sur ImageCompareCard. `Image.getSize()` callback (RN) → `Image.loadAsync({ uri })` Promise (expo-image, retourne `ImageRef.{width,height}`) — l'API `Image.getMeta()` mentionnée dans le brief n'existe pas en SDK 55, `loadAsync` est l'équivalent canonique. Snapshot ImageCompareCard regénéré. Tests 2120/2120 ✅. |
| 11 | `android/sentry.properties:3 project=apple-ios` | ✅ **RESOLVED** | 2026-05-14 | /team run `2026-05-14-mobile-infra-hardening-batch`. `museum-frontend/android/sentry.properties:3` → `defaults.project=android`. Aligne avec `eas.json:44 SENTRY_PROJECT="android"` (canonical pour builds EAS Android). Fix bloque la fuite silencieuse de sourcemaps Android vers le projet Sentry iOS lors d'invocations `sentry-cli` hors-EAS (dev-menu source-map upload). |
| 12 | RTL Arabic broken (8+ left/right vs start/end) | 🔴 OPEN | — | Session 4 i18n-a11y-EAA |
| 13 | MFA page hard-coded English | 🔴 OPEN | — | Session 4 i18n-a11y-EAA |
| 14 | EAA non-conformant (€25k/an FR) | 🔴 OPEN | — | Session 4 i18n-a11y-EAA |

**Score :** 7/14 closed (iOS 26 + TypeORM replayable tokens + Sharp DoS + cert pinning + chatSession plaintext + expo-image migration + sentry Android project).
**Remaining :** 7 P0s à fermer avant 2026-05-31 GO/NO-GO checkpoint.

## Out-of-scope adjacents promus blocker pré-launch

| Item | Catégorie | Statut | Cible |
|---|---|---|---|
| EU CRA VDP (deadline 2026-09-11) | Compliance / disclosure | 🔴 OPEN | Session 6 Compliance-VDP — ship avant launch pour bake |
| Garak target Phi-3 PAS Musaium | AI safety verification | 🔴 OPEN | Session 7 AI-Safety-Verify |
| Stryker `99.75%` claim non vérifié | Test discipline | 🔴 OPEN | Session 7 AI-Safety-Verify |

## Lecture rapide

- **Avant chaque session /team** : relire la ligne correspondante + le détail file:line dans FINAL-REPORT §3.1 + le rapport forensique référencé (F-* dans `05-gaps/` ou R-* dans `04-research/`).
- **Au merge d'un fix** : éditer ce fichier (statut + date + commit/PR), pas FINAL-REPORT.
- **GO/NO-GO 2026-05-31** : tableau ci-dessus doit afficher 14/14 ✅.
