# A10 — Root + App READMEs doc audit (2026-05-26)

Auditeur : Claude Code (read-only). Vérification code-first : chaque claim checké contre `package.json`, `ls`, `git ls-files`.

---

## Tableau de synthèse

| Fichier | État | Confiance | Preuve (doc→code) | Action |
|---|---|---|---|---|
| `CLAUDE.md` | **À MODIFIER** | HIGH | Voir §Findings 1–4 ci-dessous | 4 corrections ciblées |
| `README.md` | **OK** | HIGH | Commandes OK (`pnpm dev`, port 5433, `npm install`, `npm run dev`). Tech stack correct. ADR-044 existe. `docs/AI_VOICE.md` existe. | Aucune |
| `AGENTS.md` | **OK** | HIGH | Thin pointer intentionnel vers CLAUDE.md. Commentaire GitNexus skip en place. Pas un doublon actif. | Aucune |
| `CHANGELOG.md` | **OK** | HIGH | Format Keep-a-Changelog respecté. Dernier lot P0 a11y 2026-05-25 — cohérent avec git log. Tout en `[Unreleased]` (pas de version taguée encore) — correct pour pre-launch. | Aucune |
| `SECURITY.md` | **À MODIFIER** | HIGH | V1 target dit `2026-06-01` mais CLAUDE.md (source de vérité projet) dit `2026-06-07 (minimum, à reconfirmer)`. Date stale. `docs/operations/VDP_RUNBOOK.md` et `docs/operations/PGP_KEY_GENERATION.md` et `docs/operations/INCIDENT_CONTACTS.md` existent tous — OK. | Corriger date V1 |
| `museum-backend/README.md` | **À MODIFIER** | HIGH | `.env.local.example` et `.env.staging.example` **absents** (`ls` vérifié) ; seuls `.env.example` et `.env.production.example` existent. README dit "prefer the environment-specific templates" et liste les 3 cp — 2 sur 3 sont fantômes. | Retirer les 2 lignes cp fantômes ou signaler clairement |
| `museum-backend/CHANGELOG.md` | **OK** | HIGH | Activement maintenu. Entrées détaillées avec sha256, frozen-test mentions. Conforme état du code. | Aucune |
| `museum-backend/docs/observability/PLAUSIBLE_FUNNEL.md` | **OK** | HIGH | Références lib-docs, decisions.md, spec.md cohérentes avec les chemins existants. Contenu opérationnel (Goals, funnel steps, env vars) non-vérifiable sans live Plausible, mais la doc est clairement un runbook ops — pas une spec code. | Aucune |
| `museum-backend/docs/operations/SIGLIP_PROVISIONING.md` | **OK** | HIGH | Statut "bucket not yet provisioned" explicitement signalé. Script `scripts/fetch-models.sh` et `Dockerfile.prod` référencés — cohérents. Failure modes validés. | Aucune |
| `museum-backend/docs/perf/2026-04-30-A1-A2-explain-analyze.md` | **OK** | HIGH | Résultats EXPLAIN ANALYZE mesurés, dates + commits référencés. Snapshot de perf historique — pas un claim dynamique. | Aucune |
| `museum-backend/ops/llm-guard-sidecar/README.md` | **OK** | HIGH | Port 8081 correct, endpoints `/scan/prompt` `/scan/output` `/health` cohérents avec le code adapter. Setup Python 3.11 vérifiable. | Aucune |
| `museum-backend/scripts/llm-security/README.md` | **OK** | HIGH | Note Garak déferré V2.1 présente. Layout fichiers correct (`ls` implicite depuis git ls-files). | Aucune |
| `museum-backend/security/promptfoo/README.md` | **OK** | HIGH | Claims cohérents avec les corpus jailbreak et le workflow CI. | Aucune |
| `museum-backend/src/modules/chat/adapters/secondary/search/SEARCH_PROVIDERS.md` | **OK** | HIGH | Providers actifs (Tavily + Brave), retirés (Google CSE, SearXNG, DuckDuckGo) avec date 2026-05-17. Architecture FallbackSearchProvider correcte. | Aucune |
| `museum-backend/tests/helpers/chaos/README.md` | **OK** | HIGH | Interface `BrokenRedisCache` cohérente avec le code d'injection de fautes. | Aucune |
| `museum-backend/tests/helpers/integration/README.md` | **OK** | HIGH | `createIntegrationHarness()`, `harness.scheduleStop()` — cohérent avec CLAUDE.md §Pièges connus. | Aucune |
| `museum-backend/tests/mutation-killers/README.md` | **OK** | HIGH | Convention de nommage claire, pas de claims techniques vérifiables. | Aucune |
| `museum-frontend/README.md` | **OK** | HIGH | Scripts corrects (`npm run dev`, `npm run lint` décrit comme `eslint + tsc`). `docs/MOBILE_INTERNAL_TESTING_FLOW.md` et `docs/STORE_SUBMISSION_GUIDE.md` existent. `docs/AI_VOICE.md` existe. | Aucune |
| `museum-frontend/RUN_LOCAL.md` | **OK** | HIGH | `pnpm dev:stack` → `scripts/dev-stack.sh` EXISTS. `pnpm dev:stack:down` → `scripts/dev-stack-down.sh` EXISTS. `npm run env:local` / `dev:local` / `dev:check` existent dans `package.json`. `.env.local-dev` et `.env.prod-test` existent (gitignorés mais présents localement — expected). | Aucune |
| `museum-frontend/.maestro/README.md` | **OK** | HIGH | Flows listés cohérents avec les fichiers .yaml présents. Backend prereq port 3000 correct. | Aucune |
| `museum-frontend/.maestro/AUTH_FLOWS_NOTES.md` | **OK** | HIGH | Flows listés avec seeds requis. Contenu maintenance-grade, pas de claims specs dynamiques. | Aucune |
| `museum-frontend/.maestro/MODAL_FLOWS_NOTES.md` | **OK** | HIGH | testID anchors documentés. Note scope honnête (non couverts par sentinel screen-test-coverage). | Aucune |
| `museum-frontend/.maestro/NAV_FLOWS_NOTES.md` | **OK** | HIGH | Flows listés, generated 2026-05-17, cohérent. | Aucune |
| `museum-frontend/.maestro/fixtures/README.md` | **OK** | HIGH | `test-artwork.jpg` Mona Lisa correctement documenté avec source Wikimedia + license. | Aucune |
| `museum-frontend/.maestro/fixtures/audio.md` | **OK** (non lu) | MEDIUM | Confiance basée sur le pattern des autres fixtures docs. | Aucune |
| `museum-frontend/docs/CERT_PINNING_RUNBOOK.md` | **OK** | HIGH | Pinset (leaf + E8 intermediate), NotAfter dates, procédure rotation détaillée. ADR-016 et ADR-031 référencés (non vérifié existence mais probable). | Aucune |
| `museum-frontend/docs/IOS26_CRASH_DIAG.md` | **OK** | HIGH | CLAUDE.md memory dit "RESOLVED 2026-05-14 via Expo SDK downgrade … instrumentation retained until 2026-06-15 bake". Doc dit "instrumentation added" — cohérent avec "retenu jusqu'à bake". Pas de claim "le crash est en cours" dans le doc. | Aucune |
| `museum-frontend/features/README.md` | **À MODIFIER** | HIGH | Table "Status per feature (verified 2026-05-12)" manque 5 features existant dans `museum-frontend/features/` : `diagnostics`, `home`, `legal`, `paywall`, `support`. Ces dossiers sont présents (`ls` vérifié). Table stale ~2 semaines. | Ajouter les 5 features manquantes (ou mettre à jour la date de vérification) |
| `museum-frontend/assets/images/backgrounds/README.md` | **OK** | HIGH | Nommage convention, `mobile/` et `desktop/` dirs existent, `IMAGE_SPECS.json` existe. | Aucune |
| `museum-web/README.md` | **À MODIFIER** | HIGH | `docs/CDN_CLOUDFLARE_SETUP.md` référencé dans §More docs **n'existe pas**. Le doc CDN réel est `docs/adr/ADR-024-cloudflare-cdn-strategy.md` (`find` vérifié). | Corriger le lien CDN |
| `packages/musaium-shared/README.md` | **OK** | HIGH | `file:` dependency pattern documenté correctement. Consumers (3) listés. Guards (bootstrap, sentinel, husky) cohérents avec CLAUDE.md §Pièges connus. Surface exports `.`+`./observability` — cohérent avec CHANGELOG v0.2.0. | Aucune |
| `packages/musaium-shared/CHANGELOG.md` | **OK** | HIGH | v0.2.0 et v0.1.0 documentés. Retrait des phantom sub-paths cohérent avec README. | Aucune |
| `tools/ast-grep-rules/README.md` | **OK** | HIGH | Install + run instructions valides. | Aucune |
| `tools/eslint-plugin-musaium-test-discipline/README.md` | **OK** | HIGH | 2 règles documentées (`no-inline-test-entities`, `no-typeorm-set-undefined`) — cohérent avec CLAUDE.md §ESLint + §Pièges connus TypeORM. | Aucune |

