# ROADMAP 10/10 — Dual-Track Multi-Session Spec

> **Date**: 2026-04-04
> **Objectif**: Atteindre 10/10 sur les 7 axes de l'audit (test pertinence, code quality, architecture, feature completeness, documentation, dependency health, team/process)
> **Méthode**: 4 phases, 14 sessions Claude parallélisées, dual-track (qualité technique + features)
> **Baseline audit**: 7/10 global — Tests 6.5, Code 7.5, Architecture 8, Features 8.5, Docs 5, Deps 7, Team 6

---

## Architecture de la Roadmap

```
PHASE 1 ─── "Nettoyer" ──────────────── 7 sessions parallèles (max)
│ S1: Doc cleanup + delete museum-admin
│ S2: Auth typing hacks fix
│ S3: Frontend test cleanup
│ S4: Team/Process hardening
│ S5: Email Change UI (feature-frontend)
│ S6: Reviews UI (feature-frontend)
│ S7: Remotion → Framer Motion (museum-web)
├──────────────────────────────────────────────────────────────────
PHASE 2 ─── "Refactorer" ────────────── 3 sessions (S8+S9 parallèles, S10 après S8)
│ S8: chat-message.service.ts split + eslint-disables
│ S9: Architecture fixes (ports, barrels, ChatModule)
│ S10: Test factory consolidation (après S8 — même fichiers chat)
├──────────────────────────────────────────────────────────────────
PHASE 3 ─── "Connecter" ─────────────── 3 sessions (S11+S12 parallèles, S13 après)
│ S11: Museum→Chat flow fix + location GPS dans le chat
│ S12: Art Keywords offline sync (feature-fullstack)
│ S13: Maestro CI + E2E gaps (après S11/S12 — teste les nouvelles features)
├──────────────────────────────────────────────────────────────────
PHASE 4 ─── "Vérifier" ──────────────── 1 session
│ S14: Full re-audit 10/10 (4 agents parallèles)
```

---

## Isolation des fichiers — ZERO conflit entre sessions parallèles

| Session | Modifie | Ne touche PAS |
|---------|---------|---------------|
| S1 | `docs/**`, `AGENTS.md`, `README.md`, `museum-admin/` (delete), `museum-backend/project.md`, `museum-backend/roadmap.md`, `.claude/skills/team/SKILL.md.v1.bak`, `museum-frontend/components/CameraView.tsx`, `museum-frontend/quality-ratchet.json`, `.gitignore` | Aucun src/ |
| S2 | `museum-backend/src/modules/auth/useCase/authSession.service.ts`, `socialLogin.useCase.ts` | Rien d'autre |
| S3 | `museum-frontend/__tests__/screens/chat-session.test.tsx`, `conversations.test.tsx`, `__tests__/components/GlassCard.test.tsx`, `__tests__/screens/privacy.test.tsx`, `terms.test.tsx` | Aucun code prod |
| S4 | `.claude/skills/team/` (templates, protocols, knowledge), `.claude/quality-ratchet.json` | Aucun code app |
| S5 | `museum-frontend/app/(stack)/change-email.tsx` (new), `features/auth/infrastructure/authApi.ts` (add 2 methods), `features/auth/`, i18n auth keys | Rien chat/, rien museum/ |
| S6 | `museum-frontend/app/(stack)/reviews.tsx` (new), `features/review/` (new), i18n review keys | Rien auth/, rien chat/ |
| S7 | `museum-web/src/remotion/` (delete), `museum-web/src/components/marketing/HeroPlayer.tsx`, `museum-web/package.json` | Rien mobile, rien backend |
| S8 | `museum-backend/src/modules/chat/useCase/chat-message.service.ts` + extracted files, eslint-disable files in chat/ | Pas auth/, pas frontend/ |
| S9 | `museum-backend/src/modules/chat/useCase/image-enrichment.service.ts`, `chat/index.ts`, `chat/domain/ports/`, auth+daily-art `index.ts` barrels | Pas chat-message.service.ts |
| S10 | `museum-backend/tests/helpers/chat/` (new shared factories), `tests/unit/chat/*.test.ts` (8 files) | Pas src/ prod |
| S11 | `museum-backend/src/modules/chat/useCase/chat-session.service.ts`, `llm-prompt-builder.ts`, `museum-frontend/app/(stack)/museum-detail.tsx`, `features/chat/application/useStartConversation.ts`, `useChatSession.ts`, `features/museum/application/useLocation.ts` | Pas chat-message.service.ts |
| S12 | `museum-frontend/features/art-keywords/` (new), `museum-backend/` art-keywords tests only | Rien chat/ existant |
| S13 | `.github/workflows/ci-cd-mobile.yml`, `museum-frontend/.maestro/` | Pas src/ |
| S14 | Lecture seule → rapport | Aucune modification |

---

## PHASE 1 — "Nettoyer" (7 sessions parallèles)

### S1 — `/team chore: Cleanup documentation + delete museum-admin`

**Axe**: Documentation 5→10
**Durée**: ~20min
**Commande**: `/team chore: Cleanup documentation — supprimer 14 fichiers dead weight (liste ci-dessous), archiver docs/fullcodebase-analyse/ vers docs/archive/, supprimer museum-admin/ entièrement (doublon de museum-web admin), mettre à jour README.md (supprimer paths absolus /Users/Tim, retirer "GPT-4", unifier en anglais), mettre à jour 3 docs stales.`

