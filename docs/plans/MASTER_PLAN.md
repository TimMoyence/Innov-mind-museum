# Audit Sécurité & Qualité Musaium — Plan Enterprise-Grade

> **Imported into repo 2026-04-21** (previously hosted out-of-repo at `~/.claude/plans/generic-squishing-manatee.md` — dependency made fragile, re-homed for version control and audit traceability).

**Date** : 2026-04-20 · **Scope** : monorepo InnovMind (backend + frontend + web + design-system) · **Mode** : lecture seule, critique honnête

## Context

Audit demandé après plusieurs jours d'amélioration qualité/tests/sécurité/features. Objectif : état de vérité, pas de guess, pas d'embellissement, détecter dette tech, doublons, features zombies, et tracer le chemin vers un niveau **enterprise-grade**. Sources : 3 agents Explore en parallèle + GitNexus (5912 symbols, 15222 relations, 300 flows) + 3 WebSearch de confirmation.

---

## 1. État Brut (cross-validé)

| Axe | Score | Vérité |
|---|---|---|
| Architecture backend (hexagonal) | **8.5/10** | Respecté, 0 violation structurelle, wiring propre via barrels |
| Code quality | **7/10** | tsc PASS, `as-any=0` baseline, 76 eslint-disable (tous justifiés CLAUDE.md) |
| Tests | **6.5/10** | 2402-2717 tests, 88% statements **pile sur le seuil** — aucune marge |
| Dependencies | **8/10** | Pas de vulns connues, mais TypeORM EOL à 6 mois |
| Docs | **4/10** | **Bloated** — 352 KB V1_Sprint + 556 KB superpowers + 280 KB plans/ + 152 KB archive obsolète |
| Frontend lifecycle | **7/10** | 3 leaks potentiels identifiés (SSE timer, useTextToSpeech, MemoryCache GC) |
| Enterprise-readiness | **CONDITIONAL PASS** | Core solide, routing monolithes + contract tests maigres + TypeORM unmitigated |

## 2. Les 14 Checks Demandés — Matrice Features

| Feature | TODO | Branché HTTP | Tests unit | Tests E2E | Entity DB | Migration | Verdict |
|---|---|---|---|---|---|---|---|
| Auth (14 endpoints) | — | ✓ | ✓ | ✓ | ✓ | ✓ | **PROD** |
| Chat texte | — | ✓ | ✓ | ✓ | ✓ | ✓ | **PROD** |
| Chat voice V1 (STT+TTS) | — | ✓ | ✓ (mocks) | ✓ | ✓ (audioUrl) | ✓ 1776593841594 | **PROD** |
| Museum directory + geo | — | ✓ | ✓ | ✓ | ✓ | ✓ | **PROD** |
| Daily-Art | — | ✓ | ✓ | N/A | ✗ (static) | N/A | **STUB (by design)** |
| Review + modération | — | ✓ | ✓ | ✓ | ✓ | ✓ | **PROD** |
| Support (tickets) | — | ✓ | ✓ | ✓ | ✓ | ✓ | **PROD** |
| Admin dashboard + RBAC | — | ✓ | ✓ | ✓ | ✓ | ✓ | **PROD** |
| Knowledge-extraction (BullMQ) | — | ✓ | ✓ | ✓ | ✓ | ✓ | **PARTIEL** (worker isolé manque) |
| Onboarding mobile | — | ✓ | ✓ | ✓ | — | — | **PROD** |
| Daily-Art saved | — | ✓ | ✓ | ✓ | ✓ | ✓ | **PROD** |

**Conclusion** : **0 feature zombie**. Toutes branchées. Feature flags voice V1 proprement retirés. SSE deprecated mais actif sous ADR-001 (justifié tant que mobile < v1.1).

## 3. Findings Critiques (cross-validés par ≥2 agents ou websearch)

