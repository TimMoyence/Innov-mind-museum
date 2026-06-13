# MISSION — Mise en prod Musaium V1 (launch 2026-08-27)

Monorepo Musaium (`museum-backend` Node22/Express/TypeORM/BullMQ ; `museum-frontend` RN/Expo ; `museum-web` Next15). Objectif : **clôturer à 100 % le backlog de mise en prod (tâches #1→#16 ci-dessous)** + les bugs découverts, pour un launch le **2026-08-27**.

## RÈGLE ZÉRO — re-découverte de chaque feature
Avant de toucher une tâche, **RE-DÉCOUVRE sa réalité** contre l'arbre (Grep/Read/exécution réelle). Les descriptions ci-dessous sont des **points de départ, PAS des vérités**. Plusieurs artefacts du repo se sont déjà révélés **faux** (ex : la doc affirmait « cloud.langfuse.com = US » alors que c'est la région **EUROPE/eu-west-1**). **Aucune supposition ne se propage.** Tout claim = preuve `file:line` OU sortie de commande réelle. « Je ne sais pas » est valide ; inventer ne l'est pas (UFR-013).

## MÉTHODE DE TRAVAIL (non-négociable)
Orchestration multi-agents, **~4 agents en parallèle**. Utilise l'outil **Workflow** (pipeline déterministe + `resumeFromRunId`) ou le skill **/team**. Worktree isolation si édition concurrente.