#### Suppressions (14 fichiers)

| Fichier | Raison |
|---------|--------|
| `AGENTS.md` | Contenu 100% identique à la section GitNexus de CLAUDE.md |
| `docs/prompts/claude-enterprise-audit.md` | Template de prompt, pas de la documentation |
| `docs/prompts/claude-integrity-verification.md` | Template de prompt, pas de la documentation |
| `docs/TOMORROW_REVIEW_V3.md` | Prompt one-shot daté, usage unique |
| `docs/V1_Sprint/PROMPT_COVERAGE_100.md` | Prompt one-shot ("copy-paste this tomorrow morning") |
| `docs/QA_AUDIT_REPORT.md` | Supersédé par CONSOLIDATED_TEST_AUDIT_2026-04-01.md |
| `docs/TEST_ARCHITECTURE_AUDIT.md` | Supersédé par CONSOLIDATED_TEST_AUDIT_2026-04-01.md |
| `docs/POST_MERGE_ACTIONS.md` | Checklist one-time datée mars 2026 |
| `museum-backend/project.md` | Plan PoC-era "Phase 0: Stabilisation S1", 100% supersédé |
| `museum-backend/roadmap.md` | Roadmap PoC-era avec TODOs unchecked, supersédé par MASTER_ROADMAP_V2 |
| `museum-frontend/docs/SUBAGENT_ENTERPRISE_FINDINGS.md` | Audit bloqué (SDK manquant), 0 findings utiles |
| `museum-frontend/components/CameraView.tsx` | Dead code — 0 imports dans tout le frontend (vérifié par grep) |
| `museum-frontend/quality-ratchet.json` | Doublon stale du vrai `.claude/quality-ratchet.json` |
| `.claude/skills/team/SKILL.md.v1.bak` | Fichier backup v1 |

#### Archive (12 fichiers → docs/archive/)

`docs/fullcodebase-analyse/*.md` — analyses pré-Sprint 1, valeur historique uniquement, scores stales

#### Suppression répertoire

`museum-admin/` — entièrement. 17 fichiers, 0 tests, 5 pages. Doublon strict de museum-web admin qui a plus de pages, des tests, et du CI.

#### Mises à jour

| Fichier | Action |
|---------|--------|
| `README.md` | Retirer paths absolus `/Users/Tim/Desktop/...`, remplacer "GPT-4" par "Multi-LLM (OpenAI/Deepseek/Google)", unifier en anglais |
| `museum-frontend/docs/ARCHITECTURE_MAP.md` | Mettre à jour pour refléter la structure actuelle (header dit "Jan 30, 2026") |
| `museum-frontend/docs/IMPROVEMENTS_TODO.md` | Cocher les P0/P1 résolus, supprimer les items complétés |
| `docs/RELEASE_CHECKLIST.md` | Mettre à jour les références sprint/date |
| `.gitignore` | Retirer toute référence à museum-admin si présente |

#### DoD
- 0 fichier dead weight détecté par re-scan
- museum-admin/ n'existe plus
- README.md ne contient plus de paths absolus

---

### S2 — `/team refactor: Fix auth typing hacks`

**Axe**: Code Quality (auth segment)
**Durée**: ~15min
**Commande**: `/team refactor: Fix 5 occurrences de "as unknown as Record<string, unknown>" dans auth. Typer sanitizeUser() dans authSession.service.ts pour accepter User directement au lieu de Record<string, unknown>. Fixer socialLogin.useCase.ts:59,78,99. Objectif: 0 double-cast dans le module auth.`

#### Détail technique

| Fichier | Lignes | Fix |
|---------|--------|-----|
| `authSession.service.ts:157` | `sanitizeUser(user as unknown as Record<string, unknown>)` | Changer la signature de `sanitizeUser` pour accepter `User` (ou `User \| Record<string, unknown>`) avec overload |
| `authSession.service.ts:194` | Même pattern | Même fix |
| `socialLogin.useCase.ts:59` | `this.authSessionService.socialLogin(user as unknown as Record<string, unknown>)` | Le param `socialLogin()` devrait accepter `User` |
| `socialLogin.useCase.ts:78` | `existingUser as unknown as Record<string, unknown>` | Idem |
| `socialLogin.useCase.ts:99` | `newUser as unknown as Record<string, unknown>` | Idem |

#### DoD
- 0 occurrence de `as unknown as Record` dans `museum-backend/src/`
- `pnpm lint` PASS
- `pnpm test` PASS, 0 régression

---

### S3 — `/team refactor: Frontend test cleanup — mock walls + tests pointless`

**Axe**: Test Pertinence (frontend segment)
**Durée**: ~25min
**Commande**: `/team refactor: Nettoyer les tests frontend à faible valeur. (1) chat-session.test.tsx a 18 jest.mock() — factoriser via test-utils.tsx (qui en a déjà 20). Garder les assertions de comportement, supprimer les tests "does testID exist". (2) conversations.test.tsx même traitement (11 mocks). (3) Supprimer GlassCard.test.tsx ("renders children" teste React, pas notre code). (4) Reworker privacy.test.tsx + terms.test.tsx — tester la structure (a des liens, a un bouton retour) pas le contenu texte. Si des tests sont supprimés, mettre à jour le ratchet avec justification.`

#### Détail

