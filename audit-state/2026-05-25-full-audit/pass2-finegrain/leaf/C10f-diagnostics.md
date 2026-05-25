# C10f — Feature `diagnostics` (FPS / MapLibre perf HUD)

Audit E2E léger, READ-ONLY, fresh-context (UFR-022). `dev` @ HEAD `1fb32f5ba`. Méthode : gitnexus + grep + read, claims cités path:line (UFR-013).

## Verdict

**WIRED-DEV-ONLY** — réellement consommé (MuseumMapView), correctement `__DEV__`-gaté aux 4 points de contact, aucune fuite, aucun risque sécu. Pas orphan, pas leak-risk.

## Surface

3 fichiers, ~175 LOC :
- `museum-frontend/features/diagnostics/perfStore.ts` — store module-singleton (get/subscribe/updateFps/markRenderStart/markRenderEnd/reset). Métriques = `{ fpsP50, fpsP5, lastRenderMs }` uniquement.
- `museum-frontend/features/diagnostics/useFpsMeter.ts` — hook rAF, ring buffer 60 frames, calcule P50/P5 FPS, publie au store.
- `museum-frontend/features/diagnostics/PerfOverlay.tsx` — HUD absolute top/end sur la carte, lit le store.

## Consommateur réel (non orphan)

Un seul consommateur applicatif : `features/museum/ui/MuseumMapView.tsx`
- import `PerfOverlay` (`MuseumMapView.tsx:15`) + `perfStore` (`:16`).
- `perfStore.markRenderStart()` — `MuseumMapView.tsx:163` (dans `if (__DEV__)` :162).
- `perfStore.markRenderEnd()` — `MuseumMapView.tsx:236` (`if (__DEV__)` inline).
- `<PerfOverlay />` rendu — `MuseumMapView.tsx:286` : `{__DEV__ ? <PerfOverlay /> : null}`.

Autres références = non-consommateurs :
- `app/(dev)/_layout.tsx:14` — simple commentaire doc qui *cite* PerfOverlay comme précédent du pattern `__DEV__`, pas un import.
- `__tests__/components/MuseumMapView.test.tsx:55-57` — mock `PerfOverlay: () => null`.

## Dev-only / atteignabilité prod

Défense en profondeur, 4 gates `__DEV__` indépendants :
1. Montage gaté côté consommateur : `MuseumMapView.tsx:286` (`{__DEV__ ? <PerfOverlay/> : null}`).
2. PerfOverlay self-gate render : `PerfOverlay.tsx:29` `if (!__DEV__) return null;`.
3. PerfOverlay self-gate subscription : `PerfOverlay.tsx:24-27` `useEffect` `if (!__DEV__) return undefined;` → pas d'abo store en release.
4. FPS meter gaté : `PerfOverlay.tsx:22` `useFpsMeter(__DEV__)` ; `useFpsMeter.ts:17` `if (!enabled) return;` → pas de boucle rAF en release.
5. Les marks store sont aussi gatés côté caller : `MuseumMapView.tsx:162,236`.

En release : `__DEV__` est une constante remplacée par `false` (`babel-preset-expo`, `babel.config.js:4`) → branches mortes éliminées au build → la View tree, la boucle rAF et l'abo store ne tournent jamais. Le store reste à `INITIAL_METRICS` (`perfStore.ts:12-18`) sans coût runtime (commentaire explicite `perfStore.ts:30-33`). Écran inatteignable en prod (overlay jamais monté ; aucune route dédiée).

## Fuite d'info (logs / écran prod)

Aucune.
- Pas de `console.*`, `logger`, `Sentry`, `reportError`, `captureMessage` dans `features/diagnostics/` (grep = NONE).
- Données exposées = uniquement nombres FPS et ms de rendu cluster (`perfStore.ts:1-8`). Aucun champ PII / token / GPS / secret (grep des noms sensibles = aucun hit dans le code, seul match = mot "Values" dans un commentaire).
- HUD `pointerEvents="none"` (`PerfOverlay.tsx:34`) → n'intercepte pas le touch même affiché.
- `accessibilityLabel` (`PerfOverlay.tsx:36`) annonce les mêmes FPS/ms — non sensible, et de toute façon non monté en prod.

## Risque sécu si exposé prod

Négligeable même en hypothèse d'exposition : la seule info divulguée serait des compteurs de performance graphique locaux (FPS/ms), sans valeur pour un attaquant et sans donnée utilisateur. Aucun appel réseau, aucune écriture persistante (store en mémoire, reset à l'unmount `useFpsMeter.ts:43-46`).

## Notes mineures (non bloquant)

- `useFpsMeter` est "safe to run in production but no consumer" par design (commentaire `useFpsMeter.ts:12-14`) : le gating est délégué au caller, qui le fait correctement. Défense correcte mais le contrat repose sur la discipline du caller — actuellement respecté.
- Conforme gotchas CLAUDE.md : props logiques RTL (`end: 8` `PerfOverlay.tsx:52` au lieu de `right`), pas d'emoji unicode, Ionicons/Text only.
