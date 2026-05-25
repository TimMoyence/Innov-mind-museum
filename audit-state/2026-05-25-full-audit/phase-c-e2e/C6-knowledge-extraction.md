# C6 — KNOWLEDGE-EXTRACTION + image-compare (SigLIP/pgvector) — E2E trace

**Branche** `dev` @ `89852f2a1` · architecte READ-ONLY fresh-context (UFR-022) · 2026-05-25
**Méthode** : tout claim cité `path:line` (vérifié via Read/Grep). "supposé" tagué explicitement.

> ⚠️ Cadrage : il y a **DEUX pipelines distincts**, pas un seul flux linéaire.
> - **Pipeline A (vecteur)** : `catalog-ingest` CLI → SigLIP → `artwork_embeddings` → `/chat/compare` kNN. Tenant-scopé (`museum_id`).
> - **Pipeline B (texte/facts)** : `KnowledgeRouter` + `extraction.worker` (BullMQ) → scrape → classify → `artwork_knowledge`. **Sans tenant** (I-SEC8). Lu via `DbLookupService` (6e source enrichment chat).
> Ils se rejoignent uniquement conceptuellement (enrichment des matches compare via Wikidata enricher, PAS via `artwork_knowledge`).

---

## Diagramme entrée → data (path:line)

### Pipeline A — ingest → embed → store → retrieve (vecteur)

```
CLI `--museum=Qxxx`
  → parseCliArgs (catalog-ingest.ts:370) ; validateWikidataQid strict ^Q[1-9][0-9]{0,18}$ (helpers:79,93)
  → main() resolveMuseumId : --museum-id=<int> | lookup museums.wikidata_qid | null=global (catalog-ingest.ts:498-530)
  → runIngest (catalog-ingest.ts:238)
     ├ fetchArtworksOfMuseum SPARQL (helpers:226) ; buildArtworksOfMuseumSparql interpole Qid 2× (helpers:180,186), guard validateWikidataQid (helpers:173)
     │   P275 license = ENTITY URI → mapLicenseUriToSlug (helpers:110,287)
     ├ classifyLicense(raw, allowed) (catalog-ingest.ts:186) ⚠️ slug allow-list
     ├ download thumbnail ≤1 MiB, Content-Length + body cap (helpers:359 / catalog-ingest.ts:143 rawDownload)
     ├ encoder.encode → SiglipOnnxAdapter (siglip-onnx.adapter.ts:116)
     │   preprocess ((x/255)-0.5)/0.5 = [-1,1] ✅ (image-preprocess.ts:17-19) ; output 768-d L2-normalisé (siglip:140,299)
     │   session opts cpu/all/batch=1 (siglip:63) ; timeout→EncoderUnavailableError (siglip:241)
     └ repository.upsertBatch (artwork-embedding.repository.pg.ts:142)
         classifyRows VALUES CTE (skip si vector+modelVersion identiques) → writeBatch INSERT ON CONFLICT(qid) (pg:233,257)
         museum_id ::integer (pg:247) ← opts.museumId ?? null (catalog-ingest.ts:328)
  → DATA: artwork_embeddings (migration 1778406339944) embedding halfvec(768) + HNSW halfvec_ip_ops (migration:53,78)

RETRIEVE — POST /chat/compare (chat-compare.route.ts:215)
  auth → dailyChatLimit → userLimiter → sessionLimiter → multer single('image') → handler (route:215-224)
  verifySessionAccess → {museumId} (route:157) ; museumId forwardé seulement si ≠null (route:170)
  → compareImageUseCase (compare.use-case.ts:82)
     imageProcessor.process (EXIF/magic/OCR guardrail) (compare.use-case.ts:95)
     → similarityService.compare (similarity.service.ts:237)  [5 stages: cache→encode→search→enrich→fusion]
         cache key inclut museumId (similarity:161,167) ✅ OWASP LLM08
         encode → encoder, fallback encoder_unavailable (similarity:394)
         findNearest topN=max(20,4*topK) (similarity:149,257) ; WHERE museum_id IS NULL OR =$4 (pg:122) ✅
         neighbours.length===0 → no_visual_neighbor (similarity:274)
         enrichBatch (Wikidata enricher) ; candidats sans facts droppés (similarity:296,449) (UFR-013)
         scoreCandidate finalScore=wVisual*visualScore (V1 metadataScore=0) (similarity:177,303)
     persist appendAssistantMessage metadata.compareResults (compare.use-case.ts:139) sauf encoder_unavailable→503 (route:181)
  → FE: ChatMessageBubble rend message.metadata.compareResults via ImageCompareCarousel (ChatMessageBubble.tsx:276-278)
```

