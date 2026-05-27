/**
 * T-API-2 (RED — S-BE-API, UFR-022 fresh-context red phase 2026-05-26).
 *
 * Proves NPS attribution derives `review.museumId` from the VISITED session
 * (`chatSession.museumId`), never from the noter's tenant claim
 * (`authedUser.museumId`) — and that an absent / missing / foreign session is a
 * SILENT NULL (no 400, no existence leak). Spec R1-R4 / Q1.
 *
 * Design (design-c2.md §3, §4 M3): `CreateReviewUseCase` gains an
 * `IReviewSessionLookup` collaborator (2nd constructor arg) and `execute`
 * accepts an optional `sessionId`. The use-case calls
 * `lookup.findSessionMuseum(sessionId, userId)`; a returned session sets
 * `museumId = session.museumId` (NULL ok), `null` (missing/foreign/not-owned)
 * → `museumId = null`.
 *
 * Baseline FAILS (success of red phase per UFR-022): the use-case today takes
 * ONLY a repository, ignores any `sessionId`, and the route passes
 * `authedUser.museumId` (`review.route.ts:67`). The session-lookup collaborator
 * does not exist, so none of the museumId-from-session assertions hold.
 *
 * The local `SessionLookupLike` shape + constructor/input casts are confined to
 * this test file (allowed: not an `as Entity` cast on a domain entity; these are
 * test-input shapes). They let the test COMPILE against the current source
 * (`tsc --noEmit` clean) while asserting the future contract at runtime, so the
 * failure is an honest assertion-fail, not a compile error. After green the
 * casts collapse to the real types.
 *
 * lib-docs/typeorm/PATTERNS.md §9 (hexagonal: UC depends on the port interface,
 * not the chat repo concretely). Test data via local repo mock factory.
 */
import { CreateReviewUseCase } from '@modules/review/useCase/public/createReview.useCase';

import type { IReviewRepository } from '@modules/review/domain/review/review.repository.interface';
import type { ReviewDTO } from '@modules/review/domain/review/review.types';

const persistedReview: ReviewDTO = {
  id: '00000000-0000-0000-0000-000000000001',
  userId: 1,
  userName: 'Ada L.',
  rating: 9,
  comment: 'A sufficiently long review comment.',
  status: 'pending',
  museumId: null,
  createdAt: '2026-05-26T12:00:00.000Z',
};

function makeRepo(): jest.Mocked<IReviewRepository> {
  return {
    createReview: jest.fn().mockResolvedValue(persistedReview),
    listReviews: jest
      .fn()
      .mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
    getReviewById: jest.fn().mockResolvedValue(null),
    moderateReview: jest.fn().mockResolvedValue(null),
    getAverageRating: jest.fn().mockResolvedValue({ average: 0, count: 0 }),
    listForUser: jest.fn().mockResolvedValue([]),
    findByMuseum: jest
      .fn()
      .mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
    aggregateNps: jest
      .fn()
      .mockResolvedValue({ nps: 0, promoters: 0, passives: 0, detractors: 0, count: 0 }),
  };
}

/** Future `IReviewSessionLookup` port shape (created in green T-API-7). */
interface SessionLookupLike {
  findSessionMuseum: jest.Mock<
    Promise<{ museumId: number | null } | null>,
    [sessionId: string, userId: number]
  >;
}

function makeLookup(result: { museumId: number | null } | null): SessionLookupLike {
  return {
    findSessionMuseum: jest.fn().mockResolvedValue(result),
  };
}

/** Construct the UC with the (future) 2-arg signature without a tsc break. */
function makeUseCase(repo: IReviewRepository, lookup: SessionLookupLike): CreateReviewUseCase {
  const Ctor = CreateReviewUseCase as unknown as new (
    repo: IReviewRepository,
    lookup: SessionLookupLike,
  ) => CreateReviewUseCase;
  return new Ctor(repo, lookup);
}

interface AttributionExecuteInput {
  user: { id: number; firstname?: string | null; lastname?: string | null };
  rating: number;
  comment: string;
  sessionId?: string | null;
  /** Present ONLY to assert it is NEVER read by the use-case (R4). */
  museumId?: number | null;
}

async function execute(
  uc: CreateReviewUseCase,
  input: AttributionExecuteInput,
): Promise<ReviewDTO> {
  const run = uc.execute.bind(uc) as unknown as (i: AttributionExecuteInput) => Promise<ReviewDTO>;
  return run(input);
}

const VALID_COMMENT = 'A sufficiently long review comment.';
const OWNED_SESSION = '11111111-1111-4111-8111-111111111111';

