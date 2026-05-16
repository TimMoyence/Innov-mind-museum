# Audit 360 — Session 1 — Tasks atomiques

**Date :** 2026-05-16 · **Source :** `.claude/skills/team/team-reports/working/2026-05-16-audit-360/S1-types-libs-dryskiss.md`
**Format :** YAML-front-matter, implémentable par fresh agent dev sans contexte session.
**Doctrine :** UFR-013 (honnêteté), UFR-016 (bury dead code), UFR-018 (vérifier > supposer).

> **Conventions** :
> - Chaque task = scope unique (1 app), AC vérifiable mesurable.
> - `effort` ≤ 4h ; sinon split.
> - `priority: P0` = bloquant 2026-06-01 (J-16). `P1` = ≤2 sem post-launch.
> - `dependencies` cite les T1.x cross-task ; `none` si autonome.
> - `deferrable: Y` = peut glisser post-launch sans risque sécurité/UX.

---

## T1.1 — Décision langfuse v3 EOL (migration v5 OU ADR accept-EOL)

```yaml
app: museum-backend
refs:
  - museum-backend/package.json (langfuse ~3.38.20)
  - museum-backend/src/shared/observability/langfuse.client.ts
  - docs/audit-2026-05-12/MASTER.md (P1-7 carry-over)
ac: |
  AU CHOIX (1 des 2 paths) :
  (a) langfuse upgrade to ^5.x dans package.json + langfuse.client.ts refactored against v5 SDK + `pnpm test` BE pass + smoke `pnpm dev` startup OK + verify Langfuse traces apparaissent dans dashboard staging
  (b) `docs/adr/ADR-052-langfuse-v3-accept-eol.md` créé, daté 2026-05-16, signé tech lead, listant : raison du delay, deadline migration (Q3 2026 max), mitigation sécurité (pas de PII custom property = OK), rollback plan
priority: P0
effort: 3h (a) ou 30min (b)
dependencies: none
deferrable: N
rationale: |
  langfuse v3 deprecated upstream (v5 stable depuis 2026-03). Observability-critical path : aucun security patch futur. Pré-launch B2C, on accepte EOL via ADR ; post-launch, migrer rapidement. (b) tenable pour 2026-06-01, (a) à planifier Q3.
```

---

## T1.2 — Zod-validate JWKS + Google token-exchange casts (P0-8 carry-over)

```yaml
app: museum-backend
refs:
  - museum-backend/src/modules/auth/.../social-token-verifier.ts:56
  - museum-backend/src/modules/auth/.../google-token-exchange.ts:80
  - museum-backend/src/modules/auth/.../jwt-decode.ts (pattern référence — Zod déjà appliqué)
ac: |
  Les 2 sites cités (JWKS response + Google token exchange response) passent par `JwksResponseSchema.safeParse()` / `GoogleTokenResponseSchema.safeParse()` au lieu de `as JwksResponse` / `as GoogleTokenResponse`. En cas d'échec : throw `ExternalApiContractError` (existant) avec event-log structuré.
  Tests unitaires ajoutés (`social-token-verifier.test.ts`, `google-token-exchange.test.ts`) couvrant : (1) response valide → OK ; (2) response shape changed → throw avec log structuré.
  `pnpm test` BE pass. `as-any-baseline.json` reste à 0.
priority: P0
effort: 2h
dependencies: none
deferrable: N
rationale: |
  Chemin auth critique. Si Google/Apple/Microsoft changent shape API (improbable mais possible), un cast `as JwksResponse` produit un crash runtime ou pire un bypass auth. Le pattern Zod existe déjà dans le module (jwt-decode), juste à étendre.
```

---

## T1.3 — Documenter `noUncheckedIndexedAccess` BE en TECH_DEBT