### Pipeline B — scrape → classify → store → lookup (facts)

```
ExtractionWorker BullMQ queue 'knowledge-extraction' (extraction.worker.ts:22,60)
  job {url, locale} → ExtractionJobService.processUrl (extraction-job.service.ts:49)
     dedup contentRepo.findByUrl + refetchAfterDays (extraction-job.ts:52)
     → HtmlScraper.scrape (html-scraper.ts:327)
         validateUrl SSRF (protocol/hostname/private-IP/IMDS 169.254) (html-scraper:130,297)
         fetchWithSafeRedirects re-valide chaque hop ≤5 (html-scraper:250)
         readBodyWithCap : L1 Content-Length pre-guard + L2 streamed cumulative cap reader.cancel() (html-scraper:182-243) ✅
     → classifier.classify (LLM) (extraction-job.ts:76)
         conf < reviewThreshold → discarded ; < confidenceThreshold → needsReview (extraction-job.ts:82,87)
     → storeClassification switch artwork|museum|irrelevant (extraction-job.ts:102)
         artwork → artworkRepo.upsertFromClassification (typeorm-artwork-knowledge.repo.ts:36)
  → DATA: artwork_knowledge (artwork-knowledge.entity.ts) ⚠️ AUCUN museum_id (I-SEC8)

LOOKUP — DbLookupService.lookup (db-lookup.service.ts:18) "6e source enrichment chat"
  artworkRepo.searchByTitle(term, locale) ILIKE + needsReview=false + confidence>=0.4 (repo:23-33) — PAS de filtre tenant

KnowledgeRouter cascade (knowledge-router.service.ts:183) — distinct de DbLookup, sert le chat principal
  Leg1 KB Wikidata (runWithLegBudget kbTimeoutMs) (router:214) → hit=wikidata
  Leg2 LLM judge (judgeTimeoutMs, fail-open conf=0 force WS) (router:240) → conf>=threshold=skip WS
  Leg3 WebSearch Tavily→Brave (wsTimeoutMs) (router:285) + optional rerank (router:325)
  AbortSignal.any([timeout, parent]) par leg (router:91-93) ✅ pas de loser-leak ; resolve() never throws (router:188)
```

---

## ✅ Solide

- **SigLIP normalize correct** — `((x/255)-0.5)/0.5` = [-1,1], pas ImageNet (image-preprocess.ts:17-19). Le gotcha CLAUDE.md est respecté. Output 768-d L2-normalisé (siglip-onnx.adapter.ts:140,299).
- **pgvector retrieve cohérent** — `<#>` inner-product sur vecteurs L2-unit ≡ cosine, rescale `(1-(e<#>q))/2` (artwork-embedding.repository.pg.ts:119) ; HNSW `halfvec_ip_ops` (migration:78). Cohérent encode↔store↔search.
- **OWASP LLM08 tenant scope (Pipeline A)** — `findNearest` WHERE `museum_id IS NULL OR museum_id=$4` (pg:122) ; cache key inclut tenant (similarity.service.ts:167) ; route resolve depuis `ChatSession.museumId` (chat-compare.route.ts:157,170). Chaîne E2E propre.
- **KnowledgeRouter cascade** — `AbortSignal.any` par leg, pas `Promise.race` (router:91-93) ; fail-open `resolve()` never throws (router:188, R10) ; PII hash sha256[:16] (router:489).
- **html-scraper guards** — Content-Length pre-guard + streamed cap double-couche (html-scraper:182-243) ; SSRF re-validé à chaque redirect hop, IPv4-mapped IPv6 hex form fermé (html-scraper:44,250).
- **catalog-ingest idempotence + SPARQL injection guard** — `validateWikidataQid` strict, interpolé 2× mais gardé (helpers:173) ; upsertBatch skip si parity (pg:142).
- **Compare route complète** — auth+rate-limit+session-ownership+museumId, 503 mapping encoder, taxonomie COMPARE_* (chat-compare.route.ts:215). BE bout-en-bout fonctionnel.

