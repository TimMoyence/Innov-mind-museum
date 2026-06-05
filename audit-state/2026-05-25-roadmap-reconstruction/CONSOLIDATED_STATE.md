# État consolidé V1 — vérification croisée par le code (2026-05-25, J-13)

> **Méthode** : 1 fresh agent a construit `VERIFICATION_TASKLIST.md` (8 domaines, ~98 items). 8 fresh agents (Opus, read-only) ont vérifié CHAQUE item par `Read`/`Grep`/`git show` sur la **bonne ref**. Verdicts détaillés (1 bloc/item, schéma commun) dans `findings/D1..D8`. Aucun code/doc applicatif touché par l'audit.
> **Doctrine** : UFR-024 (path:line reproductible) + UFR-013 (preuve obligatoire). La roadmap était « fausse à ~1/3 » — confirmé : les faux ne sont PAS des faux « shipped », ce sont des **claims d'audit STALE** (décrivent un bug déjà corrigé) + des **path:line dérivés**.
>
> **🛑 CORRECTION POST-AUDIT (2026-05-25, git vérifié) — prime sur §1/§2/§3 ci-dessous.** La prémisse « LOT 1 & LOT 3 = faits sur branches `p0/*` NON mergées » était FAUSSE (erreur d'interprétation `git rev-list --left-right` au seed de l'audit : le `43 2` reflétait un **squash-merge**, pas un non-merge). `git merge-base --is-ancestor` prouve : **LOT 1 mergé sur `dev` via `e0aade002` (#293), LOT 3 via `811fd501c` (#295), LOT 2 via `71f103b35` (#294)**. Donc **LOT 1/2/3 sont TOUS sur `dev`** — aucun merge à faire. Corollaires vérifiés sur `dev` : **I-SEC12 = ✅ fait** (overrides `museum-backend/package.json:80-81`), **A8(b) = ✅ fait** (comment CASCADE). Les verdicts `DONE-BRANCH` des findings D1/D2 doivent se lire **`DONE-DEV`**. **`docs/ROADMAP_PRODUCT.md` (réécrit, sentinelle verte) est la source de vérité à jour** ; les sections ci-dessous gardent leur valeur d'analyse mais leur cadrage « branche/merge » est superseded.

---

## 1. Verdict global : où on en est à J-13

**La majorité du travail P0 est FAITE et MERGÉE sur `dev` (LOT 1/2/3). Le reliquat = LOT 4 stabilité (seul vrai dev neuf) + I-SEC8 + LOT 5 a11y + LOT 6 burial. Pas de merge de branche à faire.**

| Lot | État réel vérifié | Ref | Reste à faire |
|---|---|---|---|
| **LOT 1 — Sécurité/PII** | ✅ FAIT & MERGÉ (12 items) | `dev` (`e0aade002` #293) | I-SEC12 ✅ fait · A8b ✅ fait · B17-rotation = ops |
| **LOT 2 — GDPR/consent** | ✅ FAIT & MERGÉ (6 items) | `dev` (`71f103b35` #294) | I-SEC8 seul OPEN (knowledge cross-tenant) ; 2 claims étaient faux |
| **LOT 3 — Feature-gates/data** | ✅ FAIT & MERGÉ (11 items) | `dev` (`811fd501c` #295) | C8 stats-scope (no-op documenté) |
| **LOT 4 — Stabilité/observ.** | ❌ NON DÉMARRÉ (~9 OPEN) | `dev` | **Le gros reliquat dev.** I-OPS2 (alerting), I-FIX3 (cap coût), I-OPS3/4/6/8 |
| **LOT 5 — a11y** | ❌ NON DÉMARRÉ (4 OPEN) | `dev` | Petits fixes (I-CMP1 one-liner, I-CMP5 domaine, I-CMP3 audio-desc) |
| **LOT 6 — Burial/honnêteté** | ❌ NON DÉMARRÉ (résidus inertes) | `dev` | Suppressions mécaniques (~1243 LOC + 18,5 MB) + TD-AS-01 codemod |
| **Ops Tim (hors-code)** | ⏳ en attente | — | B12 PGP, B13 mailbox, B14 DPA Langfuse, B19 S3 PAB, C7.5 device TTS |

**Santé honnêteté roadmap** : sur 16 clusters « shipped » re-vérifiés (D7a) → 0 faux ✅, 3 ⚠️ connus toujours vrais. Sur 14 réconciliés ✅ (D7bc) → 12 faits + 2 réfutations honnêtes. Sur 8 claims falsifiés → 8/8 restent faux. Sur 9 TD archivés (D8) → 9/9 réellement corrigés, anchors OK. **La roadmap ne ment pas sur la complétude ; elle traîne des descriptions de bugs déjà résolus.**

---

## 2. Plan de déblocage (séquence recommandée, J-13 → launch)

**Estimation volontairement non-chiffrée en jours** (UFR-019 : mes estimations solo sont 50-70 % trop hautes). Ordre par dépendance et par ROI. **LOT 1/2/3 déjà mergés sur `dev` → aucun merge de branche dans ce plan.**

1. **LOT 4 stabilité** (seul vrai chantier dev neuf) — prioriser **I-OPS2** (alertes backend-down/5xx/DB/Redis + severity routing) et **I-FIX3** (cap coût par fan-out + métrer STT/TTS + judge fail-OPEN→fail-CLOSED). Puis I-OPS3 (migration single-path), I-OPS6 (guard pgvector ≥0.7.0), I-OPS4 (budgets timeout), I-OPS8 (required-checks). I-OPS5/I-OPS7/TD-OP-01 = P1/scale, peuvent glisser V1.0.x.
2. **I-SEC8** (knowledge base sans `museum_id` → bleed cross-tenant dans le system prompt) — seul OPEN de sécurité critique restant, à folder dans LOT 4.
3. **LOT 5 a11y** — rapide : I-CMP1 (retirer opacity), I-CMP5 (`musaium.app`→`.com` + skip-link), I-CMP3 (audio-desc 5 sous-points, la feature « for accessibility »).
4. **LOT 6 burial** — mécanique : `git rm --cached stryker-incremental.json` (D2), supprimer llama-prompt-guard ~571 LOC (D3, décision DELETE lockée), 3 hard-skips 238 LOC (D4), SSE dormant ~434 LOC (D1), codemod async-storage (TD-AS-01), 2 reliquats doc (ADR-036 `v1`→`v2`, ref `AiDisclosureModal`).
5. **Ops Tim** : B12/B13/B14/B19 + C7.5 (device TTS smoke iPhone réel).

**Note migrations** : LOT 3 a livré les migrations (wikidata_qid, museum_id reviews/tickets) déjà sur `dev` — **vérifier no-drift sur DB clean** (`migration:run` puis `generate Check` vide) avant le bake prod, ce que l'audit read-only n'a pas pu exécuter.

---

## 3. Directive de réécriture (ROADMAP_PRODUCT.md + TECH_DEBT.md)

> Marqueurs : ✅ = shipped/fait (sur dev) · 🔀 = FAIT sur branche non-mergée (nouveau marqueur, à expliciter en légende) · ❌ = ouvert · ⚠️ = partiel/gap connu · 🧑‍🔧 = ops humain. Tout claim doit garder un path:line qui résout (UFR-024).

### 3.1 P0.A — Security (LOT 1, ref `origin/p0/security`)
- **A3, A4, A6, A7, A9** : ❌ → **🔀 DONE-BRANCH:p0/security**. Note « fait, non mergé ».
- **A5** : ❌ → **🔀**. Corriger le nom du sentinel : `scripts/sentinels/fe-version-sync.mjs` (PAS `museum-frontend-version-sync.mjs`).
- **A8** : ❌ → **⚠️ PARTIAL** : (a) docstring cost-breaker corrigée 🔀 ; (b) docstring `deleteAccount.useCase.ts` non touchée = reste ❌.
- **A1, A2** : restent ✅ (re-confirmés D7bc, `71f103b35`).

### 3.2 P0.B — GDPR (LOT 2 sur dev + reconfirmés)
- **B6, B7, B10, B15, B16, B18** : ❌ → **✅ DONE-DEV** (`71f103b35` #294). B6/B7 = `ThirdPartyAiConsentChecker` wiré (`prepare-message.pipeline.ts` + `chat-media.route.ts`). B15/B16/B18 = `privacy-content.canonical.json` (19 subprocessors, `/terms` `/subprocessors`, âge 15).
- **B1-B5, B8, B9, B11** : restent ✅ (re-confirmés D7bc).
- **B12, B13, B14, B19** : restent ❌ **🧑‍🔧 NEEDS-OPS-HUMAN**.
- **B17** : ⚠️ : code/.env.example nettoyé (🔀 sur p0/security) ; rotation clé = 🧑‍🔧.

### 3.3 P0.C — Feature-gates (LOT 3, ref `origin/p0/feature-gates`)
- **C1, C2, C3, C4, C4b, C5, C6, C7, I-FIX1, I-FIX2** : ❌ → **🔀 DONE-BRANCH:p0/feature-gates**.
  - **C5** : corriger le claim — telemetry **Plausible IMPLÉMENTÉE** (pas « =0 »), module `telemetry/` + funnel + events FE/BE + consent gate.
  - **C4b** : décision tranchée (Aquitaine seul ingest-viable 133 œuvres ; CAPC/Cité du Vin Q-code carto only). Doc-anchors `c4b-sparql-counts.md`/`c2-license-uris.md` **manquants** → à committer au merge ou retirer la ref.
- **C8** : ❌ → **⚠️ PARTIAL** : faille RBAC/BOLA fermée (museum_manager scope JWT) mais `WHERE museum_id` sur stats users/sessions/messages = no-op documenté (`getStats.useCase.ts`).
- **C9** : 🔀 DONE-BRANCH (museum_manager allow-list AdminShell).

### 3.4 P0.I.A — I-SEC (répartis)
- **I-SEC1, I-SEC2, I-SEC3, I-SEC5, I-SEC7, I-SEC10** : ❌ → **🔀 DONE-BRANCH:p0/security**. (I-SEC3 route re-localisée `:204`.)
- **I-SEC12** : reste **❌ OPEN** — le pin `ws`/`brace-expansion` n'existe PAS (overrides vide). **Retirer du périmètre LOT 1** dans la doc (jamais inclus dans le commit « 12 items »).
- **I-SEC4, I-SEC6** : restent ✅ (réfutations confirmées D7bc).
- **I-SEC8** : reste **❌ OPEN** (knowledge sans `museum_id`, `findById` non scopé — `artwork-knowledge.entity.ts` + `prepare-message.pipeline.ts:357`). #294 dit « reclassify » mais NE corrige pas → ne pas cocher.
- **I-SEC9** : ❌ → **✅ FALSE-CLAIM résolu** : `searchTerm` déjà retiré du payload/worker.
- **I-SEC11** : reste ❌ **DEFERRED-V1.1** latent (`UrlHeadProbe` jamais instancié).

### 3.5 P0.I.B — I-OPS (LOT 4, ref `dev`, NON démarré)
- **I-OPS2, I-OPS3, I-OPS4, I-OPS6, I-OPS7, I-OPS8** : restent **❌ OPEN**.
  - I-OPS3 : nuancer « crash-loop » → **conditionnel** (idempotence TypeORM amortit).
  - I-OPS4 : corriger les chiffres → LLM **15s** + budget 25s (pas « 10s×2 »).
  - I-OPS8(d) : « sentinel-mirror absent des required-checks » **non vérifiable par fichier** (config branch-protection GitHub) → marquer « à confirmer via `gh api` / Settings ».
- **I-OPS5** : **⚠️ PARTIAL** : rotation clé GPG doc-mitigée ; restent media non-backupé + bucket unique SPOF (majoritairement IaC/ops).
- **I-OPS1** : reste ✅ (réfutation D7bc ; BE `sentry.ts` set release explicite, FE auto-map RN — confiance moyenne).
- **I-FIX3** : reste **❌ OPEN** (cap $0.002/HTTP pas par fan-out, anon bypass, judge fail-OPEN). Launch-relevant.
- **TD-OP-01** : reste ❌ OPEN (opossum sans dispose, non-blocker).

### 3.6 P0.I.C — I-CMP (LOT 5, ref `dev`, NON démarré)
- **I-CMP1** : reste **❌ OPEN** (`AiDisclosureFooter.tsx:36` opacity:0.7 présent).
- **I-CMP3** : reste **❌ OPEN** — **5/5** sous-violations confirmées.
- **I-CMP5** : reste **❌ OPEN** (skip-link absent + statement pointe `musaium.app`/`support@musaium.app` au lieu de `musaium.com`).
- **I-CMP6** : reste **❌ OPEN** (SBOM non attesté, prio basse CRA 2027 → non-blocker V1).
- **I-CMP4** : reste ✅ (D7bc, badges web OK).

### 3.7 P0.I.D — I-FIX
- **I-FIX1, I-FIX2** : 🔀 DONE-BRANCH:p0/feature-gates (cf 3.3).
- **I-FIX3** : ❌ OPEN (cf 3.5).

### 3.8 P0.D — Burial (LOT 6, ref `dev`, NON démarré)
- **D1** : ❌ → **⚠️** : SSE dormant réel **≈434 LOC** (`sseParser.ts` 81 + `chatApi/stream.ts` 214, derrière flag `EXPO_PUBLIC_CHAT_STREAMING` off). **Corriger 2 claims faux** : `sendMessageStreaming.ts` (185) est **LIVE** (stratégie par défaut, pas dead-code) ; pas de `streaming.e2e.test.ts` FE référant un fichier supprimé.
- **D2** : reste ❌ OPEN (`stryker-incremental.json` tracké, **18,5 MB / 397 976 lignes**).
- **D3** : reste ❌ OPEN (llama-prompt-guard **~571 LOC**, zéro wiring ; décision DELETE lockée). W6.1 déjà `[x]` cohérent.
- **D4** : ❌ → **⚠️** : 3 hard-skips réels = **238 LOC** ; `streaming.e2e.test.ts` est conditionnel valide (pas un hard-skip) → retirer du claim.
- **D5** : ❌ → **⚠️ PARTIAL** : rotation TECH_DEBT **déjà faite** (anchors résolvent) ; restent ADR-036:15,56 `llm:v1:`→`v2` + ref obsolète `AiDisclosureModal` (AI_DISCLOSURE_AUDIT.md ×3, AI_DISCLOSURE.md ×3, ADR-055 ×1).
- **TD-AS-01** : reste ❌ OPEN (≥9 clés async-storage non-namespacées).

### 3.9 P0.F / P0.G — re-confirmés
- **P0.F** : 13 clusters ✅ confirmés. 3 ⚠️ à garder explicites : **C4.3** (assertions `quoteInFacts`/`citeRealUrl` non câblées, gate dead-on-arrival), **W2.2** (branding zéro consumer FE mobile, `ChatHeader.tsx` = `useTheme()` global), **W2.3** (stats per-museum no-op museumId).
- **P0.G** : 8/8 restent faux. **Corriger 2 wordings** : « C9.16 SSE résidus absent » (FAUX, résidus FE présents → D1) et « 5 alerts manquantes » (FAUX, 5 alerts shippées `llm-cost.yml`).

### 3.10 TECH_DEBT.md
- TD-17/18/19/28/30/RN-01/RN-03/52/LF-02 : confirmés fermés, anchors OK. (Cosmétique : line refs stale TD-28 `:225-227`→`:211/:240` dans l'archive.)
- TD-20 : résolu, mais **TD-20a (museumId guardrail) + TD-20b (STT BYTES) restent OUVERTS** — ne pas marquer le cluster entier fermé.
- C6.5 : **wording faux** « 503 fail-open » → réel **fail-CLOSED correct** ; recocher.
- NOW V1.0.x : ~12 items OPEN (tous non-blocker) — C3.5, C3.7, C10 ChooseAnother (path réel `ProactiveMuseumBanner.tsx`), Accept-Language `fr-FR` strict-equals (impact FR visible), Maestro audio-flow cassé, reviews.userName ghost, TTS cache `.mp3` vs Opus, RTL borders, `metric-naming.mjs` dupliqué/divergé, `workspace-links.mjs` absent CI mirror (trou UFR-020), AUDIT_ACCOUNT_DELETED loggé avant cleanup.

---

## 4. Fichiers sources (preuve)
`findings/D1-lot1-security.md` · `D2-lot3-feature-gates.md` · `D3-lot2-gdpr.md` · `D4-lot4-stability.md` · `D5-lot5-a11y.md` · `D6-lot6-burial.md` · `D7a-shipped-reverif.md` · `D7bc-reconciled-falsified.md` · `D8-techdebt-now.md`. Chaque bloc = verdict + path:line + ref + confiance.