| Fichier | Problème | Action |
|---------|----------|--------|
| `chat-session.test.tsx` | 18 mocks, 150+L setup, assertions triviales (getByTestId) | Supprimer les mocks déjà dans test-utils. Garder uniquement: header renders with title, send message flow, error state display. Target: <80L |
| `conversations.test.tsx` | 11 mocks, tests de rendu basique | Factoriser via test-utils. Garder: loading state, cards render, empty state. Target: <60L |
| `GlassCard.test.tsx` | 1 test: "renders children" | DELETE — teste React.createElement, pas de valeur business |
| `privacy.test.tsx` | Teste que des strings de texte légal apparaissent | Reworker: tester structure (ScrollView exists, back button exists, links to external policy). Ne PAS tester le contenu texte |
| `terms.test.tsx` | Même problème | Même traitement |

#### Ratchet
Si net removal de tests, mettre à jour `.claude/quality-ratchet.json` avec commentaire: "Removed N low-value tests (mock choreography, renders-children, static text). Replaced by structure tests."

#### DoD
- 0 test file avec >10 jest.mock() (hors test-utils.tsx)
- GlassCard.test.tsx supprimé
- privacy/terms testent la structure, pas le texte
- `npm test` PASS
- Ratchet mis à jour si nécessaire

---

### S4 — `/team chore: Team/Process hardening`

**Axe**: Team/Process 6→10
**Durée**: ~20min
**Commande**: `/team chore: Hardening du système /team. (1) Créer team-templates/audit.md (template manquant pour le mode audit). (2) Renforcer la vérification Sentinelle: ajouter check eslint-disable allowlist à chaque porte (grep new eslint-disable vs CLAUDE.md allowlist). (3) Renforcer injection DRY factories dans les mandats agents. (4) Git track team-knowledge/ et team-reports/ (actuellement non trackés = connaissance volatile). (5) Appliquer politique rétention team-reports/: garder 5 derniers, archiver les anciens.`

#### Fichiers à créer/modifier

| Fichier | Action |
|---------|--------|
| `.claude/skills/team/team-templates/audit.md` | CREATE — template mode audit (Scan parallèle → Consolidate → Report, comme dans SKILL.md) |
| `.claude/skills/team/team-protocols/quality-gates.md` | UPDATE — ajouter step Sentinelle: `grep -c eslint-disable` diff vs allowlist |
| `.claude/skills/team/team-protocols/agent-mandate.md` | UPDATE — renforcer section DRY factories (inclure makeRepo/makeCache exemples) |
| `.claude/skills/team/team-knowledge/*.json` | CREATE les 7 fichiers JSON si absents, git add |
| `.claude/skills/team/team-reports/` | Git track, archiver les fichiers avant 2026-03-30 |

#### DoD
- `team-templates/audit.md` existe et est valide
- `/team audit:` ne crash plus sur template manquant
- `team-knowledge/` et `team-reports/` sont trackés dans git
- Sentinelle documente le check eslint-disable

---

### S5 — `/team feature-frontend: Email Change screen`

**Axe**: Feature Completeness (Email Change 0%→100%)
**Durée**: ~25min
**Commande**: `/team feature-frontend: Créer l'écran Email Change. Le backend a déjà les endpoints PUT /api/auth/change-email et POST /api/auth/confirm-email-change. Les types OpenAPI sont déjà générés. Il faut: (1) Ajouter changeEmail() + confirmEmailChange() dans features/auth/infrastructure/authApi.ts. (2) Créer app/(stack)/change-email.tsx — formulaire: nouveau email + mot de passe confirmation → appel API → message "check your email". (3) Ajouter un bouton "Change Email" dans settings.tsx section sécurité (à côté de Change Password). (4) i18n 8 langues. (5) Tests: change-email.test.tsx.`

#### Contrat backend existant (ne pas modifier)

```
PUT /api/auth/change-email
  Body: { newEmail: string, password: string }
  Response: 200 { message: string }

POST /api/auth/confirm-email-change  
  Body: { token: string }
  Response: 200 { message: string }
```

#### Frontend à créer

| Fichier | Contenu |
|---------|---------|
| `features/auth/infrastructure/authApi.ts` | Ajouter `changeEmail(newEmail, password)` + `confirmEmailChange(token)` |
| `app/(stack)/change-email.tsx` | Formulaire: TextInput email + TextInput password + bouton Submit. Loading state, error handling, success message. Style cohérent avec change-password.tsx |
| `app/(stack)/settings.tsx` | Ajouter bouton "Change Email" dans SettingsSecurityCard, navigation vers change-email |
| i18n `locales/*/auth.json` | Ajouter clés: changeEmail.title, changeEmail.newEmail, changeEmail.password, changeEmail.submit, changeEmail.success, changeEmail.error — 8 langues |
| `__tests__/screens/change-email.test.tsx` | Tests: form renders, validation, submit calls API, success state, error state |

#### DoD
- Écran change-email accessible depuis settings
- Appel API fonctionne (manuellement testable via test.http)
- i18n 8 langues
- Tests passent
- `npm run lint` + `npm test` PASS

---

### S6 — `/team feature-frontend: Reviews screen`

**Axe**: Feature Completeness (Reviews 0%→100%)
**Durée**: ~30min
**Commande**: `/team feature-frontend: Créer le module Reviews mobile. Le backend a déjà les endpoints POST /api/reviews (create, auth), GET /api/reviews (list approved, public, paginated), GET /api/reviews/stats (avg + count). Les types OpenAPI sont générés (ReviewDTO, ReviewListResponse, ReviewStatsResponse). Il faut: (1) Créer features/review/ (reviewApi.ts, useReviews.ts, ReviewCard.tsx, StarRating.tsx). (2) Créer app/(stack)/reviews.tsx — liste des reviews + stats en header + bouton "Write a review" + formulaire inline. (3) Navigation depuis settings ou home. (4) i18n 8 langues. (5) Tests complets.`

