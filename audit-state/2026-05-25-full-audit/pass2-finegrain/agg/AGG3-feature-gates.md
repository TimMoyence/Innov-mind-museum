# AGG3 — Synthèse domaine FEATURE-GATES (pass-2 fine-grain, agrégation READ-ONLY)

> Agent d'AGRÉGATION fresh-context (UFR-022). **CONSOLIDE** les rapports de feuilles pass-2 (`L11`-`L15`) + contexte pass-1 (`A4`, `B6`-data, `B6`-secu, `C8`-admin-telemetry). **Aucune re-vérif code** — les chemins:lignes proviennent des feuilles, qui les ont vérifiés sur `dev` @ HEAD `1fb32f5ba` (pass-2) / `89852f2a1` (pass-1, état final équivalent).
> Scope roadmap : `docs/ROADMAP_PRODUCT.md` P0.C1..C9 + C4b + P0.I.D (I-FIX1..3).

---

## 1. Tableau consolidé des verdicts

| Item | Marqueur roadmap actuel | Verdict pass-1 (A4) | Verdict pass-2 consolidé | Sévérité gap | Flip recommandé |
|---|---|---|---|---|---|
| **C1** SigLIP provisioning | ✅ | DONE | **PARTIEL** — code SHA-pin OK, **provisioning ops NON fait** | MOYEN (risque 503 /chat/compare prod) | **✅ → ⚠️ + 🧑‍🔧** |
| **C2** SPARQL license URI→slug | ✅ | DONE | **FIX PARTIEL** — pd/cc-0 OK+testé ; **CC-BY-SA inatteignable** ; fixture intégration masque encore le chemin URI | MOYEN (fausse promesse CLI + 0 test cc-by-sa) | ⚠️ qualifier (cc-by-sa) |
| **C3** Migration wikidata_qid + CLI lookup | ✅ | DONE | **CONFORME** — leak `museum_id=NULL` corrigé ; réserve : résolution Qid→DB istanbul-ignored, non testée e2e | FAIBLE | ✅ garder |
| **C4** Seed Bordeaux + Q-codes + retrait Paris | ✅🧑‍🔧 | DONE (exec=ops) | **DONE-DEV** code/tests 8/8, MAIS 2 claims roadmap FAUX + retrait Paris NON FAIT | MOYEN (honnêteté + dead code Paris) | ✅ garder code, **corriger texte roadmap l.134** |
| **C4b** Image-compare Aquitaine seul | ✅ | DONE | **COHÉRENT** — décision documentée, mais "Aquitaine-only" = OPÉRATIONNEL, **pas de gate code** | FAIBLE | ✅ garder |
| **C5** Telemetry Plausible (KR4) | ✅ | DONE | **DONE-DEV** — câblé E2E (BE 24/24, FE 284/284), seul gap = env var FE `EXPO_PUBLIC_PLAUSIBLE_DOMAIN` non documentée → no-op silencieux prod | MOYEN (KR4 dashboard vide sans set manuel) | ✅ garder |
| **C6** `.env.example` corrections + dead-var drop | ✅🧑‍🔧 | DONE (appli=ops) | **DONE** — outcome correct (5 dead vars #295 + 2 antérieurs), corrections réelles. Caveat : attribution #295 partielle, "mirror" asymétrique | TRIVIAL (provenance) | ✅ garder |
| **C7** Reviews/Tickets museum_id + scope read+update | ✅ | DONE | **PARTIEL** — migrations+entités+**write-path** scopés OK ; **admin READ+UPDATE NON scopés** (4 use-cases) ; **NPS per-museum = dead code** ; user→museum jamais assigné (rows NULL) | MOYEN (BOLA latent + dead code + over-claim) | **✅ → ⚠️** |
| **C8** Multi-tenant leak `/admin/analytics` + `/admin/stats` | ⚠️ | PARTIAL | **PARTIEL** (conforme ⚠️) — RBAC/BOLA fermé sur `/stats`, mais leak agrégat global = no-op documenté ; `/analytics/*` admin-only sans museumId ; **+ bug analytics 400** (NEW) | MOYEN (leak latent V1 + UI cassée) | ⚠️ garder |
| **C9** museum_manager dans AdminShell allow-list | ✅ | DONE | **DONE-DEV** (FE allow-list correct) — mais produit **7 nav links morts** (BE 403), incohérence FE↔BE | FAIBLE (cosmétique/UX, pas sécu) | ✅ garder + qualifier "7 dead links" |
| **I-FIX1** Cache invalidate namespace `llm:v2:` | ✅ | DONE | **CONFIRMÉ** — délègue au bon namespace, câblé, testé. Aucune divergence fonctionnelle | — | ✅ garder |
| **I-FIX2** Cross-artwork cache key `currentArtworkKey` | ✅ | DONE | **CONFIRMÉ** — 2 œuvres = clés distinctes, testé. Edge `roomId` non-folded = TD-LOW | TRIVIAL | ✅ garder |
| **I-FIX3** STT/TTS metering + cap fan-out + anon + judge fail-OPEN | ❌ | OPEN | **CONFIRMÉ NON-FIXÉ à HEAD** — les 4 sous-claims tiennent. Remédiation existe sur `34bf280fc`/#300 mais **NON-ANCÊTRE de HEAD** (non mergée) | P0/V1.0.x (sécu+coût) | ❌ garder |

**Comptage** : DONE/CONFORME (6 : C3, C4b, C5, C6, I-FIX1, I-FIX2) · PARTIEL/qualifier (5 : C1, C2, C7, C8, C9) · OPEN (1 : I-FIX3).

---

## 2. Corrections de marqueur roadmap (DIVERGENCE pass-2 vs pass-1)

> **Point central** : pass-1 (A4) avait conclu **AUCUN checkbox-flip** (« tous les marqueurs conformes »). Le fine-grain pass-2 INFIRME ça sur 2 items en creusant au-delà de la présence de code/migration.

### 2.1 C1 ✅ → ⚠️ (+ 🧑‍🔧) — RECOMMANDÉ
Pass-1 a vu le code (`fetch-models.sh`, runbook, test) et coché DONE. Pass-2 (L11) confirme le code correct **mais** :
- GCS bucket `musaium-models-public` **non provisionné** (`fetch-models.sh:36-40` TODO(ops) non résolu).
- `SIGLIP_ONNX_SHA256` **jamais injecté en CI** (grep `.github/workflows/` = 0 ; les 4 `docker/build-push-action` ne passent aucun `build-args:`) → SHA reste `""` → fetch warning-only silencieux.
- Prod default `EMBEDDINGS_PROVIDER=siglip-onnx` (`env-resolvers.ts:136`), **absent de `.env.production.example`**, fallback `replicate` non câblé.
→ Le risque « cold-start /chat/compare = 503 » du roadmap **reste ouvert tel quel**. Le ✅ couvre le code, pas le provisioning. Le marqueur honnête = **⚠️ DONE-DEV (code) + 🧑‍🔧 (provisioning ops bloquant)** — aligné sur la note roadmap l.158 « vérifier /chat/compare en prod ».

### 2.2 C7 ✅ → ⚠️ — RECOMMANDÉ
Pass-1 a vu migrations + `aggregateNps(museumId)` scopé au repo et coché DONE. Pass-2 (L13) re-trace les call-sites et trouve que le scope **n'est jamais exercé sur la surface admin** :
- Admin READ reviews/tickets : `ListAllReviewsUseCase` (`listAllReviews.useCase.ts:30-35`) + `ListAllTicketsUseCase` (`listAllTickets.useCase.ts:35-39`) ne passent **PAS** museumId → tout admin/moderator voit tous les tenants.
- Admin UPDATE : `ModerateReviewUseCase` (`moderateReview.useCase.ts:59-72`) + `UpdateTicketStatusUseCase` (`updateTicketStatus.useCase.ts:37-42`) update par id seul, **zéro tenant guard**.
- `aggregateNps`/`findByMuseum` = **dead code** (zéro caller non-repo/non-test) → la « KR2 NPS per-museum » que C7 prétend débloquer **n'a aucune surface API**.
- `users.museum_id` **jamais assigné** (aucun write path) → en V1 chaque row review/ticket = `museum_id = NULL`, le write-scope est inerte.
→ L'audit original offrait un binaire « scope ALL read+update, OU descope KR2 global » — **ni l'un ni l'autre fait**. Le ✅ DONE-DEV (`ROADMAP:162`) est **over-claimed** ; son voisin C8 porte déjà « no-op documenté » — C7 mérite le même qualifier **⚠️** sur read+update + NPS.

### 2.3 C4 — pas un flip, mais texte roadmap à corriger
- `ROADMAP:134` affirme `scripts/seed-pilot-museums.sh` « N'EXISTE PAS (claim audit antérieur faux) » — **FAUX** : le fichier EXISTE (6880 bytes, exécutable, dernier commit `f6335fe52`). C'est le claim « n'existe pas » qui est faux.
- `ROADMAP:134` localise les Q-codes Paris à retirer dans `catalog-ingest.helpers.ts`+`seed-museums.ts` — **IMPRÉCIS** : ces fichiers n'ont aucun Q-code Paris actif (seed Paris sans `wikidataQid`, helpers = param/docstring). Le vrai siège = `seed-pilot-museums.sh:56-62` (`louvre=Q19675`, `orsay=Q23402`, `pompidou=Q193554` + boucle d'ingest réelle `:158-172`), **non cité**.

