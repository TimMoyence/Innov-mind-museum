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

const { leadNotifierByType } = require('@modules/leads/useCase') as {
  leadNotifierByType: (type: LeadType) => { subscribe?: (p: unknown) => Promise<unknown> } & {
    notify?: (p: unknown) => Promise<unknown>;
  };
};

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
