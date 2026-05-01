# Phase 8 — Coverage Gap Analysis

_Generated 2026-05-01 by scripts/audits/coverage-gap-analysis.mjs_

## museum-backend

**Globals:** lines 88.62% (target 90) | branches 76.20% (target 78) | functions 82.07% (target 85)

### Top 30 files by uncovered-line count

| File | Lines | Branches | Functions | Hot? |
|---|---|---|---|---|
| tests/helpers/e2e/e2e-app-harness.ts | 5/109 (5%) | 0/23 (0%) | 0/26 (0%) |  |
| src/modules/chat/adapters/secondary/chat.repository.typeorm.ts | 17/108 (16%) | 0/68 (0%) | 1/28 (4%) |  |
| tests/helpers/openapi/openapi-response-validator.ts | 122/169 (72%) | 50/100 (50%) | 16/19 (84%) |  |
| tests/helpers/chat/chatTestApp.ts | 93/139 (67%) | 49/85 (58%) | 21/38 (55%) |  |
| src/modules/museum/adapters/secondary/bullmq-enrichment-scheduler.adapter.ts | 7/47 (15%) | 0/18 (0%) | 0/5 (0%) |  |
| src/modules/auth/adapters/primary/http/auth.route.ts | 132/170 (78%) | 23/46 (50%) | 20/25 (80%) |  |
| src/modules/auth/adapters/primary/http/mfa.route.ts | 28/65 (43%) | 0/7 (0%) | 0/6 (0%) |  |
| scripts/benchmark-guardrails.ts | 70/105 (67%) | 37/45 (82%) | 10/16 (63%) |  |
| src/modules/chat/chat-module.ts | 102/137 (74%) | 11/43 (26%) | 18/25 (72%) |  |
| src/modules/chat/adapters/secondary/chat-repository-queries.ts | 7/40 (18%) | 0/16 (0%) | 0/6 (0%) |  |
| src/modules/museum/adapters/secondary/typeorm-museum-enrichment-cache.adapter.ts | 4/33 (12%) | 0/12 (0%) | 1/9 (11%) |  |
| src/modules/chat/useCase/llm-prompt-builder.ts | 97/123 (79%) | 57/79 (72%) | 12/14 (86%) |  |
| src/shared/http/overpass.client.ts | 131/156 (84%) | 48/73 (66%) | 19/21 (90%) |  |
| src/modules/knowledge-extraction/adapters/secondary/typeorm-artwork-knowledge.repo.ts | 2/25 (8%) | 0/10 (0%) | 1/6 (17%) |  |
| src/modules/chat/useCase/chat-media.service.ts | 73/95 (77%) | 26/43 (60%) | 8/10 (80%) |  |
| src/modules/auth/adapters/secondary/nonce-store.ts | 23/44 (52%) | 10/16 (63%) | 5/10 (50%) |  |
| src/modules/chat/adapters/primary/http/chat-message.route.ts | 37/57 (65%) | 13/39 (33%) | 8/10 (80%) |  |
| src/modules/museum/adapters/secondary/bullmq-museum-enrichment-queue.adapter.ts | 6/26 (23%) | 0/9 (0%) | 1/6 (17%) |  |
| tests/helpers/e2e/e2e-auth.helpers.ts | 4/24 (17%) | 0/14 (0%) | 0/4 (0%) |  |
| src/config/env.production-validation.ts | 72/90 (80%) | 19/31 (61%) | 9/9 (100%) |  |
| src/data/db/data-source-router.ts | 10/26 (38%) | 1/6 (17%) | 2/5 (40%) |  |
| src/modules/admin/adapters/secondary/admin-analytics-queries.ts | 77/93 (83%) | 38/55 (69%) | 11/12 (92%) |  |
| src/modules/auth/useCase/index.ts | 107/123 (87%) | 4/8 (50%) | 1/14 (7%) |  |
| src/modules/chat/adapters/secondary/audio-storage.s3.ts | 12/28 (43%) | 1/7 (14%) | 1/7 (14%) |  |
| src/modules/chat/adapters/secondary/audio-storage.stub.ts | 11/27 (41%) | 3/9 (33%) | 2/5 (40%) |  |
| src/modules/chat/jobs/chat-media-purger.ts | 64/79 (81%) | 8/21 (38%) | 6/8 (75%) |  |
| src/data/db/migrations/1777100000000-AddAuditLogHashChain.ts | 12/26 (46%) | 0/15 (0%) | 2/5 (40%) |  |
| src/helpers/middleware/cookie-parser.middleware.ts | 6/20 (30%) | 1/8 (13%) | 2/3 (67%) |  |
| src/modules/auth/adapters/secondary/totp-secret.repository.pg.ts | 3/17 (18%) | 0/1 (0%) | 1/7 (14%) |  |
| src/modules/knowledge-extraction/adapters/secondary/typeorm-museum-enrichment.repo.ts | 2/16 (13%) | 0/8 (0%) | 1/4 (25%) |  |

