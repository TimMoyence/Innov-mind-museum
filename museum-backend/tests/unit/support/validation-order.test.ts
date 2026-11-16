import { SubmitB2bLeadUseCase } from '@modules/leads/useCase/submitB2bLead.useCase';
import { CreateTicketUseCase } from '@modules/support/useCase/ticket-user/createTicket.useCase';
import { SubmitSupportContactUseCase } from '@modules/support/useCase/contact/submitSupportContact.useCase';
import { logger } from '@shared/logger/logger';
import { InMemorySupportRepository } from 'tests/helpers/support/inMemorySupportRepository';

import { makeB2bLeadPayload } from '../../helpers/leads/b2bLead.fixtures';
import { makeStubLeadRepository } from '../../helpers/leads/stubLeadRepository';
import { makeSupportContactInput } from '../../helpers/support/supportContact.fixtures';

import type { B2bLeadRole } from '@modules/leads/domain/ports/b2b-lead-notifier.port';

jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn(), logActorAction: jest.fn() },
  AUDIT_SUPPORT_TICKET_CREATED: 'SUPPORT_TICKET_CREATED',
}));

const TOO_LONG = 'x'.repeat(100_000);

const ticket = (overrides: Record<string, string>) =>
  new CreateTicketUseCase(new InMemorySupportRepository()).execute({
    userId: 1,
    subject: 'Help',
    description: 'Description long enough',
    ...overrides,
  });

const lead = (overrides: Record<string, string>) =>
  new SubmitB2bLeadUseCase({ notify: () => Promise.resolve() }, makeStubLeadRepository()).execute({
    ...makeB2bLeadPayload(),
    ...overrides,
    role: (overrides.role ?? 'director') as B2bLeadRole,
  });

describe('ORDRE · the first invalid field is the one refused', () => {
  it.each([
    ['subject before description', { subject: TOO_LONG, description: TOO_LONG }, 'subject must'],
    [
      'description before category',
      { description: TOO_LONG, category: TOO_LONG },
      'description must',
    ],
    ['category before priority', { category: TOO_LONG, priority: 'urgent' }, 'category must'],
  ])('ORDRE · ticket: %s', async (_case, overrides, message) => {
    await expect(ticket(overrides)).rejects.toThrow(message);
  });

  it.each([
    ['name before museum', { name: TOO_LONG, museum: TOO_LONG }, 'name must'],
    ['museum before role', { museum: TOO_LONG, role: 'ceo' }, 'museum must'],
    ['role before message', { role: 'ceo', message: TOO_LONG }, 'role must be one of'],
  ])('ORDRE · B2B lead: %s', async (_case, overrides, message) => {
    await expect(lead(overrides)).rejects.toThrow(message);
  });

  it('ORDRE · a bot with an invalid field is refused before any honeypot log', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const bot = { website: 'http://spam.example', fillMs: 0 };

    await expect(
      new SubmitB2bLeadUseCase(
        { notify: () => Promise.resolve() },
        makeStubLeadRepository(),
      ).execute({ ...makeB2bLeadPayload(), ...bot, name: TOO_LONG }),
    ).rejects.toThrow('name must');
    await expect(
      new SubmitSupportContactUseCase({ notify: () => Promise.resolve() }).execute({
        ...makeSupportContactInput(),
        ...bot,
        email: 'not-an-email',
      }),
    ).rejects.toThrow('email must be valid');

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
