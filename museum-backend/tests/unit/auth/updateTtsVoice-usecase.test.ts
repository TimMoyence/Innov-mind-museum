import { UpdateTtsVoiceUseCase } from '@modules/auth/useCase/updateTtsVoice.useCase';

const makeRepoStub = (existingUser?: { id: number }) =>
  ({
    getUserById: jest.fn().mockResolvedValue(existingUser ?? { id: 1 }),
    updateTtsVoice: jest.fn().mockResolvedValue(undefined),
  }) as any;

describe('UpdateTtsVoiceUseCase', () => {
  it('persists a known voice', async () => {
    const repo = makeRepoStub();
    const uc = new UpdateTtsVoiceUseCase(repo);
    const result = await uc.execute(1, 'echo');
    expect(repo.updateTtsVoice).toHaveBeenCalledWith(1, 'echo');
    expect(result.ttsVoice).toBe('echo');
  });

  it('persists null to reset', async () => {
    const repo = makeRepoStub();
    const uc = new UpdateTtsVoiceUseCase(repo);
    const result = await uc.execute(1, null);
    expect(repo.updateTtsVoice).toHaveBeenCalledWith(1, null);
    expect(result.ttsVoice).toBeNull();
  });

  it('rejects unknown voice with 400', async () => {
    const repo = makeRepoStub();
    const uc = new UpdateTtsVoiceUseCase(repo);
    await expect(uc.execute(1, 'sage' as any)).rejects.toMatchObject({ statusCode: 400 });
    expect(repo.updateTtsVoice).not.toHaveBeenCalled();
  });

  it('rejects when user not found with 404', async () => {
    const repo = {
      getUserById: jest.fn().mockResolvedValue(null),
      updateTtsVoice: jest.fn(),
    } as any;
    const uc = new UpdateTtsVoiceUseCase(repo);
    await expect(uc.execute(99, 'echo')).rejects.toMatchObject({ statusCode: 404 });
  });
});
