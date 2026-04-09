# Sprint 4 — Monetisation + Retention

> ⚠️ **STATUS**: NOT STARTED — planning doc only, 0 code.
>
> **Duree**: 2 semaines | **Priorite**: Post-traction | **Dependances**: S0 (free tier), S3 (walks)

## Goal

Implementer Free/Per-tour/Premium + Collection + Museum Passport.

## User Stories

| ID | Story | Critere d'acceptation |
|----|-------|----------------------|
| S4-01 | Comprendre free vs paid | UI pricing claire |
| S4-02 | Acheter un tour | IAP 3.99EUR debloque walk complet |
| S4-03 | S'abonner Premium | Mensuel 4.99EUR ou annuel 29.99EUR |
| S4-04 | Ma collection d'art | Galerie artworks sauves |
| S4-05 | Passeport musees | Tampon visuel par musee visite |

## Taches Techniques

### Monetisation (5j)
- [ ] `npx expo install react-native-purchases` (RevenueCat)
- [ ] Backend: `premiumStatus` sur User entity, webhook RevenueCat
- [ ] Frontend: `features/subscription/` module complet
- [ ] Configurer produits App Store Connect + Google Play Console
- [ ] Remplacer placeholder S0 par vrai paywall

### Retention (3j)
- [ ] Backend: table `collections` + CRUD endpoints
- [ ] Frontend: CollectionScreen + useCollection hook
- [ ] Museum Passport: grille tampons + animation
- [ ] i18n 8 langues

## Definition of Done
- [ ] IAP + subscription fonctionnels iOS/Android
- [ ] Paywall quand limite atteinte
- [ ] Collection + Passport visibles
- [ ] 10+ nouveaux tests | Build EAS (module natif)
