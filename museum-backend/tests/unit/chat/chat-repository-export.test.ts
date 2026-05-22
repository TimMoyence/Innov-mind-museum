/**
 * RED (T1.10 sibling) — chat-repository reads for the DSAR export (B3, R12):
 *   - `listMessageFeedbackForUser(repo, userId)` → rows where userId matches,
 *     projected to `{ messageId, value, createdAt }`.
 *   - `listMessageReportsForUser(repo, userId)` → rows where userId matches,
 *     projected to `{ messageId, reason, comment, status, createdAt }`.
 *     `reviewedBy` / `reviewerNotes` / `reviewedAt` are third-party moderator
 *     data and MUST be excluded (design D7).
 *
 * FAILS at red baseline: neither read is implemented (the accessors return
 * `undefined`), so the first assertion in each block fails.
 */
import {
  getListMessageFeedbackForUser,
  getListMessageReportsForUser,
} from 'tests/helpers/chat/gdpr-export-reads.accessor';

import type { MessageFeedback } from '@modules/chat/domain/message/messageFeedback.entity';
import type { MessageReport } from '@modules/chat/domain/message/messageReport.entity';
import type { Repository } from 'typeorm';

interface RepoMockQb {
  select: jest.Mock;
  addSelect: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  getMany: jest.Mock;
  getRawMany: jest.Mock;
}

/**
 * Builds an entity-agnostic repo mock whose query builder + `find` both honour
 * the userId filter. Returned as `unknown` so callers cast to the concrete
 * `Repository<Entity>` the accessor expects.
 */
function buildRepoMock(rowsForUser: (userId: number) => unknown[]): unknown {
  let captured: number | undefined;
  const getMany = jest.fn(
    async (): Promise<unknown[]> => (typeof captured === 'number' ? rowsForUser(captured) : []),
  );
  const qb: RepoMockQb = {
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    where: jest.fn((_clause: string, params?: { userId?: number }) => {
      if (params && typeof params.userId === 'number') captured = params.userId;
      return qb;
    }),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    getMany,
    getRawMany: getMany,
  };
  const find = jest.fn(
    async (opts?: { where?: { userId?: number } }): Promise<unknown[]> =>
      typeof opts?.where?.userId === 'number' ? rowsForUser(opts.where.userId) : [],
  );
  return { createQueryBuilder: jest.fn(() => qb), find };
}

describe('listMessageFeedbackForUser (B3 / R12)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is implemented (RED: not yet implemented)', () => {
    expect(getListMessageFeedbackForUser()).toBeInstanceOf(Function);
  });

  it('returns the user feedback projected to messageId/value/createdAt', async () => {
    const listFeedback = getListMessageFeedbackForUser();
    expect(listFeedback).toBeInstanceOf(Function);

    const repo = buildRepoMock((userId) =>
      userId === 42
        ? [
            {
              id: 'fb-1',
              messageId: 'm-1',
              userId: 42,
              value: 'positive',
              createdAt: new Date('2026-01-02T00:00:00.000Z'),
            },
          ]
        : [],
    ) as Repository<MessageFeedback>;

    const rows = await listFeedback!(repo, 42);
    expect(rows.length).toBe(1);
    expect(rows[0]).toEqual(expect.objectContaining({ messageId: 'm-1', value: 'positive' }));
  });
});

describe('listMessageReportsForUser (B3 / R12 / D7)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is implemented (RED: not yet implemented)', () => {
    expect(getListMessageReportsForUser()).toBeInstanceOf(Function);
  });

  it('projects the report WITHOUT reviewer-internal fields (D7)', async () => {
    const listReports = getListMessageReportsForUser();
    expect(listReports).toBeInstanceOf(Function);

    const repo = buildRepoMock((userId) =>
      userId === 42
        ? [
            {
              id: 'rep-1',
              messageId: 'm-2',
              userId: 42,
              reason: 'inaccurate',
              comment: 'wrong',
              status: 'pending',
              reviewedBy: 7,
              reviewedAt: new Date('2026-01-03T00:00:00.000Z'),
              reviewerNotes: 'internal note',
              createdAt: new Date('2026-01-02T12:00:00.000Z'),
            },
          ]
        : [],
    ) as Repository<MessageReport>;

    const rows = await listReports!(repo, 42);
    expect(rows.length).toBe(1);
    const dto = rows[0] as unknown as Record<string, unknown>;
    expect(dto).toEqual(
      expect.objectContaining({
        messageId: 'm-2',
        reason: 'inaccurate',
        comment: 'wrong',
        status: 'pending',
      }),
    );
    // Third-party moderator data MUST NOT be in the subject's export DTO.
    expect(dto).not.toHaveProperty('reviewedBy');
    expect(dto).not.toHaveProperty('reviewerNotes');
    expect(dto).not.toHaveProperty('reviewedAt');
  });
});
