# ADR-066 — Pointer-events routing convention for RN overlay containers with backdrop dismiss

**Status:** Accepted — implemented
**Date:** 2026-05-23
**Deciders:** /team run `2026-05-23-chat-composer-buttons-modal-dismiss` (architect + editor + reviewer fresh-context UFR-022)
**Implemented in:** commit `<placeholder>` (PR pending — `museum-frontend/features/chat/ui/bottom-sheet-router/BottomSheetContainer.tsx`, `BottomSheetBackdrop.tsx`)
**Related design:** [`team-state/2026-05-23-chat-composer-buttons-modal-dismiss/design.md`](../../.claude/skills/team/team-state/2026-05-23-chat-composer-buttons-modal-dismiss/design.md) §3 D1, §9 D1
**Lib-docs:** [`lib-docs/react-native/PATTERNS.md`](../../lib-docs/react-native/PATTERNS.md) §0 (Pressable canonical shape), §3 (Pressable vs Touchable)
**Audit context:** [`docs/chat-ux-refonte/specs/C4.md`](#) — superseded by [`ADR-055`](ADR-055-bottomsheet-router-state-machine.md)

---

## Context

Le `<BottomSheetRouter>` (ADR-055) compose **trois Views superposées** par-dessus l'écran hôte pour chaque route C4 :

1. **Outer wrapper** — `StyleSheet.absoluteFill`, porte `accessibilityViewIsModal=true` + `accessibilityRole="dialog"` (semantic scope du modal pour VoiceOver/TalkBack).
2. **Backdrop** (`<BottomSheetBackdrop>`) — frère/enfant du wrapper, semi-transparent, son `<Pressable>` dispatche `CLOSE` au reducer sur tap.
3. **Inner sheet slab** — `Animated.View` qui héberge le contenu animé de la route (`sheet`/`card`/`fullscreen`).

Bug rapporté V1-blocker (2026-05-23) : taper en-dehors du slab visible du `attachment-picker` ne ferme PAS la sheet, alors que :

- la route est correctement déclarée `blocking: false` ([`routes.ts:157-163`](../../museum-frontend/features/chat/ui/bottom-sheet-router/routes.ts)) ;
- le reducer dispatche bien `CLOSE` sur `handleBackdropPress` ([`bottomSheetMachine.ts`](../../museum-frontend/features/chat/ui/bottom-sheet-router/bottomSheetMachine.ts)) ;
- la même chaîne fonctionne pour `MuseumSheet` / `BiometricSetupSheet` / `SourceCitation`.

Investigation : le `Animated.View` wrap des présentations `sheet`/`card`/`fullscreen` héritait de `pointerEvents="auto"` (la valeur par défaut), combiné à un layout `StyleSheet.absoluteFill` qui couvre tout l'écran. Résultat : le wrap absorbe TOUS les taps avant que le `<Pressable>` du backdrop (rendu plus bas dans le tree) puisse les recevoir.

L'audit a confirmé que le bug touchait potentiellement les **6 routes non-bloquantes** partageant le `BottomSheetContainer` (`attachment-picker`, `browser`, `context-menu`, `summary`, `ai-disclosure`, `cartel-scanner`). Pas seulement `attachment-picker`.

### Alternatives examinées

| Option | Verdict |
|---|---|
| Re-render le backdrop **sibling-root** (frère du modal outer wrapper) | Rejetée — orphan le backdrop du scope `accessibilityViewIsModal`, dégrade VoiceOver. |
| Hack `zIndex` sur le slab pour passer SOUS le backdrop | Rejetée — Z-index ≠ paint-order historiquement fiable sur Android, fragile cross-platform. |
| Swap l'ordre `Animated.View` / wrap | Rejetée — le wrap doit porter la géométrie d'animation, swap casse l'entrance/exit. |
| **`pointerEvents="box-none"` sur les containers `absoluteFill`** | **Retenue (D1)** — minimal, RN-natif, conforme aux semantics documentées. |

---

## Decision

**Convention "pointer-events routing" pour tout overlay RN qui couvre l'écran avec un backdrop dismissable dessous + un slab interactif dessus.**

### Règle

Pour chaque View qui :

- (a) couvre l'écran (`StyleSheet.absoluteFill`, `flex: 1`, ou équivalent screen-covering), ET
- (b) sert UNIQUEMENT de container layout/animation (ne reçoit pas elle-même de tap), ET
- (c) a un sibling sensible aux taps (typiquement un `<BottomSheetBackdrop>` ou tap-zone arrière) :

→ DOIT porter `pointerEvents="box-none"`.

Le **slab visible interactif** (le contenu du sheet, du card, du fullscreen) — qui DOIT recevoir ses propres `<Pressable>` / `PanResponder` / form inputs — garde `pointerEvents="auto"` (le défaut).

### Sémantique RN (rappel)

| Valeur | Effet |
|---|---|
| `auto` (défaut) | View + enfants sont des hit-targets |
| `box-none` | View N'EST PAS un hit-target, ses enfants RESTENT hit-targets |
| `box-only` | View est un hit-target, ses enfants ne le sont PAS |
| `none` | Ni la View ni ses enfants ne sont hit-targets |

Notre cas : on veut "container transparent au tap, enfants opaques" = **`box-none`**.

### Prop vs style

Le repo utilise la **forme prop** (`<View pointerEvents="box-none">`) plutôt que la forme style (`style={{ pointerEvents: 'box-none' }}`). Convention conservée par cohérence avec l'existant (`BottomSheetContainer.tsx:291,305`, `bottom-sheet-router/`). RN 0.83 supporte les deux ; le prop est `@deprecated` mais fonctionnel et reste la convention dominante du codebase.

> Migration vers `style.pointerEvents` envisageable lors d'un sweep RN ≥ 0.85 — sans urgence (non-breaking aujourd'hui).