```yaml
app: museum-backend
refs:
  - museum-backend/tsconfig.json (option absente)
  - docs/TECH_DEBT.md (ajouter entrée)
  - S1 report § 4.2 (justification chiffrée)
ac: |
  `docs/TECH_DEBT.md` reçoit une nouvelle entrée TD-BE-noUncheckedIndexedAccess avec : (1) raison du défer pré-launch (35-50 sites, 8-12h), (2) sites estimés (similarity.service.ts, chat.repository.ts pagination, validators arrays), (3) deadline post-V1 sprint 1, (4) trigger (toute mention noUncheckedIndexedAccess en review). Entrée datée 2026-05-16.
priority: P0
effort: 15min
dependencies: none
deferrable: N
rationale: |
  Sans entrée TECH_DEBT, le défer va se perdre. Acter par écrit = empêche drift silencieux. C'est la seule action « pré-launch » de ce sujet — l'activation elle-même est P1 post-V1.
```

---

## T1.4 — Aligner ESLint majors (BE v10 vs FE/Web v9) — Décision + plan

```yaml
app: cross (museum-backend + museum-frontend + museum-web)
refs:
  - museum-backend/package.json eslint ^10.2.0
  - museum-frontend/package.json eslint ^9.39.4
  - museum-web/package.json eslint ^9.39.4
  - docs/audit-2026-05-12/MASTER.md (P1-8 carry-over)
ac: |
  AU CHOIX :
  (a) FE + Web montent à v10 : update package.json, run `pnpm lint` / `npm run lint` chaque app, fix breaking rule changes (ex. flat-config migration si applicable), zero net lint errors, ratchet `lintWarnings*` ne grow pas
  (b) BE descend à v9 : revert + tests
  Décision documentée dans CHANGELOG ou ADR-053. `pnpm bootstrap` (root) clean.
priority: P0
effort: 3-4h (a) ou 1h (b)
dependencies: none
deferrable: N
rationale: |
  Major split = config doublée à maintenir. Path (a) est forward-looking ; path (b) si v10 introduit trop de breaking. À trancher rapidement avant que d'autres rules drift.
```

---

## T1.5 — @musaium/shared : cull phantom exports (geo, auth, errors, i18n, validation)

```yaml
app: cross (packages/musaium-shared)
refs:
  - packages/musaium-shared/src/index.ts
  - packages/musaium-shared/src/geo/, auth/, errors/, i18n/, validation/
  - S1 report § 5.3 (consumption table)
ac: |
  AU CHOIX :
  (a) Cull : retirer du barrel `geo`, `auth`, `errors`, `i18n`, `validation` (0 imports cross-app vérifié par grep). Bump package version. Run `pnpm bootstrap` + smoke 3 apps build OK. UFR-016 bury_dead_code respecté.
  (b) Câbler : intégrer au moins 1 import réel de chaque sous-export dans une des 3 apps (preuve de live use). Documenter dans CHANGELOG.
  Verbe : « live or cull » — pas de phantom export à conserver.
priority: P0
effort: 30min (a) ou 4h (b)
dependencies: T1.4 (si v10 alignement vient avant)
deferrable: N
rationale: |
  P1-2 audit 05-12 : « packages/musaium-shared/ créé mais consommé par 0 fichier — phantom. live or revert doctrine. » L'observability sub-package est live (12 imports), les 4 autres pas. Soit on les enterre (UFR-016), soit on les câble — pas de purgatoire.
```

---

## T1.6 — Barrel doctrine FE : enforce OU strip docblock (UFR-013)

