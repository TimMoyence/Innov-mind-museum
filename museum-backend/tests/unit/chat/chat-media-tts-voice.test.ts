/**
 * Spec C T2.5 — chat-media TTS reads `user.ttsVoice` w/ env fallback.
 *
 * The synthesizeSpeech path must prefer the per-user voice preference
 * (`session.user.ttsVoice`) over the env default (`env.tts.voice`).
 * When `user.ttsVoice` is null/undefined, fall back to env.tts.voice.
 *
 * The replay path (`getMessageAudioUrl`) is intentionally NOT covered here:
 * it must keep using the audioVoice snapshot persisted at synthesis time
 * (audio-cache invariant), not re-resolve from the user.
 */

import { ChatMediaService } from '@modules/chat/useCase/audio/chat-media.service';
import type { ChatMessageWithSessionOwnership } from '@modules/chat/domain/session/chat.repository.interface';
import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import type { ChatSession } from '@modules/chat/domain/session/chatSession.entity';
import type { TextToSpeechService } from '@modules/chat/domain/ports/tts.port';

import { makeSession, makeMessage, makeSessionUser } from '../../helpers/chat/message.fixtures';
import { makeChatRepo } from '../../helpers/chat/repo.fixtures';

const SESSION_ID = 'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4';
const MESSAGE_ID = 'b1b1b1b1-c2c2-4d3d-9e4e-f5f5f5f5f5f5';

/**
 * Builds a ChatSession.user stub with a pinned `ttsVoice`.
 * `makeSessionUser` only sets `id`, so we extend it for this test's needs.
 * @param id
 * @param ttsVoice
 */
const makeUserWithVoice = (id: number, ttsVoice: string | null): ChatSession['user'] => {
  const base = makeSessionUser(id)!;
  return Object.assign(base, { ttsVoice }) as ChatSession['user'];
};

const makeMessageRow = (
  msgOverrides: Partial<ChatMessage> = {},
  sessionOverrides: Partial<ChatSession> = {},
): ChatMessageWithSessionOwnership => {
  const session = makeSession({
    id: SESSION_ID,
    user: makeSessionUser(42),
    ...sessionOverrides,
  });
  const message = makeMessage({ role: 'assistant', text: 'Hello world', ...msgOverrides, session });
  return { message, session };
};

const makeRepo = (messageRow: ChatMessageWithSessionOwnership) =>
  makeChatRepo({
    getMessageById: jest.fn().mockResolvedValue(messageRow),
  });

const makeTts = (): jest.Mocked<TextToSpeechService> => ({
  synthesize: jest.fn().mockResolvedValue({
    audio: Buffer.from('fake-audio'),
    contentType: 'audio/mpeg',
  }),
});

describe('chat-media TTS voice resolution (Spec C T2.5)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses user.ttsVoice when set on the session.user relation', async () => {
    const row = makeMessageRow({}, { user: makeUserWithVoice(42, 'echo') });
    const repo = makeRepo(row);
    const tts = makeTts();
    const svc = new ChatMediaService({ repository: repo, tts });

    await svc.synthesizeSpeech(MESSAGE_ID, 42);

    expect(tts.synthesize).toHaveBeenCalledWith({ text: 'Hello world', voice: 'echo' });
  });

  it('falls back to env.tts.voice when user.ttsVoice is null', async () => {
    const row = makeMessageRow({}, { user: makeUserWithVoice(42, null) });
    const repo = makeRepo(row);
    const tts = makeTts();
    const svc = new ChatMediaService({ repository: repo, tts });

    await svc.synthesizeSpeech(MESSAGE_ID, 42);

    expect(tts.synthesize).toHaveBeenCalledWith({
      text: 'Hello world',
      voice: 'alloy', // env.tts.voice default per env.ts
    });
  });

  it('falls back to env.tts.voice when session.user is missing entirely', async () => {
    const row = makeMessageRow({}, { user: makeSessionUser(42) }); // no ttsVoice prop
    const repo = makeRepo(row);
    const tts = makeTts();
    const svc = new ChatMediaService({ repository: repo, tts });

    await svc.synthesizeSpeech(MESSAGE_ID, 42);

    expect(tts.synthesize).toHaveBeenCalledWith({ text: 'Hello world', voice: 'alloy' });
  });
});
