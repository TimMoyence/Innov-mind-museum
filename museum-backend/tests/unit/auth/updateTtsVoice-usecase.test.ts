import { UpdateTtsVoiceUseCase } from '@modules/auth/useCase/updateTtsVoice.useCase';
import type { TtsVoice } from '@modules/chat/voice-catalog';

import { makeUser } from '../../helpers/auth/user.fixtures';
import { makeUserRepo } from '../../helpers/auth/user-repo.mock';

describe('UpdateTtsVoiceUseCase', () => {
  it('persists a known voice', async () => {
    const repo = makeUserRepo(makeUser({ id: 1 }));
    const result = await new UpdateTtsVoiceUseCase(repo).execute(1, 'echo');
    expect(repo.updateTtsVoice).toHaveBeenCalledWith(1, 'echo');
    expect(result.ttsVoice).toBe('echo');
  });

  it('persists null to reset', async () => {
    const repo = makeUserRepo(makeUser({ id: 1 }));
    const result = await new UpdateTtsVoiceUseCase(repo).execute(1, null);
    expect(repo.updateTtsVoice).toHaveBeenCalledWith(1, null);
    expect(result.ttsVoice).toBeNull();
  });

  it('rejects unknown voice with 400', async () => {
    const repo = makeUserRepo(makeUser({ id: 1 }));
    await expect(
      new UpdateTtsVoiceUseCase(repo).execute(1, 'sage' as TtsVoice),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repo.updateTtsVoice).not.toHaveBeenCalled();
  });

  it('rejects when user not found with 404', async () => {
    const repo = makeUserRepo(null);
    await expect(new UpdateTtsVoiceUseCase(repo).execute(99, 'echo')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(repo.updateTtsVoice).not.toHaveBeenCalled();
  });
});