```yaml
app: museum-frontend
refs:
  - museum-frontend/features/*/index.ts (13 barrels, chaque docblock dit "MUST go through barrel")
  - 203 deep imports vs 8 barrel imports = violation 25:1
  - docs/audit-2026-05-12/MASTER.md (P1-6 carry-over)
ac: |
  AU CHOIX :
  (a) Enforce : ajouter ESLint `no-restricted-imports` per feature scope, backfill les 13 barrels (auto-codemod si possible), 0 deep import résiduel
  (b) Strip docblocks : retirer/réécrire les claims « MUST go through barrel » dans les 13 `features/*/index.ts` pour refléter réalité (« deep imports allowed within reasonable scope »)
  Décision documentée. UFR-013 (docblocks ne doivent pas mentir).
priority: P0
effort: 30min (b) ou 1-2j (a)
dependencies: none
deferrable: N
rationale: |
  Pré-launch, J-16 : path (b) tenable. Path (a) post-launch. L'important = stopper le mensonge UFR-013. Aucun runtime risk, mais intégrité doctrine non négociable selon CLAUDE.md UFR-013.
```

---

## T1.7 — BE 5 `as unknown as` low-medium sites — extraire helpers typés

```yaml
app: museum-backend
refs:
  - museum-backend/src/shared/semaphore.ts:86 (timeout fallback)
  - museum-backend/src/modules/chat/.../guardrail-evaluation.service.ts:498 (metadata cast)
  - museum-backend/src/.../museum-enrichment-cache.adapter.ts:156 (cache value cast)
  - museum-backend/src/data/data-source.ts:95 (driver introspection)
  - museum-backend/src/.../social-otc-store.ts:125 (JSON.parse generic)
ac: |
  Pour les 5 sites listés : remplacer `as unknown as X` par soit (1) un helper typed dédié (`timeoutResult<T>()`, `parseCacheValue(schema)`), soit (2) un schéma Zod si la valeur provient d'un parse runtime (otc-store). Aucun `as unknown as` neuf introduit. Tests unitaires couvrent la branche fallback de chaque site.
  `as-any-baseline.json` à 0 maintenu.
priority: P1
effort: 2-3h cumulé
dependencies: none
deferrable: Y
rationale: |
  Aucun de ces sites n'est risque sécurité (audit 05-12 + spot-check). C'est de la dette type-safety à éponger post-launch quand budget de refactor permet.
```

---

## T1.8 — Stale audit 05-12 entries : reflag MASTER.md

```yaml
app: cross (docs)
refs:
  - docs/audit-2026-05-12/MASTER.md (P0-6, P0-7, P1-1, P2-6, P2-7)
  - S1 report § 8 (drift doctrine ↔ code)
ac: |
  MASTER.md historique mis à jour avec mentions de résolution datées 2026-05-16 :
  - P0-6 ✅ RESOLVED 2026-05-14 (déjà fait dans MASTER.md, vérifier)
  - P0-7 ⚠️ RESOLVED (api.ts:38-56 actuels = legitime ; soit fixed entre 05-12 et 05-13, soit audit 05-12 trompé sur la ligne)
  - P1-1 ✅ RESOLVED (sentry-scrubber centralisé via @musaium/shared/observability)
  - P2-6 ✅ RESOLVED (npm ls FE = empty, extraneous packages partis)
  - P2-7 ❌ INCORRECT au moment de l'audit (Web a noUncheckedIndexedAccess depuis longtemps)
  Update unique commit, message clair.
priority: P1
effort: 30min
dependencies: none
deferrable: Y
rationale: |
  Doctrine drift cleanup. Si l'audit 05-12 reste flag-stale, le prochain agent le re-trouvera comme blockers fantômes. Hygiène memory + tracking.
```

---

## T1.9 — Clarifier doctrine helper env canonical (typeofString vs trimOrUndefined vs readEnvString)

```yaml
app: museum-frontend (+ doctrine)
refs:
  - CLAUDE.md gotcha "process.env.X typed différemment local vs GitHub Actions (museum-frontend)"
  - museum-frontend/.../cert-pinning-init.ts:61 (documentation locale)
  - 11 sites `process.env.EXPO_PUBLIC_*` — tous via trimOrUndefined/readEnvString, aucun via typeofString
ac: |
  Choisir helper canonical (recommandation : `readEnvString` ou `trimOrUndefined` selon le pattern existant le plus utilisé). Update gotcha CLAUDE.md pour pointer le helper réel utilisé. Si `typeofString` n'existe pas réellement, retirer la mention du gotcha.
  Ajouter un test de lint (ast-grep ou ESLint) qui flag toute lecture `process.env.X` sans wrap par le helper canonical.
priority: P1
effort: 1h
dependencies: none
deferrable: Y
rationale: |
  CLAUDE.md gotcha documente un helper `typeofString` ; 0 site FE l'utilise. Faux ou helper renommé entre temps. Si on laisse, prochain dev hésite. UFR-013 — la doc doit suivre le code.
```

---

## T1.10 — Bump @tanstack/react-query FE 5.99.2 → 5.100.10 (manual PR)

```yaml
app: museum-frontend
refs:
  - museum-frontend/package.json (@tanstack/react-query ^5.99.2)
  - ~7 patches behind, hors auto-merge rule Renovate
ac: |
  package.json bumped to ^5.100.10 (vérifier latest non-major au moment de l'exécution). `npm install`. `npm run lint` + `npm test` + `npm run dev` smoke chat session list charge OK. CHANGELOG.md note.
priority: P1
effort: 30min + smoke
dependencies: none
deferrable: Y
rationale: |
  Patches accumulés ; manual bump pour vérifier qu'aucune query/mutation behavior change. Faible risque mais nécessite check humain (pas auto-merge).
```

---

## T1.11 — BE extraction guardrail-evaluation.service.ts (608L → split)

```yaml
app: museum-backend
refs:
  - museum-backend/src/modules/chat/.../guardrail-evaluation.service.ts (608L, 2 méthodes >100L)
ac: |
  Extract 2 méthodes >100L vers helpers privés ou sub-modules :
  - Évaluation V1 keyword guardrail
  - Évaluation V2 LLM judge
  Le fichier guardrail-evaluation.service.ts ≤ 400L après split. Tests unitaires existants pass sans modification. ADR-015 doctrine respectée (chaque V2 layer reste indépendant).
priority: P1
effort: 4h
dependencies: none
deferrable: Y
rationale: |
  Le fichier devient ingérable à 608L pour un orchestrateur AI safety critical. Split réduit cyclo + facilite tests focal. Pas urgent (functioning OK), mais maintenance debt.
```

---

## T1.12 — Split 7 FE screens >300L — start tickets.tsx canonical

```yaml
app: museum-frontend
refs:
  - museum-frontend/app/(stack)/tickets.tsx (397L)
  - autres : chat/[sessionId].tsx (504), carnet/[sessionId].tsx (409), preferences.tsx (387), reviews.tsx (385), ticket-detail.tsx (379), settings.tsx (376)
ac: |
  `tickets.tsx` refactored en : (1) `useTicketsListScreen()` hook (state/filter/data), (2) `<TicketsListView>` presenter (markup). Le fichier `tickets.tsx` ≤ 100L (orchestration only). Tests existants pass. Pattern documenté en commentaire ou ADR pour les 6 autres.
priority: P1
effort: 4h (tickets seul ; 3-4j pour les 7)
dependencies: none
deferrable: Y
rationale: |
  Audit 05-12 + Subagent B flag les 7 screens. Acceptable pré-launch mais friction code-review + onboarding. Commencer par tickets.tsx = template. Les 6 autres = P1 sprint 1 V1.1.
```

---

## Récap priorité

| Priorité | Tasks | Effort cumulé |
|---|---|---|
| **P0 (avant 2026-06-01)** | T1.1, T1.2, T1.3, T1.4, T1.5, T1.6 | ~7-12h (selon paths a/b) |
| **P1 (≤2 sem post-launch)** | T1.7, T1.8, T1.9, T1.10, T1.11, T1.12 | ~12-15h cumulé |

**Verdict effort P0 réaliste J-16 :** tenable en 1.5-2j-dev distribués sur la semaine. Pas de blocker.
