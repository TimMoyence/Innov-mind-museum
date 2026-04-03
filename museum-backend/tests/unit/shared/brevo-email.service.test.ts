import { BrevoEmailService } from '@shared/email/brevo-email.service';

describe('BrevoEmailService', () => {
  const apiKey = 'xkeysib-test-key';
  let service: BrevoEmailService;

  beforeEach(() => {
    service = new BrevoEmailService(apiKey);
    jest.restoreAllMocks();
  });

  it('sends email with correct payload on success', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 201 }));

    await service.sendEmail('user@example.com', 'Welcome', '<h1>Hello</h1>');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.brevo.com/v3/smtp/email',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
        },
      }),
    );

    const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      sender: { name: 'Musaium', email: 'no-reply@musaium.com' },
      to: [{ email: 'user@example.com' }],
      subject: 'Welcome',
      htmlContent: '<h1>Hello</h1>',
    });
  });

  it('throws on non-OK response with status and body excerpt', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"code":"unauthorized","message":"invalid key"}', {
        status: 401,
      }),
    );

    await expect(service.sendEmail('a@b.com', 'Subj', '<p>Hi</p>')).rejects.toThrow(
      /Brevo email failed \(401\)/,
    );
  });

  it('handles non-OK response with unreadable body gracefully', async () => {
    const badResponse = new Response(null, { status: 500 });
    jest.spyOn(badResponse, 'text').mockRejectedValue(new Error('read err'));
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(badResponse);

    await expect(service.sendEmail('a@b.com', 'S', '<p>x</p>')).rejects.toThrow(
      /Brevo email failed \(500\)/,
    );
  });
});