---

## ⚠️ Faible / rupture (path:line + sévérité)

- **[HAUTE] CC-BY-SA ingest IMPOSSIBLE — triple blocage.** Le slug `'cc-by-sa'` est dans le type `ArtworkImageLicense` (artworkEmbedding.entity.ts:22) mais :
  1. `mapLicenseUriToSlug` mappe l'URI CC-BY-SA Q18199165 → `'cc-by-sa-4.0'` (helpers:58), JAMAIS `'cc-by-sa'`.
  2. `classifyLicense` compare au slug allow-list ; `'cc-by-sa-4.0'` ∉ → `null` → `licenseRejected` (catalog-ingest.ts:186, helpers:104). Donc même si `--license-filter=cc-by-sa` passé, l'URI Wikidata réelle ne matche jamais.
  3. Défense en profondeur : CHECK SQL `license IN ('public-domain','cc-0')` (migration:60-61, entity:35) rejetterait `cc-by-sa` au DB layer même s'il arrivait.
  **Verdict : `'cc-by-sa'` est inatteignable depuis Wikidata — le slug est mort.** MAIS ce n'est PAS un blocage de l'ingest réel : la V1 allow-list = `['public-domain','cc-0']` (catalog-ingest.ts:390, et docstring helpers:50). Les œuvres PD/CC-0 (Q19652→`public-domain`, Q6938433→`cc-0`, helpers:54-55) passent. Donc l'ingest réel V1 FONCTIONNE pour le scope visé ; seul CC-BY-SA est inerte (cohérent avec la décision produit 2026-05-08, mais le type union + le mapping `cc-by-4.0`/`cc-by-sa-4.0`/`gfdl-1.2` sont du dead-code forward-compat — helpers:56-59, jamais acceptés). Incohérence : `attribution` "Required for cc-by-sa" (compare-result.types.ts:43,82) référence un état inatteignable.

- **[MOYENNE] Score-floor C3.7 `fallbackVisualThreshold` = DEAD config.** Parsé env.ts:345 (`VISUAL_FALLBACK_VISUAL_THRESHOLD`, défaut 0.4), exposé `env.types.ts:413`, testé (env.test.ts:442,484 + fixtures). **JAMAIS lu** dans `similarity.service.ts` ni `compare.use-case.ts` (grep exhaustif : seulement env/types/tests/dist). Le seul critère `no_visual_neighbor` est `neighbours.length===0` (similarity.service.ts:274) — AUCUN floor de score appliqué. Pire : la docstring `compare-result.types.ts:15` ment — "no candidate above VISUAL_FALLBACK_VISUAL_THRESHOLD" alors que le code ne filtre pas par score. Violation UFR-013 (doc affirme un comportement non implémenté).

- **[MOYENNE] `useCompareImage` FE = ORPHELIN (C3.5 confirmé).** `useCompareImage` (useCompareImage.ts:70) → `imageComparisonApi.compare` POST `/api/chat/compare` (imageComparisonApi.ts:25,46). **Aucun écran/composant n'importe `useCompareImage`** (grep : 0 consommateur hors le fichier lui-même + ses tests). Le chaînon `imageComparisonApi` n'est importé QUE par `useCompareImage`. Le path de RENDU existe (`ChatMessageBubble.tsx:276` lit `message.metadata.compareResults` → `ImageCompareCarousel`), mais le path de DÉCLENCHEMENT (capture photo → mutation) est mort. L'utilisateur V1 ne peut JAMAIS déclencher un compare depuis la mobile app. Pipeline FE E2E rompu.

