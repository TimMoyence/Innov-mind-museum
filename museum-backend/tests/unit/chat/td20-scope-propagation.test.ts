/**
 * TD-20 [T6.1 / contextless] RED — per-tenant scope propagation from the call
 * sites to the LLM ports (A7a/A7c/R13/R12).
 *
 * Asserts the tenant scope arrives at the port (mock the port, assert received
 * args):
 *   - TTS-via-chat-media: `museumId === session.museumId`,
 *     `tier === deriveTier(session.user?.id)`, `requestId === messageId` (A7a/R13a).
 *   - TTS-via-describe (one-shot, no session): NO museumId/tier/requestId
 *     supplied — honestly contextless (A7c/D6).
 *
 * RED: the call sites do not yet populate `museumId`/`tier` on the TTS port,
 * and `deriveTier` does not exist yet → import fails / received args lack the
 * scope → assertions fail.
 *
 * Entities via shared factories (`makeSession`/`makeMessage`/`makeSessionUser`,
 * `tests/helpers/chat/`). The propagation assertions for STT, judge-via-router,
 * and judge/llm-guard-via-guardrail-closure are covered by the per-adapter
 * scope tests (`*.td20.test.ts`) which assert the observation carries the scope
 * the port receives; the call-site population for those deeper paths is
 * verified by the verifier against the design §2 touch list + `pnpm lint`.
 */
import { ChatMediaService } from '@modules/chat/useCase/audio/chat-media.service';
import { DescribeService } from '@modules/chat/useCase/describe.service';
import { deriveTier } from '@shared/observability/derive-tier';

import { makeCache } from '../../helpers/chat/cache.fixtures';
import { makeSession, makeMessage, makeSessionUser } from '../../helpers/chat/message.fixtures';
import { makeChatRepo } from '../../helpers/chat/repo.fixtures';

import type { ChatOrchestrator } from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { TextToSpeechService } from '@modules/chat/domain/ports/tts.port';
import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import type { ChatSession } from '@modules/chat/domain/session/chatSession.entity';
import type { ChatMessageWithSessionOwnership } from '@modules/chat/domain/session/chat.repository.interface';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const SESSION_ID = 'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4';
const MESSAGE_ID = 'b1b1b1b1-c2c2-4d3d-9e4e-f5f5f5f5f5f5';
const MUSEUM_ID = 7;
const USER_ID = 42;

const makeMessageRow = (
  msgOverrides: Partial<ChatMessage> = {},
  sessionOverrides: Partial<ChatSession> = {},
): ChatMessageWithSessionOwnership => {
  const session = makeSession({
    id: SESSION_ID,
    museumId: MUSEUM_ID,
    user: makeSessionUser(USER_ID),
    ...sessionOverrides,
  });
  const message = makeMessage({
    id: MESSAGE_ID,
    role: 'assistant',
    text: 'The Mona Lisa is a portrait by Leonardo da Vinci.',
    ...msgOverrides,
    session,
  });
  return { message, session };
};

const makeTtsSpy = (): jest.Mocked<TextToSpeechService> => ({
  synthesize: jest.fn().mockResolvedValue({
    audio: Buffer.from('fake-audio'),
    contentType: 'audio/ogg',
  }),
});

describe('TD-20 — scope propagation (A7a/A7c/R13/R12)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('TTS-via-chat-media: museumId/tier/requestId arrive at the TTS port (A7a/R13a/R12)', async () => {
    const row = makeMessageRow();
    const repo = makeChatRepo({ getMessageById: jest.fn().mockResolvedValue(row) });
    const tts = makeTtsSpy();
    const svc = new ChatMediaService({ repository: repo, tts, cache: makeCache() });

    await svc.synthesizeSpeech(MESSAGE_ID, USER_ID);

    expect(tts.synthesize).toHaveBeenCalledTimes(1);
    const arg = tts.synthesize.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.museumId).toBe(MUSEUM_ID);
    expect(arg.tier).toBe(deriveTier(USER_ID)); // 'free'
    expect(arg.requestId).toBe(MESSAGE_ID);
  });

  it('TTS-via-chat-media: anonymous session yields tier=anonymous (A7a/R12)', async () => {
    const row = makeMessageRow({}, { user: null });
    const repo = makeChatRepo({ getMessageById: jest.fn().mockResolvedValue(row) });
    const tts = makeTtsSpy();
    const svc = new ChatMediaService({ repository: repo, tts, cache: makeCache() });

    await svc.synthesizeSpeech(MESSAGE_ID);

    const arg = tts.synthesize.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.museumId).toBe(MUSEUM_ID);
    expect(arg.tier).toBe('anonymous');
  });

  it('TTS-via-describe: one-shot supplies NO museumId/tier/requestId (A7c/D6/UFR-013)', async () => {
    const tts = makeTtsSpy();
    const orchestrator: ChatOrchestrator = {
      generate: jest.fn().mockResolvedValue({
        text: 'A guided audio description of the artwork.',
        metadata: {},
      }),
    } as unknown as ChatOrchestrator;
    const svc = new DescribeService({ orchestrator, tts });

    await svc.describe({
      text: 'describe this',
      locale: 'en',
      guideLevel: 'beginner',
      format: 'audio',
    });

    expect(tts.synthesize).toHaveBeenCalledTimes(1);
    const arg = tts.synthesize.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.museumId).toBeUndefined();
    expect(arg.tier).toBeUndefined();
    expect(arg.requestId).toBeUndefined();
  });
});