describe('CreateReviewUseCase — NPS attribution (S-BE-API / T-API-2)', () => {
  it('(a) derives museumId from an owned session (museum 42) → persists museumId:42 (R1)', async () => {
    const repo = makeRepo();
    const lookup = makeLookup({ museumId: 42 });
    const uc = makeUseCase(repo, lookup);

    await execute(uc, {
      user: { id: 1, firstname: 'Ada', lastname: 'Lovelace' },
      rating: 9,
      comment: VALID_COMMENT,
      sessionId: OWNED_SESSION,
    });

    expect(lookup.findSessionMuseum).toHaveBeenCalledWith(OWNED_SESSION, 1);
    expect(repo.createReview).toHaveBeenCalledWith(
      expect.objectContaining({ museumId: 42, sessionId: OWNED_SESSION }),
    );
  });

  it('(b) owned session with museum NULL → persists museumId null/omitted (R2)', async () => {
    const repo = makeRepo();
    const lookup = makeLookup({ museumId: null });
    const uc = makeUseCase(repo, lookup);

    await execute(uc, {
      user: { id: 1, firstname: 'Ada', lastname: 'Lovelace' },
      rating: 10,
      comment: VALID_COMMENT,
      sessionId: OWNED_SESSION,
    });

    expect(repo.createReview).toHaveBeenCalledTimes(1);
    const arg = repo.createReview.mock.calls[0]?.[0];
    expect(arg?.museumId ?? null).toBeNull();
  });

  it('(c) no sessionId → museumId null, returns DTO, no throw (R3)', async () => {
    const repo = makeRepo();
    const lookup = makeLookup(null);
    const uc = makeUseCase(repo, lookup);

    const result = await execute(uc, {
      user: { id: 1, firstname: 'Ada', lastname: 'Lovelace' },
      rating: 7,
      comment: VALID_COMMENT,
    });

    expect(result).toBeDefined();
    expect(lookup.findSessionMuseum).not.toHaveBeenCalled();
    const arg = repo.createReview.mock.calls[0]?.[0];
    expect(arg?.museumId ?? null).toBeNull();
  });

  it('(d) foreign/missing session (lookup returns null) → museumId null, no throw, no 400 (R3/Q1)', async () => {
    const repo = makeRepo();
    const lookup = makeLookup(null); // not found / not owned — indistinguishable
    const uc = makeUseCase(repo, lookup);

    const result = await execute(uc, {
      user: { id: 1, firstname: 'Ada', lastname: 'Lovelace' },
      rating: 8,
      comment: VALID_COMMENT,
      sessionId: '22222222-2222-4222-8222-222222222222',
    });

    expect(result).toBeDefined();
    const arg = repo.createReview.mock.calls[0]?.[0];
    expect(arg?.museumId ?? null).toBeNull();
  });

  it('(f) foreign/inexistent session → sessionId NULL persisted, NOT the raw client id (F2 — FK + existence-oracle guard)', async () => {
    const repo = makeRepo();
    // lookup returns null: session missing OR owned by another user — the use-case
    // cannot distinguish, and MUST persist sessionId NULL so a non-existent UUID
    // can't trip the reviews.session_id → chat_sessions FK (500) and a foreign
    // session can't be linked cross-user (privacy leak / existence oracle).
    const lookup = makeLookup(null);
    const uc = makeUseCase(repo, lookup);
    const FOREIGN_SESSION = '33333333-3333-4333-8333-333333333333';

    await execute(uc, {
      user: { id: 1, firstname: 'Ada', lastname: 'Lovelace' },
      rating: 6,
      comment: VALID_COMMENT,
      sessionId: FOREIGN_SESSION,
    });

    const arg = repo.createReview.mock.calls[0]?.[0];
    // sessionId MUST be coherent with museumId: both NULL when the lookup misses.
    expect(arg?.museumId ?? null).toBeNull();
    expect(arg?.sessionId ?? null).toBeNull();
    expect(arg?.sessionId).not.toBe(FOREIGN_SESSION);
  });

  it('(g) owned session → sessionId persisted (link kept only when lookup succeeds)', async () => {
    const repo = makeRepo();
    const lookup = makeLookup({ museumId: 5 });
    const uc = makeUseCase(repo, lookup);

    await execute(uc, {
      user: { id: 1, firstname: 'Ada', lastname: 'Lovelace' },
      rating: 9,
      comment: VALID_COMMENT,
      sessionId: OWNED_SESSION,
    });

    const arg = repo.createReview.mock.calls[0]?.[0];
    expect(arg?.sessionId).toBe(OWNED_SESSION);
    expect(arg?.museumId).toBe(5);
  });

  it('(e) manager (authedUser.museumId=7) notes session museum 3 → museumId:3, tenant claim ignored (R4)', async () => {
    const repo = makeRepo();
    const lookup = makeLookup({ museumId: 3 });
    const uc = makeUseCase(repo, lookup);

    await execute(uc, {
      user: { id: 1, firstname: 'Ada', lastname: 'Lovelace' },
      rating: 9,
      comment: VALID_COMMENT,
      sessionId: OWNED_SESSION,
      museumId: 7, // tenant claim — MUST be ignored; attribution comes from session
    });

    const arg = repo.createReview.mock.calls[0]?.[0];
    expect(arg?.museumId).toBe(3);
    expect(arg?.museumId).not.toBe(7);
  });
});
