# Audit 04 — Documentation, commentaires & honnêteté/fraîcheur

**Date** : 2026-05-31 · **Scope** : docs/ (~39 .md racine + 65 ADR + ROADMAP×3 + TECH_DEBT + DOCS_INDEX), CLAUDE.md (394 l.), commentaires code BE/FE.
**Verdict** : maturité élevée. La doctrine UFR-013/UFR-024 est réellement outillée et la plupart des références résolvent. Quelques drifts de numéros de ligne et une ambiguïté de basename qui crée une fausse impression de couverture du sentinel.

## Méthode
8 références citées résolues à la main (Read/Grep/Bash) + exécution du sentinel `roadmap-claim-resolves.mjs`.

## Ce qui est solide (preuves)

1. **Sentinel d'honnêteté réel et exécutable**. `scripts/sentinels/roadmap-claim-resolves.mjs` (474 l.) vérifie path:line (fichier existe + ≥ N lignes), SHA commit (`git cat-file -e`), cross-doc, workflows, liens md relatifs. Exclut fences/URLs/`git log`. **Exécuté : PASS** — « scanned 4 roadmap file(s); every path:line / commit SHA / cross-doc / workflow ref resolves (49586 repo files indexed, 13 SHA(s) checked) ». Né de l'audit 2026-05-20 (22 claims P0 falsifiés). Câblé pre-push + sentinel-mirror.yml.
2. **Références ADR de haute fidélité**. `ADR-009-ota-disabled.md` cite `app.config.ts:376-380` → résout EXACTEMENT (`updates.enabled:false`, `checkAutomatically:'NEVER'`, app.config.ts = 397 l.). `ADR-004` status « Resolved (2026-05-14) — watching » cohérent avec MEMORY. `ADR-051` documente honnêtement l'amendement (Llama Prompt Guard adapter DELETED, Presidio infra-ready).
3. **AI_SAFETY.md drift-free**. Les 5 couches citent des fichiers qui existent tous : `art-topic-guardrail.ts`, `sanitizePromptInput()`/`@shared/validation/input.ts`, `llm-prompt-builder.ts`, marqueur `[END OF SYSTEM INSTRUCTIONS]` (grep confirme dans llm-prompt-builder.ts + llm-judge-guardrail.ts), `llm-guard.adapter.ts`, `llm-judge-guardrail.ts`. Cross-refs ADR-015/030/038/047/048/049 + 14 docs compliance listés.
4. **Gotchas CLAUDE.md largement exacts**. Cache key `llm:v2:{contextClass}:...` → confirmé `llm-cache.service.ts:119`. CORS `sentry-trace`+`baggage` → confirmé `app.ts:150-151`. ROADMAP claim `langchain.orchestrator.ts:162-177` (cost breaker) → résout (checkCostBreakerOrThrow).
5. **Densité commentaires saine, pas de pollution TODO**. Grep TODO/FIXME/HACK : **1 BE** (faux-positif : `XXXXX-XXXXX` format recovery-code) + **3 FE** légitimes et scopés (`consentApi.ts:11`, `leadsApi.ts:10` = « swap to OpenApiResponseFor when BE spec exposes », `supportLinks.ts:14` = Instagram handle réel). Aucun cimetière de TODO périmés. Commentaire Stryker `sentry-scrubber.ts:27` documenté + daté (2026-05-13).

## Faiblesses (preuves)

1. **[MEDIUM — fausse impression de couverture] Ambiguïté basename → fausse PASS du sentinel**. ROADMAP_PRODUCT.md:59 cite `sentry-scrubber.ts:37-54` (« 16 clés SENSITIVE_QUERY_KEYS »). MAIS `museum-backend/src/shared/observability/sentry-scrubber.ts` ne fait que **29 lignes** (thin forwarder, aucune SENSITIVE_QUERY_KEYS). Le contenu réel (256 l., SENSITIVE_QUERY_KEYS, scrubRecord) vit dans `packages/musaium-shared/src/observability/sentry-scrubber.ts`. 4 fichiers partagent le basename (BE 29 l., web 43 l., FE 42 l., shared 256 l.). Le sentinel résout par basename vers le PLUS LONG candidat → PASS, mais un lecteur du module BE croit à tort que la ligne existe là. Le claim est *vrai dans l'absolu* mais la citation est trompeuse (mauvais fichier implicite). ROADMAP_AUDIT_TRAIL:18/24 répète `sentry-scrubber.ts:37-54` sans préfixe de chemin.
2. **[LOW] Drift de numéro de ligne dans un gotcha CLAUDE.md**. Le gotcha `museum-web/src/lib/api.ts` affirme « apiPut ajouté (`api.ts:233`) ». Réel : `apiPut` est à **api.ts:258** (le fichier a grossi). Le point du gotcha reste valide (apiPut existe), seul le numéro a dérivé de 25 lignes.
3. **[LOW] Chemin de fichier imprécis dans un gotcha**. CLAUDE.md référence `trace-propagation.middleware.ts` comme middleware monté dans app.ts ; le fichier vit sous `shared/observability/` (pas `shared/middleware/`). Existe bien, mais le lecteur peut chercher au mauvais endroit.
4. **[LOW] Incohérence d'étiquette roadmap**. CLAUDE.md : « ## Roadmap (vivante, **double**) ». DOCS_INDEX.md : « ## Roadmap (vivante, **triple**) » (le 3ᵉ = ROADMAP_AUDIT_TRAIL, 247 l.). Doc structurante qui se contredit sur le nombre de roadmaps.
5. **[LOW] Couverture doc-last-verified étroite**. `scripts/sentinels/doc-last-verified.json` (gate 90 j) ne couvre que **6 docs** (ROADMAP_PRODUCT, ARCHITECTURE, TECH_DEBT, ROPA, SUBPROCESSORS, SECURITY) sur ~50. Les ~44 autres (AI_SAFETY, 65 ADR, AI_VOICE, CAPACITY_PLAN…) n'ont AUCUN garde-fou de fraîcheur — fausse impression que « les docs sont vérifiées ».

## Densité
Ni sur- ni sous-documenté globalement. CLAUDE.md (394 l.) est dense mais chaque gotcha = un incident réel daté avec réf commit. Risque : la section « Pièges connus » devient un mur de texte où les drifts de ligne (apiPut, sentry-scrubber) passent inaperçus car le lecteur ne re-vérifie pas. Zones critiques bien documentées (AI safety, migration governance, cache). 65 ADR = bonne traçabilité décisionnelle, statuts honnêtes (Resolved/Withdrawn/Amended explicites).

## Claims à re-vérifier adversarialement
- ROADMAP_PRODUCT en-tête « 178 items, 93 livré-vérifié » — échantillonner 5 items ✅ contre le code réel.
- doc-last-verified ne couvre que 6/50 docs : la doctrine HON-08 prétend-elle couvrir plus ?
- AI_SAFETY.md « Last review 2026-05-20 » non gardé par doc-last-verified (absent du json) → potentiellement stale sans alerte.
