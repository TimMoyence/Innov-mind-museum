import { MicrosoftPresidioAdapter } from '@modules/chat/adapters/secondary/guardrails/presidio.adapter';
import { logger } from '@shared/logger/logger';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const loggerWarn = logger.warn as unknown as jest.Mock;

/**
 * Build a fetch mock whose response chain mirrors the Presidio service
 * pair: first call → `/analyze` (returns array of entities), optional
 * second call → `/anonymize` (returns `{ text: redacted }`).
 * @param responses
 */
const makeFetchSequence = (responses: Partial<Response>[]): jest.Mock => {
  const mock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
  for (const r of responses) {
    mock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
      ...r,
    } as Response);
  }
  return mock;
};

const buildAdapter = (
  fetchFn: jest.Mock,
  overrides: Partial<{
    baseUrl: string;
    timeoutMs: number;
    blockThreshold: number;
    scoreThreshold: number;
  }> = {},
) =>
  new MicrosoftPresidioAdapter({
    baseUrl: overrides.baseUrl ?? 'http://presidio:3000',
    timeoutMs: overrides.timeoutMs ?? 500,
    fetchFn: fetchFn as unknown as typeof fetch,
    ...(overrides.blockThreshold !== undefined ? { blockThreshold: overrides.blockThreshold } : {}),
    ...(overrides.scoreThreshold !== undefined ? { scoreThreshold: overrides.scoreThreshold } : {}),
  });

