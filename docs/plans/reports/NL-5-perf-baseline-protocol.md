# NL-5 — Mobile Perf Baseline Protocol (P12 closure)

**Date** : 2026-04-17
**Sprint** : NL-5 Phase 3 finalization
**Purpose** : protocole reproductible pour mesurer la perf Musaium sur devices physiques (NL-2.1 / NL-2.5 Done When — bloqué par dépendance matérielle, ce doc débloque l'exécution future).

## Setup one-shot

### Devices cibles

| Device | Rôle | Specs |
|---|---|---|
| iPhone 12 (ou équivalent mid-range iOS) | Référence haut de gamme moyen | iOS 17+, A14, 4GB RAM |
| Pixel 6 entry / Galaxy A24 | Référence entry Android | Android 13+, 6GB RAM |

### Build à utiliser

```bash
cd museum-frontend
eas build --profile preview --platform all --non-interactive
```

**Preview build** (pas `development`) :
- Bundle minifié (proche prod)
- React Compiler actif
- Pas de dev tools embarqués = mesures fiables

### Outils de mesure

1. **RN Performance CLI** (inclus dans RN 0.83) — FPS, render time, commit time
2. **Xcode Instruments → Time Profiler + Allocations** pour iOS
3. **Android Studio Profiler → CPU + Memory** pour Android
4. **Flashlight.dev** (optional) — CI perf gating Android

---

## Scenarios de référence (fixtures reproductibles)

### Scenario A — Cold start

1. Kill app (force stop OS-level)
2. Launch app, chronomètrer jusqu'à premier écran interactif
3. Métriques : `cold_start_ms`, `time_to_interactive_ms`

**Target NL-5** :
- iPhone 12 : cold_start ≤ 1500ms
- Pixel 6 : cold_start ≤ 2200ms

### Scenario B — Chat scroll (50 / 100 / 200 messages)

Seed dataset `__tests__/fixtures/chat-stress-seed.json` (à générer, 200 messages alternant user/assistant).

1. Ouvrir une session seedée
2. Scroll continu (finger swipe) pendant 10 secondes
3. Métriques via RN DevTools Performance :
   - `fps_median`, `fps_p1` (worst 1%)
   - `frame_drops` (frames > 16.6ms)
   - `js_thread_busy_pct`

**Target NL-5** :
- fps_median ≥ 55 sur iPhone 12, ≥ 48 sur Pixel 6
- fps_p1 ≥ 40
- frame_drops ≤ 5% du total

### Scenario C — Transitions stack

1. Home → museum detail → retour → home (x5)
2. Métriques : `transition_median_ms`, `transition_p95_ms`

**Target NL-5** :
- transition_median ≤ 200ms
- transition_p95 ≤ 400ms

### Scenario D — Keyboard open on chat input

1. Ouvrir chat session, tap input
2. Mesurer jusqu'à layout stable
3. Métriques : `keyboard_layout_shift_ms`, `frame_drops_during_open`

**Target NL-5** :
- keyboard_layout_shift ≤ 300ms
- frame_drops_during_open = 0

### Scenario E — Memory peak pendant 5 minutes

1. Usage intensif (scroll chat, upload image, naviguer)
2. Relever heap max via Instruments / Android Profiler
3. Métrique : `memory_peak_mb`

**Target NL-5** :
- iPhone 12 : memory_peak ≤ 220 MB
- Pixel 6 : memory_peak ≤ 260 MB

---

## Format du rapport

`docs/plans/reports/NL-2.1-baseline.md` (ou `NL-2.5-after.md` après optimisations) :

```markdown
# Perf Baseline — <version tag> — <date>

Devices: iPhone 12 iOS 17.4 / Pixel 6 Android 14

| Scenario | Metric | iPhone 12 | Pixel 6 | Target | Status |
|---|---|---|---|---|---|
| A | cold_start_ms | … | … | 1500 / 2200 | ✅/❌ |
| B (100 msg) | fps_median | … | … | 55 / 48 | |
| B (100 msg) | frame_drops | … | … | ≤ 5% | |
| C | transition_median_ms | … | … | 200 | |
| D | keyboard_layout_shift_ms | … | … | 300 | |
| E | memory_peak_mb | … | … | 220 / 260 | |

Notes : <commit hash, EAS build id, React Compiler state>
```

---

## Optimizations disponibles si targets non atteints

Ordre de priorité (impact décroissant) :

1. **FlashList getItemType** sur listes mixtes → already applied on ChatMessageList + ticket-detail (NL-2 + NL-4)
2. **useCallback sur renderItem** → applied on MuseumDirectoryList (NL-5)
3. **Reanimated 3 migration** pour animations legacy Animated.Value si frame_drops concentrés pendant anims (4 fichiers candidats identifiés dans NL-2 audit)
4. **Image downsizing** pour liste museum (cover 600px max)
5. **Lazy load** routes non critiques via Expo Router dynamic imports
6. **Hermes Precompile** pour bundle size (RN 0.83 + Hermes 2.0)

## Variables de contrôle (à fixer pour comparabilité)

- LLM provider : `OPENAI` (gpt-4o-mini)
- Data Mode : `auto` puis `low-data` en second run
- Location : coordonnées fixes (Louvre 48.8606, 2.3376)
- Locale : `en` (puis `fr`, `ja`, `ar` pour RTL/CJK stress)
- Network : Wi-Fi 100 Mbps symétrique
- Pas de Developer Mode RN activé

---

## Exemples de commandes utiles

```bash
# iOS — run instruments from Xcode Cloud or local Xcode
xcrun xctrace record --template "Time Profiler" --launch -- /path/to/app

# Android — run systrace via adb
adb shell atrace --async_start -c -b 32768 gfx view wm am input res app
# ... run scenarios on device ...
adb shell atrace --async_stop > trace.txt

# RN DevTools performance (from dev menu in RN 0.83)
# Cmd+D → Performance → Start recording → run scenarios → Stop → export JSON
```

## Done When

- [ ] Baseline mesurée sur les 2 devices (commit/release tag référencé)
- [ ] Rapport `NL-2.1-baseline.md` ou `NL-2.5-after.md` produit
- [ ] Écarts identifiés vs targets
- [ ] Si écart : ticket Linear ouvert avec niveau (P0 régression, P1 optimisation)
