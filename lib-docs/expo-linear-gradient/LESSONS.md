# Lessons — expo-linear-gradient

## 2026-05-20 — colors depuis les tokens + typage as const + RTL
- **Symptôme** : (a) erreur TS sur `colors={someStringArray}` ; (b) gradient cassé en dark mode ; (c) gradient directionnel inversé en RTL.
- **Cause** : (a) `colors` est `readonly [ColorValue, ColorValue, ...]` ≥2, un `string[]` non figé échoue ; (b) couleurs hardcodées au lieu de `theme.pageGradient` ; (c) `start`/`end` ne sont PAS auto-mirrorés pour RTL.
- **Fix** : `colors={theme.pageGradient}` (déjà typé) ou littéral `as const` ≥2 couleurs. Gradient décoratif diagonal/vertical = aucun handling RTL. Gradient horizontal *porteur de sens* (progress L→R) = swap `start.x`/`end.x` via `I18nManager.isRTL`.
- **Anti-pattern à éviter** : inline-dupliquer la stack double-gradient de LiquidScreen ; animer `colors`/`locations` chaque frame (rebuild du paint natif) → animer l'opacity d'un layer statique.
- **Ref** : `shared/ui/LiquidScreen.tsx:58-74` (seul consommateur). CLAUDE.md § RTL discipline.

## 2026-05-20 — locations doit matcher colors en longueur
- **Symptôme** : stops de gradient indéfinis / rendu inattendu.
- **Cause** : `locations.length !== colors.length`.
- **Fix** : même longueur, valeurs 0..1 croissantes. Omettre `locations` = distribution uniforme.
- **Ref** : snapshot §Props. `dither` (Android, default true) laisse réduire le banding.
