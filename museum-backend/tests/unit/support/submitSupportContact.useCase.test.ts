import { SubmitSupportContactUseCase } from '@modules/support/useCase/contact/submitSupportContact.useCase';

import type { SupportContactNotifier } from '@modules/support/domain/ports/support-contact-notifier.port';

describe('SubmitSupportContactUseCase', () => {
  const notify = jest.fn<Promise<void>, [Parameters<SupportContactNotifier['notify']>[0]]>();
  const notifier: SupportContactNotifier = {
    notify,
  };
  const useCase = new SubmitSupportContactUseCase(notifier);

  beforeEach(() => {
    notify.mockReset();
    notify.mockResolvedValue(undefined);
  });

  it('forwards a valid support contact payload', async () => {
    await useCase.execute({
      name: 'Ada Lovelace',
      email: 'Ada@example.com',
      message: 'I cannot access my saved tickets from the web support page.',
      fillMs: 30_000,
      ip: '127.0.0.1',
      requestId: 'req-123',
      userAgent: 'Mozilla/5.0',
    });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      message: 'I cannot access my saved tickets from the web support page.',
      suspect: false,
      ip: '127.0.0.1',
      requestId: 'req-123',
      userAgent: 'Mozilla/5.0',
    });
  });

  it('trims fields before forwarding', async () => {
    await useCase.execute({
      name: '  Grace Hopper ',
      email: ' GRACE@EXAMPLE.COM ',
      message: '  Please contact me regarding payment support issue. ',
    });

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Grace Hopper',
        email: 'grace@example.com',
        message: 'Please contact me regarding payment support issue.',
      }),
    );
  });

  it('BOT-CONTACT-2026-11-08 · un champ website fait d’espaces envoie quand même l’e-mail de support', async () => {
    await useCase.execute({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      message: 'I cannot access my saved tickets from the web support page.',
      website: '   ',
    });

    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('BOT-CONTACT-2026-11-08 · un champ website rempli répond comme un envoi normal sans envoyer d’e-mail', async () => {
    await expect(
      useCase.execute({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        message: 'I cannot access my saved tickets from the web support page.',
        website: 'https://spam.example',
      }),
    ).resolves.toBeUndefined();

    expect(notify).not.toHaveBeenCalled();
  });

  it('rejects invalid email', async () => {
    await expect(
      useCase.execute({
        name: 'Ada',
        email: 'not-an-email',
        message: 'This message is long enough to be valid.',
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'email must be valid',
    });
    expect(notify).not.toHaveBeenCalled();
  });

  it('rejects too-short messages', async () => {
    await expect(
      useCase.execute({
        name: 'Ada',
        email: 'ada@example.com',
        message: 'too short',
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'message must be between 10 and 5000 characters',
    });
    expect(notify).not.toHaveBeenCalled();
  });
});