### CRITIQUES
- **SEV:CRITICAL — iPhone 16 / A18 Pro crash** : Expo SDK 55 + iOS 26 crashent en prod (github.com/expo/expo#44680, mémoire projet confirme investigation en cours). Impact business direct. *Ce n'est pas un bug de code interne, c'est un bug Expo amont.*
- **SEV:HIGH — TypeORM 1.0 breaking changes** : `findByIds/findOneById` retirés, `@EntityRepository` retiré, `connection→dataSource` rename, `@RelationCount` retiré. Codemod dispo (`@typeorm/codemod`) mais spike requis avant H2 2026.
- **SEV:HIGH — Routes monolithes** : `auth.route.ts` (514L, 14 endpoints), `chat-message.route.ts` (514L). Dépasse max-lines, eslint-disable présent. Test isolation difficile.
- **SEV:HIGH — Contract OpenAPI minimal** : 1 seul fichier de contract tests. Routes réelles non validées sur statut/headers/erreurs. Risque régression externe.

### MEDIUM
- **SSE timer leak** `chat-message.route.ts:101-118` — `keepAliveTimer`/`sseTimer` créés sans `res.on('close')` / `res.on('error')` cleanup. FD leak possible sur abort.
- **`useTextToSpeech`** (frontend) — `webAudioRef.current.play()` sans `.catch()`, callbacks `onerror`/`onended` non nettoyés.
- **MemoryCacheService** `gcTimer` tourne après shutdown (pas de destructor).
- **Coverage ratchet 88% pile au seuil** — aucune marge pour régression.
- **E2E golden-paths seulement** — pas de chaos tests (LLM timeout, DB down, concurrency).

### LOW
- **`config/env.ts` 354L** over-engineered pour 2 feature flags actifs — simplifiable ~100L.
- **i18n namespace triplé** (backend + frontend + docs) — 3 sources de vérité.
- **Chat service god object** `chat.service.ts` 372L orchestre 5 sous-services.

## 4. Docs & Code Mort — Deletions /Challenged

| Cible | Taille | Proposition | Challenge | Verdict |
|---|---|---|---|---|
| `docs/V1_Sprint/PROGRESS_TRACKER.md` | 60 KB | SUPPRIME | Perte historique sprint ? → export snapshot final avant | **ARCHIVE** (move `docs/archive/`) |
| `docs/V1_Sprint/SPRINT_LOG.md` | 172 KB | ARCHIVE | Contexte post-mortem utile | **ARCHIVE** |
| `docs/archive/fullcodebase-analyse/` | 152 KB | SUPPRIME | GitNexus couvre 100% (5912 symbols) ? → confirmé | **DELETE** |
| `docs/plans/PLAN_01..12_*.md` | 112 KB | TRIM | Redondants avec `team-reports/` | **MERGE en 1 PLAN_MASTER.md, supprimer reste** (fait 2026-04-21 : archivé dans `docs/archive/plans-2026-04-17/`) |
| `docs/plans/reports/` (16) | 120 KB | SUPPRIME | Dupliqué `.claude/skills/team/team-reports/` | **DELETE** |
| `.claude/skills/generated/*/SKILL.md` | 16 fichiers | SUPPRIME si regenerable via hook | Check `.claude/hooks/` régénération | **DONE** (supprimé 2026-04-21) |
| `new.md` (racine) | ~1 KB | SUPPRIME | Bruit, pas du monorepo | **DONE** (supprimé 2026-04-21) |
| `docs/adr/ADR-001-sse-streaming-deprecated.md` | — | GARDE | Décision architecturale traçable tant que SSE vit | **KEEP** |
| 5× `PRODUCT_*_AUDIT` | — | MERGE | Vue d'état fragmentée | **CONSOLIDATE en `PRODUCT_STATE.md`** |
| `.claude/agents/*.md` | 9 fichiers | GARDE | Mandats agents opérationnels | **KEEP** |

**Gain estimé** : ~800 KB docs mortes éliminées, ~30 % réduction noise.

## 5. Plan Consolidé — Upgrade Enterprise-Grade

### Phase 0 — Safety Net (1 semaine, prérequis)
- [ ] Snapshot git tag `v1.0-pre-enterprise-upgrade` avant tout delete
- [ ] `npx gitnexus analyze --embeddings` (index frais avant refactor)
- [ ] Baseline coverage lock : passer ratchet de 2717 à **2800 tests min** (+83 pour créer marge)

### Phase 1 — Nettoyage Docs & Dead Weight (2-3 jours · XS)
- [x] Créer `docs/archive/sprint-journals/` et déplacer `V1_Sprint/` (done 2026-04-20)
- [ ] Supprimer `docs/archive/fullcodebase-analyse/` après validation GitNexus
- [x] Merger `docs/plans/PLAN_01..12` → archivé dans `docs/archive/plans-2026-04-17/`
- [ ] Supprimer `docs/plans/reports/` (dupliqué team-reports)
- [x] Supprimer `new.md` (done)
- [ ] Consolider 5× `PRODUCT_*_AUDIT.md` → `docs/PRODUCT_STATE.md`
- [ ] Commit unique : `docs: prune obsolete reports, consolidate product state`

### Phase 2 — Lifecycle Fixes (3-5 jours · S)
**Fichiers critiques** :
- [ ] `museum-backend/src/modules/chat/adapters/primary/http/chat-message.route.ts:101-118` → ajouter `res.on('close'|'error')` pour clearInterval SSE timers
- [ ] `museum-frontend/features/chat/application/useTextToSpeech.ts:174` → `.catch()` sur play(), cleanup `onerror/onended`
- [ ] `museum-backend/src/shared/cache/memory-cache.service.ts` → exposer `destroy()` et l'appeler dans shutdown handler (`src/index.ts`)
- [ ] Ajouter tests lifecycle : SSE client disconnect, TTS play rejection, cache shutdown

### Phase 3 — TypeORM Mitigation (1-2 semaines · L)
- [x] Pin `typeorm@^0.3.27 <1.0` dans `package.json` pour éviter breaking auto-update (confirmed present)
- [ ] Spike : fork branche `spike/typeorm-v1-codemod`, exécuter `npx @typeorm/codemod v1 src/`, mesurer delta
- [x] Décision documentée ADR-002 : migration TypeORM 1.0 OU migration Drizzle (baseline utilisateur "S-tier 2026") (present in docs/adr/)
- [ ] Si TypeORM 1.0 : planifier 2 sprints pour rename `connection→dataSource`, retrait `@EntityRepository`

### Phase 4 — Routing Refactor (1 semaine · M)
- [ ] Extract `auth.route.ts` (514L) en sub-routers : `register.router.ts`, `login.router.ts`, `social.router.ts`, `reset.router.ts`, `api-key.router.ts` (~100L chacun)
- [ ] Extract `chat-message.route.ts` (514L) en : `message.router.ts`, `stream.router.ts` (legacy), `session.router.ts`
- [ ] `gitnexus_impact` upstream avant chaque split
- [ ] Tests unit par sub-router (isolation)

### Phase 5 — Contract & Chaos Tests (2 semaines · M)
- [ ] Étendre contract tests : statut codes + headers + error shapes. Cibler 50+ scénarios (chaque route = au moins 1 happy + 1 auth error + 1 validation error)
- [ ] Ajouter chaos tests : LLM timeout injection, DB down fallback, Redis down → MemoryCache activation, concurrent requests (k6 soak)
- [ ] Memory-cache : 3 scénarios e2e (Redis healthy / Redis down / cache poison)

### Phase 6 — Observability & Perf (1 semaine · M)
- [ ] Split knowledge-extraction worker en image Docker séparée (isolation OOM)
- [ ] Ajouter Grafana dashboards latence par route
- [ ] Coverage gate CI : pass si delta ≥ 0, fail si régression

### Phase 7 — iOS 26 / A18 Pro Mitigation (inconnu, dépend d'Expo)
- [ ] Tracker github.com/expo/expo#44680 (investigation déjà en cours selon mémoire projet)
- [ ] Si Expo ne fix pas avant TestFlight final : downgrade Expo 54 en hotfix OU eject vers RN bare 0.82
- [ ] **Bloquant pour release publique** si A18 Pro crash non résolu

**Effort total estimé** : ~6-8 semaines à 1 dev, ~3-4 semaines à 2 devs parallèles.

## 6. Fichiers Critiques à Modifier

- `museum-backend/src/modules/chat/adapters/primary/http/chat-message.route.ts` (SSE cleanup)
- `museum-backend/src/modules/auth/adapters/primary/http/auth.route.ts` (split)
- `museum-backend/src/shared/cache/memory-cache.service.ts` (destroy)
- `museum-frontend/features/chat/application/useTextToSpeech.ts` (error handling)
- `museum-backend/package.json` (pin typeorm — already done)
- `museum-backend/tests/contract/openapi/` (extension)
- `docs/` (nettoyage)
- `docs/adr/ADR-002-typeorm-migration.md` (exists)

## 7. Verification (end-to-end)

Pour chaque phase :
1. `pnpm lint && pnpm test` dans museum-backend (tsc PASS, ratchet respecté)
2. `cd museum-frontend && npm run lint && npm test` (tests hooks lifecycle)
3. `pnpm migration:run` puis `node scripts/migration-cli.cjs generate --name=Check` → doit être vide
4. `mcp__gitnexus__detect_changes({scope: "staged"})` → valider scope
5. `mcp__gitnexus__impact` upstream sur chaque symbole touché → pas d'ignorer HIGH/CRITICAL
6. Manual QA : `pnpm smoke:api` (routes vivantes), Expo dev + TestFlight sur iPhone 15/16 si possible
7. `pnpm test:contract:openapi` étendu
8. CI green sur branche PR avant merge

## 8. Ce qui n'a PAS été vérifié (honnêteté)

- **npm audit / snyk** pas exécuté (mode lecture stricte). À lancer avant Phase 3.
- **Couverture line réelle par module** — baseline globale 88% mais répartition inconnue (certains modules peuvent être à 50%).
- **Performance réelle** (p95 latence routes, query time DB) — pas mesurée.
- **Sécurité runtime** — pas de pentest automatisé lancé dans cet audit (cf. skills `semgrep`/`codeql` à activer en Phase 5).
- **i18n coverage** — 3 sources identifiées mais pas audité en détail.

---

## Sources WebSearch

- [TypeORM 1.0 Release Notes](https://dev.typeorm.io/docs/releases/1.0/release-notes/) — breaking changes confirmés
- [Expo SDK 55/56 iPhone 16 crash #44680](https://github.com/expo/expo/issues/44680) — prod crash A18 Pro / iOS 26
- [React Native 0.83 release](https://reactnative.dev/blog/2025/12/10/react-native-0.83) — React 19.2, pas de breaking
- [Expo SDK 55 migration guide](https://reactnativerelay.com/article/expo-sdk-55-migration-guide-breaking-changes-sdk-53-to-55)
- [LangChain in Production 2026](https://medium.com/@kasimoluwasegun/langchain-in-production-beyond-the-tutorials-e7b7f2506572) — patterns circuit breaker confirmés comme best practice
