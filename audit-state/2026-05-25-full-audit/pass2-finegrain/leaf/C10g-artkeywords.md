# C10g — ART-KEYWORDS (taxonomy) — Audit E2E léger

**Date** : 2026-05-25 · **Branch** : `dev` @ HEAD `1fb32f5ba` · **Méthode** : grep + Read, citations path:line (UFR-013).

## Verdict

**WIRED — full E2E chain intact, des deux côtés.** Feature **headless by design** (aucun écran, aucune route Expo). Route POST taxonomy **correctement gatée** (I-SEC3 ✅). Classifier **consommé E2E** (FE `classifyText` → `preClassified` wire → BE guardrail short-circuit). Pas d'orphan.

---

## 1. Frontend — feature `museum-frontend/features/art-keywords/` (356 LOC, 5 fichiers)

Couches hexagonales propres : domain / application / infrastructure.

| Fichier | Rôle |
|---|---|
| `domain/contracts.ts` | Types (`ArtKeywordDTO`/`ArtKeywordListResponse` re-export OpenAPI) + `ArtKeywordsSyncState`/`...Failure`. |
| `infrastructure/artKeywordsStore.ts` | Zustand persisté (`musaium.artKeywords`, v2, migrate v1→v2) — keywords par locale + last-sync + failure tracking. |
| `infrastructure/artKeywordsApi.ts` | `syncKeywords(locale, since)` → GET `/api/chat/art-keywords` ; `getLocale()` façade C1 hexagonal. |
| `application/useArtKeywordsSync.ts` | Background sync 24h+jitter, backoff (3 retries), clock-skew-safe. |
| `application/useArtKeywordsClassifier.ts` | `classifyText(text, locale)` → `'art' | 'unknown'` (token-match NFD-normalisé contre keyword set local). |

### Câblage FE (confirmé)

- **Sync monté au root** : `app/_layout.tsx:26` import + `:84` `useArtKeywordsSync();`.
- **Classifier consommé dans le chat** : `features/chat/application/useChatSession.ts:7` import, `:65` `const { classifyText } = useArtKeywordsClassifier();`, injecté dans `SendMessageContext` (`:201`, dep `:260`). Type contract : `sendStrategy.types.ts:74 classifyText: ClassifyText`.
- **Calcul `preClassified` + envoi wire** : `sendStrategies/sendMessageStreaming.ts:57-60` calcule `preClassified = classifyText(text, locale) === 'art' ? 'art' : undefined`, passé à `chatApi.sendMessageSmart({ ..., preClassified })` (`:70`). Sérialisé dans le body `context` JSON ET multipart (`infrastructure/chatApi/send.ts:90,114,135`). Path audio aussi : `chatApi/audio.ts:19,44,75`.

**→ Le classifier est utilisé E2E** : sa sortie traverse le réseau jusqu'au BE.

---

## 2. Backend — taxonomy + consommation `preClassified`

### Routes (`modules/chat/adapters/primary/http/routes/chat-message.route.ts`)

