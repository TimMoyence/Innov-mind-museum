# InnovMind — Assistant de Musée (PoC) — Plan Projet Complet

Ce document décrit une feuille de route complète (UX + Back-end + IA) pour livrer un Proof of Concept solide d’un assistant de musée: conversation guidée, analyse d’images et suggestions de visite. Il s’appuie sur les capacités déjà présentes dans le dépôt (IA conversationnelle et analyse d’image) et vise la rapidité, la clarté et la maîtrise des coûts.

## Vision & Objectifs

- Expérience: Un compagnon culturel, engageant et pédagogique, disponible sur web/mobile.
- Simplicité: Back-end léger, API claires, coûts et latences maîtrisés.
- Pertinence: Prompts structurés, mémoire réduite et réponses concises mais utiles.
- Extensibilité: Base solide pour ajouter catalogue œuvres/musées et RAG plus tard.

## Personae & Scénarios Clés

- Visiteur Débutant: veut comprendre une œuvre, découvrir quoi voir ensuite.
- Amateur Confirmé: cherche du contexte, comparaisons, liens entre œuvres.
- Expert/Curateur (admin plus tard): ajuster les prompts, suivre la qualité.

Scénarios PoC
1) Chat Guide: échange naturel avec un guide virtuel, ton adapté, réponses courtes et claires, question ouverte finale.
2) Insight d’Image: l’utilisateur envoie une photo; l’IA renvoie un résumé structuré (4 lignes) ou indique que ce n’est pas de l’art.
3) Suggestion de Parcours: proposer 2–3 œuvres à voir ensuite à partir du contexte récent.

## Parcours Utilisateur (PoC)

1. Démarrage: l’utilisateur ouvre la page → création de conversation → premier message.
2. Conversation: l’utilisateur pose une question → IA répond en tenant compte des derniers échanges.
3. Analyse d’Image: upload base64 → 4 lignes standardisées; option d’insérer le résultat dans la conversation.
4. Suggestions: en un clic, recevoir des propositions de prochaines œuvres (titres + raison en 1 ligne).

## Modèle de Données (actuel + proche)

- User (auth simple PoC).
- ImageInsightConversation / ImageInsightMessage: entités existantes, réutilisées pour la conversation.
- (Futur) Artwork, Museum: table légère ou JSON pour ancrer les réponses et préparer un RAG.

Références code utiles
- `src/modules/IA/conversation/adapters/secondary/conversation.IA.ts`
- `src/modules/IA/imageInsight/adapters/secondary/imageInsight.analyzer.ts`
- `src/modules/IA/imageInsight/core/domain/imageInsightConversation.entity.ts`
- `src/modules/IA/imageInsight/core/domain/imageInsightMessage.entity.ts`

## Architecture & API (PoC)

Auth (simple)
- POST `/auth/login` → `{ token }` (JWT court). Rôles plus tard.

Conversations
- POST `/conversations` → créer une conversation
  - Body: `{ language?: 'fr'|'en', tone?: 'débutant'|'confirmé'|'expert' }`
  - Resp: `{ id, createdAt }`
- GET `/conversations/:id` → récupérer messages
  - Resp: `{ id, messages: [{ role: 'user'|'assistant', content, createdAt }] }`
- POST `/conversations/:id/messages` → envoyer un message utilisateur
  - Body: `{ content: string, language?: 'fr'|'en', tone?: 'débutant'|'confirmé'|'expert' }`
  - Resp: `{ content: string }` (réponse IA via `IAService`)

Insights d’Image
- POST `/insights`
  - Body: `{ imageBase64: string, conversationId?: string, language?: 'fr'|'en', tone?: 'beginner'|'confirmed'|'expert' }`
  - Resp: `string | null` (format 4 lignes; `null` si non artistique)

Suggestions (léger)
- GET `/tours/suggestions?conversationId=...`
  - Resp: `{ suggestions: Array<{ title: string, reason: string }> }`

## Couche IA — Prompts & Latence

Conversation (`IAService`)
- Prompt système court, messages structurés (System/Human/AI), mémoire limitée aux N derniers échanges (déjà fait).
- Réponses: 120–180 mots, ton adapté, question ouverte finale.
- Résumé périodique (futur): compacter l’historique au-delà d’un seuil.

