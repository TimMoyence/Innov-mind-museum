import { UserMemoryService } from '@modules/chat/useCase/user-memory.service';
import { makeUserMemoryRepoStub } from '../../helpers/chat/userMemory.fixtures';

describe('UserMemoryService.mergeLanguagePreference', () => {
  it('writes mode of recent locales when changed from existing', async () => {
    const repo = makeUserMemoryRepoStub({ languagePreference: null });
    repo.recentSessions = [
      {
        sessionId: 's3',
        locale: 'fr',
        createdAt: new Date('2026-04-03'),
        lastMessageAt: new Date(),
      },
      {
        sessionId: 's2',
        locale: 'fr',
        createdAt: new Date('2026-04-02'),
        lastMessageAt: new Date(),
      },
      {
        sessionId: 's1',
        locale: 'en',
        createdAt: new Date('2026-04-01'),
        lastMessageAt: new Date(),
      },
    ];
    const svc = new UserMemoryService(repo);

    await svc.updateAfterSession(1, null, 'sess-1');

    expect(repo.upsertCalls[0][1].languagePreference).toBe('fr');
  });

  it('uses most recent on tie', async () => {
    const repo = makeUserMemoryRepoStub({ languagePreference: null });
    repo.recentSessions = [
      {
        sessionId: 's2',
        locale: 'en',
        createdAt: new Date('2026-04-02'),
        lastMessageAt: new Date(),
      },
      {
        sessionId: 's1',
        locale: 'fr',
        createdAt: new Date('2026-04-01'),
        lastMessageAt: new Date(),
      },
    ];
    const svc = new UserMemoryService(repo);
    await svc.updateAfterSession(1, null, 'sess-1');
    expect(repo.upsertCalls[0][1].languagePreference).toBe('en');
  });

  it('no-ops when value unchanged from existing', async () => {
    const repo = makeUserMemoryRepoStub({ languagePreference: 'fr' });
    repo.recentSessions = [
      { sessionId: 's1', locale: 'fr', createdAt: new Date(), lastMessageAt: new Date() },
    ];
    const svc = new UserMemoryService(repo);
    await svc.updateAfterSession(1, null, 'sess-1');
    expect(repo.upsertCalls[0][1].languagePreference).toBeUndefined();
  });
});
