/**
 * RED — UFR-022 phase=red, Cluster A (B7), RUN_ID=2026-05-21-p0-gdpr.
 *
 * Specifies the audio-route consent gate (R4, R5, R6) on
 * `POST /api/chat/sessions/:id/audio`
 * (`museum-backend/src/modules/chat/adapters/primary/http/routes/chat-media.route.ts:230-241`).
 *
 * Acceptance shape (design §3 R4 / §5):
 *  - denied scope `third_party_ai_audio_openai` → HTTP 403
 *    body `{ error: 'consent_required', scope: 'third_party_ai_audio_openai' }`,
 *    `chatService.postAudioMessage` invoked ZERO times (R5 short-circuit).
 *  - granted scope → HTTP 201 (existing happy path unchanged).
 *
 * RED rationale: today the route runs `isAuthenticated → rateLimit →
 * costGuard → multer → handler`; there is NO consent step. Whatever the
 * scope state, today's route returns 201 (or other AppError) — the 403
 * assertion fails, and `postAudioMessage` is invoked once when it should be
 * zero. Both assertions fail RED until T1.10 lands the gate.
 *
 * The userConsentRepository is mocked at the `@modules/auth/useCase` barrel
 * (mirrors `tests/unit/auth/consent.route.test.ts:12-73`) so the future
 * `buildThirdPartyAiConsentChecker()` factory (T1.6) — which lazy-imports
 * the barrel exactly like `buildLocationConsentChecker()` does at
 * `chat-module.ts:836-838` — consults this in-memory store.
 *
 * Lib-docs consulted:
 *  - lib-docs/express/LESSONS.md (middleware ordering, async error shape)
 *  - lib-docs/typeorm/LESSONS.md (repo boundary; no direct ORM usage in port).
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
      // I-SEC7b sibling — middleware `isAuthenticated` calls this after the
      // P0 security sweep (PR #293 squash). Returns the claims object that
      // includes `jti` + `expSec` so the denylist read path can run; the
      // module-level denylist defaults to a no-op (returns false) in tests
      // with no Redis, so the gate stays open and we only assert the
      // consent-route behaviour this test cares about.
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

// ─── 3. Mock ChatService — we only care whether postAudioMessage is invoked ──
const mockPostAudioMessage = jest.fn();
const mockChatService: Partial<ChatService> = {
  postAudioMessage: mockPostAudioMessage,
};

const app = createApp({
  chatService: mockChatService as ChatService,
  healthCheck: async () => ({ database: 'up' }),
});

const TEST_USER_ID = 1; // userToken() default sub
const AUDIO_SCOPE = 'third_party_ai_audio_openai';

const successAudioReply = {
  sessionId: 'session-uuid',
  message: {
    id: 'msg-audio-1',
    role: 'assistant',
    text: 'Art response from audio',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  metadata: {},
  transcription: { text: 'hi', model: 'whisper-1', provider: 'openai' },
};

describe('POST /api/chat/sessions/:id/audio — third_party_ai_audio_openai consent gate (B7 / R4, R5, R6)', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
    sharedRepo.reset();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('returns 403 { error: "consent_required", scope: "third_party_ai_audio_openai" } when scope NOT granted (R4 deny path + R6 shape)', async () => {
    // No grant applied — denial path.
    mockPostAudioMessage.mockResolvedValue(successAudioReply); // would succeed if invoked

    const res = await request(app)
      .post('/api/chat/sessions/session-uuid/audio')
      .set('Authorization', `Bearer ${userToken()}`)
      .attach('audio', Buffer.from('fake-audio'), {
        filename: 'recording.webm',
        contentType: 'audio/webm',
      });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'consent_required', scope: AUDIO_SCOPE });
  });

  it('does NOT invoke chatService.postAudioMessage when scope is denied (R5 short-circuit)', async () => {
    mockPostAudioMessage.mockResolvedValue(successAudioReply);

    await request(app)
      .post('/api/chat/sessions/session-uuid/audio')
      .set('Authorization', `Bearer ${userToken()}`)
      .attach('audio', Buffer.from('fake-audio'), {
        filename: 'recording.webm',
        contentType: 'audio/webm',
      });

    expect(mockPostAudioMessage).not.toHaveBeenCalled();
  });

  it('returns 201 + transcription when third_party_ai_audio_openai is granted (happy path preserved)', async () => {
    await applyConsentGrantSpec(
      sharedRepo,
      makeConsentGranted({ userId: TEST_USER_ID, scope: AUDIO_SCOPE }),
    );
    mockPostAudioMessage.mockResolvedValueOnce(successAudioReply);

    const res = await request(app)
      .post('/api/chat/sessions/session-uuid/audio')
      .set('Authorization', `Bearer ${userToken()}`)
      .attach('audio', Buffer.from('fake-audio'), {
        filename: 'recording.webm',
        contentType: 'audio/webm',
      });

    expect(res.status).toBe(201);
    expect(res.body.transcription.text).toBe('hi');
    expect(mockPostAudioMessage).toHaveBeenCalledTimes(1);
  });

  it('consent check runs AFTER auth (no token → 401, not 403) — middleware ordering preserved', async () => {
    // No Authorization header → isAuthenticated returns 401 BEFORE consent check.
    const res = await request(app)
      .post('/api/chat/sessions/session-uuid/audio')
      .attach('audio', Buffer.from('fake-audio'), {
        filename: 'recording.webm',
        contentType: 'audio/webm',
      });

    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('UNAUTHORIZED');
    expect(mockPostAudioMessage).not.toHaveBeenCalled();
  });

  it('revoked grant is treated as denial (revokedAt set → 403)', async () => {
    await applyConsentGrantSpec(
      sharedRepo,
      makeConsentGranted({ userId: TEST_USER_ID, scope: AUDIO_SCOPE }),
    );
    await sharedRepo.revoke(TEST_USER_ID, AUDIO_SCOPE);
    mockPostAudioMessage.mockResolvedValue(successAudioReply);

    const res = await request(app)
      .post('/api/chat/sessions/session-uuid/audio')
      .set('Authorization', `Bearer ${userToken()}`)
      .attach('audio', Buffer.from('fake-audio'), {
        filename: 'recording.webm',
        contentType: 'audio/webm',
      });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'consent_required', scope: AUDIO_SCOPE });
    expect(mockPostAudioMessage).not.toHaveBeenCalled();
  });
});
