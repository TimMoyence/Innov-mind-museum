/**
 * R3 RED tests — SubmitBetaSignupUseCase.
 *
 * Pins R3 §1 R10 + R11 + R14 + R16 + R17 down BEFORE implementation:
 *  - Happy path : valid payload calls notifier.subscribe ONCE with normalized
 *    email (trim + lowercase).
 *  - Missing consent → throws 400, notifier NOT called.
 *  - Invalid email → throws 400, notifier NOT called.
 *  - Honeypot triggered (non-empty `website`) → silent drop — notifier NOT
 *    called, no error thrown (R10).
 *  - Whitespace-only honeypot → treated as empty (R10 nuance).
 *  - Notifier reports `duplicate` outcome → use case still resolves (R16
 *    idempotent anti-enumeration).
 *  - Notifier throws non-duplicate error → use case rethrows for the route
 *    handler to map to 5xx (R15).
 *  - Structured log `beta_signup_submitted` emitted with `{requestId,
 *    honeypotTriggered}` — no full email logged (PII discipline, R17).
 *
 * MUST FAIL at baseline `d5919dd3` — the use case is not implemented yet.
 *
 * The expected production location (R3 §0.3 + §3.3) is:
 *   museum-backend/src/modules/leads/useCase/submitBetaSignup.useCase.ts
 *   museum-backend/src/modules/leads/domain/ports/beta-signup-notifier.port.ts
 *
 * The barrel `@modules/leads/useCase` is the public entry-point both tests and
 * the route consume.
 */
import {
  makeBetaSignupPayload,
  type BetaSignupPayload,
} from '../../helpers/leads/betaSignup.fixtures';

import { SubmitBetaSignupUseCase } from '@modules/leads/useCase/submitBetaSignup.useCase';
import { logger } from '@shared/logger/logger';

/** Outbound port shape under test — production version will live alongside the use case. */
interface BetaSignupNotifier {
  subscribe(
    payload: BetaSignupPayload & {
      ip?: string;
      requestId?: string;
      userAgent?: string;
    },
  ): Promise<void>;
}

describe('SubmitBetaSignupUseCase (R3 §1 R10/R11/R14/R16/R17)', () => {
  const subscribe = jest.fn<Promise<void>, [Parameters<BetaSignupNotifier['subscribe']>[0]]>();
  const notifier: BetaSignupNotifier = { subscribe };
  // Cast to the public contract — TypeScript stays honest about the missing
  // module while keeping `as any` out of the ratchet.
  const useCase = new (SubmitBetaSignupUseCase as new (n: BetaSignupNotifier) => {
    execute(
      input: BetaSignupPayload & { ip?: string; requestId?: string; userAgent?: string },
    ): Promise<void>;
  })(notifier);

  beforeEach(() => {
    subscribe.mockReset();
    subscribe.mockResolvedValue(undefined);
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

  // ── Honeypot — R10 silent drop ──────────────────────────────────────

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

  // ── Idempotent anti-enumeration — R16 ───────────────────────────────

  it('notifier resolves on duplicate outcome → use case still resolves (R16)', async () => {
    // The Brevo adapter swallows the 400 "duplicate_parameter" case and
    // resolves silently. The use case must not surface that signal upward.
    subscribe.mockResolvedValue(undefined);
    await expect(useCase.execute(makeBetaSignupPayload())).resolves.toBeUndefined();
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('notifier throws → use case rethrows (R15 — route maps to 5xx)', async () => {
    subscribe.mockRejectedValue(new Error('Brevo contacts add failed (502): bad gateway'));
    await expect(useCase.execute(makeBetaSignupPayload())).rejects.toThrow(
      /Brevo contacts add failed/,
    );
  });

  // ── Structured logging — R17 ────────────────────────────────────────

  it('logs beta_signup_submitted with requestId + honeypotTriggered, no full email (R17)', async () => {
    const infoSpy = jest.spyOn(logger, 'info');
    await useCase.execute({
      ...makeBetaSignupPayload({ email: 'someone@example.com' }),
      requestId: 'req-beta-logs',
    });

    // The event must be emitted exactly once.
    const submittedCalls = infoSpy.mock.calls.filter((call) => call[0] === 'beta_signup_submitted');
    expect(submittedCalls).toHaveLength(1);

    const [, payload] = submittedCalls[0] as [string, Record<string, unknown>];
    expect(payload).toMatchObject({
      requestId: 'req-beta-logs',
      honeypotTriggered: false,
    });
    // PII discipline — full email MUST NOT appear in the structured log.
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('someone@example.com');
  });
});
