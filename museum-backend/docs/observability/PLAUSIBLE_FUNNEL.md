# Plausible funnel — operations runbook (Wave C5)

> Statut : actif depuis Wave C5 (2026-05-21). Outil : **Plausible Analytics** (D-C5 — cookieless, privacy-first, EU-hosted). Voir aussi `lib-docs/plausible/PATTERNS.md` pour les patterns code (FE/BE/web Musaium-specific).

## 1. Pourquoi Plausible (vs PostHog)

Décision D-C5 (`.claude/skills/team/team-state/2026-05-21-p0-feature-gates/decisions.md:5`) — Plausible retenu pour : (a) cookieless donc consent gate GDPR simplifié, (b) ~10× moins cher que PostHog cloud, (c) auto-hébergeable si besoin (AGPL backend), (d) volume d'events Musaium pré-launch reste très en-dessous des seuils où PostHog devient pertinent (cohortes/replays).

## 2. Goals à créer dans le dashboard Plausible

> **CRITIQUE** : Plausible ne fait PAS de backfill (`PATTERNS.md` §5 anti-pattern #9). Les Goals DOIVENT être créés AVANT que le code émetteur ne ship en prod, sinon les events sont perdus pour la rétention historique.

Les 4 Goals à créer (settings → Goals → "+ Add Goal" → Custom event) :

| Goal name (case-sensitive) | Émetteur | Site | Trigger code | Props clé |
|---|---|---|---|---|
| `paywall_modal_shown` | FE mobile | musaium app | `PaywallProvider.tsx:open()` | `tier` |
| `paywall_cta_clicked` | FE mobile | musaium app | `QuotaUpsellModal.tsx:onSubmit()` | `tier` |
| `paywall_email_captured` | FE mobile | musaium app | `QuotaUpsellModal.tsx:onSubmit() (post-202)` | `tier` |
| `quota_exceeded` | BE | musaium app | `monthly-session-quota.middleware.ts:tryConsume null branch` | `tier`, `limit` |

Le `domain` Plausible côté mobile = même site que le web (`musaium.com`) — Plausible n'a pas de concept d'app séparée ; on segmente via le préfixe `app://musaium/…` dans le champ `url` pour distinguer en dashboard.

## 3. Funnel visualisation

Dans Plausible → Funnels → "+ Add Funnel" → ordre :

1. `paywall_modal_shown` (entrée)
2. `paywall_cta_clicked`
3. `paywall_email_captured`

Et un funnel BE-seul pour observer le ratio attempt-vs-blocked :

1. `quota_exceeded` (entrée)
2. `paywall_modal_shown` (le client mobile doit afficher la modal dans la foulée — gap = bug FE)

Conversion-rate target : KR4 dashboard suit `paywall_email_captured / paywall_modal_shown ≥ 5%`.

## 4. Alerting + threshold

Plausible cloud n'a pas d'alerting natif fiable. Stratégie :

- **Smoke quotidien** : un sentinel CI (à ajouter post-launch) appelle `GET https://plausible.io/api/v1/stats/aggregate` (API token nécessaire) et fail si `paywall_modal_shown` est resté à 0 sur les dernières 24 h alors que le BE a émis ≥1 `quota_exceeded` (signal d'un FE qui n'instrumente plus).
- **Threshold dégradation** : conversion `paywall_email_captured / paywall_modal_shown` < 1 % sur 7 j roulants = alerte (probable régression UX modal).

## 5. Responsable rotation

Pré-launch (≤2026-06-07) : **Tim** (solo dev) supervise + ajuste les Goals.
Post-launch : à définir avec le 1er hire produit. Jusque-là le sentinel CI (§4) + un check hebdo manuel (`/recap`) suffisent.

## 6. Configuration env

| Var | Layer | Valeur | Notes |
|---|---|---|---|
| `PLAUSIBLE_DOMAIN` | BE | `musaium.com` (prod) / vide (dev) | Site Plausible enregistré. Vide → adapter no-op. |
| `PLAUSIBLE_ENDPOINT_URL` | BE | `https://plausible.io/api/event` (prod) / vide (dev) | Override si self-hosted. Vide → adapter no-op. |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Web | `musaium.com` (prod) / vide (dev) | Lu par `<PlausibleProvider>` dans `layout.tsx`. |
| `EXPO_PUBLIC_PLAUSIBLE_DOMAIN` | Mobile | `musaium.com` (prod) / vide (dev) | Lu par `shared/analytics/plausible.ts`. |
| `EXPO_PUBLIC_PLAUSIBLE_ENDPOINT_URL` | Mobile | `https://api.musaium.com/api/telemetry/funnel` (prod) | Optionnel — défaut composé via `EXPO_PUBLIC_API_BASE_URL`. |

Le mobile ne tape JAMAIS `plausible.io` directement : il passe par le BE proxy `/api/telemetry/funnel` (PATTERNS.md §3.3) — cert-pinning allowlist reste minimale + consent gate centralisé BE-side.

## 7. PII & GDPR

`lib-docs/plausible/PATTERNS.md` §4 + §5 anti-pattern #1 — les `props` ne portent JAMAIS d'email/userId/phone/fullName. Le `PlausibleAdapter` strip défensivement la liste canary (`email`, `userEmail`, `phone`, `phoneNumber`, `fullName`, `firstName`, `lastName`, `address`, `birthdate`, `dateOfBirth`). Idem côté FE dans `shared/analytics/plausible.ts`. Tout nouveau champ identifiant DOIT être ajouté à la canary list (PR review check-list).

Le consent gate FE (`useAnalyticsConsent()`) fail-closed : tant que l'utilisateur n'a pas explicitement opted-in (via la bannière paywall ou le futur écran Settings), `trackFunnelEvent()` short-circuit AVANT le fetch — 0 byte envoyé (R-C5b GDPR Art. 7).

## 8. Liens

- Lib-docs : `lib-docs/plausible/PATTERNS.md` (canonical reference).
- Plausible docs : https://plausible.io/docs/events-api
- Décision : `.claude/skills/team/team-state/2026-05-21-p0-feature-gates/decisions.md` §D-C5.
- Spec : `.claude/skills/team/team-state/2026-05-21-p0-feature-gates/spec.md` §R-C5 / §R-C5b.