#### Contrat backend existant (ne pas modifier)

```
POST /api/reviews          (auth required)
  Body: { rating: 1-5, title: string, comment: string }
  Response: 201 { review: ReviewDTO }

GET /api/reviews           (public, paginated)
  Query: ?page=1&limit=10
  Response: 200 { reviews: ReviewDTO[], total: number, page: number }

GET /api/reviews/stats     (public)
  Response: 200 { averageRating: number, totalReviews: number }
```

#### Frontend à créer

| Fichier | Contenu |
|---------|---------|
| `features/review/infrastructure/reviewApi.ts` | `getReviews(page)`, `getReviewStats()`, `submitReview(rating, title, comment)` |
| `features/review/application/useReviews.ts` | Hook: fetch stats + paginated list, submit review, optimistic update |
| `features/review/ui/ReviewCard.tsx` | Card: avatar, name, star rating, title, comment, date |
| `features/review/ui/StarRating.tsx` | Interactive star rating (1-5), tap to set, display-only mode |
| `app/(stack)/reviews.tsx` | Screen: stats header (avg rating + count) + FlatList of ReviewCard + FAB "Write Review" → bottom sheet form |
| Navigation | Depuis settings: "Rate Musaium" button → reviews screen |
| i18n `locales/*/reviews.json` | Clés: title, writeReview, rating, comment, submit, success, empty — 8 langues |
| `__tests__/screens/reviews.test.tsx` | Tests |
| `__tests__/features/review/reviewApi.test.ts` | Tests API |
| `__tests__/features/review/useReviews.test.ts` | Tests hook |

#### DoD
- Écran reviews accessible depuis settings
- Peut voir la liste, les stats, et soumettre un avis
- i18n 8 langues
- Tests passent
- `npm run lint` + `npm test` PASS

---

### S7 — `/team refactor: Remotion → Framer Motion (museum-web)`

**Axe**: Dependency Health (Remotion removal)
**Durée**: ~20min
**Commande**: `/team refactor: Migrer le hero animation de Remotion vers Framer Motion dans museum-web. Remotion n'est utilisé que dans 2 fichiers: src/remotion/HeroComposition.tsx (198L, iPhone mockup flottant + orbs lumineux) et src/components/marketing/HeroPlayer.tsx (30L, Player wrapper). Framer Motion est DÉJÀ installé et utilisé dans 3 composants marketing (AnimatedSection, DeviceShowcase, PhoneMockup). La migration consiste à: (1) Réécrire HeroComposition en composant Framer Motion (useMotionValue pour float/rotation, animate pour orbs). (2) Supprimer HeroPlayer.tsx (plus besoin du Player wrapper). (3) Supprimer src/remotion/ entièrement. (4) pnpm remove remotion @remotion/player. (5) Vérifier le build. L'animation doit être visuellement identique: iPhone mockup qui flotte avec rotation subtile + 3 orbs lumineux en drift.`

#### État actuel

```
src/remotion/HeroComposition.tsx (198L)
  - Utilise: useCurrentFrame, useVideoConfig, interpolate, spring, Img (Remotion)
  - Animation: entrance spring (scale 0.8→1), float Y (sin wave ±15px), rotateY/X (drift),
    3 orbs avec drift indépendant
  - Image: /images/screenshots/02_home.png dans un mockup iPhone (bezel titanium, Dynamic Island)

src/components/marketing/HeroPlayer.tsx (30L)  
  - Wrapper: <Player component={HeroComposition} 300frames 30fps autoPlay loop>
```

#### Cible: 1 composant Framer Motion

```tsx
// src/components/marketing/HeroAnimation.tsx
// Framer Motion: motion.div avec animate, transition (repeat Infinity), 
// useMotionValue pour float interactif (optionnel)
// Même visuel: iPhone mockup + 3 orbs + entrance fade
```

#### DoD
- `remotion` et `@remotion/player` supprimés de package.json
- `src/remotion/` supprimé
- Hero animation fonctionne identiquement avec Framer Motion
- `pnpm build` PASS (museum-web)
- `pnpm lint` PASS

---

## PHASE 2 — "Refactorer" (S8+S9 parallèles, puis S10)

### S8 — `/team refactor: Split chat-message.service.ts + fix eslint-disables`

**Axe**: Code Quality 7.5→10
**Durée**: ~35min
**Commande**: `/team refactor: Décomposer chat-message.service.ts (583L, eslint-disable max-lines) et fixer les 23 eslint-disables unjustifiés dans le backend. Cible: aucun fichier >400L, 0 eslint-disable hors allowlist CLAUDE.md.`

#### Extractions depuis chat-message.service.ts

| Extraction | Méthode source | Destination | Lignes |
|-----------|---------------|-------------|--------|
| Enrichment fetching | `fetchEnrichmentData()` (71L) | Inline split: `fetchParallelEnrichments()` + `mergeWikidataImage()` dans le même fichier, ou extraction si ça réduit suffisamment | ~71L |
| Buffer drain | `postMessageStream()` drain logic (L511-522) | `shared/` utility `awaitBufferDrain(buffer, timeoutMs)` | ~15L |
| Audio validation | `postAudioMessage()` validation (L540-558) | `validateAudioInput()` standalone function même fichier | ~20L |

