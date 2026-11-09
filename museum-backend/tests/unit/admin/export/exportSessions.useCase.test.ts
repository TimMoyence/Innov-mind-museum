import { ExportChatSessionsUseCase } from '@modules/admin/useCase/export/exportChatSessions.useCase';
import { AUDIT_ADMIN_EXPORT_SESSIONS } from '@shared/audit/audit.types';
import {
  makeExportSessionRow,
  type ExportRowSessions,
} from '../../../helpers/admin/export.fixtures';

interface ExportRepoSpy {
  streamChatSessions: jest.Mock;
}

interface AuditSpy {
  log: jest.Mock;
  logActorAction: jest.Mock;
}

interface ExportInput {
  actorId: number;
  actorRole: 'visitor' | 'moderator' | 'museum_manager' | 'admin' | 'super_admin';
  museumScope: number | null;
}
interface ExportUseCase {
  execute(input: ExportInput): Promise<AsyncIterable<ExportRowSessions>>;
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const r of iter) out.push(r);
  return out;
}

function makeAsyncIter(rows: ExportRowSessions[]): AsyncIterable<ExportRowSessions> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const r of rows) yield r;
    },
  };
}

const TEST_PSEUDONYM_SALT = 't'.repeat(48);

describe('ExportChatSessionsUseCase (R2 R6/R7/R8/R12/R17)', () => {
  let repo: ExportRepoSpy;
  let audit: AuditSpy;
  let useCase: ExportUseCase;

  beforeEach(() => {
    repo = {
      streamChatSessions: jest.fn(() => makeAsyncIter([makeExportSessionRow()])),
    };
    audit = {
      log: jest.fn().mockResolvedValue(undefined),
      logActorAction: jest.fn().mockResolvedValue(undefined),
    };
    useCase = new (ExportChatSessionsUseCase as new (
      r: ExportRepoSpy,
      a: AuditSpy,
      salt: string,
    ) => ExportUseCase)(repo, audit, TEST_PSEUDONYM_SALT);
  });

  it('super_admin → repo called with scopeMuseumId=null (R7)', async () => {
    const iter = await useCase.execute({
      actorId: 1,
      actorRole: 'super_admin',
      museumScope: null,
    });
    await collect(iter);
    expect(repo.streamChatSessions).toHaveBeenCalledWith(
      expect.objectContaining({ scopeMuseumId: null }),
    );
  });

  it('museum_manager → repo called with scopeMuseumId=user.museumId (R6 / AC4)', async () => {
    const iter = await useCase.execute({
      actorId: 2,
      actorRole: 'museum_manager',
      museumScope: 42,
    });
    await collect(iter);
    expect(repo.streamChatSessions).toHaveBeenCalledWith(
      expect.objectContaining({ scopeMuseumId: 42 }),
    );
  });

  it('admin → repo called with scopeMuseumId=user.museumId (R8 / Q2 default)', async () => {
    const iter = await useCase.execute({
      actorId: 3,
      actorRole: 'admin',
      museumScope: 7,
    });
    await collect(iter);
    expect(repo.streamChatSessions).toHaveBeenCalledWith(
      expect.objectContaining({ scopeMuseumId: 7 }),
    );
  });

  it('moderator → throws Forbidden BEFORE any repo call (R4 / Q3)', async () => {
    await expect(
      useCase.execute({ actorId: 4, actorRole: 'moderator', museumScope: null }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repo.streamChatSessions).not.toHaveBeenCalled();
  });

  it('visitor → throws Forbidden BEFORE any repo call (R4)', async () => {
    await expect(
      useCase.execute({ actorId: 5, actorRole: 'visitor', museumScope: null }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repo.streamChatSessions).not.toHaveBeenCalled();
  });

  it('museum_manager with no museumId → throws Forbidden NO_MUSEUM_ASSIGNED (R9 / AC6)', async () => {
    await expect(
      useCase.execute({ actorId: 6, actorRole: 'museum_manager', museumScope: null }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repo.streamChatSessions).not.toHaveBeenCalled();
  });

  it('emits audit log exactly once with action AUDIT_ADMIN_EXPORT_SESSIONS (R12)', async () => {
    const iter = await useCase.execute({
      actorId: 1,
      actorRole: 'super_admin',
      museumScope: null,
    });
    await collect(iter);
    expect(audit.logActorAction).toHaveBeenCalledTimes(1);
    expect(audit.logActorAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ADMIN_EXPORT_SESSIONS,
        actorId: 1,
        metadata: expect.objectContaining({
          kind: 'sessions',
          scopeMuseumId: null,
        }),
      }),
    );
  });

  it('audit.log is awaited BEFORE the first row is yielded (N6 / AC10)', async () => {
    const order: string[] = [];
    audit.logActorAction.mockImplementation(async () => {
      order.push('audit');
    });
    repo.streamChatSessions.mockImplementation(() => ({
      async *[Symbol.asyncIterator]() {
        order.push('first-row');
        yield makeExportSessionRow();
      },
    }));
    const iter = await useCase.execute({
      actorId: 1,
      actorRole: 'super_admin',
      museumScope: null,
    });
    await collect(iter);
    expect(order).toEqual(['audit', 'first-row']);
  });

  it('audit metadata MUST NOT include row payload (N9 — no free-text PII)', async () => {
    const iter = await useCase.execute({
      actorId: 1,
      actorRole: 'super_admin',
      museumScope: null,
    });
    await collect(iter);
    const firstCall = audit.logActorAction.mock.calls[0] as unknown[];
    const entry = firstCall[0] as { metadata?: Record<string, unknown> };
    const serialised = JSON.stringify(entry.metadata ?? {});
    expect(serialised).not.toContain('Loved the visit');
  });

  it('super_admin sees raw user_id in stream rows (R17 / D6)', async () => {
    repo.streamChatSessions.mockImplementation(() =>
      makeAsyncIter([makeExportSessionRow({ user_id: '42' })]),
    );
    const iter = await useCase.execute({
      actorId: 1,
      actorRole: 'super_admin',
      museumScope: null,
    });
    const rows = await collect(iter);
    expect(rows[0].user_id).toBe('42');
  });

  it('museum_manager sees a pseudonymised user_id (R17 / D6)', async () => {
    repo.streamChatSessions.mockImplementation(() =>
      makeAsyncIter([makeExportSessionRow({ user_id: '42' })]),
    );
    const iter = await useCase.execute({
      actorId: 2,
      actorRole: 'museum_manager',
      museumScope: 42,
    });
    const rows = await collect(iter);
    expect(rows[0].user_id).not.toBe('42');
    expect(rows[0].user_id).toMatch(/^[0-9a-f]{16}$/);
  });
});
