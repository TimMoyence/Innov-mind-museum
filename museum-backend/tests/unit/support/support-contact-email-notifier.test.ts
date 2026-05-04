import {
  EmailSupportContactNotifier,
  NoopSupportContactNotifier,
} from '@modules/support/adapters/secondary/notifier/support-contact-email.notifier';
import type { EmailService } from '@shared/email/email.port';
import type { SupportContactPayload } from '@modules/support/domain/ports/support-contact-notifier.port';

jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { logger } = jest.requireMock('@shared/logger/logger') as {
  logger: { info: jest.Mock; warn: jest.Mock; error: jest.Mock };
};

const makePayload = (overrides: Partial<SupportContactPayload> = {}): SupportContactPayload => ({
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  message: 'I have a question about the exhibit.',
  ...overrides,
});

describe('EmailSupportContactNotifier', () => {
  let sendEmail: jest.Mock;
  let emailService: EmailService;
  let notifier: EmailSupportContactNotifier;

  beforeEach(() => {
    sendEmail = jest.fn().mockResolvedValue(undefined);
    emailService = { sendEmail };
    notifier = new EmailSupportContactNotifier(emailService, 'support@museum.test');
  });

  it('sends email with correct recipient and subject', async () => {
    await notifier.notify(makePayload());

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      'support@museum.test',
      '[Musaium Support] Ada Lovelace <ada@example.com>',
      expect.any(String),
    );
  });

  it('escapes HTML special characters in name, email, and message', async () => {
    const payload = makePayload({
      name: '<script>alert("xss")</script>',
      email: 'user&co@"test\'.com',
      message: 'Test & verify <b>bold</b> "quotes" \'single\'',
    });

    await notifier.notify(payload);

    const html = sendEmail.mock.calls[0][2] as string;
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(html).toContain('user&amp;co@&quot;test&#39;.com');
    expect(html).toContain(
      'Test &amp; verify &lt;b&gt;bold&lt;/b&gt; &quot;quotes&quot; &#39;single&#39;',
    );
    // Verify no raw HTML special characters leaked through
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>bold</b>');
  });

  it('replaces newlines with <br/> in message', async () => {
    const payload = makePayload({
      message: 'Line one\nLine two\nLine three',
    });

    await notifier.notify(payload);

    const html = sendEmail.mock.calls[0][2] as string;
    expect(html).toContain('Line one<br/>Line two<br/>Line three');
  });

  it('truncates subject to 200 characters', async () => {
    const longName = 'A'.repeat(250);
    const payload = makePayload({ name: longName });

    await notifier.notify(payload);

    const subject = sendEmail.mock.calls[0][1] as string;
    expect(subject.length).toBeLessThanOrEqual(200);
  });

  it('includes all HTML sections in output', async () => {
    await notifier.notify(makePayload());

    const html = sendEmail.mock.calls[0][2] as string;
    expect(html).toContain('<h2>New Musaium Support Contact</h2>');
    expect(html).toContain('<strong>Name:</strong>');
    expect(html).toContain('<strong>Email:</strong>');
    expect(html).toContain('<strong>Request ID:</strong>');
    expect(html).toContain('<strong>IP:</strong>');
    expect(html).toContain('<strong>User-Agent:</strong>');
    expect(html).toContain('<hr/>');
  });

  it('uses "unknown" for missing ip and userAgent, "n/a" for requestId', async () => {
    const payload = makePayload({
      ip: undefined,
      requestId: undefined,
      userAgent: undefined,
    });

    await notifier.notify(payload);

    const html = sendEmail.mock.calls[0][2] as string;
    expect(html).toContain('unknown'); // ip and userAgent default
    expect(html).toContain('n/a'); // requestId default
  });

  it('uses provided optional fields when present', async () => {
    const payload = makePayload({
      ip: '192.168.1.1',
      requestId: 'req-abc-123',
      userAgent: 'TestAgent/1.0',
    });

    await notifier.notify(payload);

    const html = sendEmail.mock.calls[0][2] as string;
    expect(html).toContain('192.168.1.1');
    expect(html).toContain('req-abc-123');
    expect(html).toContain('TestAgent/1.0');
  });

  it('escapes ampersand in all five positions', async () => {
    const payload = makePayload({
      name: 'R&D',
      email: 'r&d@test.com',
      message: 'Testing & verifying',
    });

    await notifier.notify(payload);

    const html = sendEmail.mock.calls[0][2] as string;
    expect(html).toContain('R&amp;D');
    expect(html).toContain('r&amp;d@test.com');
    expect(html).toContain('Testing &amp; verifying');
  });
});

describe('NoopSupportContactNotifier', () => {
  const notifier = new NoopSupportContactNotifier();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves without throwing', async () => {
    await expect(notifier.notify(makePayload())).resolves.toBeUndefined();
  });

  it('logs a warning with requestId and hasIp info', async () => {
    await notifier.notify(makePayload({ requestId: 'req-42', ip: '10.0.0.1' }));

    expect(logger.warn).toHaveBeenCalledWith('support_contact_notifier_noop', {
      requestId: 'req-42',
      hasIp: true,
    });
  });

  it('logs hasIp as false when ip is undefined', async () => {
    await notifier.notify(makePayload({ ip: undefined }));

    expect(logger.warn).toHaveBeenCalledWith(
      'support_contact_notifier_noop',
      expect.objectContaining({ hasIp: false }),
    );
  });
});