Objectif: `chat-message.service.ts` passe de 583L à <400L, `eslint-disable max-lines` supprimé.

#### 23 eslint-disables unjustifiés à fixer

| Rule | Count | Fix |
|------|-------|-----|
| `complexity` (4) | `chat-message.route.ts:109`, `chat.contracts.ts:333`, `chat.image-url.ts:56`, `llm-section-runner.ts:183` | Décomposer en sous-fonctions |
| `max-lines-per-function` (3) | `EnsureChatTables.ts:10`, `chat-media.route.ts:126`, `llm-section-runner.ts:183` | Extraire helpers |
| `max-lines` (1) | `chat-message.service.ts:1` | Résolu par le split ci-dessus |
| `max-params` (2) | `langchain.orchestrator.ts:180,315` | Options object pattern |
| `no-base-to-string` (2) | `llm-prompt-builder.ts:256,260` | Explicit .toString() ou template literal fix |
| `no-namespace` (1) | `accept-language.middleware.ts:6` | Convertir namespace en module |
| `void-use` (1) | `api.router.ts:130` | Assigner à variable ou restructurer |
| `non-nullable-type-assertion-style` (1) | `chat-session.service.ts:145` | Utiliser `!` ou restructurer le flow |
| `no-non-null-assertion` (1) | `userMemory.repository.typeorm.ts:41` | Utiliser optional chaining ou null check |
| `consistent-type-imports` (1) | `langchain.orchestrator.ts:112` | Ajouter `type` keyword |

Note: Les fichiers `chat-session.service.ts` et `llm-prompt-builder.ts` sont aussi touchés par S11 (Phase 3). Pour éviter les conflits: **S8 ne touche QUE les eslint-disables dans ces fichiers, pas la logique**. S11 ajoutera la logique museum→chat ensuite.

#### DoD
- `chat-message.service.ts` < 400L
- 0 eslint-disable hors allowlist CLAUDE.md dans `museum-backend/src/`
- `pnpm lint` PASS
- `pnpm test` PASS, 0 régression

---

### S9 — `/team refactor: Architecture fixes (ports, barrels, ChatModule)`

**Axe**: Architecture 8→10
**Durée**: ~25min
**Commande**: `/team refactor: Fixer 3 violations architecturales. (1) image-enrichment.service.ts importe UnsplashClient type depuis adapters/secondary/ — déplacer le type vers domain/ports/image-source.port.ts. (2) ChatModule getters retournent | undefined avant build() — implémenter un builder pattern qui retourne un typed "built" object sans undefined. (3) Vérifier que auth et daily-art ont un index.ts barrel cohérent avec les autres modules (chat, admin, support, review ont des barrels).`

#### Fix 1: Import violation

```
AVANT: image-enrichment.service.ts imports { UnsplashClient, UnsplashPhoto } from '../adapters/secondary/unsplash.client'
APRÈS: Créer domain/ports/image-source.port.ts avec interface ImageSourceClient + ImageSourcePhoto
        image-enrichment.service.ts importe depuis domain/ports/
        unsplash.client.ts implémente ImageSourceClient
```

#### Fix 2: ChatModule builder pattern

```
AVANT: chatModule.getImageStorage(): ImageStorage | undefined
APRÈS: chatModule.build() returns { imageStorage: ImageStorage, repository: ChatRepository, ... }
       Plus de getters optional, plus de null checks downstream
```

#### Fix 3: Barrel consistency

Vérifier/créer `index.ts` dans:
- `museum-backend/src/modules/auth/index.ts`
- `museum-backend/src/modules/daily-art/index.ts`
- Pattern: même structure que `chat/index.ts` (composition root + export)

#### DoD
- 0 import d'adapter depuis useCase/domain (vérifié par grep)
- ChatModule.build() retourne un typed object, 0 getter undefined
- Tous les modules ont un index.ts barrel
- `pnpm lint` + `pnpm test` PASS

---

### S10 — `/team refactor: Test factory consolidation` (APRÈS S8)

**Axe**: Test Pertinence (DRY factories)
**Durée**: ~25min
**Dépendance**: S8 doit être terminé (même fichiers chat/tests)
**Commande**: `/team refactor: Consolider les factories de test dupliquées. 8 fichiers de test chat définissent des makeRepo()/makeSession()/makeCache() locaux au lieu d'utiliser des factories partagées. (1) Créer tests/helpers/chat/repo.fixtures.ts avec makeRepo() partagé (in-memory chat repo mock). (2) Créer tests/helpers/chat/cache.fixtures.ts avec makeCache() partagé (noop cache mock). (3) Migrer les 8 fichiers pour importer les factories partagées. (4) Réécrire chat-service.test.ts: de 300L de delegation mock testing → test du wiring constructeur seulement (~50L). Supprimer les tests qui vérifient que JavaScript sait appeler des fonctions.`

#### 8 fichiers à migrer