### Application immédiate

- `museum-frontend/features/chat/ui/bottom-sheet-router/BottomSheetContainer.tsx` :
  - outer `<View style={StyleSheet.absoluteFill}>` (a11y modal scope) → `pointerEvents="box-none"`
  - `Animated.View` wrap (`sheet`/`card`/`fullscreen` style) → `pointerEvents="box-none"`
  - inner `<View style={innerStyle}>` (le slab visible) → `pointerEvents="auto"` (défaut conservé explicite)
- Backdrop sibling (`<BottomSheetBackdrop>`) reçoit naturellement les taps non-absorbés par le slab.

### Convention "discrete dismiss label" (sous-décision)

Pendant le même run, on a constaté que `<BottomSheetBackdrop>` héritait du `accessibilityLabel` du sheet hôte → VoiceOver annonçait deux fois le titre du dialog (à l'open + en scrubbing sur le backdrop) sans semantic "fermer". Décision : le backdrop expose une prop `dismissLabel` distincte (i18n `a11y.bottomSheet.dismiss`) ; l'outer wrap garde l'announce label du sheet. Cette sous-règle est *pattern-générique* pour tout backdrop dismissable (et non spécifique à `BottomSheetRouter`).

---

## Consequences

### Quand appliquer

- Toute nouvelle modale / overlay RN qui :
  - couvre l'écran (`absoluteFill` ou équivalent), ET
  - a un backdrop tap-to-dismiss, ET
  - un slab visible avec des interactions internes (boutons, swipe, scroll).

Exemples futurs probables : `<DownloadProgressSheet>`, `<TutorialOverlay>`, `<MultiSelectMenu>`, toute future route C4 ajoutée à `BottomSheetRouter`, toute migration des Modal standalones existants vers un `BottomSheetRouter` étendu.

### Quand ne PAS appliquer

- **Centered card sans tap-to-dismiss** (ex `QuotaUpsellModal`, ADR-053 / `feedback_state_machine_react_key`) — pas de backdrop interactif, l'absorption des taps par le wrap est *souhaitée* (protège l'input form contre les drops). Backdrop reste un `<View>` non-Pressable.
- **Pinch-zoom / image viewer plein écran** (ex `ArtworkHeroModal`, `ImageFullscreenModal`) — la surface entière sert au pinch ; un tap ne doit PAS fermer (faux positif pendant pinch settling). Close affordance = bouton top-trailing + swipe-down + Android-back uniquement.
- **Slab `fullscreen` sans backdrop** (`browser` / `ai-disclosure` / `cartel-scanner` rendus en `fullscreen`) — pas de zone backdrop visible, mais on conserve quand même `box-none` sur le wrap pour homogénéité (le slab `auto` couvre déjà 100% de l'écran, donc no-op concret).
- **Toast / snackbar éphémère** — pas de backdrop, pas de dismiss-tap, hors scope de l'ADR.

### Effets de bord

- **Aucun** sur les routes blocking (`consent`, `voice-intro`, `daily-limit`) — leur backdrop tap est court-circuité dans le reducer (`bottomSheetMachine.ts:36-44`), donc le routing pointer-events est sans effet sur leur policy de dismiss.
- **PanResponder swipe-down** non affecté — le slab garde `pointerEvents="auto"`, le PanResponder y est attaché.
- **`accessibilityViewIsModal`** non affecté — la prop est sur le outer wrap, indépendamment des hit-tests.
- **Android hardware-back** non affecté — passe par `BackHandler`, hors hit-test chain.
- **Animations entrance/exit** non affectées — `useNativeDriver: true` sur les transforms n'a pas de dépendance au hit-test.

### Risques

- **Inversement, si un futur dev ajoute un container `absoluteFill` ENTRE le slab et le backdrop sans appliquer `box-none`, le bug réapparaît.** Mitigation : ce ADR est référencé dans `lib-docs/react-native/PATTERNS.md` (section pointer-events à ajouter en V1.1 — voir tech-debt `D-Composer-01` / `D-R6-01`) et dans le code source via commentaire au point de décision.
- **Tests de régression** : 4/6 routes non-bloquantes couvertes par `backdrop-dismiss.test.tsx` parametrize (`attachment-picker`, `browser`, `context-menu`, `summary`). Les 2 routes restantes (`ai-disclosure`, `cartel-scanner`) sont tracked tech-debt `TD-BACKDROP-DISMISS-R6` — extension 2-line dans une fresh red phase V1.1.

---

## Verification

- 7 nouvelles regression-guard tests par surface (audit spec §7, entries #10-16) garantissent que le contract `backdrop tap = onDismiss called` (ou explicitement non-Pressable pour `intentionally-no-backdrop-dismiss`) ne régresse pas.
- `blocking-non-regression.test.tsx` parametrize les 3 routes blocking (`consent`, `voice-intro`, `daily-limit`) pour garantir que le R5 fix ne casse PAS leur policy.
- `pre-complete-verify.sh` + `pnpm test` (314 suites, 3282 tests) PASS post-fix.

---

## References

- Spec — [`team-state/2026-05-23-chat-composer-buttons-modal-dismiss/spec.md`](../../.claude/skills/team/team-state/2026-05-23-chat-composer-buttons-modal-dismiss/spec.md) §3 R5/R6/R7/R12
- Design — `design.md` §3 root-cause note, §9 D1/D6
- Reviewer JSON (loop 2 APPROVED 89.9) — `.claude/skills/team/team-reports/2026-05-23-chat-composer-buttons-modal-dismiss/code-review-loop2.json`
- Lib-docs — [`lib-docs/react-native/PATTERNS.md`](../../lib-docs/react-native/PATTERNS.md) §0 (DO/DON'T) + §3 (Pressable canonical shape)
- Related — [ADR-055](ADR-055-bottomsheet-router-state-machine.md) (BottomSheetRouter state machine), [ADR-053](ADR-053-apple-5-1-2-i-granular-consent.md) (consent dismiss policy), CLAUDE.md *RN Modal persistent host state reset* gotcha.