- **[HAUTE/OPS] pgvector ≥0.7.0 NON gaté (I-OPS6 confirmé).** Migration fait `CREATE EXTENSION IF NOT EXISTS vector` (migration:39) puis `halfvec(768)` (migration:53). AUCUNE assertion de version (grep `extversion`/`pg_extension` = 0 hit dans src/migrations + 0 health-check). Sur un Postgres prod avec pgvector 0.6.x, l'extension s'installe sans erreur PUIS `halfvec` échoue → revert de toute la migration au 1er `migration:run` (exactement le gotcha CLAUDE.md "pgvector halfvec(N) exige ≥0.7.0"). Le CI mitige via image `pgvector/pgvector:pg16`, mais prod VPS n'a pas de garde-fou programmatique.

- **[INFO/SEC8] `artwork_knowledge` cross-tenant — PUBLIC-CATALOG by design, pas un leak.** L'entité n'a AUCUN `museumId` (artwork-knowledge.entity.ts, unique index `(title,artist,locale)` ligne 11). `searchByTitle` ne filtre pas par tenant (typeorm-artwork-knowledge.repo.ts:23-33). MAIS : le contenu = facts encyclopédiques scrapés du web public (Wikipedia/etc via html-scraper) classés par LLM (extraction-job.ts:76,110) — c'est un **catalogue de connaissances publiques partagé**, pas des données tenant-privées. `museum_enrichment` (l'autre sink, extraction-job.ts:128) porte bien `museumId:null` explicite (ligne 132). Verdict : pas de fuite cross-tenant réelle en V1 (single-tenant, contenu public). I-SEC8 = **dette de design à documenter** (asymétrie avec `artwork_embeddings` qui EST scopé) à régler AVANT B2B si un musée veut des fiches privées — sinon faux positif. Le champ `roomId` W3 (entity:60) suggère un futur intra-musée qui rendrait le scope nécessaire.

---

## 🔧 Gaps E2E

1. **FE trigger manquant (bloquant produit)** — aucun écran ne monte `useCompareImage`. Sans un flux capture-photo→mutate, la feature compare est invisible côté mobile malgré BE + composants de rendu complets. Soit câbler, soit `// e2e-skip:` + retirer du scope V1 (UFR-016 : si mort, enterrer).
2. **Score-floor : décider lire-ou-enterrer.** Soit appliquer `fallbackVisualThreshold` dans `similarity.service.ts` (filtrer `neighbours` avec `visualScore < floor` avant `length===0`), soit supprimer la config + corriger la docstring mensongère (compare-result.types.ts:15). État actuel viole UFR-013.
3. **pgvector version gate** — ajouter dans la migration (ou un health/startup check) `SELECT extversion FROM pg_extension WHERE extname='vector'` + throw si < 0.7.0, AVANT le `CREATE TABLE halfvec`. Évite un revert silencieux en prod.
4. **CC-BY-SA dead-code** — soit aligner mapping (`cc-by-sa-4.0`→`cc-by-sa`) + élargir CHECK SQL + allow-list si on veut vraiment CC-BY-SA, soit enterrer le slug `'cc-by-sa'` du type union + le bloc `attribution` "required for cc-by-sa". Forward-compat actuelle = bruit non testé.
5. **`artwork_knowledge` tenant** — documenter explicitement le statut "public catalog, no tenant scope" (ADR ou commentaire entité) pour fermer I-SEC8 comme décision consciente, sinon ré-évaluer avant B2B + `roomId` intra-musée.

---

## Santé E2E par pipeline

- **Pipeline A (vecteur, ingest→store→retrieve BE)** : solide, complet, tenant-scopé. ~8.5/10 (CC-BY-SA inerte + score-floor mort = bruit, pas blocage).
- **Pipeline A (FE trigger)** : rompu — hook orphelin. 2/10.
- **Pipeline B (facts scrape→store→lookup)** : robuste (SSRF/Content-Length/fail-open), mais tenant-flat (dette assumée). 7.5/10.
- **Ops (pgvector gate)** : risque prod non gardé. 5/10.

**Global E2E : 6/10** — le cœur BE est solide mais 2 ruptures notables (FE trigger orphelin = feature non-déclenchable, pgvector non gaté = risque déploiement) tirent la note.