| Fichier | Factories locales à supprimer |
|---------|-------------------------------|
| `tests/unit/modules/admin/changeUserRole.useCase.test.ts` | `makeRepo()` |
| `tests/unit/audit/audit.service.test.ts` | `makeRepo()` |
| `tests/unit/chat/chat-media.service.test.ts` | `makeSession()`, `makeRepo()`, `makeCache()` |
| `tests/unit/chat/user-memory.service.test.ts` | `makeRepo()`, `makeCache()` |
| `tests/unit/chat/chat-session.service.test.ts` | `makeSession()`, `makeRepo()`, `makeCache()` |
| `tests/unit/chat/chat-message-service.test.ts` | `makeSession()`, `makeRepo()`, `makeCache()` |
| `tests/unit/chat/visit-context.test.ts` | `makeSession()` |
| `tests/unit/chat/chat-service.test.ts` | `makeRepo()` |

#### Réécriture chat-service.test.ts

```
AVANT: 300+L vérifiant que service.createSession(x) appelle sessionsSvc.createSession(x)
       = mock choreography, teste que JavaScript peut appeler des fonctions

APRÈS: ~50L vérifiant:
       - Le constructeur wire correctement les sous-services
       - Les méthodes publiques existent et sont callable
       - Pas de vérification de delegation (les sous-services ont leurs propres tests)
```

#### DoD
- 0 factory locale dans les 8 fichiers (grep `makeRepo\|makeCache` hors tests/helpers/)
- `tests/helpers/chat/repo.fixtures.ts` et `cache.fixtures.ts` existent
- `chat-service.test.ts` < 80L
- `pnpm test` PASS
- Ratchet test count peut baisser (justifié par suppression delegation tests)

---

## PHASE 3 — "Connecter" (S11+S12 parallèles, puis S13)

### S11 — `/team bug: Museum→Chat flow fix + location GPS`

**Axe**: Feature Completeness (museum→chat flow, le plus critique UX)
**Durée**: ~35min
**Commande**: `/team bug: Le flow "Start Chat Here" depuis museum-detail est CASSÉ. Quand un user clique sur un musée puis "Start Chat Here", le LLM ne sait pas QUEL musée. Le museumId est stocké mais jamais résolu en nom. De plus, le chat n'a aucune awareness de la localisation GPS du visiteur — il ne peut pas dire "les musées autour de vous" quand l'user demande vocalement ou par texte. Fix complet ci-dessous.`

#### Problème 1: museumName jamais résolu

```
FLOW ACTUEL:
museum-detail.tsx → startConversation({ museumId: 42 }) → backend crée session avec museumId=42, museumName=null
→ LLM reçoit "museumMode: true" MAIS pas le nom du musée → prompt générique "you're in a museum"

FIX:
1. Backend chat-session.service.ts: à createSession(), si museumId fourni, query MuseumRepository.findById(museumId)
   → set session.museumName = museum.name, session.museumAddress = museum.address
2. Backend llm-prompt-builder.ts: si session.museumName existe, injecter dans le system prompt:
   "The visitor is at: {museumName}, {museumAddress}. Use this context for all responses."
3. Frontend museum-detail.tsx: passer aussi museumName + museumAddress dans startConversation()
   (fallback: le backend résout depuis museumId, mais le frontend peut pré-remplir)
4. Frontend useStartConversation.ts: inclure museumName/museumAddress dans payload createSession
```

#### Problème 2: museumMode vient des settings, pas de la session

```
FLOW ACTUEL:
useChatSession.ts:39 → museumMode vient de useRuntimeSettings()
→ Si user setting = museumMode:false mais session créée depuis un musée (museumMode:true)
→ Le frontend envoie museumMode:false, ça écrase la valeur session

FIX:
5. Frontend useChatSession.ts: quand la session a museumMode=true (chargée depuis l'API),
   utiliser session.museumMode au lieu de runtimeSettings.museumMode pour cette session
   → Le setting global est un default, pas un override
```

#### Problème 3: Location GPS jamais envoyée au chat

```
ÉTAT ACTUEL:
- chatApi.postMessage() accepte `location` (string) dans le context → ça marche dans le backend
- llm-prompt-builder.ts:142 injecte `<visitor_context>Visitor location: {location}</visitor_context>` si présent
- useLocation.ts existe dans features/museum/ — retourne lat/lng/status
- MAIS useChatSession ne passe JAMAIS location → le champ est toujours undefined

FIX:
6. Frontend useChatSession.ts: importer useLocation depuis features/museum/
   → Passer la position GPS dans context.location quand disponible
   → Format: "lat:{lat},lng:{lng}" (le backend peut l'utiliser pour query nearby museums)

7. Backend llm-prompt-builder.ts: enrichir le contextLine — si location contient des coords,
   query searchMuseums.useCase.ts avec ces coords pour obtenir les musées proches
   → Injecter dans le prompt: "Nearby museums: {list}" quand l'user demande
   
   ATTENTION: Ne pas query à chaque message — seulement quand la session n'a pas encore de museum context
   et que le message semble demander des recommandations de musées.
   Alternative plus simple: passer les coords au backend, stocker dans la session,
   et laisser le visitContext s'enrichir progressivement.

8. Backend chat-session.service.ts: accepter un champ optionnel `coordinates: {lat, lng}`
   dans createSession → stocker dans la session pour utilisation future par le prompt builder
```

#### Problème 4: "Qu'est-ce que j'ai autour de moi ?" dans le chat

```
FIX:
9. Backend: Créer un lightweight nearbyMuseumsProvider dans chat/useCase/
   - Accepte lat/lng, retourne les 5 musées les plus proches (via MuseumRepository ou searchMuseums)
   - Appelé par le prompt builder quand session.coordinates existe et que le visitContext n'a pas encore de musée
   - Le résultat est injecté comme contexte système:
     "Nearby museums based on visitor GPS: 1. Louvre (0.3km) 2. Orsay (0.8km) ..."
   - Cacheable: ne query qu'une fois par session (stocker dans visitContext)
```

