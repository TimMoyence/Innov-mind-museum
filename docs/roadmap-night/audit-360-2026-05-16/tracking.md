# Audit-360 S1 — Tracking

Source de vérité pour l'état du chantier S1 (Types & Libs). **Toute mise à jour passe par ce fichier** (append-only sur Notes, écrasement OK sur Status).

**Worktree** : `/Users/Tim/Desktop/all/dev/Pro/InnovMind-audit-360-s1/` (sibling de `InnovMind/`)
**Branch** : `worktree-feat+audit-360-s1`
**Démarré** : 2026-05-16
**Cible launch V1** : 2026-06-01 (memory : `feedback_no_solo_dev_estimates` — pas de calendrier)
**Sister worktrees** : `InnovMind-chat-ux/` + `InnovMind-roadmap/` — ne PAS toucher à leurs scopes pour éviter collisions au merge

---

## Source de vérité

- **Rapport audit** : `.claude/skills/team/team-reports/working/2026-05-16-audit-360/S1-types-libs-dryskiss.md`
- **Tasks YAML** : `docs/roadmap-night/audit-360-2026-05-16/S1-types-libs.tasks.md` (T1.1 → T1.12)
- **Doctrine** : CLAUDE.md (UFR-013, UFR-016, UFR-018, UFR-020) + `.claude/agents/shared/user-feedback-rules.json`
- **Pattern éprouvé** : `docs/roadmap-night/tracking.md` (5/5 features livrées 2026-05-14/15)

---

## Conventions

### Statuts (lifecycle linéaire, calqué roadmap-night)

| Statut | Sens | Owner attendu |
|---|---|---|
| `pending` | À démarrer | — |
| `discovery` | Spec mini Spec Kit en cours (`specs/T1.x.md`) | inspection-agent (fresh, general-purpose) |
| `red` | Tests rouges écrits, code pas encore | red-test-agent (fresh, general-purpose) |
| `green` | Code en cours pour faire passer les tests | green-code-agent (fresh, general-purpose) |
| `review` | Diff complet, en review fresh-context | review-agent (fresh, Plan agent type) |
| `changes-requested` | Verdict < APPROVED — retour green | green-code-agent |
| `done` | USER a appliqué diff + commit + hooks PASS sur worktree | — |
| `blocked` | Bloqué externe (décision user, dep tierce, archi) | dispatcher |
| `escalated` | `correctiveLoops >= 2` — stop, attendre user au matin | dispatcher |

### Concurrency cap

**Max 3 features en flight simultanément** (vs cap 2 du précédent run roadmap-night — S1 tasks sont plus courtes en effort moyen). Le dispatcher REFUSE de démarrer une 4ème feature.

### Pipeline 4-rôles (cohérent avec roadmap-night)

```
inspection-agent (fresh ctx, general-purpose for Write spec)
  → spec.md + design.md + tasks.md à docs/roadmap-night/audit-360-2026-05-16/specs/T1.x.md
  → questions ouvertes Q1-Q5 loggées dans tracking.md Notes

red-test-agent (fresh ctx, general-purpose)
  → écrit tests FAIL au baseline, RUN pour PROUVER fail
  → BLOCK si tests passent déjà au baseline (= pas vraiment red)
  → diff dans /tmp/audit-s1-T1.x-red.diff

green-code-agent (fresh ctx, general-purpose)
  → lit UNIQUEMENT spec + red diff + fichiers cités
  → fait passer les tests + run hooks scoped
  → vérifie ratchets (as-any=0, pas de nouveau eslint-disable sans justification)
  → diff dans /tmp/audit-s1-T1.x-green.diff

review-agent (fresh ctx, Plan agent type — JAMAIS SendMessage continuation)
  → 5-axis scoring (correctness 0.30 / scope-fidelity 0.20 / kiss-dry 0.20 / a11y-design 0.15 / security-honesty 0.15)
  → verdict APPROVED ≥85, CHANGES_REQUESTED 70-84, BLOCK <70
  → JSON à docs/roadmap-night/audit-360-2026-05-16/reviews/T1.x-review-loopN.json
  → cap 2 corrective loops, sinon ESCALATED
```

