# A8 — P0.F "shipped & cochés" re-vérification indépendante au HEAD courant

> Agent fresh-context READ-ONLY (UFR-022). Ref vérifiée : `dev` @ HEAD **`89852f2a1`** ("chore(gitnexus): refresh index stats in CLAUDE.md").
> Méthode (UFR-013 / UFR-024) : grep symbole/fichier-clé + lecture ciblée prouvant EXISTENCE + correspondance. Chaque verdict cite path:line réel lu au HEAD. Échantillonnage **indépendant** des claims D7a — NON une recopie.
> Date : 2026-05-25.

## Cadre — drift depuis l'audit D7a (HEAD `9aff378b0` → `89852f2a1`)

`git diff --name-only 9aff378b0 89852f2a1` = 2 commits applicatifs (#298 a11y/compliance lockdown + de-flake e2e admin-user-tier) + docs/audit-state. **AUCUN des 3 fichiers de gap (`ChatHeader.tsx`, `admin.repository.pg.ts` getStats, `halluc-corpus.json`/`halluc.config.yaml`) n'a été touché** entre D7a et HEAD → les 3 ⚠️ persistent verbatim. Les commits interceptés touchent composants a11y, `llama-prompt-guard.adapter.ts`, tests, ADR/legal docs — hors surface "shipped" échantillonnée.

---

### C1.2 (LLM cache wired v2 key + Prom counters + Grafana) — VERDICT: SHIPPED-CONFIRMED
- État réel vérifié : `museum-backend/src/modules/chat/useCase/llm/llm-cache.service.ts:119` clé `llm:v2:{contextClass}:{museumId|none}:{userId|anon}:{sha256}` ; `:129` `sha256OfCanonicalInput` ; `:122/149/152` `voiceMode`+`audioDescriptionMode` inclus dans le canonical input (truthy-only) ; `:4` import + `:64/68/70` `.inc()` sur `llmCacheMissesTotal`/`llmCacheHitsTotal`. Code présent et cohérent avec le commit `d54552beb` (key v1→v2).
- CHECKBOX-FLIP / wording-fix : aucun (✅ tient).
- Amélioration/debt : aucune.

### C3.1 (SigLIP ONNX normalize [-1,1] mean=std=0.5) — VERDICT: SHIPPED-CONFIRMED
- État réel vérifié : `museum-backend/src/modules/chat/adapters/secondary/embeddings/image-preprocess.ts:21` `SIGLIP_MEAN = 0.5`, `:22` `SIGLIP_STD = 0.5`, `:60-62` `(x*inv255 - SIGLIP_MEAN)/SIGLIP_STD` par canal RGB → [-1,1] ; docstring `:17-18` ADR-037 "NOT ImageNet mean/std".
- CHECKBOX-FLIP / wording-fix : aucun.
- Amélioration/debt : aucune.

### C3.2 (pgvector halfvec(768) + HNSW + halfvec_ip_ops) — VERDICT: SHIPPED-CONFIRMED
- État réel vérifié : `museum-backend/src/data/db/migrations/1778406339944-AddArtworkEmbeddings.ts:53` `"embedding" halfvec(768) NOT NULL` ; `:78` `CREATE INDEX ... USING hnsw ("embedding" halfvec_ip_ops) WITH (m=16, ef_construction=64)`. Scope museum_id = migration séparée (citée D7a `1778622760826`, cohérent).
- CHECKBOX-FLIP / wording-fix : aucun.
- Amélioration/debt : aucune. (Rappel gotcha CLAUDE.md : exige pgvector ≥0.7 prod — concerne ops, pas un faux shipped.)

### C3.4 (chat-compare endpoint 5-stages + CompareResult + i18n) — VERDICT: SHIPPED-CONFIRMED
- État réel vérifié : `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-compare.route.ts:2` "T6.2 — POST /chat/compare route handler" ; `:16` import `compareRequestSchema` ; helpers `compareGuardrailBlocked`/`compareInvalidImage`. Route + schema + helpers présents au HEAD.
- CHECKBOX-FLIP / wording-fix : aucun. (C3.5 hook orphan = hors scope P0.F, resté V1.0.x.)
- Amélioration/debt : aucune.

### C4.3 (promptfoo halluc-eval — assertions quoteInFacts/citeRealUrl) — VERDICT: PARTIAL (⚠️ gap CONFIRMÉ TOUJOURS VRAI)
- État réel vérifié : workflow + corpus existent. **MAIS les 2 assertions sémantiques restent non câblées dans le pipeline halluc** au HEAD :
  - `museum-backend/security/promptfoo/halluc.config.yaml:59` `tests: 'file://halluc-corpus.json'` ; `:66 defaultTest.assert` ne contient QUE des `not-contains`/`not-icontains` (`:69-73` `[END OF SYSTEM INSTRUCTIONS]`, etc.). Aucun `type: javascript`, aucun `file://...halluc-assertions` dans `halluc.config.yaml` (seule mention de "javascript" = commentaire `:53`).
  - `halluc-corpus.json` : 0 assertion `javascript` — distribution réelle = **60 `icontains-any` + 5 `not-contains` + 43 `not-icontains`** (grep `"type"`). `quoteInFacts`/`citeRealUrl` = 0 occurrence dans tout `security/promptfoo/*.yaml`+`*.json` (hors `lib/`+`spec`+`dist`). Les seuls `type: javascript` du dossier vivent dans `c2-enrichment.yaml:18/30/41/52` — config DIFFÉRENTE (enrichment C2), pas la gate halluc.
  - → eval halluc = dead-on-arrival pour les 2 fonctions citation : seules des heuristiques `(not-)contains` sont exercées en CI.
- CHECKBOX-FLIP / wording-fix : **MAINTENIR le ⚠️ tel quel** (P0.F:162). Pas de recoche pleine ✅.
- Amélioration/debt : câbler `quoteInFacts`/`citeRealUrl` via `type: javascript` + `file://lib/halluc-assertions` dans `halluc.config.yaml` (les fonctions + unit tests existent déjà), OU reporter explicitement V1.0.x. Gap réel, pas une fabrication.

### C4.4 (citation Zod sources[] v2 + FE SourceCitation + i18n) — VERDICT: SHIPPED-CONFIRMED
- État réel vérifié : BE `museum-backend/src/modules/chat/useCase/orchestration/sources-validator.ts` présent ; FE `museum-frontend/features/chat/ui/SourceCitation.tsx` présent. (Échantillon EXISTENCE ; détail schéma v2 ligne-à-ligne non ré-audité — confiance moyenne sur le shape exact, haute sur l'existence.)
- CHECKBOX-FLIP / wording-fix : aucun.
- Amélioration/debt : aucune.

### C6.1-C6.4 (paywall stub + quota + tier + admin override) — VERDICT: SHIPPED-CONFIRMED
- État réel vérifié : `museum-backend/src/shared/middleware/monthly-session-quota.middleware.ts` présent ; FE `museum-frontend/features/paywall/ui/QuotaUpsellModal.tsx` présent ; admin override `museum-backend/src/modules/admin/useCase/users/changeUserTier.useCase.ts:42` `this.repository.changeUserTier(input.userId, input.newTier)`.
- CHECKBOX-FLIP / wording-fix : aucun.
- Amélioration/debt : aucune.

### C7.1 / C9.x (smoke:api + audio-desc autoplay + AI Act badge + TTS Opus + cache key) — VERDICT: SHIPPED-CONFIRMED
- État réel vérifié : TTS Opus `museum-backend/src/modules/chat/adapters/secondary/audio/text-to-speech.openai.ts:46` `response_format: 'opus'` ; AI disclosure FE `museum-frontend/features/chat/ui/AiDisclosureSheetContent.tsx` + `AiDisclosureFooter.tsx` présents ; cache key v2 inclut voiceMode/audioDescriptionMode (cf C1.2:122/149/152).
- CHECKBOX-FLIP / wording-fix : aucun au niveau cluster. (C9.13 Reranker = throws `RerankerUnavailableError` `null-reranker.adapter.ts:24` → reste P0.G falsifié, hors P0.F — cohérent.)
- Amélioration/debt : aucune (sous-C9 individuels non ré-audités exhaustivement ; confiance cluster haute).

### C10.A1-A6 + B1-B6 (chat UX refonte) — VERDICT: SHIPPED-CONFIRMED
- État réel vérifié : présents au HEAD — `museum-frontend/features/chat/ui/` : `Composer.tsx`, `ArtworkHeroModal.tsx`, `ConversationResumptionBanner.tsx`, `AskMoreChip.tsx`, `CartelScannerSheetContent.tsx` (QR), `ProactiveMuseumBanner.tsx` (proactive).
- CHECKBOX-FLIP / wording-fix : aucun.
- Amélioration/debt : aucune.

### W1.4-W1.6 (UX choix musée ; geofence hybrid ; QR-deeplink + [CURRENT ARTWORK]) — VERDICT: SHIPPED-CONFIRMED
- État réel vérifié : geofence FE `museum-frontend/features/museum/application/useGeofencePreCache.ts` présent ; `[CURRENT ARTWORK]` BE `museum-backend/src/modules/chat/useCase/llm/llm-prompt-builder.ts:75` `return \`[CURRENT ARTWORK]\ntitle: ...\n[END OF CURRENT ARTWORK]\`` avec docstring `:52-62` anti-injection.
- CHECKBOX-FLIP / wording-fix : aucun.
- Amélioration/debt : aucune.

### W2.2 (branding) — VERDICT: PARTIAL (⚠️ gap CONFIRMÉ TOUJOURS VRAI — ZÉRO consumer FE mobile)
- État réel vérifié :
  - Éditeur admin WEB présent : `museum-web/src/app/[locale]/admin/museums/[id]/branding/page.tsx:6` `import { apiPut }` ; `:14-16` commentaire "Per-museum branding editor. Reads/writes `museum.config.branding` via PUT /api/museums/:id (BE allows **arbitrary config record**)" ; `:128` `apiPut(\`/api/museums/${museum.id}\`, { config: nextConfig })`.
  - **ZÉRO consumer FE mobile** : `ChatHeader.tsx:8/60` importe et consomme `useTheme()` de `@/shared/ui/ThemeContext` (mode light/dark global, aucun param tenant/branding). Grep `branding` sur `museum-frontend/{features,app,shared}` (hors tests) = **1 seul match** = `app/(tabs)/home.tsx:34`, qui est un **commentaire JSDoc** (`/** Renders the home screen with branding... */`), PAS un consumer. → branding write-only admin, jamais rendu côté mobile.
  - **Découverte additionnelle (citation D7a obsolète)** : le BE n'a PAS de schéma Zod nommé `branding` — grep `branding` sur `museum-backend/src` (hors tests) = **0 match**. La citation D7a `src/shared/db/jsonb-schemas/museum-config.schema.ts:branding` NE RÉSOUT PAS au HEAD. Le branding est persisté en jsonb arbitraire non typé (`page.tsx:15` "BE allows arbitrary config record") — renforce le gap : pas seulement non-consommé mobile, mais non-validé/non-typé BE.
- CHECKBOX-FLIP / wording-fix : **MAINTENIR le ⚠️** (P0.F:169). Corriger toute citation roadmap pointant un schéma BE `branding` (n'existe pas).
- Amélioration/debt : (1) câbler un consumer mobile (museum config → ThemeContext tenant overlay) OU déclasser le claim "branding" en admin-only ; (2) typer le shape BE (actuellement arbitrary jsonb).

### W2.3 (stats per-museum) — VERDICT: PARTIAL (⚠️ gap CONFIRMÉ TOUJOURS VRAI — museumId no-op au repo)
- État réel vérifié :
  - Use-case `museum-backend/src/modules/admin/useCase/analytics/getStats.useCase.ts:25-29` documente explicitement "V1 — the underlying repository does not yet scope stats by museumId ... global cross-tenant snapshot until users/sessions/messages gain museum_id columns (out-of-scope this lot)". `museumId?:number` `:18` threadé mais non utilisé au repo.
  - Repo `museum-backend/src/modules/admin/adapters/secondary/pg/admin.repository.pg.ts:213` `async getStats(): Promise<AdminStats>` — **AUCUN paramètre museumId** ; `:214-235` trois `COUNT(*)` (`u.role` groupBy, sessions, messages) **non scopés** par tenant. Confirme le no-op.
  - Note : D7a citait le repo sous `adapters/secondary/persistence/` — chemin réel = `adapters/secondary/pg/`. La ligne :213 et le comportement sont identiques (imprécision de chemin D7a, pas un nouveau gap).
- CHECKBOX-FLIP / wording-fix : **MAINTENIR le ⚠️** (P0.F:169, bug C8 latent). Pas de recoche pleine ✅.
- Amélioration/debt : ajouter colonnes `museum_id` à users/sessions/messages OU clamp explicite (refuser stats per-museum tant que non scopé) pour éviter fuite cross-tenant à un museum_manager. Cross-ref C8 (DOMAINE 2 / P0.G C8 RBAC).

---

## Synthèse A8

| Verdict | Count | Clusters |
|---|---|---|
| SHIPPED-CONFIRMED | 9 | C1.2, C3.1, C3.2, C3.4, C4.4, C6, C7.1/C9, C10, W1.4-1.6 |
| PARTIAL (⚠️ gap maintenu) | 3 | C4.3, W2.2, W2.3 |
| FALSE-CLAIM | 0 | — |

**Aucun faux "shipped" au HEAD `89852f2a1`.** 12 clusters échantillonnés (9 confirmés + 3 ⚠️). Les 3 gaps ⚠️ (C4.3 / W2.2 / W2.3) sont **TOUS confirmés persistants** au HEAD — fichiers non touchés depuis D7a. Pas de FALSE-CLAIM : tout le code coché ✅ existe ; les 3 PARTIAL ne sont pas des fabrications mais des sous-gaps documentés.

**Découvertes additionnelles (corrections de citations D7a, pas de nouveaux gaps) :**
1. W2.2 : BE n'a AUCUN schéma `branding` (grep = 0 dans `museum-backend/src`) — la citation D7a `museum-config.schema.ts:branding` ne résout pas. Branding = jsonb arbitraire non typé. Renforce le gap.
2. W2.3 : repo getStats est sous `adapters/secondary/pg/` (D7a disait `persistence/`) — ligne:213 + comportement identiques.
3. C4.3 : les seuls `type: javascript` du dossier promptfoo vivent dans `c2-enrichment.yaml` (config enrichment, ≠ gate halluc) — confirme que la gate halluc n'exerce pas les assertions citation.
