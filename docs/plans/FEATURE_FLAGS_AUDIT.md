# Feature Flags Audit — Musaium

> **Décision produit (2026-04-19)** : Musaium est en **Phase 1 de production**. L'utilisateur doit recevoir **toutes les features**, pas la moitié. Les feature flags restants bloquent l'**effet wahoo** de la V1. On déflague.
>
> **Philosophie** : un flag n'est légitime que pendant un rollout actif ou pour isoler un composant non-prêt. Un flag par défaut OFF qui survit plusieurs sprints = dette, pas sécurité.

**Auteur** : Tech Lead (/team v4)
**Date** : 2026-04-19
**Pipeline** : `audit` — pas de code touché dans ce document, seulement inventaire + plan de suppression.
**Scope** : backend uniquement (frontend = 0 occurrence de `FEATURE_FLAG_*`).

---

## 1. Inventaire complet (11 flags)

| # | Flag | Env var | Default | Consumer(s) | Utilité historique | Prod status 2026-04-19 | Décision |
|---|------|---------|---------|-------------|--------------------|------------------------|----------|
| 1 | `voiceMode` | `FEATURE_FLAG_VOICE_MODE` | `false` | `chat-media.route.ts:175` (TTS endpoint, 404 si OFF) | Gate soft launch TTS synthèse vocale | `false` partout (`.env.*.example`) — feature prête, flag résiduel | **LOT 1 — supprimer dans NL-4** |
| 2 | `streaming` | `FEATURE_FLAG_STREAMING` | `false` | `chat-message.route.ts:125` (SSE stream, 404 si OFF) | Gate SSE pendant stabilisation buffer guardrails V2 | `false` partout — feature stable, pilier V1 | **LOT 1 — supprimer dans NL-4** |
| 3 | `ocrGuard` | `FEATURE_FLAG_OCR_GUARD` | `false` | `chat-module.ts:312` (active `TesseractOcrService` vs `DisabledOcrService`) | Gate Tesseract coûteux (CPU) pour détection texte injection dans images | `false` partout | **LOT 2 — évaluer suppression ou activation par défaut** |
| 4 | `apiKeys` | `FEATURE_FLAG_API_KEYS` | `false` | `authenticated.middleware.ts:27`, `auth/useCase/index.ts:102`, `auth.route.ts:435` (routes `/api-keys/*` montées + middleware JWT accepte préfixe `msk_`) | Gate programme API keys B2B (routes + validation) | `false` partout | **LOT 2 — flag légitime** (feature non-prête V1). Garder jusqu'à spec B2B validée, sinon **supprimer le code associé** |
| 5 | `multiTenancy` | `FEATURE_FLAG_MULTI_TENANCY` | `false` | ❌ **AUCUN consumer dans `src/`** (parsé dans `env.ts:277` + `env.types.ts:141` uniquement) | Scaffold multi-tenant B2B museums (jamais câblé) | `false` partout | **LOT 2 — supprimer immédiatement** (flag mort = dette pure) |
| 6 | `userMemory` | `FEATURE_FLAG_USER_MEMORY` | `false` | `chat-module.ts:166` (désactive repo `UserMemory` + service) | Gate mémoire long-terme utilisateur (GDPR-sensible) | `false` partout | **LOT 2 — supprimer** (feature V1 de Musaium, doit être ON) |
| 7 | `knowledgeBase` | `FEATURE_FLAG_KNOWLEDGE_BASE` | `false` | `chat-module.ts:173` (désactive adapter Wikidata) | Gate enrichissement Wikidata (différenciateur #1 selon V3 review) | `false` partout, absent des `.env.{staging,production}.example` | **LOT 2 — supprimer** (feature wahoo par excellence) |
| 8 | `imageEnrichment` | `FEATURE_FLAG_IMAGE_ENRICHMENT` | `false` | `chat-module.ts:188` (désactive Unsplash + Wikidata P18) | Gate enrichissement images réponse | `false` partout, absent des `.env.{staging,production}.example` | **LOT 2 — supprimer** si clé Unsplash présente en prod |
| 9 | `webSearch` | `FEATURE_FLAG_WEB_SEARCH` | `false` | `chat-module.ts:222` (désactive multi-provider Tavily/Google CSE/Brave/SearXNG) | Gate recherche web dans pipeline chat | `false` partout, absent des `.env.{staging,production}.example` | **LOT 2 — supprimer** si au moins un provider configuré en prod |
| 10 | `knowledgeExtraction` | `FEATURE_FLAG_KNOWLEDGE_EXTRACTION` | `false` | `knowledge-extraction/index.ts:35` (court-circuite l'enregistrement du module entier) | Gate pipeline BullMQ scraping admin-driven (coût LLM) | `true` en staging/production, `false` en local | **LOT 2 — flag légitime** (pipeline opérateur coûteux). Garder mais migrer vers **config admin** (ADMIN_ENABLE_EXTRACTION) |
| 11 | `artTopicClassifier` | ⚠️ `FEATURE_ART_TOPIC_CLASSIFIER` (sans `_FLAG_`) | `false` | `chat-module.ts:132` (active classifier LLM output) | Gate rejet réponses off-topic (digressions culturelles bloquées) | `false` partout (discipline topique déléguée au system prompt) | **LOT 2 — supprimer le flag ET le code** (décision produit : system prompt suffit, cf. commentaire `env.types.ts:147-152`) |

**Total** : 11 flags parsés, **10 consommés**, **1 mort** (`multiTenancy`).

---

## 2. Découvertes saillantes

### 2.1. `multiTenancy` — flag fantôme

Parsé dans `env.ts:277` et déclaré dans `env.types.ts:141`, **jamais lu nulle part** dans `src/`. Pure dette. Suppression immédiate sans impact (0 consumer).

### 2.2. Incohérence nommage `artTopicClassifier`

Toutes les autres variables suivent `FEATURE_FLAG_*`. Celle-ci est `FEATURE_ART_TOPIC_CLASSIFIER`. Conséquence : **le service `StaticFeatureFlagService` (shared/feature-flags) ne la voit pas** (il filtre sur préfixe `FEATURE_FLAG_`). Seul le champ statique `env.featureFlags.artTopicClassifier` la lit.
→ à harmoniser si on garde le flag. Sinon → suppression résout le problème.

### 2.3. Fichiers `.env.example` désynchronisés

`FEATURE_FLAG_KNOWLEDGE_BASE`, `FEATURE_FLAG_IMAGE_ENRICHMENT`, `FEATURE_FLAG_WEB_SEARCH` sont présents dans `.env.local.example` mais absents de `.env.staging.example` et `.env.production.example`. Les devs qui copient depuis prod ne voient pas ces features existent. Rollout silencieux impossible.

### 2.4. `FEATURE_FLAG_KNOWLEDGE_EXTRACTION=true` en prod

Seul flag activé par défaut en prod/staging. Cas légitime : gate pipeline opérateur coûteux. À **déplacer vers `ADMIN_*`** pour sortir du registre "feature flags" (qui sous-entend "rollout utilisateur").

### 2.5. Frontend — aucun flag

Zéro occurrence de `FEATURE_FLAG_*`, `featureFlag`, ou `expo-public-feature` dans `museum-frontend/`. Les flags sont **100% backend-side** — pas de propagation mobile à gérer.

---

## 3. Plan de suppression

### LOT 1 — Dans NL-4 Chat UX Unification V1 (maintenant)

**Objectif** : débloquer l'effet wahoo V1 sur les deux piliers **vocal** et **streaming**.

| Étape | Fichier | Action |
|-------|---------|--------|
| 1.1 | `src/modules/chat/adapters/primary/http/chat-media.route.ts` | Supprimer lignes 175-178 (guard 404 `voiceMode`) |
| 1.2 | `src/modules/chat/adapters/primary/http/chat-message.route.ts` | Supprimer lignes 125-128 (guard 404 `streaming`) |
| 1.3 | `src/config/env.ts` | Retirer `voiceMode:` et `streaming:` dans l'objet `featureFlags` (lignes 273, 276) |
| 1.4 | `src/config/env.types.ts` | Retirer `voiceMode: boolean;` et `streaming: boolean;` dans `featureFlags` (lignes 137, 140) |
| 1.5 | `.env.local.example` / `.env.staging.example` / `.env.production.example` | Retirer les deux lignes correspondantes (3 fichiers × 2 lignes) |
| 1.6 | Tests | Grep `featureFlags.voiceMode` et `featureFlags.streaming` — purger les tests qui stubaient le flag (non représentatifs de la réalité prod = ON) |
| 1.7 | Docs | `RELEASE_CHECKLIST.md`, `docs/FEATURE_KNOWLEDGE_BASE_WIKIDATA.md` — scrub références résiduelles voice/streaming flag |

**Critère de done** :

```bash
cd museum-backend
grep -rE "FEATURE_FLAG_(VOICE_MODE|STREAMING)|featureFlags\.(voiceMode|streaming)" src/ tests/ .env.*.example
# attendu: 0 match
pnpm lint
pnpm test
pnpm test:e2e -- --testPathPattern='streaming|media'
```

**Risque** : NUL. Les deux gates renvoient juste 404 — les retirer ne change RIEN quand `env=true` (prod actuel = false, mais le but est justement d'activer).

**Effort** : 30 min (édition) + 15 min (tests) = **1 commit**.

---

### LOT 2 — Ticket « Feature Flags Audit » (post-voice-V1)

**Objectif** : passer à 0 flag ou flags justifiés uniquement.

Pour chaque flag du LOT 2, décision à prendre :

| Flag | Décision proposée | Justification |
|------|-------------------|---------------|
| `multiTenancy` | **Supprimer** | Mort (0 consumer). Re-câbler depuis zéro le jour où B2B est planifié. |
| `artTopicClassifier` | **Supprimer flag + code** | Product décidé : system prompt suffit (cf. commentaire `env.types.ts:147-152`). `ArtTopicClassifier` output-side est code mort sous condition permanente `false`. |
| `userMemory` | **Supprimer → ON par défaut** | Feature V1, différenciateur. Garder le flag freine l'adoption et crée code paths inutilisés. |
| `knowledgeBase` | **Supprimer → ON par défaut** | Différenciateur #1 selon V3 review. Wikidata = read-only public API, coût négligeable. |
| `imageEnrichment` | **Supprimer → ON par défaut** si `UNSPLASH_ACCESS_KEY` est présent, sinon kill-switch natif via absence de clé | La clé API est le vrai gate. Garder les deux = redondant. |
| `webSearch` | **Supprimer → ON par défaut** si au moins un provider API key est présent, sinon kill-switch natif | Idem : key presence = vrai gate. |
| `ocrGuard` | **Évaluer** : activer par défaut OU supprimer + remplacer par vraie défense (LLM Guard V2) | Tesseract CPU-lourd, valeur anti-injection limitée. À benchmarker avant décision. |
| `apiKeys` | **Évaluer** : soit spec B2B validée → ON par défaut, soit **suppression totale** du code `msk_*` + routes `/api-keys/*` | Le flag est légitime tant que la feature n'est pas prête, mais héberger 3 consumers + route complète "pour plus tard" = dette. |
| `knowledgeExtraction` | **Renommer** `ADMIN_ENABLE_EXTRACTION` | Pas un flag produit (pas de rollout utilisateur). C'est une config opérateur. Sortir du registre `FEATURE_FLAG_*`. |

**Actions structurelles additionnelles** (LOT 2) :

- Si zéro flag survit → **supprimer** `src/shared/feature-flags/` (port + `StaticFeatureFlagService` + test)
- Synchroniser les trois `.env.*.example` — plus de désynchro silencieuse
- Scrub `featureFlags` dans `env.ts` / `env.types.ts` : retirer l'objet entier ou le réduire aux flags vraiment vivants
- Scrub des docs historiques (`RELEASE_CHECKLIST.md`, specs superpowers) mentionnant des flags supprimés

**Critère de done** :

```bash
cd museum-backend
grep -rE "FEATURE_FLAG_|featureFlags\." src/ tests/
# attendu: soit 0 match, soit uniquement les flags documentés légitimes (≤ 2)

pnpm lint && pnpm test && pnpm test:e2e
```

**Effort estimé** : 1-2 jours (dépend du nombre de flags effectivement supprimés — si on va jusqu'au bout, il faut wire correctement `userMemory`/`knowledgeBase`/`imageEnrichment`/`webSearch` côté prod, vérifier les coûts LLM, et valider les env vars requis).

**Prérequis LOT 2** :
- Voice V1 livré (TTS endpoint actif en prod sans gate)
- Streaming V1 livré (SSE actif en prod sans gate)
- Validation produit explicite flag-par-flag (userMemory ON pose question GDPR — à acter avec legal)

---

## 4. Principes post-audit

Une fois le LOT 2 purgé, adopter cette discipline :

1. **Un flag = un rollout actif avec date de fin**. Si pas de date → ce n'est pas un flag, c'est de la config ou de la dead code.
2. **Pas de flag par défaut OFF qui survit > 1 sprint**. Soit on active, soit on supprime.
3. **Les capabilities externes (clé API, endpoint URL) sont le vrai gate** — ne pas dupliquer avec un flag booléen.
4. **Les configs opérateur (pipelines coûteux, jobs admin) → préfixe `ADMIN_*`**, pas `FEATURE_FLAG_*`.

---

## Fichiers critiques

### LOT 1 — à éditer (voice + streaming)
- `museum-backend/src/modules/chat/adapters/primary/http/chat-media.route.ts` (L175-178)
- `museum-backend/src/modules/chat/adapters/primary/http/chat-message.route.ts` (L125-128)
- `museum-backend/src/config/env.ts` (L273, L276)
- `museum-backend/src/config/env.types.ts` (L137, L140)
- `museum-backend/.env.local.example` (L125, L128)
- `museum-backend/.env.staging.example` (L116, L119)
- `museum-backend/.env.production.example` (L115, L118)

### LOT 2 — à traiter par flag
- Flag mort → `env.ts`, `env.types.ts`, `.env.*.example` uniquement
- Flags câblés (userMemory, knowledgeBase, imageEnrichment, webSearch, ocrGuard, artTopicClassifier) → `chat-module.ts` (composition root) + config files + ports
- `apiKeys` → `auth.route.ts`, `authenticated.middleware.ts`, `auth/useCase/index.ts`
- `knowledgeExtraction` → `knowledge-extraction/index.ts`

### À préserver
- Pipeline chat (ordre messages LLM, guardrails) — cf. `CLAUDE.md` AI Safety
- Contrat OpenAPI — la suppression des 404 "NOT_FOUND" sur `/tts` et `/stream` peut nécessiter update spec

## Risques

- **Moyen** : activer `knowledgeBase` en prod sans vérifier quota Wikidata SPARQL → mitigation : monitoring requête Wikidata 48h après passage ON.
- **Moyen** : `userMemory` ON par défaut = data GDPR stockée systématiquement → mitigation : valider avec legal que le consentement onboarding couvre la mémoire long-terme.
- **Faible** : `webSearch` ON sans provider configuré = erreur silencieuse en chat → mitigation : fail-fast au boot si flag retiré et aucun provider présent.

## Done When

- [ ] LOT 1 commit mergé dans NL-4 (voice + streaming flags retirés, tests verts)
- [ ] Ticket LOT 2 créé avec décision flag-par-flag validée par product owner
- [ ] Après LOT 2 : `grep FEATURE_FLAG_ src/` retourne ≤ 2 matches justifiés par commentaire `// Kept: <raison + date review>`