### Gates obligatoires avant `done`

**BE (museum-backend)** :
- `pnpm --filter museum-backend lint` PASS (tsc --noEmit)
- `pnpm --filter museum-backend test -- <fichiers touchés>` PASS
- `node scripts/sentinels/as-any-ratchet.mjs` PASS (BE=0, FE=0, Web=0)
- Si TypeORM touché : pas de `.set({ field: undefined })` (CLAUDE.md gotcha)
- Pas de nouveau `eslint-disable` sans `Justification: ≥20 chars` + `Approved-by:`

**FE (museum-frontend)** :
- `cd museum-frontend && npm run lint` PASS (tsc --noEmit + ESLint)
- `npm test` PASS sur fichiers touchés
- Pas de `marginLeft/Right` introduit (RTL doctrine, CLAUDE.md gotcha)
- typeofString helper usage cohérent si T1.9 in scope

**Web (museum-web)** :
- `pnpm --filter museum-web lint` PASS
- `pnpm --filter museum-web test` PASS (Vitest)
- `pnpm --filter museum-web build` PASS

**Cross** :
- Si touche `packages/musaium-shared/` : `pnpm bootstrap` PASS + 3 apps build PASS
- Si touche package.json racine ou app manifest : `pnpm install` clean + `pnpm bootstrap`

**Docs only** :
- Markdown syntax check
- Pas de lien cassé vers fichier inexistant

---

## Tasks T1.1 → T1.12