Analyse d’Image (`IAImageInsightAnalyzer`)
- Format strict 4 lignes pour parsing minimal côté client.
- Détection rapide du non-artistique → `null`.

Performance & Coûts
- Trim des messages: ~10–12 derniers; troncature dure des textes longs.
- `temperature = 0.5` (0.2 pour parcours très guidés).
- Option streaming côté UI pour réduire la latence perçue.

## Sécurité & Conformité (portée PoC)

- JWT court; header `Authorization: Bearer <token>`.
- Validation d’entrée (class-validator / zod). Limites strictes sur `imageBase64`.
- Rate limiting IP + token, quota par minute.
- Secrets via env; ne pas logger les prompts complets ni PII.

## Observabilité

- Logs structurés: requestId, userId, latence, modèle, tokens.
- Catégoriser erreurs: entrée invalide, timeout LLM, erreur amont.
- Télémétrie optionnelle: échantillonner prompts/réponses avec masquage.

## Tests

- Unit: builders de prompts, trimming, extracteurs de réponse.
- Contrat: endpoints principaux (conversations, messages, insights).
- Snapshot: gabarits de prompts (éviter dérives).

## Workflow Dev

- Scripts: `dev`, `test`, `lint`, `typecheck`.
- Données seed pour démos (convos + exemples d’insights).
- CI simple: lint + tests; échec sur erreurs de type.

## Roadmap (PoC → MVP)

Phase 0 — Stabilisation IA (immédiat)
- Prompts structurés, mémoire limitée (implémenté dans `IAService`).
- Extraction robuste du texte, logs minimaux.

Phase 1 — API Conversation
- Routes: créer conversation, envoyer message, lister messages.
- Persister messages; caper historique à N (résumé optionnel).

Phase 2 — API Insight d’Image
- `/insights`: limites de taille, validation MIME; retourner 4 lignes ou `null`.
- Si `conversationId` fourni: insérer un bref résumé dans la conversation (option).

Phase 3 — Suggestions de Visite
- Prompt déterministe sur les derniers messages → 2–3 œuvres (titre + raison).

Phase 4 — Observabilité & Limites
- Rate limiting, métriques latence requête/LLM, journaux structurés.

Phase 5 — Durcissement
- Auth renforcée, validation stricte, journalisation sûre, gestion d’erreurs homogène.

Phase 6 — Enrichissement (MVP+)
- Catalogue léger œuvres/musées (JSON ou table) + RAG simple.
- Outil admin: éditer prompts, consulter conversations (avec masquage).

## Critères d’Acceptation (PoC)

- Conversation: réponses pertinentes, ton/langue respectés, question ouverte finale.
- Insight d’image: 4 lignes conformes; `null` si non artistique.
- Latence moyenne: < 2.5s (texte), < 4s (image) en conditions normales.
- Pas d’exceptions non gérées; logs avec requestId et durée.

## Exemples de Charges (Payloads)

POST `/conversations/:id/messages`
```json
{
  "content": "Je viens de voir 'La Joconde'. Que voir ensuite ?",
  "language": "fr",
  "tone": "débutant"
}
```

200
```json
{
  "content": "Pour prolonger votre visite, je vous propose… (120–180 mots, question ouverte finale)"
}
```

POST `/insights`
```json
{
  "imageBase64": "<base64>",
  "language": "fr",
  "tone": "beginner",
  "conversationId": "<uuid>"
}
```

200 (exemple)
```text
Musée: Inconnu
Œuvre: Inconnu
Artiste: Inconnu
Description ou histoire de l'oeuvre et question ouverte: …
```

## Backlog & Risques

- Streaming de réponse pour UX réactive (frontend + SSE).
- Index DB (FK, `createdAt`) pour lecture rapide de l’historique.
- Gestion de pics de charge (rate limit + backpressure).
- Gouvernance des prompts (versionner, auditer les changements).
- Coûts LLM: surveiller tokens; résumer après N messages.

---

Ce plan fournit un cadre clair pour un PoC convaincant — focalisé sur des APIs simples, une IA maîtrisée (prompts compacts, mémoire limitée) et une UX engageante. Il pose aussi les bases nécessaires pour évoluer vers un MVP avec catalogue et RAG.