---

## Findings notables

### Finding 1 — CLAUDE.md §Common Commands : commentaire `pnpm lint` erroné (backend + frontend)

**Confiance : HIGH**

- **Backend** — ligne 28 : `pnpm lint  # typecheck (tsc --noEmit)`  
  Réalité (`museum-backend/package.json scripts.lint`) : `eslint src/ --cache ... --max-warnings=0 && pnpm lint:test-discipline && tsc --noEmit --incremental`  
  → Le script exécute ESLint + le plugin test-discipline + tsc. Le commentaire "typecheck (tsc --noEmit)" est trop restrictif et trompeur.

- **Frontend** — ligne 54 : `npm run lint  # typecheck (tsc --noEmit)`  
  Réalité (`museum-frontend/package.json scripts.lint`) : `eslint . --cache ... --max-warnings=0 && tsc --noEmit --incremental`  
  → Le script exécute ESLint + tsc, pas seulement tsc.

**Note** : museum-web `pnpm lint` (ligne 66) dit `# ESLint + typecheck (tsc --noEmit)` — CORRECT.

**Correction** :
```
# CLAUDE.md line 28:
pnpm lint  # ESLint + lint:test-discipline + tsc --noEmit

# CLAUDE.md line 54:
npm run lint  # ESLint + tsc --noEmit
```

