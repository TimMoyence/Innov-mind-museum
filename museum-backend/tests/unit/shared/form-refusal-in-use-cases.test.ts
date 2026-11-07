import { RegisterUseCase } from '@modules/auth/useCase/registration/register.useCase';
import { assertPasswordNotBreached } from '@shared/validation/password-breach-check';
import { env } from '@src/config/env';
import { makeUserRepo } from 'tests/helpers/auth/user-repo.mock';
import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';

import type {
  AudioTranscriber,
  AudioTranscriptionResult,
} from '@modules/chat/domain/ports/audio-transcriber.port';

jest.mock('@shared/validation/password-breach-check', () => ({
  assertPasswordNotBreached: jest.fn(async () => undefined),
}));

const transcriberSaying = (text: string): AudioTranscriber => ({
  transcribe: async (): Promise<AudioTranscriptionResult> => ({
    text,
    model: 'whisper-1',
    provider: 'openai',
  }),
});

const SPOKEN_AUDIO = { base64: 'dGVzdA==', mimeType: 'audio/mp3', sizeBytes: 100 };

describe('refus de forme levés dans les cas d’usage', () => {
  it('QUOTA · un message sans texte ni image est un refus de forme, il ne consomme aucun quota', async () => {
    const service = buildChatTestService();
    const session = await service.createSession({});

    await expect(service.postMessage(session.id, {})).rejects.toMatchObject({
      statusCode: 400,
      inputRejected: true,
    });
  });

  it('QUOTA · un audio vide est un refus de forme, il ne consomme aucun quota', async () => {
    const service = buildChatTestService(undefined, transcriberSaying('Bonjour'));
    const session = await service.createSession({});

    await expect(
      service.postAudioMessage(session.id, {
        audio: { base64: '', mimeType: 'audio/mpeg', sizeBytes: 0 },
      }),
    ).rejects.toMatchObject({ statusCode: 400, inputRejected: true });
  });

  it('QUOTA · un audio transcrit trop long est refusé après la transcription payée, il consomme le quota', async () => {
    const service = buildChatTestService(
      undefined,
      transcriberSaying('x'.repeat(env.llm.maxTextLength + 1)),
    );
    const session = await service.createSession({});

    await expect(
      service.postAudioMessage(session.id, { audio: SPOKEN_AUDIO }),
    ).rejects.toMatchObject({ statusCode: 400, inputRejected: false });
  });

  it('QUOTA · un prénom invalide est un refus de forme, levé avant tout appel à HIBP', async () => {
    const useCase = new RegisterUseCase(makeUserRepo());

    await expect(
      useCase.execute({
        email: 'jean@test.com',
        password: 'StrongP@ss1!',
        firstname: 'Jean2',
        dateOfBirth: '1990-01-01',
      }),
    ).rejects.toMatchObject({ statusCode: 400, inputRejected: true });
    expect(assertPasswordNotBreached).not.toHaveBeenCalled();
  });
});
