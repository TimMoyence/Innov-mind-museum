# InnovMind — Roadmap détaillée (PoC → MVP)

Cette roadmap décrit les phases, objectifs, tâches, livrables et critères d’acceptation pour construire un assistant de musée (chat + analyse d’images) performant et extensible.

## Synthèse des jalons

- Phase 0: Stabilisation IA (S1)
- Phase 1: API Conversation (S2)
- Phase 2: API Insight d’image (S3)
- Phase 3: Suggestions de visite (S4)
- Phase 4: Observabilité & limites (S5)
- Phase 5: Durcissement sécurité/erreurs (S6)
- Phase 6: Enrichissement (Catalogue + RAG) (S7–S8)

---

## TODO Back‑end (Vue Product Manager)

- Now (S1–S2)
  - [ ] Conversation IA: prompt système concis + trims (déjà partiel) — valider comportement en FR/EN
  - [ ] Extraction réponse robuste (texte/parts) — normaliser sortie string
  - [ ] Endpoint `POST /conversations` (création)
  - [ ] Endpoint `GET /conversations/:id` (lecture historique, tri `createdAt`)
  - [ ] Endpoint `POST /conversations/:id/messages` (appel `IAService` + persistance)
  - [ ] Validation payloads (DTO/zod) + limites taille message (ex: 2 000 chars)
  - [ ] Index DB sur FK et `createdAt`
  - [ ] Tests contrat basiques (200/4xx/5xx) pour ces endpoints

- Next (S3–S4)
  - [ ] Endpoint `POST /insights` (image base64) → `IAImageInsightAnalyzer`
  - [ ] Validation image (taille max, format), erreurs claires
  - [ ] Option: si `conversationId`, insérer un résumé court comme message assistant
  - [ ] Endpoint `GET /tours/suggestions` (id convo) → 2–3 suggestions (titre + raison)
  - [ ] Rate limiting IP+token (ex: 60 req/min) sur `/messages` et `/insights`
  - [ ] Logs structurés (reqId, userId, latence, modèle) + métriques simples
  - [ ] Tests contractuels pour `/insights` et `/tours/suggestions`

- Later (S5–S8)
  - [ ] Normalisation des erreurs (schéma commun, codes)
  - [ ] Masquage PII dans logs, bannière conformité
  - [ ] Résumé périodique d’historique (cap N messages)
  - [ ] Mini‑catalogue œuvres/musées (JSON/table) + endpoint `GET /catalog/search`
  - [ ] RAG léger: injecter 3–5 faits pertinents dans le prompt
  - [ ] Backoffice minimal (édition prompts, consultation conversations)
  - [ ] CI: lint + tests + typecheck bloquants

- Qualité/Perf
  - [ ] P50/P95 latence textes < 2.5s; images < 4s (échantillon PoC)
  - [ ] Observabilité: taux d’erreur < 2% 5xx sur PoC
  - [ ] Coût/token: trimming 10–12 messages + troncature dure > 800 chars

— DOD (Definition of Done) par endpoint —
- [ ] DTO/validation en place, erreurs 400 lisibles
- [ ] Tests contrat (happy path + 1–2 erreurs)
- [ ] Logs structurés + mesure de latence
- [ ] Documentation payloads d’entrée/sortie

## Phase 0 — Stabilisation IA (Semaine 1)

- Objectifs:
  - Prompts compacts, messages structurés, mémoire limitée pour réduire coûts/latence.
  - Extraction de texte robuste depuis le LLM.
- Tâches:
  - Conversation: prompt système concis + rôles (System/Human/AI), trimming (10–12 messages), troncature des messages longs.
    - `src/modules/IA/conversation/adapters/secondary/conversation.IA.ts`
  - Insight: format 4 lignes strict, détection non-artistique → `null`.
    - `src/modules/IA/imageInsight/adapters/secondary/imageInsight.analyzer.ts`
  - Journalisation minimale sans PII (longueur dernier message user, latence).
- Livrables:
  - Réponses cohérentes en 120–180 mots avec question finale.
  - 4 lignes structurées pour l’insight d’image.
- Critères d’acceptation:
  - Latence moyenne < 2.5s (texte), < 4s (image) sur jeux d’essai.
  - Aucune exception non gérée en logs.
- Risques & mitigations:
  - Variabilité LLM → baisser `temperature` à 0.2 pour flux guidés.

## Phase 1 — API Conversation (Semaine 2)

- Objectifs:
  - Exposer des endpoints REST pour créer une conversation et envoyer des messages.
- Tâches:
  - Routes: `POST /conversations`, `GET /conversations/:id`, `POST /conversations/:id/messages`.
  - Persistance via entités existantes ImageInsightConversation/ImageInsightMessage.
  - Validation d’entrée (class-validator/zod) + limites de taille.
  - Index DB (FK, `createdAt`) pour lecture rapide.
