# Sprint Plan — 2026-05-05 → 2026-05-19

> **Type :** P1 closure + feature freeze rampe.
> **Window :** 2026-05-05 (Tuesday) → 2026-05-19 (Tuesday) — **14 jours**.
> **Position dans le sprint launch :** segment intermédiaire du sprint product `2026-05-03 → 2026-06-01` (cf. `docs/ROADMAP_PRODUCT.md`). Cette fenêtre clôt la dette P1 résiduelle et déclenche le feature-freeze ramp 12-day soak avant launch 2026-06-01.
> **Objectif unique :** entrer le **2026-05-19** en feature-freeze avec 0 P0/P1 ouvert, suite tests intégration verte et 48h soak staging propre.

---

## Contexte runtime — 3 worktrees parallèles

Sprint exécuté en parallèle sur 3 branches isolées (git worktree, même HEAD `fe5515bd`) :

| Worktree | Branch | Scope owner | ADR territory |
|---|---|---|---|
| `InnovMind-cleanup-be` | `cleanup/be` | backend P1 closure (audit-chain cron, LLM judge Redis, Cosign) | ADR-016, ADR-028 |
| `InnovMind-cleanup-fe` | `cleanup/fe` | mobile P1 closure (iOS crash diagnostics, F3 MuseumSheet, F5 noUncheckedIndexedAccess, F12 prebuild) | ADR-030, ADR-031 |
| `InnovMind-cleanup-web` | `cleanup/web` | web dette + version harmonization + ADR cleanup + roadmap consolidation | ADR-010, ADR-017, ADR-032+, ADR-033+ |

**Coordination :** les trois worktrees mergent indépendamment en `main`. Le worktree web (présent doc) ne touche **jamais** `museum-backend/`, `museum-frontend/`, `design-system/`, ni les ADR-016/028/030/031.

Pointeurs de status (à compléter au fil du sprint par chaque worktree) :

- **WT1 (be) :** `docs/adr/ADR-016-mobile-cert-pinning-deferred.md` + `docs/adr/ADR-028-module-composition-singletons-deferred.md`
- **WT2 (fe) :** `docs/adr/ADR-030-*.md` + `docs/adr/ADR-031-*.md` (à créer par WT2 si pertinent)
- **WT3 (web) :** ce doc + `docs/adr/ADR-032-typescript-monorepo-alignment.md` + `docs/adr/ADR-033-zod-3-4-status-quo.md`

---

## Objectifs P1 closure (must-ship avant 2026-05-19)

### 1. Cosign image signing audit (WT1)

- Vérifier signature Cosign présente sur dernières images backend GHCR.
- Renovate pin SHA validé sur tous les workflows GitHub Actions.
- Bloquant pour KR3 (stabilité supply-chain).

### 2. iOS 26 crash diagnostics (WT2)

- Cf. memoire projet `project_ios26_crash_investigation` : expo-updates fixé, React bridge init crash en attente diagnostics.
- Reproduction sur device A18 Pro avec capture symbolicated stacktrace.
- Décision : fix v1 vs hotfix post-launch documentée en ADR.

### 3. F3 — MuseumSheet finalize (WT2)

- Sheet bottom-sheet résultat sélection musée. UX validation 3 personae (curieux, expert, famille).
- Rattachement `ROADMAP_FE_RN_BEST_PRACTICES.md` F3 (à cocher au merge).

### 4. F5 — noUncheckedIndexedAccess (WT2)

- TS strict flag activé sur `museum-frontend/tsconfig.json`.
- Run typecheck full, fix sites d'accès indexés non-narrowed.

### 5. Cert pinning Phase 2 (WT1 + WT2 coupé)

- ADR-016 décision finalize : ship Phase 2 OU defer post-launch+30j.
- Si ship : implémentation côté `museum-frontend` SSL pinning + tests Maestro chaos cert-rotation.

### 6. Audit-chain cron (WT1)

- Job cron BE qui vérifie hash-chain integrity `audit_log` table tous les jours.
- Alerte Sentry si rupture détectée.

### 7. LLM judge Redis (WT1)

- Cache LLM-as-judge guardrail decisions (cf. ADR-015) backed Redis 7 — éviter re-eval coût.
- TTL 24h, key = sha256(prompt+response).

### 8. Web dette (WT3 — ce sprint)

