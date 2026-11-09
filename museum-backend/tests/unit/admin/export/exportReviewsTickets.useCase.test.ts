import { ExportReviewsUseCase } from '@modules/admin/useCase/export/exportReviews.useCase';
import { ExportSupportTicketsUseCase } from '@modules/admin/useCase/export/exportSupportTickets.useCase';
import { AUDIT_ADMIN_EXPORT_REVIEWS, AUDIT_ADMIN_EXPORT_TICKETS } from '@shared/audit/audit.types';
import {
  makeExportReviewRow,
  makeExportTicketRow,
  type ExportRowReview,
  type ExportRowTicket,
} from '../../../helpers/admin/export.fixtures';

interface ReviewsRepoSpy {
  streamReviews: jest.Mock;
}

interface TicketsRepoSpy {
  streamSupportTickets: jest.Mock;
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
interface ReviewsUC {
  execute(input: ExportInput): Promise<AsyncIterable<ExportRowReview>>;
}
interface TicketsUC {
  execute(input: ExportInput): Promise<AsyncIterable<ExportRowTicket>>;
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const r of iter) out.push(r);
  return out;
}

function makeIter<T>(rows: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const r of rows) yield r;
    },
  };
}

describe('ExportReviewsUseCase (R2 R2 / R4 / R18 / Q1 BLOCKER)', () => {
  let repo: ReviewsRepoSpy;
  let audit: AuditSpy;
  let useCase: ReviewsUC;

  beforeEach(() => {
    repo = { streamReviews: jest.fn(() => makeIter([makeExportReviewRow()])) };
    audit = {
      log: jest.fn().mockResolvedValue(undefined),
      logActorAction: jest.fn().mockResolvedValue(undefined),
    };
    useCase = new (ExportReviewsUseCase as new (r: ReviewsRepoSpy, a: AuditSpy) => ReviewsUC)(
      repo,
      audit,
    );
  });

  it('super_admin → returns stream + emits AUDIT_ADMIN_EXPORT_REVIEWS', async () => {
    const iter = await useCase.execute({
      actorId: 1,
      actorRole: 'super_admin',
      museumScope: null,
    });
    const rows = await collect(iter);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(audit.logActorAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ADMIN_EXPORT_REVIEWS,
        metadata: expect.objectContaining({ kind: 'reviews' }),
      }),
    );
  });

  it('museum_manager → 403 (Q1 BLOCKER — reviews lacks museum_id)', async () => {
    await expect(
      useCase.execute({ actorId: 2, actorRole: 'museum_manager', museumScope: 42 }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repo.streamReviews).not.toHaveBeenCalled();
  });

  it('admin → 403 (Q1 BLOCKER — same as museum_manager)', async () => {
    await expect(
      useCase.execute({ actorId: 3, actorRole: 'admin', museumScope: 7 }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repo.streamReviews).not.toHaveBeenCalled();
  });

  it('moderator → 403 (Q3)', async () => {
    await expect(
      useCase.execute({ actorId: 4, actorRole: 'moderator', museumScope: null }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('visitor → 403 (R4)', async () => {
    await expect(
      useCase.execute({ actorId: 5, actorRole: 'visitor', museumScope: null }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('row exposes user_id_pseudonym, never raw userId (R18)', async () => {
    repo.streamReviews.mockImplementation(() =>
      makeIter([makeExportReviewRow({ user_id_pseudonym: 'abc123def4567890' })]),
    );
    const iter = await useCase.execute({
      actorId: 1,
      actorRole: 'super_admin',
      museumScope: null,
    });
    const rows = await collect(iter);
    expect(rows[0].user_id_pseudonym).toMatch(/^[0-9a-f]{16}$/);
    const row0 = rows[0] as unknown as Record<string, unknown>;
    expect(row0.userId).toBeUndefined();
    expect(row0.user_id).toBeUndefined();
  });
});

describe('ExportSupportTicketsUseCase (R2 R3 / R4 / R19 / Q1 BLOCKER)', () => {
  let repo: TicketsRepoSpy;
  let audit: AuditSpy;
  let useCase: TicketsUC;

  beforeEach(() => {
    repo = { streamSupportTickets: jest.fn(() => makeIter([makeExportTicketRow()])) };
    audit = {
      log: jest.fn().mockResolvedValue(undefined),
      logActorAction: jest.fn().mockResolvedValue(undefined),
    };
    useCase = new (ExportSupportTicketsUseCase as new (
      r: TicketsRepoSpy,
      a: AuditSpy,
    ) => TicketsUC)(repo, audit);
  });

  it('super_admin → returns stream + emits AUDIT_ADMIN_EXPORT_TICKETS', async () => {
    const iter = await useCase.execute({
      actorId: 1,
      actorRole: 'super_admin',
      museumScope: null,
    });
    const rows = await collect(iter);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(audit.logActorAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ADMIN_EXPORT_TICKETS,
        metadata: expect.objectContaining({ kind: 'tickets' }),
      }),
    );
  });

  it('museum_manager → 403 (Q1 BLOCKER — support_tickets lacks museum_id)', async () => {
    await expect(
      useCase.execute({ actorId: 2, actorRole: 'museum_manager', museumScope: 42 }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repo.streamSupportTickets).not.toHaveBeenCalled();
  });

  it('admin → 403 (Q1 BLOCKER)', async () => {
    await expect(
      useCase.execute({ actorId: 3, actorRole: 'admin', museumScope: 7 }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('moderator → 403 (Q3)', async () => {
    await expect(
      useCase.execute({ actorId: 4, actorRole: 'moderator', museumScope: null }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('row exposes user_email_pseudonym EVEN for super_admin (R19 / Q7)', async () => {
    repo.streamSupportTickets.mockImplementation(() =>
      makeIter([makeExportTicketRow({ user_email_pseudonym: '1234567890abcdef' })]),
    );
    const iter = await useCase.execute({
      actorId: 1,
      actorRole: 'super_admin',
      museumScope: null,
    });
    const rows = await collect(iter);
    expect(rows[0].user_email_pseudonym).toMatch(/^[0-9a-f]{16}$/);
    const row0 = rows[0] as unknown as Record<string, unknown>;
    expect(row0.user_email).toBeUndefined();
    expect(row0.userEmail).toBeUndefined();
  });

  it('audit metadata never includes ticket description / subject (N9)', async () => {
    repo.streamSupportTickets.mockImplementation(() =>
      makeIter([
        makeExportTicketRow({
          subject: 'My-Secret-Subject',
        }),
      ]),
    );
    const iter = await useCase.execute({
      actorId: 1,
      actorRole: 'super_admin',
      museumScope: null,
    });
    await collect(iter);
    const firstCall = audit.logActorAction.mock.calls[0] as unknown[];
    const entry = firstCall[0] as { metadata?: Record<string, unknown> };
    expect(JSON.stringify(entry.metadata ?? {})).not.toContain('My-Secret-Subject');
  });
});
