# Audit 2026-05-12 RAW — STATUS tracker

> **Companion file** to `FINAL-REPORT.md`. The audit report stays **immutable as historical record** — closure tracking lives here.
>
> **Last update :** 2026-05-14 — Tim
> **Scope :** 14 P0 launch blockers identifiés dans FINAL-REPORT §3.1 + Risk Heat Map §9.

## P0 closure status

| # | Finding | Statut | Date | Source / commit |
|---|---|---|---|---|
| 1 | iOS 26 / A18 Pro crash | ✅ **RESOLVED** | 2026-05-14 | Expo SDK upgrade tenté → downgrade vers version known-good. App fonctionnelle iOS 26.x. Instrumentation conservée jusqu'au 2026-06-15 bake (`AppDelegate.swift:93`, `IOS26_CRASH_DIAG.md`, ADR-004). Memory `project_ios26_crash_investigation` mise à jour. |
| 2 | TypeORM `.set({ undefined })` replayable tokens | 🔴 OPEN | — | Session 1 BE-Security |
| 3 | Sharp `limitInputPixels` DoS | 🔴 OPEN | — | Session 1 BE-Security |
| 4 | Cert pinning `PLACEHOLDER_SPKI_HASHES_TBD_PROD` | 🔴 OPEN | — | Session 2 Mobile-Infra |
| 5 | `chatSessionStore` plaintext AsyncStorage | 🔴 OPEN | — | Session 2 Mobile-Infra |
| 6 | AiConsentModal AI provider non nommé (AI Act 5.1.2(i)) | 🔴 OPEN | — | Session 3 AppStore-Compliance |
| 7 | UIBackgroundModes mismatch | 🔴 OPEN | — | Session 3 AppStore-Compliance |
| 8 | StoreButton `href='#'` | 🔴 OPEN | — | Session 3 AppStore-Compliance |
| 9 | `admin/users/[id]` stub `---` | 🔴 OPEN | — | Session 5 Web-Admin |
| 10 | `expo-image` absent (10 sites `<Image>` RN) | 🔴 OPEN | — | Session 2 Mobile-Infra |
| 11 | `android/sentry.properties:3 project=apple-ios` | 🔴 OPEN | — | Session 2 Mobile-Infra |
| 12 | RTL Arabic broken (8+ left/right vs start/end) | 🔴 OPEN | — | Session 4 i18n-a11y-EAA |
| 13 | MFA page hard-coded English | 🔴 OPEN | — | Session 4 i18n-a11y-EAA |
| 14 | EAA non-conformant (€25k/an FR) | 🔴 OPEN | — | Session 4 i18n-a11y-EAA |

**Score :** 1/14 closed (iOS 26).
**Remaining :** 13 P0s à fermer avant 2026-05-31 GO/NO-GO checkpoint.

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