- Livrables:
  - Documentation des endpoints + exemples de payloads.
- Critères d’acceptation:
  - Réponses conformes au ton/langue; historique ordonné par `createdAt`.
  - 95e percentile latence < 3s (texte).
- Risques & mitigations:
  - Historique trop long → cap + résumé périodique (optionnel).

## Phase 2 — API Insight d’image (Semaine 3)

- Objectifs:
  - Endpoint pour l’analyse d’image en base64 et retour format 4 lignes.
- Tâches:
  - Route: `POST /insights` (+ `conversationId?` pour insertion optionnelle dans la conversation).
  - Validation: MIME/poids (taille base64), anti-abus.
  - Gestion d’erreurs claire (timeouts, image invalide).
- Livrables:
  - Réponse texte 4 lignes ou `null` si non-artistique.
  - Exemple d’intégration frontend (snippet).
- Critères d’acceptation:
  - 95e percentile latence < 4s (image) en conditions normales.
- Risques & mitigations:
  - Images lourdes → limite stricte et message d’erreur explicite.

## Phase 3 — Suggestions de visite (Semaine 4)

- Objectifs:
  - Générer 2–3 œuvres à voir ensuite avec raison en 1 ligne.
- Tâches:
  - Route: `GET /tours/suggestions?conversationId=...`.
  - Prompt déterministe (basse température) sur derniers messages (≤ 10), troncature.
  - Option de débruitage (ignorer messages non-artistiques).
- Livrables:
  - `{ suggestions: [{ title, reason }] }` (format stable).
- Critères d’acceptation:
  - Réponses cohérentes, non redondantes; latence < 2.5s.
- Risques & mitigations:
  - Hallucinations sur titres → plus tard, ancrage via mini-catalogue.

## Phase 4 — Observabilité & Limites (Semaine 5)

- Objectifs:
  - Améliorer la visibilité et maîtriser l’usage.
- Tâches:
  - Logs structurés: requestId, userId, latence, modèle, tokens (si dispo).
  - Rate limiting IP + token; quotas simples.
  - Métriques: latence endpoints, taux d’erreur.
- Livrables:
  - Dashboard minimal (même via logs + scripts).
- Critères d’acceptation:
  - Alerte basique sur taux d’erreur élevé.
- Risques & mitigations:
  - Manque d’outillage → scripts CLI + rétention de logs.

## Phase 5 — Durcissement (Semaine 6)

- Objectifs:
  - Sécurité et robustesse des erreurs.
- Tâches:
  - Auth JWT courte durée; rafraîchissement ultérieur.
  - Sanitation/validation stricte de toutes les entrées.
  - Normalisation des erreurs (codes/format homogènes).
  - Politique de logs sans PII; masquage.
- Livrables:
  - Guide d’erreurs communes + codes HTTP.
- Critères d’acceptation:
  - Aucune fuite PII en logs; rapport de vulnérabilités basiques = 0 critique.
- Risques & mitigations:
  - Complexité auth → garder simple pour PoC, étendre plus tard.

## Phase 6 — Enrichissement (Semaine 7–8)

- Objectifs:
  - Améliorer la pertinence via ancrage sur données.
- Tâches:
  - Mini-catalogue œuvres/musées (JSON ou table) avec champs: `title`, `artist`, `museum`, `tags`.
  - RAG léger: recherche par tags/mots-clés pour alimenter le prompt.
  - Backoffice simple (MVP+): éditer prompts, consulter conversations (masquées).
- Livrables:
  - Endpoint `GET /catalog/search?q=...` (simple) + intégration RAG dans prompts.
- Critères d’acceptation:
  - Taux de suggestions ancrées > 70% (sur jeu de test interne).
- Risques & mitigations:
  - Données incomplètes → commencer petit, itérer.

---

## KPIs de succès

- Latence moyenne (texte < 2.5s, image < 4s).
- Taux d’erreurs (< 2% 5xx sur PoC).
- Taux de réponses « utiles » (évaluations internes) > 80%.
- Coût moyen par session (tokens) sous un seuil défini.

## Dépendances & Pré‑requis

- Accès aux APIs LLM configuré via variables d’environnement.
- Base de données opérationnelle (TypeORM), indices sur FK + `createdAt`.
- Frontend prêt à consommer les endpoints (ou Postman/Insomnia pour PoC).

## Plan de test

- Unit: générateurs de prompts, trimming, extracteurs.
- Contrat: endpoints principaux (convers., messages, insights, suggestions).
- Snapshot: stabilité des templates de prompt.
- Tests de perf simples: mesurer latence p50/p95.

## Risques globaux

- Variabilité des LLM → prompts plus déterministes, baisse de température.
- Coûts tokens → trimming agressif + résumés périodiques.
- Pics de charge → rate limiting + backpressure.