Pour CHAQUE tâche de code applicatif, **pipeline fresh-context 4 phases** (chaque phase = agent FRAIS, zéro mémoire des autres, lit les artefacts disque) :
1. **SPEC** (architect frais) — user stories + testing rules + feature rules + « ce que la feature doit rendre » + **TOUS les invariants & use-cases possibles** (volume d'idées complet, mode adversarial « comment ça casse »). Output `spec.md`. Aucun code/test.
2. **TESTS** (frais) — écrit les tests depuis la spec, **sur les factories existantes** (`docs/TEST_FACTORIES.md` ; factory modulable non figée — peut grossir avec l'app, MAIS doit laisser les autres tests VERTS ; si un test tiers devient rouge → **escalade**, ne pas bidouiller). **Red d'abord** (un test qui FAIL par use-case). Tier réel (integration = vraie frontière DataSource/queue, jamais mock là où l'infra est réelle).
3. **GREEN** (frais, zéro mémoire phase tests) — passe les tests au vert. **Test GELÉ byte-for-byte** : ne modifie JAMAIS un test ; si un test est faux → émet `BLOCK-TEST-WRONG <file>:<line> <raison>` sans toucher → re-spawn frais en phase tests.
4. **REVIEW** (frais) — review le code, **met à jour la doc si nécessaire**, remonte les erreurs de code. **On boucle en revenant phase 1** à partir de ses retours (rejection loop **illimité**).

Chaque feature a une **liste de tâches globale** ; chaque agent a sa propre liste. **Si un agent tombe** (relogin / session-limit / throttle / socket closed) → **relancer le workflow** (complet ou `resumeFromRunId`).

## GARDE-FOUS PROJET (respecter strictement — cf. CLAUDE.md)
- **Aucun bypass de hook** (UFR-020) : jamais `--no-verify`, `SKIP_*`, etc.
- **lib-docs obligatoire** : tout agent qui touche/relit du code consulte `lib-docs/<lib>/PATTERNS.md` + `LESSONS.md` des libs importées ; refresh si stale.
- Domaine de marque canonique = **musaium.com**. Email contact RGPD = **contact@musaium.com**.
- **NE JAMAIS éditer** : migrations TypeORM jouées (immuables), `museum-web/.next/standalone/**` (régénéré).
- Honnêteté (UFR-013), DRY factories, ESLint discipline, no feature flags pré-launch (UFR-015).
- Output lecture-humaine = HTML self-contained dans `artifacts/`. Reference éditable = markdown.

---

## BACKLOG — 16 tâches (faire 100 %)

> Statuts indicatifs du run précédent — **RE-VÉRIFIER chacun**, y compris ceux marqués « fait » (valider qu'ils sont corrects ET complets, sinon corriger).

### A. CODE applicatif → pipeline 4 phases obligatoire

- **#8 — Conformité : email RGPD brandé.** Remplacer `tim.moyence@gmail.com` → `contact@musaium.com` dans le contenu légal user-facing + docs. Points de départ : 4 `*-content.canonical.json` (BE `src/shared/legal/` + web `src/lib/legal/`, privacy+terms), `museum-frontend/scripts/codegen-legal-content.mjs` (email **hardcodé** ~:199), **régénérer** `museum-frontend/features/legal/privacyPolicyContent.ts` (header GENERATED — ne pas éditer main), `termsOfServiceContent.ts:94`, `museum-web/src/app/[locale]/cookies/page.tsx`, docs légales (`docs/legal/DPIA.md`, `ROPA.md`, `DPIA_ROPA_READINESS.md`, `docs/privacy-policy.html`). Repoint alias `dpo@`→`contact@`. **Exclure** : `.next/`, migration `BackfillSuperAdminOwner.ts` (immuable), `PROD_SUPER_ADMIN_EMAIL`/ops (identité de compte, hors scope). Invariants : 3 copies canoniques byte-identiques sur l'email ; 0 résidu hors exclusions ; i18n FR+EN ; durcir `legalContent.test.ts:13` (`.toContain('@')` → exact). **Statut : `spec.md` + `test-contract.md` (38 UC) déjà produits dans `.claude/skills/team/team-state/working/2026-06-13-conformite-email-subprocessors/` — RE-VÉRIFIER puis phases red→green→review.**

- **#9 — Durcir le mur de boot prod** (`museum-backend/src/config/env.production-validation.ts` UNIQUEMENT). (1) `assertSecretLength('MEDIA_SIGNING_SECRET')` manquant (~:193). (2) Distinctness `EXPORT_PSEUDONYM_SALT` vs tous les autres secrets manquante (`validateExportPseudonymSalt` ~:281-293). Tests red d'abord. Vérifier que `scripts/gen-prod-secrets.sh` produit toujours un `.env` qui PASS `pnpm validate:prod-env`. **NE PAS** toucher Langfuse (host défaut `cloud.langfuse.com` = déjà EU/eu-west-1, correct).

- **#15 — Construire 3 providers web-search manquants.** Aujourd'hui seuls **Tavily + Brave** sont câblés (`museum-backend/src/modules/chat/chat-module.ts` ~:587-590 `buildWebSearch`) ; clients dans `src/modules/chat/adapters/secondary/search/`. Implémenter **Google CSE + SearXNG + DuckDuckGo** comme vrais providers du `FallbackSearchProvider`, les câbler, lire leurs env (`GOOGLE_CSE_API_KEY/ID`, `SEARXNG_INSTANCES` — actuellement **non lus**), ajouter chacun au registre `docs/compliance/SUBPROCESSORS.md` (juridiction par provider). **Retirer `FEATURE_FLAG_WEB_SEARCH`** (variable fantôme, lue nulle part).

- **#16 — Câbler le consumer `MuseumEnrichmentWorker` au boot (BUG V1 : fiche musée vide).** Producteur sans consommateur : `enrichMuseum.useCase` enqueue sur la queue `museum-enrichment` (`enrichMuseum.useCase.ts:48`) mais `MuseumEnrichmentWorker` (`museum-backend/src/modules/museum/adapters/primary/museum-enrichment.worker.ts:220`, `.start()`:229 → `processMuseumEnrichmentJob`:44) **n'est instancié nulle part** → jobs jamais drainés → fiche `pending`/vide. `MUSEUM_ENRICHMENT_SCHEDULER_ENABLED` ne corrige PAS (scheduler = autre queue, scan-stale). **Fix** : instancier le worker + ses deps (Wikidata/Wikipédia/OSM fetchers + cache writer) + `.start()` au boot dans `museum-backend/src/index.ts`, consommant `museum-enrichment` ; fail-open. Phase tests = **integration** (vraie queue BullMQ + DataSource). Vérifier la 2e dimension : POI OSM non persistés en table `museums` → `assertMuseumExists` 404 (le tap d'un POI map enrichit-il un musée DB ?).

### B. CI / CONFIG / DOC → exempt du pipeline /team (yaml/doc), mais RE-DÉCOUVRIR + vérifier par exécution

- **#10 — Maestro `seed:museums`.** Cause racine du « full Maestro jamais vert » : musées jamais seedés en CI. **Statut : fait** — `pnpm seed:museums` ajouté dans `museum-frontend/scripts/maestro-runner-setup.sh` (~:38), couvre les 3 boots (Android shard / netshape / iOS). RE-VÉRIFIER : couvre bien les 3 jobs de `.github/workflows/ci-cd-mobile.yml` ; `seed-museums.ts` idempotent (upsert ON CONFLICT slug).

- **#11 — Alerte nightly Playwright web (rouge silencieux).** Playwright web **0/35 vert depuis 2026-05-06** sans aucune alerte. RE-DÉCOUVRIR le workflow web concerné + la cause du 0/35. Ajouter un job **issue-on-red** calqué sur `maestro-full-alert` (label dédié) + un **mode web** pour `scripts/nightly-status.mjs`.

- **#12 — `PLAUSIBLE_DOMAIN` au CI-CD.** Câbler `PLAUSIBLE_DOMAIN` (+ `EXPO_PUBLIC_PLAUSIBLE_DOMAIN`, `EXPO_PUBLIC_SENTRY_DSN_ANDROID/_IOS`) dans les workflows pertinents (backend deploy + mobile build).

- **#13 — `docs/RELEASE_CHECKLIST.md` re-daté 2026-08-27.** Actuellement « 2026-05-20, launch 2026-06-07 ». Re-dater + 12 items opérateur + cross-link runbooks (`docs/operations/S3_PUBLIC_ACCESS_VERIFICATION.md`, `PGP_KEY_GENERATION.md`, `SIGLIP_MODEL_PROVISIONING.md`, `UNIVERSAL_LINKS_VERIFICATION.md`). Corriger la note PGP stale dans `CLAUDE.md`.

- **#14 — `.env.production.example` `.app`→`.com`.** 3 entrées périmées hors CORS : `FRONTEND_URL`, `SUPPORT_INBOX_EMAIL`, `NOMINATIM_CONTACT_EMAIL` → `musaium.com`. Re-valider via `pnpm validate:prod-env`.

### C. DÉJÀ TRAITÉ — RE-VÉRIFIER seulement (ne pas re-faire si correct)

- **#5 — Langfuse** : host `cloud.langfuse.com` = **EU** (eu-west-1) → garder ; DPA auto-accepté archivé `docs/legal/dpa-signed/langfuse-cloud-eu-dpa.pdf` ; faux claims « US » corrigés dans `SUBPROCESSORS.md:52` + `.env.production.example`. **Vérifier** que ces corrections sont cohérentes et complètes.
- **#7 — Décision web-search** : Tavily+Brave réels gardés + décision de construire les 3 manquants (→ #15). Vars fantômes à purger.

### D. OPÉRATEUR (Tim) — HORS workflow agent
L'agent **ne peut pas** exécuter ceci (secrets réels, consoles OVH/Plausible/PGP). Il produit/maintient une **checklist** et **vérifie** ce qui est vérifiable côté code.
- **#1** `.env.production` (`bash scripts/gen-prod-secrets.sh` pour les 8 secrets app + valeurs réelles ; supprimer `FEATURE_FLAG_KNOWLEDGE_EXTRACTION` & `FEATURE_FLAG_WEB_SEARCH` fantômes).
- **#2** S3 Public-Access-Block sur le bucket OVH → `S3_PUBLIC_ACCESS_BLOCK_VERIFIED=true` (runbook `S3_PUBLIC_ACCESS_VERIFICATION.md`).
- **#3** Mailboxes OVH : **redirections** `security@`/`contact@`/`support@musaium.com` → Gmail (plan MX « redirect » suffit, **pas** de changement de plan).
- **#4** Clé PGP réelle Ed25519 (runbook `PGP_KEY_GENERATION.md`), remplacer `PGP_KEY_PLACEHOLDER_DO_NOT_SHIP`.
- **#6** Compte Plausible pour `musaium.com` → `PLAUSIBLE_DOMAIN`.

---

## LIVRABLE ATTENDU
- Toutes les tâches A/B menées à terme via le pipeline (A) ou en direct vérifié par exécution (B), avec preuves `file:line` / sorties de commande.
- Tâches C re-validées.
- Checklist OPÉRATEUR (D) à jour pour Tim.
- Changements regroupés sur une branche dédiée (`launch-prep-2026-08`) — **jamais committer sur `main` directement**, jamais de bypass de hook. Commit seulement sur demande / en fin de feature avec hooks+tests verts.
- Un récap HTML final dans `artifacts/`.
```

