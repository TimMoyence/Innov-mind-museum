import { makeB2bLeadPayload } from '../../../helpers/leads/b2bLead.fixtures';

import { EmailB2bLeadNotifier } from '@modules/leads/adapters/secondary/notifier/b2b-lead-email.notifier';
import { EmailSupportContactNotifier } from '@modules/support/adapters/secondary/notifier/support-contact-email.notifier';

import type { EmailService } from '@shared/email/email.port';

const contact = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  message: 'I cannot access my saved tickets from the web support page.',
};

function subjectOf(sendEmail: jest.Mock): string {
  const call = sendEmail.mock.calls[0] as [string, string, string];
  return call[1];
}

describe('TIM-2026-11-08-DEUX-SIGNAUX · objet [suspect] sur les e-mails contact et B2B', () => {
  let sendEmail: jest.Mock;
  let emailService: EmailService;

  beforeEach(() => {
    sendEmail = jest.fn().mockResolvedValue(undefined);
    emailService = { sendEmail };
  });

  it('contact suspect : l’objet commence par [suspect]', async () => {
    await new EmailSupportContactNotifier(emailService, 'support@museum.test').notify({
      ...contact,
      suspect: true,
    });

    expect(subjectOf(sendEmail)).toBe('[suspect] [Musaium Support] Ada Lovelace <ada@example.com>');
  });

  it('contact sans marque : l’objet reste inchangé', async () => {
    await new EmailSupportContactNotifier(emailService, 'support@museum.test').notify({
      ...contact,
      suspect: false,
    });

    expect(subjectOf(sendEmail)).toBe('[Musaium Support] Ada Lovelace <ada@example.com>');
  });

  it('B2B suspect : l’objet commence par [suspect]', async () => {
    const lead = makeB2bLeadPayload();
    await new EmailB2bLeadNotifier(emailService, 'b2b@museum.test').notify({
      ...lead,
      suspect: true,
    });

    expect(subjectOf(sendEmail)).toBe(
      `[suspect] [Musaium B2B] ${lead.museum} — ${lead.role} ${lead.name}`,
    );
  });

  it('B2B relivré sans champ suspect : l’objet reste inchangé', async () => {
    const lead = makeB2bLeadPayload();
    await new EmailB2bLeadNotifier(emailService, 'b2b@museum.test').notify(lead);

    expect(subjectOf(sendEmail)).toBe(`[Musaium B2B] ${lead.museum} — ${lead.role} ${lead.name}`);
  });
});
