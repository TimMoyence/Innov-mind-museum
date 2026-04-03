import { BrevoEmailService } from '@shared/email/brevo-email.service';

// ── Mock global fetch ─────────────────────────────────────────────────

const mockFetch = jest.fn<Promise<Response>, [string | URL, RequestInit?]>();

beforeEach(() => {
  jest.clearAllMocks();
  globalThis.fetch = mockFetch as typeof globalThis.fetch;
});

// ── Helpers ───────────────────────────────────────────────────────────

function makeOkResponse(): Response {
  return {
    ok: true,
    status: 200,
    text: jest.fn().mockResolvedValue(''),
  } as unknown as Response;
}

function makeErrorResponse(status: number, body: string): Response {
  return {
    ok: false,
    status,
    text: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('BrevoEmailService', () => {
  const API_KEY = 'xkeysib-test-api-key';
  const service = new BrevoEmailService(API_KEY);

  describe('sendEmail', () => {
    it('sends a transactional email with correct headers and body', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse());

      await service.sendEmail('visitor@example.com', 'Welcome', '<h1>Hello</h1>');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.brevo.com/v3/smtp/email');
      expect(init?.method).toBe('POST');

      const headers = init?.headers as Record<string, string>;
      expect(headers['api-key']).toBe(API_KEY);
      expect(headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(init?.body as string) as {
        sender: { name: string; email: string };
        to: Array<{ email: string }>;
        subject: string;
        htmlContent: string;
      };
      expect(body.sender).toEqual({ name: 'Musaium', email: 'no-reply@musaium.com' });
      expect(body.to).toEqual([{ email: 'visitor@example.com' }]);
      expect(body.subject).toBe('Welcome');
      expect(body.htmlContent).toBe('<h1>Hello</h1>');
    });

    it('resolves without error on successful send', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse());

      await expect(
        service.sendEmail('user@test.com', 'Subject', '<p>Body</p>'),
      ).resolves.toBeUndefined();
    });

    it('throws on non-ok response with status and truncated body', async () => {
      mockFetch.mockResolvedValueOnce(
        makeErrorResponse(400, '{"code":"invalid_parameter","message":"Bad email"}'),
      );

      await expect(service.sendEmail('bad@test.com', 'Subject', '<p>Body</p>')).rejects.toThrow(
        'Brevo email failed (400)',
      );
    });

    it('throws on 500 server error', async () => {
      mockFetch.mockResolvedValueOnce(makeErrorResponse(500, 'Internal Server Error'));

      await expect(service.sendEmail('user@test.com', 'Subject', '<p>Body</p>')).rejects.toThrow(
        'Brevo email failed (500)',
      );
    });

    it('includes error body snippet in thrown error message', async () => {
      const longBody = 'x'.repeat(300);
      mockFetch.mockResolvedValueOnce(makeErrorResponse(422, longBody));

      await expect(service.sendEmail('user@test.com', 'Subject', '<p>Body</p>')).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('x'.repeat(200)),
        }),
      );
    });

    it('handles fetch network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.sendEmail('user@test.com', 'Subject', '<p>Body</p>')).rejects.toThrow(
        'Network error',
      );
    });

    it('handles response.text() failure gracefully', async () => {
      const response = {
        ok: false,
        status: 503,
        text: jest.fn().mockRejectedValue(new Error('stream error')),
      } as unknown as Response;
      mockFetch.mockResolvedValueOnce(response);

      await expect(service.sendEmail('user@test.com', 'Subject', '<p>Body</p>')).rejects.toThrow(
        'Brevo email failed (503): ',
      );
    });

    it('preserves HTML content as-is in the request body', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse());

      const html = '<p>Special chars: &amp; &lt;script&gt; "quotes"</p>';
      await service.sendEmail('user@test.com', 'Subject', html);

      const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string) as {
        htmlContent: string;
      };
      expect(body.htmlContent).toBe(html);
    });
  });
});
