# ADR-001 — SSE streaming chat is deprecated

**Status:** Accepted
**Date:** 2026-04-19
**Decision-makers:** Tim (product), backend lead
**Context anchor:** V1 voice rollout (`docs/AI_VOICE.md`), product decision « pas de feature flag, toutes les features actives ».

---

## Context

Le module chat embarque deux modes de réponse assistant :

1. **Synchrone** — `POST /api/chat/sessions/:id/messages` retourne la réponse complète une fois LLM + guardrails terminés. Mode de référence.
2. **Streaming SSE** — `POST /api/chat/sessions/:id/messages/stream` ouvre un `text/event-stream` et émet les tokens au fur et à mesure que le LLM les produit, avec un buffer guardrail incrémental.

Le SSE a été ajouté début 2026 (cf. `docs/V1_Sprint/SPRINT_LOG.md:358-376`). Il était gated par `FEATURE_FLAG_STREAMING` (`OFF` partout en prod/staging/local). En pratique :

- La libération de tokens **n'est pas fluide** : le buffer guardrail force un flush par chunks de 15 updates/sec, ce qui produit un rendu mobile saccadé indistinguable de réponses paquet (mauvais perçu UX).
- Le coût opérationnel (heartbeat 15s, abort handling, reconnect Last-Event-ID, timers) ne se justifie pas pour un gain perçu nul.
- La V1 voice (cf. `docs/AI_VOICE.md`) ne s'appuie pas sur le streaming token-par-token : la pipeline classique STT → LLM → TTS retourne du texte complet puis joue l'audio TTS en MP3 (cacheable S3). Pas besoin de SSE.

Décision produit complémentaire (2026-04-19) : suppression de tous les feature flags qui scindent l'expérience utilisateur. L'utilisateur doit avoir **toutes** les features, pas la moitié. → Le flag `FEATURE_FLAG_STREAMING` ne peut donc plus exister, mais on ne souhaite pas casser brutalement les clients qui pourraient encore appeler la route.

## Decision

1. **Suppression du feature flag** `FEATURE_FLAG_STREAMING` :
   - Retiré de `src/config/env.ts` (`featureFlags.streaming`) et `src/config/env.types.ts`.
   - Retiré des trois `.env.*.example` (production / staging / local).
   - Retiré du gating dans `src/modules/chat/adapters/primary/http/chat-message.route.ts:125`.
2. **Code SSE marqué `@deprecated`** mais conservé fonctionnel :
   - `chat-message.route.ts` handler `createStreamHandler` — JSDoc `@deprecated` + référence ADR.
   - `chat.service.ts` méthode `postMessageStream` — JSDoc `@deprecated`.
   - `chat-message.service.ts` méthode `postMessageStream` — JSDoc `@deprecated`.
   - Frontend : `useStreamingState`, `sseParser`, `chatApi.postMessageStream` — JSDoc `@deprecated`.
3. **Observabilité résiduelle** : la route logue `logger.warn('sse.stream.deprecated.hit', { sessionId })` à chaque appel pour mesurer l'usage en production.
4. **Plan de retrait définitif** : si la métrique `sse.stream.deprecated.hit` reste **< 10/jour pendant 30 jours consécutifs** sur l'environnement production, on supprime tout le code (route, helpers, useCase, frontend) en V1.1.

## Consequences

### Positives
- Une seule façon de répondre aux messages chat → simplification du modèle mental + tests.
- Pas de divergence entre prod (flag OFF) et dev (flag ON dans certains tests) → comportement uniforme.
- Aligne l'intention produit « toutes les features actives » sans imposer une expérience streaming sous-optimale.

### Négatives
- Code zombie maintenu temporairement (3 fichiers BE + 3 FE + tests). Compromis explicite : on conserve le chemin tant qu'on n'a pas mesuré le résidu d'usage.
- Risque d'oubli du retrait définitif si personne ne surveille la métrique. **Mitigation** : ticket de rappel à 30j à créer (à faire au commit).

### Réversibilité
- Si on souhaite ré-évaluer le streaming en V1.1 (ex: tester un buffer guardrail différent, RAF queue, etc.), le code est encore là. Il suffit de retirer le `@deprecated` et le `logger.warn`. Aucune migration DB ne dépend du SSE.

## Alternatives considérées

| Option | Pourquoi rejetée |
|---|---|
| **Suppression complète immédiate** du code SSE | Risque de casser des clients web/mobile non identifiés. La période d'observation 30j permet de mesurer avant suppression. |
| **Maintenir le flag** mais documenter qu'il doit rester `OFF` | Contredit la décision produit « pas de feature flag ». Garder un flag uniquement pour le tenir éteint = dette inutile. |
| **Garder SSE actif et essayer un nouveau buffer** | Hors scope V1 voice. Possible en V1.1 si métriques justifient (et seulement après suppression).  |

## Liens

- `docs/AI_VOICE.md` — pipeline voice V1 (raison du retrait du flag).
- `docs/V1_Sprint/SPRINT_LOG.md:358-376` — historique de l'ajout SSE.
- `museum-backend/src/modules/chat/adapters/primary/http/chat-message.route.ts:288` — route deprecated.
- `museum-frontend/features/chat/infrastructure/sseParser.ts` — parser FE deprecated.
