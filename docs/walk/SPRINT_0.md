# Sprint 0 — Foundation + Store Submission

> ⚠️ **STATUS**: NOT STARTED — planning doc only, 0 code.
>
> **Duree**: 2 semaines | **Priorite**: IMMEDIATE | **Dependances**: aucune

## Goal

Fermer les gaps testing critiques, soumettre aux stores, poser le free tier gate, integrer Sentry web.

## Prerequis

- Backend prod running et healthy sur musaium.com
- Apple Developer Program + Google Play Console actifs
- CI workflows green sur main

## User Stories

| ID | En tant que... | Je veux... | Critere d'acceptation |
|----|---------------|------------|----------------------|
| S0-01 | developpeur | tests unitaires chat core services | 3 fichiers tests pour chat.service, chat-message.service, chat-session.service. >80% couverture ligne |
| S0-02 | developpeur | tests museum-web executes en CI | `ci-cd-web.yml` quality job inclut `pnpm test`, 8+ tests passent |
| S0-03 | developpeur | app soumise aux stores | Submission iOS + Android complete |
| S0-04 | developpeur | Sentry sur museum-web | @sentry/nextjs integre, erreurs remontees au dashboard |
| S0-05 | utilisateur | limite gratuite claire | Backend enforce 5 chats/jour, frontend montre message i18n quand atteint |
| S0-06 | marketeur | Schema.org sur landing | JSON-LD MobileApplication sur page d'accueil museum-web |

## Taches Techniques

### Testing (5 jours)

- [ ] Ecrire `museum-backend/tests/unit/chat/chat.service.test.ts`
  - Mock: orchestrator, guardrail, repository
  - Tester: createSession, postMessage, handleImage, handleAudio
  - Cible: >80% couverture ligne du service

- [ ] Ecrire `museum-backend/tests/unit/chat/chat-message.service.test.ts`
  - 549 lignes — service le plus complexe du backend
  - Mock: langchain orchestrator, cache, repository, S3
  - Tester: postMessageStream (META parsing, token filtering), postMessage (sync)
  - Tester: guardrail input/output, abort handling

- [ ] Ecrire `museum-backend/tests/unit/chat/chat-session-service.test.ts`
  - Verifier/completer couverture existante
  - Tester: createSession, listSessions, deleteSession, cache invalidation

- [ ] Ajouter `pnpm test` dans `.github/workflows/ci-cd-web.yml` job quality
  - Apres l'etape Build, ajouter etape test
  - Verifier que les 8 tests existants passent en CI

- [ ] Integrer `@sentry/nextjs` dans museum-web
  - Installer: `cd museum-web && pnpm add @sentry/nextjs`
  - Configurer: sentry.client.config.ts, sentry.server.config.ts
  - DSN via env var `SENTRY_DSN` (graceful si absent)

### Store Submission (2 jours)

- [ ] Google Play Data Safety Form
  - Suivre `docs/GOOGLE_PLAY_DATA_SAFETY.md`
  - Declarer: donnees collectees, usage, chiffrement

- [ ] Generer screenshots via Maestro
  - Utiliser `museum-frontend/maestro/screenshots.yaml`
  - Formats: iPhone 6.7", iPhone 6.5", iPad 12.9"

- [ ] Soumettre iOS
  - `eas build --platform ios --profile production`
  - `eas submit --platform ios --profile production`
  - Suivre `docs/STORE_SUBMISSION_GUIDE.md`

- [ ] Soumettre Android
  - `eas build --platform android --profile production`
  - `eas submit --platform android --profile production`

### Free Tier Gate (1 jour)

- [ ] Middleware backend: daily chat limit
  - Fichier: `museum-backend/src/helpers/middleware/daily-chat-limit.middleware.ts`
  - Compter messages/jour par userId (Redis ou DB query)
  - Limite configurable: `FREE_TIER_DAILY_CHAT_LIMIT` (env, default 5)
  - Si depasse: retourner 429 avec body `{ code: 'DAILY_LIMIT_REACHED', limit: 5 }`
  - Appliquer sur `POST /api/chat/sessions/:id/messages` et `POST /api/chat/sessions/:id/messages/stream`

- [ ] Frontend: intercepter 429 daily limit
  - Dans `features/chat/infrastructure/chatApi.ts`: detecter code `DAILY_LIMIT_REACHED`
  - Afficher modal i18n "Limite atteinte — 5 conversations par jour"
  - Bouton CTA "Upgrade" (placeholder, pointe vers settings pour l'instant)

- [ ] i18n 8 langues pour messages de limite
  - Cle: `chat.daily_limit_reached`, `chat.daily_limit_upgrade`

### SEO (0.5 jour)

- [ ] JSON-LD Schema.org MobileApplication
  - Fichier: `museum-web/src/app/[locale]/page.tsx`
  - Ajouter `<script type="application/ld+json">` avec schema MobileApplication
  - Inclure: name, operatingSystem, applicationCategory, offers

## Fichiers critiques

| Fichier | Action |
|---------|--------|
| `museum-backend/src/modules/chat/application/chat.service.ts` | A tester (294 lignes) |
| `museum-backend/src/modules/chat/application/chat-message.service.ts` | A tester (549 lignes) |
| `museum-backend/src/modules/chat/application/chat-session.service.ts` | A tester (233 lignes) |
| `.github/workflows/ci-cd-web.yml` | Ajouter etape test |
| `museum-backend/src/config/env.ts` | Ajouter FREE_TIER_DAILY_CHAT_LIMIT |
| `museum-web/src/app/[locale]/page.tsx` | Ajouter JSON-LD |

## Definition of Done

- [ ] tsc PASS sur 3 packages (backend, frontend, web)
- [ ] lint PASS sur 3 packages
- [ ] 1300+ tests backend passent
- [ ] 106+ tests frontend passent
- [ ] 8+ tests web passent en CI
- [ ] Coverage thresholds maintenus (statements 71%, branches 55%)
- [ ] App soumise aux 2 stores (iOS + Android)
- [ ] Free tier gate fonctionnel (5 chats/jour)
- [ ] Sentry web configure et rapportant
- [ ] Schema.org MobileApplication valide

## Risques

| Risque | Proba | Impact | Mitigation |
|--------|-------|--------|------------|
| Rejet App Store (privacy, metadata) | Medium | High | Suivre STORE_SUBMISSION_GUIDE.md, privacy page live, Data Safety complete |
| Tests chat revelent des bugs | Medium | Medium | Corriger immediatement — mieux maintenant qu'apres monetisation |
| Sentry web integration casse build | Low | Low | @sentry/nextjs bien documente; config stubs existent deja |
| Store review prend >2 semaines | Low | Medium | Soumettre tot; preparer les quick wins en parallele |

## Ship Decision

- **Deploy**: Backend avec free tier gate (behind feature flag `FEATURE_FLAG_FREE_TIER_LIMIT`)
- **Deploy**: Museum-web avec Sentry + tests CI
- **Store**: App soumise (review en cours)
- **Feature flag**: Free tier gate active apres approbation store
