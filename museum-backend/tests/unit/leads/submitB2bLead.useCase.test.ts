/**
 * R4 RED tests — SubmitB2bLeadUseCase.
 *
 * Pins R4 §1 R10 + R11 + R13 + R14 down BEFORE implementation:
 *  - Happy path : valid payload calls notifier ONCE.
 *  - Missing consent (false) : throws 400, notifier NOT called.
 *  - Honeypot triggered (non-empty `website`) : silent drop — notifier NOT
 *    called, no error thrown (R10).
 *  - Trimming + lowercasing of email (defense-in-depth parity with
 *    `SubmitSupportContactUseCase` :30).
 *  - Validation rejects out-of-bound name / museum / message lengths +
 *    invalid role.
 *
 * MUST FAIL at baseline `bc49afee` — the use case is not implemented yet.
 *
 * The expected production location (R4 §3.4) is:
 *   museum-backend/src/modules/leads/useCase/submitB2bLead.useCase.ts
 *   (or co-located under support/useCase/contact if D4 falls back to the
 *    alternative path). The barrel `@modules/leads/useCase` is the public
 *    entry-point both tests and the route consume.
 */
import { makeB2bLeadPayload, type B2bLeadPayload } from '../../helpers/leads/b2bLead.fixtures';
import { makeStubLeadRepository } from '../../helpers/leads/stubLeadRepository';

import { SubmitB2bLeadUseCase } from '@modules/leads/useCase/submitB2bLead.useCase';

import type { ILeadRepository } from '@modules/leads/domain/lead/lead.repository.interface';

// Outbound notifier port — production shape defined alongside the use case.
interface B2bLeadNotifier {
  notify(
    payload: B2bLeadPayload & {
      ip?: string;
      requestId?: string;
      userAgent?: string;
    },
  ): Promise<void>;
}

/**
 * Cycle B (« Aucun lead perdu ») — the use-case is now persist-then-notify and
 * depends on `ILeadRepository` (2-arg ctor). These unit cases keep the
 * validation/honeypot/PII contract; a tiny in-memory stub repo stands in for PG
 * (the real persistence ordering + transitions are pinned by the integration
 * suite `submitB2bLead.persist-then-notify.test.ts`).
 */
type B2bUseCaseCtor = new (
  notifier: B2bLeadNotifier,
  repository: ILeadRepository,
) => {
  execute(
    input: B2bLeadPayload & { ip?: string; requestId?: string; userAgent?: string },
  ): Promise<void>;
};

describe('SubmitB2bLeadUseCase (R4 §1 R10/R11/R13/R14)', () => {
  const notify = jest.fn<Promise<void>, [Parameters<B2bLeadNotifier['notify']>[0]]>();
  const notifier: B2bLeadNotifier = { notify };
  // Cast to the public contract — keeps `as any` out of the ratchet.
  const Ctor = SubmitB2bLeadUseCase as unknown as B2bUseCaseCtor;
  const useCase = new Ctor(notifier, makeStubLeadRepository());

  beforeEach(() => {
    notify.mockReset();
    notify.mockResolvedValue(undefined);
  });

  it('forwards a valid B2B lead payload to the notifier exactly once (R13)', async () => {
    await useCase.execute({
      ...makeB2bLeadPayload(),
      ip: '127.0.0.1',
      requestId: 'req-b2b-1',
      userAgent: 'Mozilla/5.0',
    });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'sales@museum.fr',
        museum: 'Louvre Lens',
        role: 'director',
        consent: true,
        ip: '127.0.0.1',
        requestId: 'req-b2b-1',
        userAgent: 'Mozilla/5.0',
      }),
    );
  });

  it('trims + lowercases email (defense-in-depth)', async () => {
    await useCase.execute({
      ...makeB2bLeadPayload({ email: '  SALES@MUSEUM.FR  ' }),
    });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ email: 'sales@museum.fr' }));
  });

  it('rejects payload when consent is false (R11)', async () => {
    await expect(
      useCase.execute(makeB2bLeadPayload({ consent: false as unknown as true })),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(notify).not.toHaveBeenCalled();
  });

  it('rejects invalid email', async () => {
    await expect(
      useCase.execute(makeB2bLeadPayload({ email: 'not-an-email' })),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(notify).not.toHaveBeenCalled();
  });

  it('rejects role outside the allowed enum', async () => {
    await expect(
      useCase.execute(makeB2bLeadPayload({ role: 'ceo' as unknown as B2bLeadPayload['role'] })),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(notify).not.toHaveBeenCalled();
  });

  it('rejects message shorter than 10 chars', async () => {
    await expect(useCase.execute(makeB2bLeadPayload({ message: 'short' }))).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(notify).not.toHaveBeenCalled();
  });

  it('rejects museum longer than 200 chars', async () => {
    await expect(
      useCase.execute(makeB2bLeadPayload({ museum: 'm'.repeat(201) })),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(notify).not.toHaveBeenCalled();
  });

  // ── Honeypot — R10 silent drop ──────────────────────────────────────

  it('honeypot triggered (non-empty website) → resolves without notifying (R10)', async () => {
    await expect(
      useCase.execute(makeB2bLeadPayload({ website: 'https://spam.example.com' })),
    ).resolves.toBeUndefined();
    expect(notify).not.toHaveBeenCalled();
  });

  it('whitespace-only website is treated as empty (not honeypot-positive)', async () => {
    await useCase.execute(makeB2bLeadPayload({ website: '   ' }));
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
