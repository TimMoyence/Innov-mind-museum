import { UserMemoryService } from '@modules/chat/useCase/memory/user-memory.service';
import { makeUserMemoryRepoStub } from '../../helpers/chat/userMemory.fixtures';

const minutes = (n: number) => n * 60_000;
const session = (i: number, durationMin: number) => ({
  sessionId: `s${String(i)}`,
  locale: 'fr',
  createdAt: new Date(2026, 3, i, 10, 0, 0),
  lastMessageAt: new Date(new Date(2026, 3, i, 10, 0, 0).getTime() + minutes(durationMin)),
});

describe('UserMemoryService.mergeSessionDurationP90', () => {
  it('skips when fewer than 5 sessions', async () => {
    const repo = makeUserMemoryRepoStub({ sessionDurationP90Minutes: null });
    repo.recentSessions = [session(1, 10), session(2, 12), session(3, 15), session(4, 20)];
    const svc = new UserMemoryService(repo);
    await svc.updateAfterSession(1, null, 'sess-x');
    expect(repo.upsertCalls[0][1].sessionDurationP90Minutes).toBeUndefined();
  });

  it('computes p90 over 10 sessions', async () => {
    const repo = makeUserMemoryRepoStub({ sessionDurationP90Minutes: null });
    // durations 5..50 minutes (10 values, p90 index = ceil(0.9*10)-1 = 8 -> 45)
    repo.recentSessions = Array.from({ length: 10 }, (_, i) => session(i + 1, (i + 1) * 5));
    const svc = new UserMemoryService(repo);
    await svc.updateAfterSession(1, null, 'sess-x');
    expect(repo.upsertCalls[0][1].sessionDurationP90Minutes).toBe(45);
  });

  it('clamps non-positive durations to 1', async () => {
    const repo = makeUserMemoryRepoStub({ sessionDurationP90Minutes: null });
    repo.recentSessions = [
      session(1, -5),
      session(2, 0),
      session(3, 5),
      session(4, 7),
      session(5, 10),
    ];
    const svc = new UserMemoryService(repo);
    await svc.updateAfterSession(1, null, 'sess-x');
    // Sorted clamped durations: [1, 1, 5, 7, 10]; p90 index = ceil(4.5)-1 = 4 -> 10
    expect(repo.upsertCalls[0][1].sessionDurationP90Minutes).toBe(10);
  });

  it('caps at 240 minutes', async () => {
    const repo = makeUserMemoryRepoStub({ sessionDurationP90Minutes: null });
    repo.recentSessions = Array.from({ length: 5 }, (_, i) => session(i + 1, 600)); // 10h each
    const svc = new UserMemoryService(repo);
    await svc.updateAfterSession(1, null, 'sess-x');
    expect(repo.upsertCalls[0][1].sessionDurationP90Minutes).toBe(240);
  });

  it('no-ops when value unchanged', async () => {
    const repo = makeUserMemoryRepoStub({ sessionDurationP90Minutes: 45 });
    repo.recentSessions = Array.from({ length: 10 }, (_, i) => session(i + 1, (i + 1) * 5));
    const svc = new UserMemoryService(repo);
    await svc.updateAfterSession(1, null, 'sess-x');
    expect(repo.upsertCalls[0][1].sessionDurationP90Minutes).toBeUndefined();
  });
});