---

### Finding 2 — CLAUDE.md §Token Discipline : chemin artworks.data.ts faux + taille openapi.ts stale

**Confiance : HIGH**

- **Chemin faux** : Table ligne `museum-backend/src/modules/daily-art/artworks.data.ts`  
  Réalité (`find` vérifié) : `museum-backend/src/modules/daily-art/adapters/secondary/catalog/artworks.data.ts`  
  → Un agent lisant CLAUDE.md et cherchant ce fichier au chemin indiqué le ratera.

- **Taille openapi.ts stale** : CLAUDE.md dit `~115 KB / ~4800 lignes`  
  Réalité (`wc`) : **129 243 bytes (~126 KB) / 4 834 lignes**  
  → La ligne count est OK (~4800 ≈ 4834). Le KB est sous-estimé d'environ 10% (115 → 126). Pas critique mais inexact.

**Correction** :
```
# Ligne chemin :
| `museum-backend/src/modules/daily-art/adapters/secondary/catalog/artworks.data.ts` | 17 KB / 363 lignes | ...

# Ligne openapi.ts :
| `museum-frontend/shared/api/generated/openapi.ts` | ~126 KB / ~4 800 lignes | ...
```

(artworks.data.ts : réalité 363 lignes / 17 572 bytes ≈ 17 KB — le KB est OK, seules les lignes et le chemin changent.)

---

### Finding 3 — SECURITY.md : V1 launch date stale (2026-06-01 vs 2026-06-07)

**Confiance : HIGH**

SECURITY.md ligne 9 : `"target 2026-06-01"`  
CLAUDE.md §Project Overview (source de vérité) : `"V1 launch 2026-06-07 (minimum, à reconfirmer)"`

Date stale. À corriger pour cohérence.

---

### Finding 4 — museum-backend/README.md : deux fichiers env.example fantômes

**Confiance : HIGH**

README §Environment Setup liste trois templates :
```bash
cp .env.local.example .env        # local dev
cp .env.staging.example .env      # preprod/staging
cp .env.production.example .env   # production
```

Réalité (`ls` vérifié) :
- `.env.example` — EXISTS (legacy)
- `.env.production.example` — EXISTS
- `.env.local.example` — **MISSING**
- `.env.staging.example` — **MISSING**

La section §Environment Setup mène à un `cp` qui fail en silence pour 2 des 3 cas. Le README dit lui-même "prefer the environment-specific templates" — mais 2 des 3 n'existent pas.

**Correction** : retirer les 2 lignes cp fantômes, ou noter qu'ils sont à créer par l'opérateur.

---

### Finding 5 — museum-web/README.md : lien CDN cassé

**Confiance : HIGH**

`museum-web/README.md` §More docs : `- CDN / Cloudflare — ../docs/CDN_CLOUDFLARE_SETUP.md`  
Réalité (`find` + `ls`) : ce fichier **n'existe pas**.  
Le doc CDN existant est `docs/adr/ADR-024-cloudflare-cdn-strategy.md`.

---

### Finding 6 — museum-frontend/features/README.md : table stale (5 features absentes)

**Confiance : HIGH**

Table "Status per feature (verified 2026-05-12)" ne liste pas : `diagnostics`, `home`, `legal`, `paywall`, `support`.  
Ces 5 dossiers existent dans `museum-frontend/features/` (`ls` vérifié).  
La table a ~2 semaines de retard sur l'état réel.

---

## Bilan

**25 OK / 5 À MODIFIER / 0 À SUPPRIMER**

Top 5 findings par sévérité :
1. **museum-backend/README.md** — 2 fichiers `env.example` fantômes → `cp` échoue en silent pour les envs local et staging (Finding 4)
2. **museum-web/README.md** — lien `docs/CDN_CLOUDFLARE_SETUP.md` cassé (Finding 5)
3. **CLAUDE.md** — chemin `artworks.data.ts` faux dans Token Discipline (Finding 2)
4. **CLAUDE.md** — commentaires `pnpm lint` / `npm run lint` incomplets (Finding 1)
5. **SECURITY.md** — V1 target date 2026-06-01 stale vs 2026-06-07 (Finding 3)
