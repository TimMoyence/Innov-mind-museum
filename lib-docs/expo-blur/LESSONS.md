# Lessons — expo-blur

## 2026-05-20 — Android n'est PAS flouté par défaut + experimentalBlurMethod déprécié
- **Symptôme** : les GlassCard / tab bar "frosted glass" rendent un simple voile semi-transparent sur Android, pas un vrai flou gaussien comme iOS.
- **Cause** : `blurMethod` default = `'none'` (Android) → rendu semi-transparent, pas de blur. Le vrai blur exige `dimezisBlurView*` (coût perf). Toute la stack Musaium (`GlassCard.tsx`, `_layout.tsx:40`) repose sur ce fallback.
- **Fix** : ne pas concevoir la lisibilité/contraste autour d'un flou inexistant sur Android. Si vrai blur requis → `blurMethod="dimezisBlurViewSdk31Plus"` (fallback `none` <SDK31) + mesurer FPS sur device bas de gamme.
- **Anti-pattern à éviter** : utiliser `experimentalBlurMethod` — déprécié SDK 55 (alias `@hidden` de `blurMethod`, types.d.ts:54). Toujours `blurMethod`.
- **Ref** : `node_modules/expo-blur/build/BlurView.types.d.ts:14,20,52-65`. `shared/ui/GlassCard.tsx`.

## 2026-05-20 — borderRadius ne clippe pas le blur
- **Symptôme** : coins carrés visibles sur une GlassCard arrondie.
- **Cause** : `borderRadius` ne s'applique pas au blur sur iOS/Android.
- **Fix** : wrapper `overflow: 'hidden'` (GlassCard `styles.card` le fait déjà).
- **Anti-pattern à éviter** : nouvel usage `BlurView` arrondi sans `overflow:'hidden'`. Réutiliser `GlassCard` plutôt que raw BlurView.
- **Ref** : `shared/ui/GlassCard.tsx:36-42`.

## 2026-05-20 — ordering BlurView vs contenu dynamique
- **Symptôme** : le flou ne se rafraîchit pas au-dessus d'une FlatList/contenu animé.
- **Cause** : BlurView monté AVANT le contenu dynamique ne capte pas les updates.
- **Fix** : rendre BlurView APRÈS le contenu dynamique dans l'arbre.
- **Ref** : snapshot §Limitations.
