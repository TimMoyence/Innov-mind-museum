import {
  makeBetaSignupPayload,
  type BetaSignupPayload,
} from '../../helpers/leads/betaSignup.fixtures';
import {
  makeStubLeadRepository,
  type StubLeadRepository,
} from '../../helpers/leads/stubLeadRepository';

import { SubmitBetaSignupUseCase } from '@modules/leads/useCase/submitBetaSignup.useCase';
import { logger } from '@shared/logger/logger';

import type { ILeadRepository } from '@modules/leads/domain/lead/lead.repository.interface';

interface BetaSignupNotifier {
  subscribe(
    payload: BetaSignupPayload & {
      ip?: string;
      requestId?: string;
      userAgent?: string;
    },
  ): Promise<void>;
}

type BetaUseCaseCtor = new (
  notifier: BetaSignupNotifier,
  repository: ILeadRepository,
) => {
  execute(
    input: BetaSignupPayload & { ip?: string; requestId?: string; userAgent?: string },
  ): Promise<void>;
};

describe('SubmitBetaSignupUseCase (R3 §1 R10/R11/R14/R16/R17)', () => {
  const subscribe = jest.fn<Promise<void>, [Parameters<BetaSignupNotifier['subscribe']>[0]]>();
  const notifier: BetaSignupNotifier = { subscribe };
  const Ctor = SubmitBetaSignupUseCase as unknown as BetaUseCaseCtor;
  let repository: StubLeadRepository;
  let useCase: InstanceType<BetaUseCaseCtor>;

  beforeEach(() => {
    subscribe.mockReset();
    subscribe.mockResolvedValue(undefined);
    repository = makeStubLeadRepository();
    useCase = new Ctor(notifier, repository);
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('forwards a valid beta signup to the notifier exactly once (R13)', async () => {
    await useCase.execute({
      ...makeBetaSignupPayload(),
      ip: '127.0.0.1',
      requestId: 'req-beta-1',
      userAgent: 'Mozilla/5.0',
    });

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'visitor@example.com',
        consent: true,
        ip: '127.0.0.1',
        requestId: 'req-beta-1',
        userAgent: 'Mozilla/5.0',
      }),
    );
  });

  it('trims + lowercases email (defense-in-depth)', async () => {
    await useCase.execute({
      ...makeBetaSignupPayload({ email: '  VISITOR@EXAMPLE.COM  ' }),
    });
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'visitor@example.com' }),
    );
  });

  it('rejects payload when consent is false (R11)', async () => {
    await expect(
      useCase.execute(makeBetaSignupPayload({ consent: false as unknown as true })),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('rejects invalid email (R6 server-side)', async () => {
    await expect(
      useCase.execute(makeBetaSignupPayload({ email: 'not-an-email' })),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('honeypot triggered (non-empty website) → resolves without notifying (R10)', async () => {
    await expect(
      useCase.execute(makeBetaSignupPayload({ website: 'https://spam.example.com' })),
    ).resolves.toBeUndefined();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('whitespace-only website is treated as empty (not honeypot-positive)', async () => {
    await useCase.execute(makeBetaSignupPayload({ website: '   ' }));
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('notifier resolves on duplicate outcome → use case still resolves (R16)', async () => {
    subscribe.mockResolvedValue(undefined);
    await expect(useCase.execute(makeBetaSignupPayload())).resolves.toBeUndefined();
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('notifier throws → use case does NOT rethrow, lead marked failed (Cycle B R5 — route stays 202)', async () => {
    subscribe.mockRejectedValue(new Error('Brevo contacts add failed (502): bad gateway'));

    await expect(useCase.execute(makeBetaSignupPayload())).resolves.toBeUndefined();

    expect(repository.inserted).toHaveLength(1);
    expect(repository.failed).toHaveLength(1);
    expect(repository.delivered).toHaveLength(0);
    expect(repository.failed[0]?.lastError).toContain('Brevo contacts add failed');
  });

  it('logs beta_signup_submitted with requestId + honeypotTriggered, no full email (R17)', async () => {
    const infoSpy = jest.spyOn(logger, 'info');
    await useCase.execute({
      ...makeBetaSignupPayload({ email: 'someone@example.com' }),
      requestId: 'req-beta-logs',
    });

    const submittedCalls = infoSpy.mock.calls.filter((call) => call[0] === 'beta_signup_submitted');
    expect(submittedCalls).toHaveLength(1);

    const [, payload] = submittedCalls[0] as [string, Record<string, unknown>];
    expect(payload).toMatchObject({
      requestId: 'req-beta-logs',
      honeypotTriggered: false,
    });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('someone@example.com');
  });
});
