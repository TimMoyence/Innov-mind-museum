/**
 * RED — UFR-022 phase=red, Cycle 3 (B1), RUN_ID=2026-05-26-chat-pipeline-hardening.
 *
 * Specifies the TTS-route consent gate on
 * `POST /api/chat/messages/:messageId/tts`
 * (`museum-backend/src/modules/chat/adapters/primary/http/routes/chat-media.route.ts:271-279`,
 * handler `createTtsHandler` ~202).
 *
 * Defect proven (B1, HIGH — GDPR Art. 7 third-party sharing without consent):
 *  - The STT route (`/sessions/:id/audio`) correctly gates on
 *    `third_party_ai_audio_openai` (`chat-media.route.ts:61-71`,
 *    `createAudioHandler(chatService, consentChecker)`).
 *  - The TTS route does NOT: `createTtsHandler(chatService)` receives no
 *    `consentChecker`, and `chatService.synthesizeSpeech` calls OpenAI TTS
 *    (`chat-media.service.ts:253`) without ever checking
 *    `third_party_ai_audio_openai`. Same provider (OpenAI), same scope as STT.
 *
 * Acceptance shape (mirrors STT gate — gate at ROUTE level, refusal shape
 * `403 { error: 'consent_required', scope }`):
 *  - denied/absent scope `third_party_ai_audio_openai` → HTTP 403
 *    body `{ error: 'consent_required', scope: 'third_party_ai_audio_openai' }`,
 *    `chatService.synthesizeSpeech` invoked ZERO times (gate short-circuits
 *    BEFORE any external OpenAI TTS call).
 *  - granted scope → existing happy path (200 + audio buffer) preserved.
 *  - revoked grant → treated as denial (403).
 *  - no token → 401 from `isAuthenticated` BEFORE the gate (ordering preserved).
 *
 * RED rationale: today the route runs `isAuthenticated → userLimiter →
 * sessionLimiter → costGuard → handler`; there is NO consent step. The 403
 * assertions fail (route returns 200 / 204) and `synthesizeSpeech` is invoked
 * once when it must be zero. These cases stay RED until the gate lands.
 *
 * The userConsentRepository is mocked at the `@modules/auth/useCase` barrel
 * (identical to `chat-media-audio-consent.test.ts`) so the
 * `buildThirdPartyAiConsentChecker()` factory — which lazy-imports the barrel —
 * consults this in-memory store.
 */

// ─── 1. Mock the auth barrel BEFORE any imports that transitively touch chat ──
jest.mock('@modules/auth/useCase', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory runs before ESM imports
  const jwtLib = require('jsonwebtoken');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory hoist
  const { env: envConfig } = require('@src/config/env');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- factory hoist
  const { makeUserConsentRepo: makeRepo } = require('../../helpers/auth/userConsent-repo.mock');

  const sharedRepo = makeRepo();

  return {
    authSessionService: {
      verifyAccessToken: (token: string) => {
        const decoded = jwtLib.verify(token, envConfig.auth.accessTokenSecret) as {
          sub: string;
          role?: string;
          museumId?: number;
          type: string;
        };
        if (decoded.type !== 'access' || !decoded.sub) {
          throw new Error('Invalid access token');
        }
        return {
          id: Number(decoded.sub),
          role: decoded.role ?? 'visitor',
          museumId: decoded.museumId ?? null,
        };
      },
      verifyAccessTokenWithClaims: (token: string) => {
        const decoded = jwtLib.verify(token, envConfig.auth.accessTokenSecret) as {
          sub: string;
          role?: string;
          museumId?: number;
          type: string;
          jti?: string;
          exp?: number;
        };
        if (decoded.type !== 'access' || !decoded.sub) {
          throw new Error('Invalid access token');
        }
        return {
          id: Number(decoded.sub),
          role: decoded.role ?? 'visitor',
          museumId: decoded.museumId ?? null,
          jti: decoded.jti ?? 'test-jti',
          expSec: decoded.exp ?? 0,
        };
      },
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
    },
    registerUseCase: { execute: jest.fn() },
    forgotPasswordUseCase: { execute: jest.fn() },
    resetPasswordUseCase: { execute: jest.fn() },
    socialLoginUseCase: { execute: jest.fn() },
    deleteAccountUseCase: { execute: jest.fn() },
    exportUserDataUseCase: { execute: jest.fn() },
    getProfileUseCase: { execute: jest.fn() },
    changePasswordUseCase: { execute: jest.fn() },
    changeEmailUseCase: { execute: jest.fn() },
    confirmEmailChangeUseCase: { execute: jest.fn() },
    verifyEmailUseCase: { execute: jest.fn() },
    updateContentPreferencesUseCase: { execute: jest.fn() },
    completeOnboarding: jest.fn(),
    generateApiKeyUseCase: { execute: jest.fn() },
    revokeApiKeyUseCase: { execute: jest.fn() },
    listApiKeysUseCase: { execute: jest.fn() },
    grantConsentUseCase: { execute: jest.fn() },
    revokeConsentUseCase: { execute: jest.fn() },
    userConsentRepository: sharedRepo,
    wireAuthMiddleware: jest.fn(),
  };
});

jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn() },
}));

// ─── 2. Imports (top-level — Jest hoists jest.mock above these) ──────────────
import request from 'supertest';

import { createApp } from '@src/app';
import { resetRateLimits, stopRateLimitSweep } from 'tests/helpers/http/route-test-setup';
import { userToken } from 'tests/helpers/auth/token.helpers';
import { makeConsentGranted, applyConsentGrantSpec } from 'tests/helpers/auth/consent.fixtures';

import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- factory hoist
const { userConsentRepository: sharedRepo } = require('@modules/auth/useCase') as {
  userConsentRepository: ReturnType<
    typeof import('../../helpers/auth/userConsent-repo.mock').makeUserConsentRepo
  >;
};

// ─── 3. Mock ChatService — we only care whether synthesizeSpeech is invoked ──
const mockSynthesizeSpeech = jest.fn();
const mockChatService: Partial<ChatService> = {
  synthesizeSpeech: mockSynthesizeSpeech,
};

const app = createApp({
  chatService: mockChatService as ChatService,
  healthCheck: async () => ({ database: 'up' }),
});

const TEST_USER_ID = 1; // userToken() default sub
const AUDIO_SCOPE = 'third_party_ai_audio_openai';

const successTtsReply = {
  audio: Buffer.from('fake-tts-audio'),
  contentType: 'audio/mpeg',
};

describe('POST /api/chat/messages/:messageId/tts — third_party_ai_audio_openai consent gate (B1)', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
    sharedRepo.reset();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('returns 403 { error: "consent_required", scope: "third_party_ai_audio_openai" } when scope NOT granted', async () => {
    // No grant applied — denial path.
    mockSynthesizeSpeech.mockResolvedValue(successTtsReply); // would succeed if invoked

    const res = await request(app)
      .post('/api/chat/messages/msg-uuid/tts')
      .set('Authorization', `Bearer ${userToken()}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'consent_required', scope: AUDIO_SCOPE });
  });

  it('does NOT invoke chatService.synthesizeSpeech when scope is denied (short-circuit BEFORE OpenAI TTS)', async () => {
    mockSynthesizeSpeech.mockResolvedValue(successTtsReply);

    await request(app)
      .post('/api/chat/messages/msg-uuid/tts')
      .set('Authorization', `Bearer ${userToken()}`);

    expect(mockSynthesizeSpeech).not.toHaveBeenCalled();
  });

  it('returns 200 + audio buffer when third_party_ai_audio_openai is granted (happy path preserved)', async () => {
    await applyConsentGrantSpec(
      sharedRepo,
      makeConsentGranted({ userId: TEST_USER_ID, scope: AUDIO_SCOPE }),
    );
    mockSynthesizeSpeech.mockResolvedValueOnce(successTtsReply);

    const res = await request(app)
      .post('/api/chat/messages/msg-uuid/tts')
      .set('Authorization', `Bearer ${userToken()}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('audio/mpeg');
    expect(mockSynthesizeSpeech).toHaveBeenCalledTimes(1);
  });

  it('consent check runs AFTER auth (no token → 401, not 403) — middleware ordering preserved', async () => {
    const res = await request(app).post('/api/chat/messages/msg-uuid/tts');

    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('UNAUTHORIZED');
    expect(mockSynthesizeSpeech).not.toHaveBeenCalled();
  });

  it('revoked grant is treated as denial (revokedAt set → 403)', async () => {
    await applyConsentGrantSpec(
      sharedRepo,
      makeConsentGranted({ userId: TEST_USER_ID, scope: AUDIO_SCOPE }),
    );
    await sharedRepo.revoke(TEST_USER_ID, AUDIO_SCOPE);
    mockSynthesizeSpeech.mockResolvedValue(successTtsReply);

    const res = await request(app)
      .post('/api/chat/messages/msg-uuid/tts')
      .set('Authorization', `Bearer ${userToken()}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'consent_required', scope: AUDIO_SCOPE });
    expect(mockSynthesizeSpeech).not.toHaveBeenCalled();
  });
});