## museum-frontend

**Globals:** lines 84.03% (target 90) | branches 68.87% (target 80) | functions 72.44% (target 80)

### Top 30 files by uncovered-line count

| File | Lines | Branches | Functions | Hot? |
|---|---|---|---|---|
| app/(stack)/chat/[sessionId].tsx | 63/133 (47%) | 38/77 (49%) | 11/46 (24%) |  |
| shared/infrastructure/httpClient.ts | 68/106 (64%) | 39/84 (46%) | 11/16 (69%) |  |
| shared/ui/InAppBrowser.tsx | 0/38 (0%) | 0/24 (0%) | 0/10 (0%) |  |
| features/auth/screens/MfaEnrollScreen.tsx | 0/36 (0%) | 0/18 (0%) | 0/10 (0%) |  |
| features/chat/application/useTextToSpeech.ts | 73/105 (70%) | 18/32 (56%) | 11/13 (85%) |  |
| shared/lib/errors.ts | 47/77 (61%) | 29/62 (47%) | 7/11 (64%) |  |
| app/auth.tsx | 42/68 (62%) | 30/41 (73%) | 8/21 (38%) |  |
| app/(tabs)/museums.tsx | 33/57 (58%) | 5/42 (12%) | 2/11 (18%) |  |
| features/chat/ui/ImageFullscreenModal.tsx | 30/53 (57%) | 4/26 (15%) | 2/12 (17%) |  |
| app/(stack)/tickets.tsx | 46/68 (68%) | 21/33 (64%) | 7/19 (37%) |  |
| features/auth/application/AuthContext.tsx | 109/129 (84%) | 19/30 (63%) | 17/23 (74%) |  |
| features/auth/screens/MfaChallengeScreen.tsx | 0/20 (0%) | 0/22 (0%) | 0/6 (0%) |  |
| features/review/ui/ReviewCard.tsx | 0/20 (0%) | 0/12 (0%) | 0/2 (0%) |  |
| features/chat/application/useAutoTts.ts | 0/16 (0%) | 0/14 (0%) | 0/7 (0%) |  |
| features/museum/ui/MuseumMapView.tsx | 90/106 (85%) | 59/107 (55%) | 18/26 (69%) |  |
| features/settings/ui/OfflineMapsSettings.tsx | 0/16 (0%) | 0/6 (0%) | 0/7 (0%) |  |
| shared/ui/BrandMark.tsx | 0/16 (0%) | 0/10 (0%) | 0/3 (0%) |  |
| app/(stack)/ticket-detail.tsx | 40/55 (73%) | 24/37 (65%) | 7/14 (50%) |  |
| features/diagnostics/PerfOverlay.tsx | 0/15 (0%) | 0/8 (0%) | 0/5 (0%) |  |
| features/settings/application/useContentPreferences.ts | 10/25 (40%) | 0/2 (0%) | 5/7 (71%) |  |
| features/settings/ui/CityPackRow.tsx | 0/15 (0%) | 0/12 (0%) | 0/5 (0%) |  |
| shared/infrastructure/apiConfig.ts | 70/85 (82%) | 39/67 (58%) | 17/17 (100%) |  |
| features/auth/application/useEmailPasswordAuth.ts | 16/30 (53%) | 11/24 (46%) | 3/5 (60%) |  |
| features/chat/application/computeLocalCacheKey.ts | 19/32 (59%) | 13/39 (33%) | 4/5 (80%) |  |
| features/auth/infrastructure/mfaApi.ts | 0/12 (0%) | 0/2 (0%) | 0/8 (0%) |  |
| features/diagnostics/useFpsMeter.ts | 0/12 (0%) | 0/10 (0%) | 0/5 (0%) |  |
| features/onboarding/ui/CameraIntentSlide.tsx | 0/12 (0%) | 0/0 (100%) | 0/1 (0%) |  |
| features/onboarding/ui/GreetingSlide.tsx | 0/12 (0%) | 0/0 (100%) | 0/1 (0%) |  |
| features/onboarding/ui/MuseumModeSlide.tsx | 0/12 (0%) | 0/0 (100%) | 0/1 (0%) |  |
| features/onboarding/ui/WalkIntentSlide.tsx | 0/12 (0%) | 0/0 (100%) | 0/1 (0%) |  |

## Recommendations

1. **Hot files (🔥)** are highest priority — Phase 4 Stryker registry overlap.
2. **Top-uncovered services / use-cases** next.
3. **Skip** generated code, migrations, type-only files.
4. **Banking-grade rule**: every new test must pin a named regression. NO cosmetic tests.
