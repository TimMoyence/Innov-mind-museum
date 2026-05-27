/**
 * RED (T2.2 — Cycle D, R5) — the `leadNotifierByType` resolver must route a
 * `brevo_erasure` lead to Brevo `removeContact` (DELETE the contact), NOT to
 * `subscribe` (which ADDS a contact — the exact opposite of erasure).
 *
 * Design §1 D3 reuses the `leads` table + the WS-B redelivery cron for the
 * durable Brevo erasure: a failed delete-account Brevo step persists a
 * `brevo_erasure` lead; the cron (`RedeliverPendingLeadsUseCase`) re-dispatches
 * it through `leadNotifierByType(lead.type)`. For that to erase rather than
 * subscribe, the resolver needs a new `'brevo_erasure'` branch.
 *
 * RED at baseline: `leadNotifierByType` has no `'brevo_erasure'` case — every
 * non-`'b2b'` type (including the unknown `'brevo_erasure'`) falls through to
 * the beta `subscribe` notifier. So dispatching a `brevo_erasure` lead would
 * call `subscribe` (re-add the contact) and never `removeContact` → the
 * assertions fail.
 *
 * Composition-root isolation: `@src/config/env` is stubbed with Brevo creds so
 * the live notifier path is selected; `@data/db/data-source` is stubbed so the
 * `LeadRepositoryPg(AppDataSource)` instantiated at module load does not open a
 * real PG connection; the Brevo notifier module is mocked to spy on
 * `removeContact` vs `subscribe`.
 */
import type { LeadType } from '@modules/leads/domain/lead/lead.types';

const removeContactSpy = jest.fn().mockResolvedValue({ outcome: 'deleted' });
const subscribeSpy = jest.fn().mockResolvedValue({ outcome: 'subscribed' });

jest.mock('@src/config/env', () => ({
  env: {
    brevoApiKey: 'test-brevo-key',
    brevoBetaListId: 17,
    b2bInboxEmail: 'b2b@example.com',
    supportInboxEmail: 'support@example.com',
  },
}));

jest.mock('@data/db/data-source', () => ({
  AppDataSource: { getRepository: jest.fn(() => ({})) },
}));

jest.mock('@modules/leads/adapters/secondary/notifier/brevo-beta-signup.notifier', () => ({
  BrevoBetaSignupNotifier: jest.fn().mockImplementation(() => ({
    subscribe: subscribeSpy,
    removeContact: removeContactSpy,
  })),
  NoopBetaSignupNotifier: jest.fn().mockImplementation(() => ({
    subscribe: subscribeSpy,
    removeContact: removeContactSpy,
  })),
}));

// Avoid pulling the real Brevo email service / b2b notifier network shapes.
jest.mock('@modules/leads/adapters/secondary/notifier/b2b-lead-email.notifier', () => ({
  EmailB2bLeadNotifier: jest.fn().mockImplementation(() => ({ notify: jest.fn() })),
  NoopB2bLeadNotifier: jest.fn().mockImplementation(() => ({ notify: jest.fn() })),
}));
jest.mock('@modules/leads/adapters/secondary/pg/lead.repository.pg', () => ({
  LeadRepositoryPg: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('@shared/email/brevo-email.service', () => ({
  BrevoEmailService: jest.fn().mockImplementation(() => ({})),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- re-grab through the mocked module after jest.mock hoisting (mirror consent.route.test.ts)
const { leadNotifierByType } = require('@modules/leads/useCase') as {
  leadNotifierByType: (type: LeadType) => { subscribe?: (p: unknown) => Promise<unknown> } & {
    notify?: (p: unknown) => Promise<unknown>;
  };
};

/** Invoke whichever delivery method the resolved notifier exposes. */
async function deliver(
  notifier: {
    subscribe?: (p: unknown) => Promise<unknown>;
    notify?: (p: unknown) => Promise<unknown>;
  },
  payload: unknown,
): Promise<unknown> {
  if (notifier.subscribe) return notifier.subscribe(payload);
  if (notifier.notify) return notifier.notify(payload);
  throw new Error('resolved notifier exposes neither subscribe nor notify');
}

describe('leadNotifierByType — brevo_erasure routes to removeContact (R5)', () => {
  beforeEach(() => {
    removeContactSpy.mockClear();
    subscribeSpy.mockClear();
  });

  it('dispatches a brevo_erasure lead via removeContact(email), never subscribe', async () => {
    const notifier = leadNotifierByType('brevo_erasure' as LeadType);

    await deliver(notifier, { email: 'erase-me@example.com' });

    // Erasure must DELETE the contact, not ADD it.
    expect(removeContactSpy).toHaveBeenCalledTimes(1);
    expect(removeContactSpy).toHaveBeenCalledWith('erase-me@example.com');
    expect(subscribeSpy).not.toHaveBeenCalled();
  });

  it('still routes a beta lead to subscribe (no regression)', async () => {
    const notifier = leadNotifierByType('beta' as LeadType);

    await deliver(notifier, { email: 'beta@example.com', consent: true });

    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    expect(removeContactSpy).not.toHaveBeenCalled();
  });
});
