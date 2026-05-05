# Roadmap FE / RN Best Practices — Musaium

> **Vivante.** Réécrite à chaque sprint. Snapshots précédents = git history.
> **Sprint courant :** 2026-05-03 → 2026-06-01 (launch sprint).
> **Owner principal :** WT2 (`InnovMind-cleanup-fe`, branche `cleanup/fe`). WT3 (web) tient cette doc à jour côté roadmap mais ne touche pas `museum-frontend/**`.
> **Horizon :** 1 mois NOW + 1 trimestre NEXT/LATER.

---

## North Star

**`museum-frontend/` = experience visiteur balade culturelle, voice-first, off-line capable.**

Référence transverse : `museum-frontend/docs/QUALITY_GUIDE.md` (qualité runtime + tests), `museum-frontend/docs/ARCHITECTURE_MAP.md` (dossiers + patterns), `museum-frontend/docs/NEXT_LEVEL_MOBILE_PRODUCTION_AND_TEST.md` (release engineering).

---

## NOW — Sprint launch (2026-05-03 → 2026-06-01)

> Coche `[x]` au merge dans `main`. WT3 met à jour cette doc en fin de cycle ; les items « `[ ] in WT2` » sont la file d'attente WT2 — soft sync, attente du merge avant cocher.

### F1 — Typed routes Expo Router 5

- [x] Génération `.expo/types/router.d.ts` activée (`experiments.typedRoutes: true`) — shipped commit `4053872f` (RN 0.83.6 bump) + `fe5515bd` (apiConfig cast cleanup, tsconfig include `.expo/types`).
- [x] `apiConfig` cast cleanup landed sur main.

### F2 — Sentry RN 8.9.1 wiring

- [x] Cf. `docs/adr/ADR-027-sentry-rn-8.9.1-shipped.md`.

### F3 — MuseumSheet bottom-sheet — finalize

- [ ] **in WT2 (cleanup/fe)** — `museum-frontend/features/museum/components/MuseumSheet.tsx` UX validation 3 personae, animation de pull-to-dismiss, a11y screen-reader labels FR + EN. Soft sync : WT3 cochera ici au merge WT2 sur `main`.

### F4 — Hermes V1 (~~NOW~~ → LATER)

- ~~[ ] Switch `museum-frontend/ios/Podfile` à `:hermes_enabled => true` + `buildReactNativeFromSource` pour expérimenter cold-start gain~~
- **DEMOTE 2026-05-05 → LATER** : `buildReactNativeFromSource` cost prohibitif pre-launch (≈ 8-12 min added per iOS Archive sur Xcode Cloud, déstabilise EXUpdates phase déjà sensible cf. `reference_expo_updates_entry_file`). Re-prio post-launch après baseline cold-start mesurable (Langfuse mobile spans + Sentry app-start metric).

### F5 — `noUncheckedIndexedAccess` strict flag

- [ ] **in WT2 (cleanup/fe)** — activer `compilerOptions.noUncheckedIndexedAccess: true` dans `museum-frontend/tsconfig.json` + fix sites d'accès indexé non-narrowed. Soft sync attendu WT2 merge.

### F6 — i18n FR + EN parity

- [x] Sentinelle `museum-frontend/.maestro/maestro-shard-manifest.mjs` couverte par `ci-cd-mobile.yml` quality job.
- [x] Pas de string hardcodée — convention `useTranslation()` + dict cohérent FR/EN.

### F7 — Maestro E2E couverture P1

- [x] 11 flows + sharding 4 voies PR (cf. CLAUDE.md §Maestro). iOS nightly cron ok.

### F8 — Test factories DRY

- [x] Convention `museum-frontend/__tests__/helpers/factories/<entity>.factories.ts` enforced via `eslint-plugin-musaium-test-discipline` (cf. CLAUDE.md §Test Discipline).

### F9 — ESLint flat config + plugin discipline

- [x] Cf. `docs/adr/ADR-010-eslint-10-harmonize-deferred.md` — mobile reste sur `eslint ^9.39.4` jusqu'à compat upstream `eslint-plugin-react`.

### F10 — Renovate + GHA SHA pinning

- [x] Cf. `docs/GITHUB_ACTIONS_SHA_PINS.md` + `renovate.json`.

### F11 — Coverage uplift Phase 9 thresholds

- [x] Thresholds 91 / 78 / 80 / 91 enforced (cf. CLAUDE.md §Coverage uplift gates).

### F12 — Expo prebuild + Pods committed

- [ ] **in WT2 (cleanup/fe)** — finalize prebuild + `Pods/` committed flow + Podfile `fmt` consteval patch re-applied (cf. `feedback_ios_pods_xcloud` + `reference_podfile_fmt_patch`). Soft sync attendu WT2 merge.

---

## NEXT — Post-launch (juin–juillet)

### F4 (re-prio) — Hermes V1

- [ ] Mesurer baseline cold-start sur 100 sessions post-launch (Langfuse `app.start.duration` p50/p95/p99).
- [ ] Si p95 > 2.5s sur iOS A18 Pro → décider Hermes via `buildReactNativeFromSource`.
- [ ] Si p95 ≤ 2.5s → demote LATER, capacité dev redirigée Recommendations.

### Voice WebRTC V1.1 (cf. ROADMAP_PRODUCT.md NEXT)

- [ ] Décision conditionnée sur KR2 NPS-voice — voir `docs/ROADMAP_PRODUCT.md` NEXT.

### MFA RN wire (post-launch + 30j)

- [ ] Cf. `docs/adr/ADR-017-mfa-rn-wire-deferred.md` — finalisé 2026-05-05, trigger 4-point checklist post-launch.

### Cert pinning Phase 2

- [ ] Cf. `docs/adr/ADR-016-mobile-cert-pinning-deferred.md` (status owned by WT1/WT2, à re-évaluer début juillet).

---

## LATER — Q3+ 2026

- Offline pack musée DL avant visite (cf. ROADMAP_PRODUCT LATER).
- Multi-langue extended (IT, ES, DE, JP, AR — cf. ROADMAP_PRODUCT LATER).
- Realtime social — visiteurs même musée chat groupe.
- Push notifs musée → visiteurs abonnés (cf. ROADMAP_PRODUCT NEXT admin enrichi, frontend wire when BE shipped).

---

## KILLED (ne pas redécider)

| Item | Date kill | Raison |
|---|---|---|
| SSE streaming chat client | 2026-04 | Cf. `docs/adr/ADR-001-sse-streaming-deprecated.md` (archived). Replaced by sync chat. |
| OTA via expo-updates | (ADR-009) | Cf. `docs/adr/ADR-009-ota-disabled.md`. Chemin Expo store-submission only. |

---

## Coordination

WT3 (web) tient ce fichier à jour côté **statut + decision + roadmap** ; WT2 (museum-frontend) **exécute** F3/F5/F12 et merge dans `main`. Soft-sync : un item « `[ ] in WT2` » bascule à `[x]` quand WT2 merge dans `main` sur la même semaine.

Coordination des 3 worktrees : cf. `docs/SPRINT_2026-05-05_PLAN.md`.