describe('MicrosoftPresidioAdapter identity (ADR-048 port contract)', () => {
  it('exposes stable name and version stamps', () => {
    const adapter = buildAdapter(makeFetchSequence([]));
    expect(adapter.name).toBe('microsoft-presidio');
    expect(adapter.version).toMatch(/^presidio-/);
  });

  it('strips trailing slash from baseUrl', async () => {
    const fetchFn = makeFetchSequence([{ json: async () => [] }]);
    const adapter = buildAdapter(fetchFn, { baseUrl: 'http://presidio:3000/' });
    await adapter.checkInput({ text: 'hi' });
    expect(fetchFn).toHaveBeenCalledWith(
      'http://presidio:3000/analyze',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('MicrosoftPresidioAdapter.checkInput', () => {
  beforeEach(() => {
    loggerWarn.mockClear();
  });

  it('returns allow=true when no PII entities detected', async () => {
    const fetchFn = makeFetchSequence([{ json: async () => [] }]);
    const adapter = buildAdapter(fetchFn);

    const decision = await adapter.checkInput({ text: 'who painted the mona lisa?' });

    expect(decision.allow).toBe(true);
    expect(decision.reason).toBeUndefined();
    expect(decision.providedBy).toEqual({ name: 'microsoft-presidio', version: adapter.version });
    // Only /analyze should have been hit — no anonymize on clean input.
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('returns allow=false with reason=pii when a high-confidence entity is detected', async () => {
    const fetchFn = makeFetchSequence([
      {
        json: async () => [{ entity_type: 'CREDIT_CARD', start: 0, end: 16, score: 0.99 }],
      },
    ]);
    const adapter = buildAdapter(fetchFn);

    const decision = await adapter.checkInput({ text: '4111111111111111' });

    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('pii');
    expect(decision.confidence).toBeCloseTo(0.99);
    // Block path must NOT call /anonymize — that's only for redaction.
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('returns allow=true with redactedText for low-confidence entities', async () => {
    const fetchFn = makeFetchSequence([
      // /analyze finds a PERSON entity with mid score (below default 0.85 block)
      {
        json: async () => [{ entity_type: 'PERSON', start: 8, end: 14, score: 0.6 }],
      },
      // /anonymize returns the redacted text
      {
        json: async () => ({ text: 'who is <REDACTED>?' }),
      },
    ]);
    const adapter = buildAdapter(fetchFn);

    const decision = await adapter.checkInput({ text: 'who is Banksy?' });

    expect(decision.allow).toBe(true);
    expect(decision.redactedText).toBe('who is <REDACTED>?');
    expect(decision.confidence).toBeCloseTo(0.6);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('blocks when ANY entity in the response exceeds blockThreshold', async () => {
    const fetchFn = makeFetchSequence([
      {
        json: async () => [
          { entity_type: 'PERSON', start: 0, end: 4, score: 0.4 },
          { entity_type: 'EMAIL_ADDRESS', start: 20, end: 36, score: 0.95 },
        ],
      },
    ]);
    const adapter = buildAdapter(fetchFn);

    const decision = await adapter.checkInput({ text: 'John mail: foo@bar.com' });

    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('pii');
    expect(decision.confidence).toBeCloseTo(0.95);
  });

  it('forwards locale (stripped to 2-letter code) as Presidio language', async () => {
    const fetchFn = makeFetchSequence([{ json: async () => [] }]);
    const adapter = buildAdapter(fetchFn);

    await adapter.checkInput({ text: 'bonjour', locale: 'fr-FR' });

    const [, init] = fetchFn.mock.calls[0];
    const body = JSON.parse(init?.body as string) as { language: string };
    expect(body.language).toBe('fr');
  });

  it('defaults to language=en when no locale provided', async () => {
    const fetchFn = makeFetchSequence([{ json: async () => [] }]);
    const adapter = buildAdapter(fetchFn);

    await adapter.checkInput({ text: 'hello' });

    const [, init] = fetchFn.mock.calls[0];
    const body = JSON.parse(init?.body as string) as { language: string };
    expect(body.language).toBe('en');
  });
});

describe('MicrosoftPresidioAdapter fail-CLOSED contract (ADR-047)', () => {
  beforeEach(() => {
    loggerWarn.mockClear();
  });

  it('fails CLOSED on HTTP 500 from /analyze', async () => {
    const fetchFn = makeFetchSequence([{ ok: false, status: 500 }]);
    const adapter = buildAdapter(fetchFn);

    const decision = await adapter.checkInput({ text: 'hello' });

    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('service_unavailable');
    expect(loggerWarn).toHaveBeenCalledWith(
      'presidio_fail_closed',
      expect.objectContaining({ op: 'analyze' }),
    );
  });

  it('fails CLOSED on malformed /analyze response (not an array)', async () => {
    const fetchFn = makeFetchSequence([{ json: async () => ({ wrong: 'shape' }) }]);
    const adapter = buildAdapter(fetchFn);

    const decision = await adapter.checkInput({ text: 'hello' });

    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('service_unavailable');
  });

  it('fails CLOSED on network error', async () => {
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<typeof fetch>>()
      .mockRejectedValue(new Error('ECONNREFUSED'));
    const adapter = buildAdapter(fetchFn);

    const decision = await adapter.checkInput({ text: 'hello' });

    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('service_unavailable');
  });

  it('fails CLOSED on AbortError (timeout)', async () => {
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<typeof fetch>>()
      .mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const adapter = buildAdapter(fetchFn);

    const decision = await adapter.checkInput({ text: 'hello' });

    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('service_unavailable');
  });

  it('fails CLOSED if /anonymize fails after low-confidence /analyze hit', async () => {
    const fetchFn = makeFetchSequence([
      {
        json: async () => [{ entity_type: 'PERSON', start: 0, end: 4, score: 0.6 }],
      },
      { ok: false, status: 503 },
    ]);
    const adapter = buildAdapter(fetchFn);

    const decision = await adapter.checkInput({ text: 'John drew this' });

    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('service_unavailable');
    expect(loggerWarn).toHaveBeenCalledWith(
      'presidio_fail_closed',
      expect.objectContaining({ op: 'anonymize' }),
    );
  });

  it('NEVER returns allow:true on error path (failure-mode regression pin)', async () => {
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<typeof fetch>>()
      .mockRejectedValue(new Error('any error'));
    const adapter = buildAdapter(fetchFn);

    const inputDecision = await adapter.checkInput({ text: 'hi' });
    const outputDecision = await adapter.checkOutput({ text: 'hello back' });

    expect(inputDecision.allow).toBe(false);
    expect(outputDecision.allow).toBe(false);
  });
});

describe('MicrosoftPresidioAdapter.checkOutput', () => {
  it('passes the assistant text to /analyze (symmetric with checkInput)', async () => {
    const fetchFn = makeFetchSequence([{ json: async () => [] }]);
    const adapter = buildAdapter(fetchFn);

    await adapter.checkOutput({ text: 'the painting depicts a landscape', locale: 'en' });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://presidio:3000/analyze');
    const body = JSON.parse(init?.body as string) as { text: string; language: string };
    expect(body.text).toBe('the painting depicts a landscape');
    expect(body.language).toBe('en');
  });
});

describe('MicrosoftPresidioAdapter.health()', () => {
  it('returns status=up + latency on successful probe', async () => {
    const fetchFn = makeFetchSequence([{ json: async () => [] }]);
    const adapter = buildAdapter(fetchFn);

    const health = await adapter.health();

    expect(health.status).toBe('up');
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    expect(new Date(health.lastCheckedAt).getTime()).not.toBeNaN();
  });

  it('returns status=down on network error during probe', async () => {
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<typeof fetch>>()
      .mockRejectedValue(new Error('ECONNREFUSED'));
    const adapter = buildAdapter(fetchFn);

    const health = await adapter.health();

    expect(health.status).toBe('down');
    expect(health.detail).toContain('ECONNREFUSED');
  });

  it('returns status=degraded on malformed probe response (200 but not an array)', async () => {
    const fetchFn = makeFetchSequence([{ json: async () => ({ not: 'an array' }) }]);
    const adapter = buildAdapter(fetchFn);

    const health = await adapter.health();
    // Either degraded or down is acceptable for a malformed-but-200 response;
    // contract says "not up". Pin the negation.
    expect(health.status).not.toBe('up');
  });
});

describe('MicrosoftPresidioAdapter.metrics()', () => {
  it('starts at zero', () => {
    const adapter = buildAdapter(makeFetchSequence([]));
    expect(adapter.metrics()).toEqual({ requests: 0, blocks: 0, errors: 0 });
  });

  it('increments requests on each scan', async () => {
    const fetchFn = makeFetchSequence([{ json: async () => [] }, { json: async () => [] }]);
    const adapter = buildAdapter(fetchFn);

    await adapter.checkInput({ text: 'one' });
    await adapter.checkInput({ text: 'two' });

    const snap = adapter.metrics();
    expect(snap.requests).toBe(2);
    expect(snap.blocks).toBe(0);
    expect(snap.errors).toBe(0);
  });

  it('increments blocks + errors on fail-CLOSED scan', async () => {
    const fetchFn = makeFetchSequence([{ ok: false, status: 500 }]);
    const adapter = buildAdapter(fetchFn);

    await adapter.checkInput({ text: 'hello' });

    const snap = adapter.metrics();
    expect(snap.requests).toBe(1);
    expect(snap.blocks).toBe(1);
    expect(snap.errors).toBe(1);
  });

  it('increments blocks on a high-confidence PII detection', async () => {
    const fetchFn = makeFetchSequence([
      { json: async () => [{ entity_type: 'EMAIL_ADDRESS', start: 0, end: 16, score: 0.99 }] },
    ]);
    const adapter = buildAdapter(fetchFn);

    await adapter.checkInput({ text: 'foo@bar.com here' });

    const snap = adapter.metrics();
    expect(snap.requests).toBe(1);
    expect(snap.blocks).toBe(1);
    expect(snap.errors).toBe(0);
  });
});
