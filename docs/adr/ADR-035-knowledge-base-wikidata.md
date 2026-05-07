# ADR-035 — Knowledge Base Wikidata enrichment for chat prompts

- **Status**: Accepted — Implemented (always-on since 2026-04-19, feature flags removed)
- **Date**: 2026-05-07 (consolidated from `docs/FEATURE_KNOWLEDGE_BASE_WIKIDATA.md` which is now deleted)
- **Owner**: backend / chat module
- **Scope**: museum-backend chat orchestration

## Context

Les LLM hallucinent régulièrement sur les dates, techniques, attributions d'œuvres. Un assistant musée qui affirme "la Joconde est une aquarelle de Raphaël" détruit la confiance utilisateur immédiatement.

L'analyse concurrentielle 2026-04 montre qu'aucun concurrent (Smartify, Ask Mona, Musa Guide) n'injecte de faits vérifiés dans le contexte LLM. Tous dépendent uniquement de la mémoire paramétrique du modèle, avec les hallucinations qui en découlent.

## Decision

Enrichir le prompt système chat avec un bloc `<knowledge_base>` contenant des données structurées Wikidata (artiste, date, technique, collection, mouvement) avant chaque appel LLM. Le LLM est instruit de traiter ces données comme **source de vérité**.

Implementation hexagonale :
- **Port** : `KnowledgeBaseProvider` dans `museum-backend/src/modules/chat/domain/ports/`.
- **Adapter** : `WikidataClient` (`adapters/secondary/search/wikidata.client.ts`) — fetch SPARQL contre `https://query.wikidata.org/sparql`, never throws (fail-open).
- **Use case** : `KnowledgeBaseService` (`useCase/knowledge/knowledge-base.service.ts`) — wraps lookup, applies cache TTL, formats prompt block.
- **Wiring** : `chat-module.ts:206-208` — `buildKnowledgeBase(cache)` retourne le service ou `undefined` si KB désactivée.

Le bloc retourné est wrappé en `<untrusted_content source="knowledge_base">` (cf. `llm-prompt-builder.ts` doc 06 § Indirect-injection wrapper) — defense-in-depth contre une injection éventuelle dans le contenu Wikidata.

## Consequences

**Positive** :
- Réduction visible des hallucinations factuelles sur les questions où Wikidata couvre.
- Différenciateur produit vs concurrents qui dépendent du LLM seul.
- Architecture extensible — ajouter un autre provider (Smithsonian Open Access, Met Museum API) = nouveau adapter implémentant `KnowledgeBaseProvider`.

**Negative** :
- Dépendance à Wikidata.org (SPARQL endpoint public, pas de SLA contractuel). Fail-open via `safeJwtVerify`-style : si Wikidata down → bloc absent du prompt, chat continue normalement.
- Couverture incomplète : Wikidata couvre bien les artistes/œuvres canoniques, faiblement les artistes contemporains, jamais les œuvres très spécifiques d'un musée local.
- Latence ajoutée : ~150-300 ms par lookup non-cached. Cache Redis TTL 7 jours sur les entités stables (artistes décédés). Lookup async parallèle au reste de la composition prompt.

**Mitigations** :
- Cache LLM (Spec G, ADR séparée) capture les réponses qui dépendent du KB enrichment, donc deuxième utilisateur posant même question = 0 ms KB lookup.
- Si Wikidata SPARQL latency dérive >500 ms p95, switch vers une copie locale (dump Wikidata mensuel filtré sur les Q-IDs art-museum, ~500 MB).

## Alternatives considered

- **Pas de KB enrichment** (status quo pré-2026-04). Rejeté : hallucinations LLM trop visibles en démo.
- **DBpedia au lieu de Wikidata**. Rejeté : DBpedia couverture art moins riche que Wikidata, infrastructure moins fiable historiquement.
- **Knowledge graph custom Musaium**. Rejeté pour V1 : effort de curation prohibitif. Re-considéré post-launch+6mois si Wikidata se révèle insuffisant pour les musées partenaires B2B.

## References

- Code : `museum-backend/src/modules/chat/adapters/secondary/search/wikidata.client.ts`
- Code : `museum-backend/src/modules/chat/useCase/knowledge/knowledge-base.service.ts`
- Wiring : `museum-backend/src/modules/chat/chat-module.ts:25,34,206-208,345,418`
- Tests : `museum-backend/tests/unit/chat/wikidata.client.test.ts` + `knowledge-base.service.test.ts`
- Indirect-injection wrapper : `docs/explications-sprint-2026-05-05/06-bloc-2-v12-orchestrator-supply-chain.md` § wrapper `<untrusted_content>`
- LLM cache TTL strategy : `docs/explications-sprint-2026-05-05/13-bloc-6-llm-cache.md`
- Original 671-line spec consolidated here on 2026-05-07 (`docs/FEATURE_KNOWLEDGE_BASE_WIKIDATA.md` deleted, recoverable via `git log`)