- **GET `/art-keywords`** (`:197`) : `isAuthenticated` + `createListArtKeywordsHandler`. Lecture taxonomy par locale ; `since` validé ISO (`:104-106`) ; defaut `locale='%'` = sentinel "all" géré par branche explicite repo (pas d'injection — voir §3).
- **POST `/art-keywords`** (`:203-209`) : **`isAuthenticated` → `requireRole(UserRole.ADMIN, UserRole.MODERATOR)` → `taxonomyWriteLimiter`** → handler.
  - **I-SEC3 / R10 (authz)** ✅ — `requireRole` rejette 403 si role absent/insuffisant ; accepte `SUPER_ADMIN` implicitement (`require-role.middleware.ts:22` `if (user.role === UserRole.SUPER_ADMIN || allowedRoles.includes(...))`). Visitor JWT n'atteint PAS le handler (OWASP API1+API5).
  - **I-SEC3 / R11 (rate-limit)** ✅ — `taxonomyWriteLimiter` (`:176-181`) 10 req/60s, `keyGenerator: byUserId`, `bucketName: 'taxonomy-write'` (clé Redis stable). **Monté APRÈS `requireRole`** (CLAUDE.md "Mutating middleware ordering" : un 403 visitor ne consomme pas le bucket admin) ✅.
  - Validation body handler (`:129-144`) : array non-vide, ≤100 entrées, strings ≤200 chars trim, locale ≤10 chars. Robuste.
- Tests présents : `tests/unit/chat/chat-message.art-keywords.authz.test.ts`, `...ratelimit.test.ts`, `artKeyword.repository.test.ts`, `prune-stale-art-keywords.test.ts`, fixtures `tests/helpers/chat/artKeyword.fixtures.ts`.

### Consommation `preClassified` (guardrail short-circuit)

- `domain/chat.types.ts:89 preClassified?: 'art'`.
- `useCase/orchestration/prepare-message.pipeline.ts:283` passe `input.context?.preClassified` à `guardrail.evaluateInput(text, preClassified, ...)`.
- `useCase/guardrail/guardrail-evaluation.service.ts:122-203` :
  - **Hard blocks toujours exécutés** (`:130-143` keyword block, `:147-163` provider LLM-Guard, `:182-194` LLM judge) — `preClassified` NE bypasse PAS la sécurité.
  - `preClassified === 'art'` (`:196-202`) skippe UNIQUEMENT le soft off-topic implicite + log `preClassified: true`. Comportement défensif correct (commentaire `:118-120`).

**→ La taxonomy sert d'optimisation latence/coût** (pré-filtre côté client pour éviter le LLM-judge sur du texte manifestement art), pas un contrôle de sécurité. Architecture saine.

### Lifecycle data
- Migrations : `1775100000000-CreateArtKeywordsTable.ts`, `1775400000000-AddArtKeywordCategoryAndUpdatedAt.ts`.
- Retention : `jobs/art-keywords-retention-cron.registrar.ts` + `useCase/prune-stale-art-keywords.ts` (cron pruning stale keywords).
- Repo `adapters/secondary/persistence/artKeyword.repository.typeorm.ts` : `upsert` paramétré (`ON CONFLICT`), `findByLocale`/`findByLocaleSince` avec sentinel `%`.

---

## 3. Findings (mineurs, non-bloquants V1)

- **F1 (cosmetic) — `isStale` retourné jamais consommé.** `useArtKeywordsSync.ts:36,113,160` expose `isStale` (doc : "UI can surface this") mais `app/_layout.tsx:84` appelle `useArtKeywordsSync();` en jetant le retour. Aucun consumer (`grep isStale` = self-only). Dead return value, pas un bug — la feature est headless, donc rien ne surface la staleness à l'UI. Soit câbler une bannière dégradée, soit retirer `isStale` de l'API du hook (UFR-016). Sév : trace.
- **F2 (info, pas un risque) — GET `locale='%'` défaut.** Quand `?locale` absent, `findByLocale('%')` retourne TOUTES les locales via branche `if (locale === '%') return repo.find()` (typeorm.repo:14) — pas de concat SQL, pas d'injection. Le `%` est un sentinel applicatif, pas un pattern LIKE passé à la DB. OK.
- **F3 (info) — GET non role-gated** (auth seul). Intentionnel : tout user authentifié doit pull la taxonomy pour classifier localement. Lecture publique-au-sein-auth d'une donnée non sensible (mots-clés art). Conforme au design.

## Conclusion

WIRED ✅ · POST taxonomy gate I-SEC3 ✅ (requireRole ADMIN/MODERATOR/+super_admin → rate-limit 10/min byUserId, ordering correct) · classifier consommé E2E ✅ (FE preClassified → BE guardrail soft-skip, hard blocks préservés). 1 finding cosmétique (isStale orphan). Aucun blocker V1.