- Split `museum-web/src/app/[locale]/page.tsx` 726 → ≤200 LOC.
- TS web 6.0 → 5.9.3 align monorepo (ADR-032).
- zod status-quo doc (ADR-033).
- ESLint 10 retry harmonize (ADR-010 update).
- ADR-017 MFA RN finalize (defer post-launch+30j default).

---

## Soak staging 48h — protocole

**Fenêtre :** 2026-05-17 22:00 UTC → 2026-05-19 22:00 UTC (avant feature freeze cut).

### Pré-requis

- Tous les P1 mergés sur `main` au plus tard 2026-05-17 18:00 UTC.
- Image backend `staging` taggée `v1.0.0-rc1` poussée GHCR.
- Mobile EAS preview build `1.0.0-rc1` distribué TestFlight + Play Internal.

### Suite synthétique (rolling 48h)

| Test | Cadence | Pass criteria |
|---|---|---|
| `pnpm smoke:api` (auth + chat + image upload + voice e2e) | toutes les 15 min | 100% pass, p99 chat < 5s |
| Maestro Android `auth` shard | toutes les 2h | 0 fail |
| Playwright admin flow (login + users + audit-logs + reports-moderation) | toutes les 4h | 0 fail |
| Lighthouse CI public landing FR/EN | toutes les 6h | perf ≥ 95, a11y ≥ 95 |
| Sentry crash-free rate (mobile + web) | live monitor | ≥ 99.5% |
| Langfuse p99 chat trace | live monitor | < 5s |
| Stryker hot-files mutation report | nightly | kill ratio ≥ 80% par fichier (cf. `.stryker-hot-files.json`) |

### Verdict

- **PASS soak** → feature freeze maintenu, release checklist déclenchée 2026-05-19.
- **FAIL ≥1 critère** → rollback rc1, hotfix dans la fenêtre, re-soak 24h additionnel (push launch +1 semaine si nécessaire — décision user).

---

## Feature freeze — 2026-05-19

À partir de 2026-05-19 22:00 UTC :

- **Aucun merge** en `main` sauf : hotfix P0, doc, test, CI infra.
- Branche `release/v1.0.0` cut depuis `main` HEAD.
- Toutes les nouvelles features / refactors → `next` branch (post-launch).
- Mobile : tag `v1.0.0` + EAS build production submission.
- Web : Docker image `web-v1.0.0` push GHCR + déploiement VPS staging-prod.

### Merge gate post-19

| Type | Allowed merge ? |
|---|---|
| P0 hotfix | ✅ via PR review express + 1 reviewer |
| P1 hotfix | ❌ → `next` branch |
| Doc / runbook update | ✅ |
| Test addition | ✅ (pas de coverage threshold drop) |
| CI workflow fix | ✅ |
| New feature / refactor | ❌ → `next` branch |

---

## Release checklist — déclenchement post-2026-05-19

Exécution complète de `docs/RELEASE_CHECKLIST.md`. Sections clés :

1. **Backend deploy prod** — image v1.0.0 + Sentry release + Trivy scan PASS + smoke prod e2e.
2. **Web deploy prod** — Docker push + VPS deploy + Lighthouse prod ≥ 95.
3. **Mobile store submit** — EAS submit iOS + Android, attente review (estimation 24-72h).
4. **Comms** — landing CTA `L4.2` activée, formulaire bêta ouvert.
5. **Monitoring** — dashboard Grafana SLO ouvert + on-call rotation activée (cf. `docs/SLO.md` + `docs/observability/`).
6. **Rollback plan** — Helm/Docker tag previous + DB migration revert script vérifié sur staging.

---

## Liens

- Roadmap produit : `docs/ROADMAP_PRODUCT.md` (NOW = sprint launch courant)
- Roadmap orchestrateur : `docs/ROADMAP_TEAM.md` (NOW = T1.x backlog)
- Mobile best-practices : `docs/ROADMAP_FE_RN_BEST_PRACTICES.md` (référencé par WT2 — créé par WT2 si absent)
- Release : `docs/RELEASE_CHECKLIST.md`
- Capacity : `docs/CAPACITY_PLAN.md`
- Chaos : `docs/CHAOS_RUNBOOKS.md`
- SLO : `docs/SLO.md`

---

## Audit trail

| Date | Auteur | Action |
|---|---|---|
| 2026-05-05 | /team standard (WT3) | Création initiale du plan, scope WT3 web |