#### Fichiers modifiés

| Couche | Fichier | Modification |
|--------|---------|-------------|
| BE | `chat-session.service.ts` | createSession: resolve museumName from museumId, accept coordinates |
| BE | `llm-prompt-builder.ts` | Inject museumName + nearby museums in prompt |
| BE | `chat/useCase/nearby-museums.provider.ts` | NEW: lightweight provider, query museum search |
| BE | `chat/domain/chatSession.entity.ts` | Add `coordinates` field (nullable JSON) if not present |
| FE | `museum-detail.tsx` | Pass museumName + museumAddress to startConversation |
| FE | `useStartConversation.ts` | Include museumName/museumAddress/coordinates in payload |
| FE | `useChatSession.ts` | Use session.museumMode instead of settings, pass GPS location in context |
| Tests | Unit + integration pour le museum resolution + nearby provider |

#### DoD
- Créer session depuis museum-detail → LLM sait QUEL musée (premier message)
- Demander "qu'est-ce qu'il y a autour de moi" → le chat liste les musées proches
- GPS coordinates passées dans le context des messages
- museumMode vient de la session, pas des settings, pour les sessions créées depuis un musée
- Tests unitaires pour museum resolution + nearby provider
- `pnpm lint` + `pnpm test` PASS

---

### S12 — `/team feature-fullstack: Art Keywords offline sync`

**Axe**: Feature Completeness (Art Keywords 0%→100%)
**Durée**: ~30min
**Commande**: `/team feature-fullstack: Implémenter le sync offline des art keywords. Le backend a déjà GET /api/chat/art-keywords?locale={locale}&since={timestamp} et POST /api/chat/art-keywords (bulk upsert). L'entity ArtKeyword existe avec la migration. Il faut créer le module frontend complet pour synchroniser les keywords au lancement et les rendre disponibles offline pour l'art-topic classifier.`

#### Backend existant (ne pas modifier)

```
GET /api/chat/art-keywords?locale=fr&since=2026-04-01T00:00:00Z
  Response: { keywords: ArtKeywordDTO[], syncedAt: string }

POST /api/chat/art-keywords (admin only, bulk upsert)
  Body: { keywords: ArtKeywordDTO[] }
```

#### Frontend à créer

| Fichier | Contenu |
|---------|---------|
| `features/art-keywords/infrastructure/artKeywordsApi.ts` | `syncKeywords(locale, since)` → GET endpoint |
| `features/art-keywords/infrastructure/artKeywordsStore.ts` | Zustand + AsyncStorage: keywords par locale, lastSyncedAt |
| `features/art-keywords/application/useArtKeywordsSync.ts` | Hook: au mount, si lastSyncedAt > 24h ou null, sync. Background sync. |
| `features/art-keywords/domain/artKeyword.types.ts` | Types locaux (pas OpenAPI pour offline) |

#### Intégration

- `app/_layout.tsx`: monter le sync hook au niveau root (après auth)
- Le store peut être consommé par le chat pour enrichir les suggestions

#### Tests

| Fichier | Contenu |
|---------|---------|
| `__tests__/features/art-keywords/artKeywordsApi.test.ts` | API calls mockés |
| `__tests__/features/art-keywords/useArtKeywordsSync.test.ts` | Sync logic: first sync, delta sync, error handling |
| `__tests__/features/art-keywords/artKeywordsStore.test.ts` | Store persistence |

#### DoD
- Au lancement de l'app (post-login), les keywords se synchronisent silencieusement
- Les keywords sont disponibles offline via le store
- Delta sync: ne télécharge que les keywords modifiés depuis le dernier sync
- Tests passent
- `npm run lint` + `npm test` PASS

---

### S13 — `/team chore: Maestro CI + E2E gaps` (APRÈS S11 + S12)

**Axe**: Test Pertinence (E2E segment) + Dependency Health
**Durée**: ~25min
**Dépendance**: S11 et S12 terminés (teste les nouvelles features)
**Commande**: `/team chore: Intégrer Maestro dans le CI et combler les gaps E2E. (1) Git track tous les flows Maestro untracked (chat-flow, navigation, onboarding, settings, helpers/). (2) Créer museum-chat-flow.yaml: museum directory → tap museum → museum detail → "Start Chat Here" → verify chat screen loads with museum context. (3) Intégrer Maestro dans ci-cd-mobile.yml (après build EAS, run sur simulateur ou EAS Maestro workflow). (4) Mettre à jour CLAUDE.md avec note de monitoring TypeORM (docs archivés, v1.0 prévue H1 2026).`

#### Maestro flows à tracker

```bash
git add museum-frontend/.maestro/chat-flow.yaml
git add museum-frontend/.maestro/navigation-flow.yaml
git add museum-frontend/.maestro/onboarding-flow.yaml
git add museum-frontend/.maestro/settings-flow.yaml
git add museum-frontend/.maestro/helpers/quick-login.yaml
git add museum-frontend/.maestro/config.yaml
git add museum-frontend/.maestro/README.md
```

#### Nouveau flow: museum-chat-flow.yaml

