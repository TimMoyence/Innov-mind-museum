# NL-S6 · Home v2 refactor — rapport sprint

> Extrait de la roadmap `2026-04-18-challenge-roadmap` · Sprint S6 · Gate P0 · Effort 1.5 j → exécuté en 1 session.
> Commit : `07b613b8` — `refactor(mobile): Home v2 — 3 intent chips + hero gear + walk stub`.

## Avant / Après

| Métrique | Avant | Après | Δ |
|---|---|---|---|
| `home.tsx` LOC | 240 | 147 | **−39 %** |
| CTAs Home | FCM 3 actions + primary + 2 secondary = 6 | 3 chips + primary + gear icon = 5 | hiérarchie simplifiée |
| Composants réutilisés | FCM (superposé) | dédiés `HomeIntentChips` + `HeroSettingsButton` | clean archi |
| Tests Home | 8 cas | 13 cas | +5 cas |
| Total tests museum-frontend | 1133 | 1146 | +13 |

## Fichiers livrés

**Créés** :
- `museum-frontend/features/home/ui/HomeIntentChips.tsx` (134 L) — 3 chips verticaux vocal/camera/walk avec haptic + a11y.
- `museum-frontend/features/home/ui/HeroSettingsButton.tsx` (54 L) — gear icon top-right de la GlassCard hero, hit slop 44×44.
- `museum-frontend/app/(stack)/walk-composer.tsx` (112 L) — stub placeholder NL-5 avec back + "Coming soon".
- `museum-frontend/__tests__/components/HomeIntentChips.test.tsx` (42 L) — 5 cas (render, 3 dispatches, disabled).
- `museum-frontend/__tests__/screens/walk-composer.test.tsx` (30 L) — 2 cas (render + back navigation).

**Modifiés** :
- `museum-frontend/app/(tabs)/home.tsx` — rewrite layout : GlassCard(hero + gear) → DailyArtCard → HomeIntentChips → primary CTA.
- `museum-frontend/features/chat/application/useStartConversation.ts` — extension `'walk'` intent (pure navigation vers `/(stack)/walk-composer`, pas de session).
- `museum-frontend/__tests__/screens/home.test.tsx` — +5 cas (gear, 3 chips, walk), −2 cas (onboarding button, FCM testID).
- `museum-frontend/shared/locales/{ar,de,en,es,fr,it,ja,zh}/translation.json` — 8 fichiers synchronisés : ajout `home.chips.*` + `a11y.home.settings_gear` + `walkComposer.*` ; suppression `home.menu/messages/onboarding` + `a11y.home.{onboarding,settings}`.

**Non touché (volontairement)** :
- `museum-frontend/shared/ui/FloatingContextMenu.tsx` — composant inchangé, utilisé par 15 autres écrans (support, conversations, preferences, settings, terms, privacy, guided-museum-mode, discover, auth, etc.).

## Décisions UX retenues

| # | Décision | Justification |
|---|----------|---------------|
| 1 | Chips en **colonne verticale** (pas row) | Lisibilité mobile, scannable, 1 intention par ligne |
| 2 | Icônes Ionicons (pas PNG custom) | Cohérence avec FCM, assets PNG dédiés en backlog design |
| 3 | Primary `Start conversation` **conservé** | Parcours libre / texte préservé, chips = raccourcis pré-ciblés |
| 4 | `Revoir onboarding` **supprimé** | Rarement re-joué en prod (feedback utilisateur) |
| 5 | `Paramètres` **déplacé en gear icon** hero top-right | Tab/menu global sans ajouter un 4ᵉ onglet |
| 6 | Chips placés **sous DailyArtCard** | Logique produit : voir l'artwork → agir |
| 7 | Chip C `walk` → **nouveau stub `/(stack)/walk-composer`** | Prépare S7-8 NL-10/11 Walk Core ; guided-museum-mode gardé pour intention museum spécifique |

## Gates

| Gate | Cible | Résultat |
|------|-------|----------|
| ESLint | 0 error | **PASS** (0 error sur le scope) |
| TypeScript | 0 error sur scope | **PASS** (les 4 erreurs restantes appartiennent au travail parallèle `features/onboarding/` — pré-existantes, hors scope S6) |
| Jest | `tests ≥ baseline` | **PASS** 1146 tests (+13 vs baseline) |
| pre-commit hook | prettier + eslint-fix | **PASS** |
| Ratchet | `≥ baseline` | **PASS** |
| Couverture i18n 8 langues | 100 % | **PASS** (script `update_locales.py` ciblé) |
| GitNexus post-commit | re-index | hook déclenché automatiquement post-commit |

## Code review Tech Lead — 2× challenge

**Round 1 (pre-test)** :
- Arch `features/home/ui/` cohérente (nouveau bounded context, alignement DDD).
- Tokens vérifiés (`space['9']`, `space['10']`, `space['14']` existent).
- Haptique / i18n / testIDs conformes aux patterns des composants voisins.

**Round 2 (pre-commit)** :
- KISS : `home.tsx` passe de 240 → 147 L, composants < 135 L chacun.
- DRY : tableau `chips` unique, `INTENT_MAP` constant pour traduire chip-intent → conversation-intent.
- Clean archi : UI pure sans logique métier ; navigation centralisée dans `useStartConversation` ; stub walk-composer isolé.
- Dead code : 100 % nettoyé (state `menuStatus`, imports obsolètes, keys i18n orphelines, tests anciens).

## Hors-scope (référence)

- PNG assets dédiés pour chips (livrable designer, backlog).
- Refactor du FCM composant (resterait cross-écrans).
- Intégration walk réelle (géofence, tour mode, carte) → S7-8 NL-10/11.
- Ports des 15 autres écrans vers un autre pattern.

## Prochaines étapes

- S7 : NL-5 Walking Guide V1 (MapLibre + Tour Mode + headphones) — le stub `walk-composer.tsx` sera remplacé par l'UI réelle.
- Backlog design : PNG icons custom pour les 3 chips si livrables.