| ID | App | Wave | Priorité | Status | Spec | Owner | Notes |
|---|---|---|---|---|---|---|---|
| T1.1 | BE | 4 | P0 | `awaiting-commit (REVERTED-rename)` | [T1.1.md](specs/T1.1.md) | dispatcher-revert-2026-05-17 | **APPROVED loop 1 95.6** mais **ADR rename REVERTED 2026-05-17** : S2 (commit `3095bf434 T-S2-2`) déjà mergé main avec résolution opposée (langfuse=050, oss-guardrail=051, user-suspend=052). Worktree restauré à ADR-050-langfuse (état HEAD), MASTER.md L71 + OVERNIGHT_P1_REPORT.md L27 ajustés (ref ADR-050 au lieu de 052) + reflag "RESOLVED 2026-05-13" préservé pour traçabilité doctrine. Net diff T1.1 = 2 fichiers (juste les reflags ADR-050, plus de rename). |
| T1.2 | BE | 1 | P0 | `done (obsolete)` | [T1.2.md](specs/T1.2.md) | inspection-2026-05-16-T1.2 | **OBSOLETE confirmé** — déjà shipped par commits `d23a1bb8b fix(P0-8)` + tests `baa14c227 test(P0-8)`. Verbatim verify : `safeParse` + `AppError` présents L77/L97, `as JwksResponse` / `as GoogleTokenResponse` = 0 hit code, tests P0-8 RED présents. Q2 nice-to-have backlog : amender AC (`ExternalApiContractError` n'existe pas, impl utilise `AppError({code:'*_MALFORMED'})`). |
| T1.3 | docs | 1 | P0 | `awaiting-commit` | [T1.3.md](specs/T1.3.md) | review-2026-05-16-T1.3-r1 | **APPROVED loop 1 weightedMean 94.85** ([review JSON](reviews/T1.3-review-loop1.json)). 26 add/0 remove sur `docs/TECH_DEBT.md`. UFR-013 honesty exemplary (Note bullet sur 0 occurrences directes). En attente commit USER. |
| T1.4 | BE | 3 | P0 | `awaiting-commit` | [T1.4.md](specs/T1.4.md) | review-2026-05-16-T1.4-r1 | **APPROVED loop 1 weightedMean 96.4** ([review JSON](reviews/T1.4-review-loop1.json)). path (b) BE descend v9.39.4 — path (a) bloqué upstream (eslint-plugin-react#3977). 2 lignes package.json + lockfile regen (837L diff) + TD-7 statut + jsdoc claim FAUX corrigée (UFR-013 win). |
| T1.5 | cross | 2 | P0 | `awaiting-commit` | [T1.5.md](specs/T1.5.md) | review-2026-05-16-T1.5-r1 | **APPROVED loop 1 weightedMean 96.2** ([review JSON](reviews/T1.5-review-loop1.json)). path (a) cull 5 sub-dirs. Diff 33 add/373 del. v0.2.0. Hooks all PASS. 1 nice-to-have N1 (retro-added [0.1.0] CHANGELOG entry — strict UFR-013 honnêteté). |
| T1.6 | FE | 4 | P0 | `done (obsolete)` | [T1.6.md](specs/T1.6.md) | inspection-2026-05-16-T1.6 | **OBSOLETE — path (b) déjà appliqué** par commit `968cdafad` 2026-05-13 (3 jours avant rédaction YAML). 3 barrels (pas 13), 0 docblock contient "MUST...barrel" (déjà retirés). Ratio réel = 51:1 (claim 25:1 sous-estimé). Path (a) antagoniste design délibéré (chat/index.ts privacy). **Source YAML stale** — flag pour reviewer S1. |
| T1.7 | BE | 4 | P1 | `awaiting-commit` | [T1.7.md](specs/T1.7.md) | review-2026-05-16-T1.7-r1 | **APPROVED loop 1 weightedMean 95.05** ([review JSON](reviews/T1.7-review-loop1.json)). 5/5 sites cleaned (semaphore, guardrail-eval, enrichment-cache, data-source, social-otc-store). `as unknown as` 4→0, `as TPayload` 1→0. +18 tests (5 in modified + 13 in 2 new files). Site 5 (Zod injection) = security upgrade. |
| T1.8 | docs | 1 | P1 | `awaiting-commit` | [T1.8.md](specs/T1.8.md) | review-2026-05-16-T1.8-r1 | **APPROVED loop 1 weightedMean 97.45** ([review JSON](reviews/T1.8-review-loop1.json)). 4 add/4 remove sur `docs/audit-2026-05-12/MASTER.md`. Preuves verbatim factuellement vérifiées sur disque. En attente commit USER. |
| T1.9 | FE+doc | 5 | P1 | `review` | [T1.9.md](specs/T1.9.md) | green-2026-05-16-T1.9-001 | GREEN — 3 local defs (typeofString + trimOrUndefined + readEnvString-local) supprimées, helper canonical `museum-frontend/shared/lib/env.ts` créé, 4 sites importent canonical, CLAUDE.md gotcha updated, 2 ast-grep rules (.ts + .tsx grammar split, 0 findings actuelles). 5ème site `chat/_internals.ts` respecté anti-collision chat-ux (TODO comment in ast-grep rule). FE lint PASS. |
| T1.10 | FE | 6 | P1 | `awaiting-commit` | [T1.10.md](specs/T1.10.md) | review-2026-05-17-T1.10-r1 | **APPROVED loop 1 weightedMean 97.2** ([review JSON](reviews/T1.10-review-loop1.json)). react-query + persist-client 5.99.2 → 5.100.10. npm install + lint + 2825 tests PASS. 0 vuln. Anti-collision chat-ux OK. Lockfile inclut musaium-shared 0.1.0→0.2.0 sync (mechanical T1.5). |
| T1.11 | BE | 5 | P1 | `awaiting-commit` | [T1.11.md](specs/T1.11.md) | review-2026-05-17-T1.11-r1 | **APPROVED loop 1 weightedMean 96.4** ([review JSON](reviews/T1.11-review-loop1.json)). 4/4 extractions (types + v2-layers + output-classifier + bias-metrics). service.ts **611L → 381L** (target ≤400 ✓ marge 19L). 5 consumers untouched, ADR-015 dual-V2 doctrine préservée (`providerDeps()`/`judgeDeps()` JSDoc séparés, zero shared state). Tests 50/50 PASS. UFR-018 catch : YAML claim "2 méthodes >100L" était FAUX (largest 93L). |
| T1.12 | FE | 7 | P1 | `awaiting-commit` | [T1.12.md](specs/T1.12.md) | review-2026-05-17-T1.12-r1 | **APPROVED loop 1 weightedMean 96.0** ([review JSON](reviews/T1.12-review-loop1.json)). tickets.tsx **397L → 21L** (target ≤100, marge 79L). +useTicketsListScreen.ts (137L hook) + TicketsListView.tsx (320L pure presenter). 16/16 tests PASS sans modif. RTL/emoji/a11y doctrine respect (parité 2 accessibilityLabel + 4 accessibilityRole). Anti-collision chat-ux OK. Comment inline doc le pattern + liste 6 autres screens pour V1.1 sprint 1. |

---

## Plan d'exécution par vagues (compatibilité-aware)

Règles de batching basées sur conflits de fichiers / lockfile / cross-app rebuild :

| Vague | Tasks | Mode | Justification |
|---|---|---|---|
| **1** | T1.3, T1.8, T1.2 | Parallèle (3) | Orthogonales : 2 docs + 1 BE auth isolé |
| **2** | T1.5 | SOLO | Touche lockfile + 3 apps via `@musaium/shared` file: dep |
| **3** | T1.4 | SOLO | Touche les 3 package.json ESLint |
| **4** | T1.1, T1.7, T1.6 | Parallèle (3) | Post-stabilisation shared/eslint : BE obs + BE as-any + FE barrels |
| **5** | T1.9, T1.11 | Parallèle (2) | FE shared/utils + BE chat module (collision possible app/) |
| **6** | T1.10 | SOLO | Touche FE package.json |
| **7** | T1.12 | SOLO | Gros refactor FE |

Si une vague échoue (review BLOCK) → la suivante NE démarre PAS → escalade user au matin.

---

## Cap watchdog

```
inFlight = features avec status in {discovery, red, green, review, changes-requested}
correctiveLoops[task-id] = nombre de cycles review→changes-requested
sessionStart = 2026-05-16T<HH:MM>:00+02:00
sessionDurationCap = 8 hours
```

Règles dures :
- `inFlight.count > 3` → REFUSE démarrer nouvelle task (cap audit-360 = 3)
- `correctiveLoops[X] >= 2` → ESCALATED (pas de 3ème boucle automatique, V12 §8)
- Tests rouges qui passent au baseline → BLOCK red-test-agent
- `now() - sessionStart >= sessionDurationCap` → STOP global

---

## Interdictions absolues (UFR doctrine)

1. Bypass hook : `--no-verify`, `-n`, `SKIP_PRE_COMMIT`, `core.hookspath=/dev/null` (UFR-020)
2. Toucher `museum-frontend/features/chat/` hors T1.x explicite (anti-drift chat-ux)
3. Modifier fichiers hors scope spec (scope-boundary check au review)
4. Commit par agent (seul USER commit, UFR doctrine)
5. Reviewer dans contexte editor (V12 §8 — toujours fresh Agent tool)
6. Plus de 3 tasks in flight (cap absolu)
7. Plus de 2 corrective loops par task
8. Inventer file:line / chiffre / "looks fine sans verbatim" (UFR-013)

---

## Stop conditions (cumul OR)

- Toutes tasks `done`
- Une task `escalated` (cap loop atteint)
- 8h cumulées depuis sessionStart
- Hook hard fail (ratchet broken, sentinelle anti-collision triggered)
- API outage (Anthropic 529/503)

---

## Commit messages convention

Format conventionnel + Co-Authored-By Claude :
- `feat(audit-s1,T1.X): <description>` — features
- `chore(audit-s1,T1.X): <description>` — bumps / cleanups
- `docs(audit-s1,T1.X): <description>` — MASTER.md / TECH_DEBT.md / CLAUDE.md edits
- `refactor(audit-s1,T1.X): <description>` — splits / extractions

Au matin : `git checkout main && git merge worktree-feat+audit-360-s1` (squash si volume, créer PR si review externe souhaitée).

---

## Log (append-only)

### 2026-05-16 ~19:35 — Init dispatcher

- Worktree `InnovMind-audit-360-s1` créé depuis HEAD (`24e70990` after CLAUDE.md commit).
- `pnpm bootstrap` PASS (3 apps `frozen-lockfile`).
- Baselines : BE lint exit 0, FE lint exit 0, Web lint exit 0, as-any ratchet BE=0/FE=0/Web=0.
- Tracking file créé. Plan Vagues 1-7 défini.
- Vague 1 (T1.3 + T1.8 + T1.2) spawned : 3 inspection-agents fresh ctx en parallèle.

### 2026-05-16 ~19:40 — Vague 1 inspections complétées

- **T1.3** SPEC_READY 119L — TD-16 format aligné convention TECH_DEBT.md, Q1/Q2/Q3 non-blocking.
- **T1.8** SPEC_READY 156L — 5 vérifications UFR-018 verbatim. Verdicts : P0-6 NO-OP, P0-7/P1-1/P2-6 RESOLVED 2026-05-16, P2-7 INCORRECT.
- **T1.2** **SPEC_BLOCKED — OBSOLETE** : déjà shipped par `d23a1bb8b` (fix P0-8) + `baa14c227` (tests RED P0-8). Verbatim confirmé par dispatcher : safeParse+AppError L77/L97, 0 cast résiduel, tests 4+3 scenarios P0-8 RED présents, `ExternalApiContractError` (cité par AC YAML) n'existe pas dans repo (impl a utilisé `AppError({code:'*_MALFORMED'})` à la place). T1.2 marqué `done (obsolete)`. Q2 (rename AppError → ExternalApiContractError ou amender AC) = nice-to-have P3 backlog matin.

### 2026-05-16 ~19:45 — Vague 1 green-code spawned

- T1.3 + T1.8 green-code en parallèle (docs-only, fichiers orthogonaux, red-test skip).
- T1.3 GREEN_READY 26 add/0 remove sur `docs/TECH_DEBT.md`.
- T1.8 GREEN_READY 4 add/4 remove sur `docs/audit-2026-05-12/MASTER.md`.

### 2026-05-16 ~19:48 — Vague 1 reviews spawned

- T1.3 + T1.8 review-agents fresh ctx (general-purpose, JSON output only).
- T1.2 obsolete documenté (pas de review nécessaire — pas d'edit).

### 2026-05-16 ~19:55 — Vague 1 COMPLETE

- **T1.3 APPROVED 94.85** (UFR-013 honesty exemplary).
- **T1.8 APPROVED 97.45** (preuves verbatim factuellement vérifiées).
- **T1.2 OBSOLETE** + baseline tests confirmed : 5660 PASS / 0 fail (273s, matches SessionStart baseline). Aucune régression.
- Diffs prêts à commit USER : `/tmp/audit-s1-T1.3-green.diff` (26 add) + `/tmp/audit-s1-T1.8-green.diff` (4 add / 4 remove).
- inFlight pipeline active : 0 (T1.3/T1.8 awaiting USER commit).

### 2026-05-16 ~19:55 — Vague 2 spawned

- T1.5 inspection-agent (SOLO — touche packages/musaium-shared + 3 apps via file: dep).

### 2026-05-16 ~20:00 — Vague 2 inspection complete

- **T1.5 SPEC_READY** — recommandation path (a) cull. Verbatim: geo=0/auth=0/errors=0/i18n=0/validation=0 hits, observability=6 hits (live).

### 2026-05-16 ~20:10 — Vague 2 green crashed mid-output

- Green-code-agent T1.5 a complété TOUT le boulot (28 tool uses : 5 rm -rf, edits index.ts + package.json, CHANGELOG.md créé, pnpm bootstrap PASS, 3 lints PASS) PUIS l'API a crashé en 500 sur la réponse chat finale.
- Dispatcher a vérifié manuellement : 5 grep 0 hits, 9 named-symbols BE-locaux uniquement, index.ts trimé, package.json v0.2.0, CHANGELOG.md propre, BE+FE+Web lints PASS, Web build PASS, as-any ratchet PASS, workspace-links PASS.
- Diff complet : `/tmp/audit-s1-T1.5-green.diff` (37 files, 33/+, 373/-).
- Review T1.5 spawned fresh ctx.