```yaml
# Trace: Museums tab → tap museum → detail → "Start Chat Here" → chat loads
appId: com.musaium.app.dev
---
- launchApp
- runFlow: helpers/quick-login.yaml
- tapOn: "Museums"                    # Bottom tab
- waitForAnimationToEnd
- tapOn:                              # First museum card
    index: 0
- assertVisible: "Start Chat Here"
- tapOn: "Start Chat Here"
- assertVisible:                      # Chat screen loaded
    id: "chat-input"
```

#### CI Integration

Dans `ci-cd-mobile.yml`, ajouter un job après le build:
```yaml
maestro-e2e:
  needs: build
  runs-on: macos-latest
  steps:
    - uses: mobile-dev-inc/action-maestro-cloud@v2
      with:
        api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
        app-file: build/*.app
        workspace: museum-frontend/.maestro
```

Alternative si pas de Maestro Cloud: run local sur simulateur iOS dans le CI.

#### CLAUDE.md update

Ajouter dans la section Dependency:
```markdown
### TypeORM Monitoring
TypeORM docs repo archived March 2026. v1.0 planned H1 2026 with breaking changes.
Current assessment: works, migration not urgent, but monitor releases.
Alternatives for future: Drizzle (S-tier 2026), Prisma 7, Kysely.
```

#### DoD
- Tous les flows Maestro trackés dans git
- museum-chat-flow.yaml existe et documente le flow museum→chat
- CI job Maestro configuré (au minimum le skeleton, même si MAESTRO_CLOUD_API_KEY n'est pas encore set)
- CLAUDE.md mis à jour avec note TypeORM
- `npm run lint` PASS

---

## PHASE 4 — "Vérifier" (1 session)

### S14 — `/team audit: Re-audit complet 10/10`

**Axe**: Vérification finale
**Durée**: ~25min
**Commande**: `/team audit: Re-audit complet. 4 agents parallèles. Mêmes critères que l'audit du 2026-04-04. Vérifier que CHAQUE axe est à 10/10.`

#### Critères PASS par axe

| Axe | Score cible | Critère PASS |
|-----|------------|-------------|
| Test Pertinence | 10/10 | 0 factory dupliquée, 0 mock wall (>10 mocks hors test-utils), 0 test pointless (GlassCard-style), Maestro en CI, chat-service.test.ts <80L |
| Code Quality | 10/10 | 0 `as unknown as Record`, 0 eslint-disable hors allowlist, aucun fichier src/ >400L |
| Architecture | 10/10 | 0 import adapter depuis useCase/domain, 0 getter `\| undefined` sur ChatModule, barrels cohérents tous modules |
| Feature Completeness | 10/10 | 29/29 production-ready (reviews UI, email change UI, art keywords sync, museum→chat flow), location GPS dans le chat |
| Documentation | 10/10 | 0 dead weight .md, museum-admin supprimé, README propre, fullcodebase-analyse archivé |
| Dependency Health | 10/10 | Remotion supprimé, TypeORM monitoring documenté, 0 package orphelin |
| Team/Process | 10/10 | Template audit.md existe, Sentinelle eslint-disable check, team-knowledge tracké, factories DRY enforced |

#### Si un axe est < 10/10
Identifier les items manquants et créer un sprint correctif ciblé.

---

## Résumé exécutif

| Phase | Sessions | Parallélisme | Durée estimée |
|-------|----------|-------------|---------------|
| Phase 1 — Nettoyer | 7 | 7x parallèle | ~30min (le plus long S6) |
| Phase 2 — Refactorer | 3 | 2x puis 1x | ~35min (le plus long S8) |
| Phase 3 — Connecter | 3 | 2x puis 1x | ~35min (le plus long S11) |
| Phase 4 — Vérifier | 1 | 1x | ~25min |
| **Total** | **14** | **Max 7x** | **~2h** |

### Ordre d'exécution strict

```
Phase 1: S1, S2, S3, S4, S5, S6, S7  (tous en parallèle)
         ↓ attendre que TOUS soient terminés
Phase 2: S8 + S9 (parallèle)
         ↓ attendre S8
         S10 (dépend de S8 — mêmes fichiers chat/tests)
         ↓ attendre que TOUS soient terminés
Phase 3: S11 + S12 (parallèle)
         ↓ attendre S11 et S12
         S13 (dépend des nouvelles features)
         ↓ attendre
Phase 4: S14 (audit final)
```

### Commandes de lancement

```bash
# === PHASE 1 === (7 terminaux Claude Code)
# T1: /team chore: Cleanup docs [coller spec S1]
# T2: /team refactor: Auth typing [coller spec S2]
# T3: /team refactor: Frontend tests [coller spec S3]
# T4: /team chore: Team process [coller spec S4]
# T5: /team feature-frontend: Email Change [coller spec S5]
# T6: /team feature-frontend: Reviews [coller spec S6]
# T7: /team refactor: Remotion migration [coller spec S7]

# === PHASE 2 === (2 puis 1 terminal)
# T8: /team refactor: Chat service split [coller spec S8]
# T9: /team refactor: Architecture fixes [coller spec S9]
# (après T8) T10: /team refactor: Test factories [coller spec S10]

# === PHASE 3 === (2 puis 1 terminal)
# T11: /team bug: Museum→Chat flow [coller spec S11]
# T12: /team feature-fullstack: Art Keywords [coller spec S12]
# (après T11+T12) T13: /team chore: Maestro CI [coller spec S13]

# === PHASE 4 ===
# T14: /team audit: Re-audit 10/10 [coller spec S14]
```