---

## 3. NOUVEAUX findings pass-2 (au-delà du pass-1)

| # | Item | Finding NOUVEAU (pass-2) | Source | Sévérité |
|---|---|---|---|---|
| N1 | C1 | SHA256 **jamais injecté en CI** (0 `build-args:` sur les 4 `build-push-action`) + prod default `siglip-onnx` absent de `.env.production.example` + fallback `replicate` non câblé. Risque 503 confirmé OUVERT (pas seulement « ops-human à vérifier ») | L11 | MOYEN |
| N2 | C2 | **CC-BY-SA doublement inatteignable** : (a) slug produit `cc-by-sa-4.0` ≠ `cc-by-sa` allow-list (pas de normalisation), (b) **DB CHECK 2-valeurs** `IN ('public-domain','cc-0')` (`AddArtworkEmbeddings.ts:60-61`) — n'inclut même pas `cc-by-sa`. Le CLI **annonce** `cc-by-sa` comme filtre valide → 0 insertion silencieuse. **0 test cc-by-sa**. Fixture intégration injecte encore des SLUGS (pas d'URI Wikidata) → bug invisible aux tests e2e | L11, B6-data | MOYEN |
| N3 | C2/C4b | **doc-anchors `c4b-sparql-counts.md` + `c2-license-uris.md` CASSÉS** — non trackés (`git ls-files` vide), référencés **8× dans du code shippé** (seed-museums.ts, catalog-ingest.helpers.ts, + tests), pointent vers répertoire `working/` éphémère supprimé. **AUCUN sentinel ne les attrape** | L12, B6-secu | MOYEN (UFR-024) |
| N4 | C2/C4b | **`doc-anchor-check.mjs` cité dans CLAUDE.md (§ Pièges) + plusieurs audits N'EXISTE PAS** (`find` vide). Seul sentinel UFR-024 réel = `roadmap-claim-resolves.mjs` qui ne scanne QUE `docs/ROADMAP*.md`, PAS les anchors en commentaires code → méta-anchor cassé (CLAUDE.md référence un outil fantôme) | L12 | MOYEN (méta-honnêteté) |
| N5 | C4 | `scripts/seed-pilot-museums.sh` **EXISTE** (réfute roadmap l.134 « n'existe pas ») et ingère réellement Louvre/Orsay/Pompidou (`:158-172`) — dead/contradictoire pré-NorthStar, « pilot weekend B2B » contredit le re-scope V1 (0 pilot contracté). **Q-codes Paris PAS retirés** (`:56-62`) | L12, B6-data | MOYEN (honnêteté + UFR-016 dead code) |
| N6 | C5 | **`EXPO_PUBLIC_PLAUSIBLE_DOMAIN` (+ `_ENDPOINT_URL`) absent de TOUS les `.env*.example` FE** → `resolveDomain()` (`plausible.ts:85-86`) lit sans fallback → en prod sans set manuel, les 3 events FE **no-op silencieux** (`return` l.113) → KR4 dashboard reste vide. Code fail-safe correct, c'est la config/doc qui manque | L12 | MOYEN |
| N7 | C7 | **`aggregateNps`/`findByMuseum` = dead code** (zéro caller) — « KR2 NPS per-museum » n'a aucune surface API. Dead code masquant une feature, **pire qu'un descope** | L13 | MOYEN (honnêteté + UFR-016) |
| N8 | C7 | **`users.museum_id` jamais assigné** (aucun write path "assign manager to museum") → axe museum_id entièrement inerte en V1 (toutes rows NULL). Prereq B2B-future non nommé | L13, C8 | FAIBLE (latent V1) |
| N9 | C8 | **Analytics page `withMuseumScope` → 400** (NEW) : `museum-web/.../analytics/page.tsx:108-128` append `?museumId=` aux 3 calls, mais schémas BE = `z.strictObject` SANS `museumId` → sélectionner un musée fait **400 même pour un admin**. Sélecteur de musée **broken-by-construction** (dead UI), drift contrat FE↔BE (W2.3) | L14, C8 | MOYEN (bug fonctionnel) |
| N10 | C8 | `analytics-scope.test.ts` **mocke le useCase** → le leak agrégat global est **invisible à CI** (anti-pattern UFR-021). Le test pin la route-scope/BOLA seulement | L14, B6-secu, C8 | FAIBLE (test creux) |
| N11 | C9 | **7 nav links morts** pour museum_manager : 6 endpoints admin → 403 (users, audit-logs, reports, analytics[×3], tickets, reviews) ; seul dashboard fonctionne (et leak global). FE allow-list ouvre des pages que le BE refuse. Commentaire AdminShell « per-page scoping » = **aspirational, non implémenté** (claim FE faux) | L14, B6-secu, C8 | FAIBLE-MOYEN (UX + honnêteté) |
| N12 | Branding (C8-adjacent) | **W2.2 branding = write-only, AUCUN consumer** : `museum.config.branding` écrit via `PUT /museums/:id`, mais grep `branding` dans `museum-backend/src` = **0**, dans FE = 0 (seul `primaryColor` = map-marker app, pas branding musée). Sous-titre « takes effect on next visitor session » = **FAUX** (UFR-013). Public DTO exclut config | C8 | MOYEN (dead feature + claim faux) |
| N13 | I-FIX3 | **Remédiation existe sur `34bf280fc` (#300) mais NON-ANCÊTRE de HEAD** (`git merge-base --is-ancestor` = NON). Le commit titre « I-FIX3 fan-out metering + judge degrade telemetry » et touche `llm-judge-guardrail.ts`/`llm-cost-guard.ts`/`.middleware.ts` mais **pas mergé** → état pré-fix présent à HEAD | L15 | P0 (à merger/re-traiter) |
| N14 | I-FIX3 | Corrections de chiffres vs roadmap : (a) « STT/TTS zéro cost recording » = STALE — ils émettent des Langfuse `generation` (TD-20), juste pas contre le cap `LlmCostGuard` ; (b) cap per-user = **$0.5/jour** (`OPENAI_USER_DAILY_USD_CAP`), le $0.002 est le montant PAR requête, pas le cap ; (c) « ~1100 MAU » **non dérivable du code** (extrapolation, mécanisme 500 calls/j confirmé) | L15 | FAIBLE (précision) |
| N15 | C8 | **`apiPut` EXISTE** (`museum-web/src/lib/api.ts:233`) → gotcha CLAUDE.md « apiPut n'existe pas » est **STALE** | C8 | TRIVIAL (doc stale) |

---

## 4. Dette priorisée (domaine FEATURE-GATES)

### P0 / V1-blocker (FIX in-session, pas track-for-later — cf. UFR `track_not_treat_v1_blocker`)
1. **I-FIX3** (N13) — merger `34bf280fc`/#300 vers HEAD OU re-traiter : (a) STT/TTS hors cap coût, (b) cap flat $0.002/HTTP non par fan-out, (c) anon bypass cap per-user, (d) **judge fail-OPEN à budget épuisé = régression sécu silencieuse**. SEUL item OPEN du périmètre. *(Note : la roadmap classe ❌ comme finition résiduelle, pas blocker dur ; mais le judge fail-OPEN sécu mérite escalade.)*
2. **C1 provisioning** (N1) — provisionner GCS `musaium-models-public` + publier SHA canonique + injecter `SIGLIP_ONNX_SHA256` en CI (`build-args:`) OU baker le modèle dans Docker OU basculer prod sur `replicate` + documenter. Sinon /chat/compare = 503 cold-start en prod. **Flip C1 → ⚠️🧑‍🔧.**

### P1 / honnêteté + cohérence (corriger avant claim "feature-gates closed")
3. **C7 read+update scope** (N7, C7 flip) — wirer `museumId` dans `ListAllReviews`/`ListAllTickets`/`ModerateReview`/`UpdateTicketStatus` + force-scope role museum_manager (mirror pattern C8 `admin.route.ts:256-259`) OU descoper explicitement. **Flip C7 → ⚠️.** Enterrer `aggregateNps`/`findByMuseum` (UFR-016) si NPS reste global.
4. **C2 CC-BY-SA** (N2) — décision : soit normaliser `cc-by-sa-4.0`→`cc-by-sa` + élargir DB CHECK + test URI cc-by-sa, soit **retirer `cc-by-sa` de `AllowedLicense`** + déclarer V1 = pd/cc-0 strict (cohérent spec §8 Q2) → supprime la fausse promesse CLI. Migrer fixture intégration vers URIs.
5. **doc-anchors + sentinel fantôme** (N3, N4) — committer `c4b-sparql-counts.md` + `c2-license-uris.md` dans un emplacement tracké (ex `museum-backend/docs/`) + corriger les 8 réfs, OU retirer les réfs. **ET** : créer le `doc-anchor-check.mjs` promis par CLAUDE.md OU corriger CLAUDE.md (claim sentinel inexistant).
6. **C4 dead pilot script + texte roadmap** (N5) — enterrer (UFR-016) OU re-cibler Bordeaux `scripts/seed-pilot-museums.sh` (Louvre/Orsay/Pompidou contradictoire V1) ; purger Q-codes Paris `:56-62` si politique "0 Q-code Paris" ; **corriger roadmap l.134** (script existe ≠ n'existe pas ; bons fichiers cités).

### P2 / fonctionnel + config
7. **C5 env FE** (N6) — ajouter `EXPO_PUBLIC_PLAUSIBLE_DOMAIN` (+ `_ENDPOINT_URL`) aux `.env*.example` FE, sinon funnel FE inerte en prod (KR4 vide).
8. **C8 analytics 400** (N9) — soit ajouter `museumId` aux 3 schémas analytics + thread aux queries, soit retirer le sélecteur de musée de `analytics/page.tsx` (FE shippé contre contrat BE qui le rejette).
9. **C8 stats leak** (TD-C8-1) — `museum_id` sur users/sessions/messages OU descope, OU bloquer museum_manager de `/stats` jusqu'au scope réel. Latent V1 (0 tenant contracté).
10. **C9 nav 403** (N11) — role-filter `NAV_KEYS` pour museum_manager (cacher les 6 surfaces 403) OU widen BE requireRole + tenant scope. Corriger le commentaire AdminShell « per-page scoping » (faux).
11. **Branding W2.2** (N12) — wirer un consumer (mobile theming depuis `config.branding`) OU marquer non-fonctionnel + corriger le sous-titre « takes effect on next visitor session » (claim faux UFR-013).

### P3 / précision + tests + cleanup (non-bloquant)
12. **C8 test creux** (N10) — test exerçant le VRAI `GetStatsUseCase.execute({museumId})` (pin no-op assumé, pas mock).
13. **C3 réserve** — test e2e de la résolution Qid→museumId DB (actuellement istanbul-ignored).
14. **I-FIX2 roomId** — folder `roomId` dans `currentArtworkKey` (TD-LOW, cohérence prompt↔clé).
15. **C6 / précisions** — corriger attribution #295 (ANTHROPIC=#293, FEATURE_FLAG=`6a50ac8f4`) ; "mirror" asymétrique. Trivial.
16. **CLAUDE.md gotcha stale** (N15) — retirer « apiPut n'existe pas » (apiPut EXISTE `api.ts:233`).
17. **C2 docstring** — `helpers.ts:49` dit allow-list V1 = `['public-domain','cc-0']` alors que runtime = `+'cc-by-sa'` (l.40 correcte). Induit en erreur.

---

## 5. Mitigant transverse V1 (honnête)
Tous les gaps multi-tenant (C7 read+update, C8 stats leak, C9 nav 403, branding) sont **latents, pas actifs** en V1 : launch B2C-only, **zéro musée B2B contracté** (CLAUDE.md), aucun compte `museum_manager` réel, `users.museum_id` jamais peuplé. Sévérité = HIGH-si-exploité / quasi-zéro-likelihood-V1. Exceptions **non-mitigées par le statut B2B** : C1 (503 prod réel pour tout user B2C de /chat/compare), C5 (KR4 dashboard vide), I-FIX3 (cap coût + judge fail-OPEN affectent tous les users), branding-claim-faux (honnêteté UFR-013 indépendante du B2B).
