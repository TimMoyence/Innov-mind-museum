# ADR-001 — SSE streaming chat is DEACTIVATED (revival V2.1)

**Status:** Accepted (updated 2026-04-22)
**Date:** 2026-04-19 (initial) — 2026-04-22 (status → deactivated, not deprecated)
**Decision-makers:** Tim (product), backend lead
**Context anchor:** V1 voice rollout (`docs/AI_VOICE.md`), product direction « pas de feature flag, toutes les features actives ».

---

## Context

Le module chat embarque deux modes de réponse assistant :

1. **Synchrone** — `POST /api/chat/sessions/:id/messages` retourne la réponse complète une fois LLM + guardrails terminés. Mode de référence V1.
2. **Streaming SSE** — `POST /api/chat/sessions/:id/messages/stream` ouvre un `text/event-stream` et émet les tokens au fur et à mesure que le LLM les produit, avec un buffer guardrail incrémental.

Le SSE a été ajouté début 2026 (cf. `docs/archive/v1-sprint-2026-04/SPRINT_LOG.md:358-376`). En pratique :

- La libération de tokens n'est pas fluide : le buffer guardrail force un flush par chunks de 15 updates/sec, ce qui produit un rendu mobile saccadé indistinguable de réponses paquet (mauvais perçu UX).
- Le coût opérationnel (heartbeat 15s, abort handling, reconnect Last-Event-ID, timers) ne se justifie pas pour un gain perçu nul.
- La V1 voice (cf. `docs/AI_VOICE.md`) ne s'appuie pas sur le streaming token-par-token : la pipeline STT → LLM → TTS retourne du texte complet puis joue l'audio TTS en MP3 (cacheable S3).

## Decision (2026-04-22 — update)

Le SSE passe du statut **`@deprecated` (removal prévu)** au statut **DEACTIVATED (revival prévu V2.1 post-Walk)**. Raison : on conserve le code entier pour le réactiver après la feature Walk (V2). Pas de suppression, pas d'observation résiduelle.

1. **Route backend unmountée** :
   - `chat-message.route.ts` — bloc `router.post('/sessions/:id/messages/stream', …)` commenté (guide de re-mount présent).
   - Handler `createStreamHandler` + `initSseTimers` **extraits** dans `chat-message.sse-dormant.ts` (sibling file). Route file clean.
2. **Frontend déjà skip** : `isChatStreamingEnabled()` dans `chatApi.ts` lit `EXPO_PUBLIC_CHAT_STREAMING` (default `false`). Aucun appel FE → BE sur la route stream tant que l'env var n'est pas flippée.
3. **JSDoc renommés** `@deprecated` → `Status: DEACTIVATED — revival V2.1` dans :
   - `chat-message.sse-dormant.ts` (header)
   - `chat.service.ts::postMessageStream`
   - `chat-message.service.ts::postMessageStream`
   - `chatApi.ts::postMessageStream`
   - `sseParser.ts`
4. **Log `sse.stream.deprecated.hit`** renommé `sse.stream.deactivated.hit` (dans fichier dormant — inaccessible tant que la route est unmountée).

## Revival plan (V2.1 post-Walk)

Pour réactiver le SSE :
1. Dans `chat-message.route.ts` → décommenter le bloc `router.post(...)` marqué `DEACTIVATED`.
2. Importer `createStreamHandler` + `initSseTimers` depuis `./chat-message.sse-dormant.ts`.
3. Importer aussi le helper `parseMessageInput` (local à `chat-message.route.ts`) et le passer au factory `createStreamHandler(chatService, parseMessageInput)`.
4. Sur mobile, set `EXPO_PUBLIC_CHAT_STREAMING=true` dans la config EAS build souhaitée.
5. Relancer les tests `chat-service-stream.test.ts` + e2e streaming.
6. Envisager refactor buffer guardrail (RAF queue, 60fps coalescing) avant de remettre en prod — cause racine de la saccade V1.

## Consequences

### Positives
- V1 reste clean : une seule façon de répondre aux messages chat.
- Code SSE sauvegardé en dormant module (`chat-message.sse-dormant.ts`) → isolation claire, lint propre.
- Pas de feature flag supplémentaire côté BE ; seul `EXPO_PUBLIC_CHAT_STREAMING` reste côté FE pour la phase revival.

### Négatives
- Code dormant (1 fichier BE sibling + FE sseParser/streaming strategies) maintenu jusqu'à V2.1. Accepté : feature stratégique pour V2.1.
- Risque d'oubli du revival si V2.1 glisse. Mitigation : ticket lié au plan Walk.

### Réversibilité
- Intégralement réversible — voir « Revival plan » ci-dessus.

## Liens

- `docs/AI_VOICE.md` — pipeline voice V1.
- `museum-backend/src/modules/chat/adapters/primary/http/chat-message.sse-dormant.ts` — handler dormant.
- `museum-backend/src/modules/chat/adapters/primary/http/chat-message.route.ts` — route file avec pointeur.
- `museum-frontend/features/chat/infrastructure/sseParser.ts` — parser FE dormant.
- `museum-frontend/features/chat/infrastructure/chatApi.ts::postMessageStream` — client FE dormant.
