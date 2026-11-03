const langfuseCtor = jest.fn();

jest.mock(
  'langfuse',
  () => ({
    Langfuse: function Langfuse(cfg: unknown) {
      langfuseCtor(cfg);
      return { trace: jest.fn(), span: jest.fn(), on: jest.fn(), flushAsync: jest.fn() };
    },
  }),
  { virtual: true },
);

describe('RAZ-M1-LANGFUSE', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    langfuseCtor.mockClear();
    process.env.LANGFUSE_ENABLED = 'true';
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-lf-test';
    process.env.LANGFUSE_SECRET_KEY = 'sk-lf-test';
    process.env.LANGFUSE_HOST = 'https://langfuse.invalid';
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it('RAZ-M1-LANGFUSE · une phase vocale se mesure sans ouvrir de client Langfuse, même clés présentes', async () => {
    const { ChatPhaseTimer } = await import('@shared/observability/chat-phase-timer');

    const timer = ChatPhaseTimer.start('stt', 'openai', 'req-raz');
    timer.end('success');

    expect(timer).toBeInstanceOf(ChatPhaseTimer);
    expect(langfuseCtor).not.toHaveBeenCalled();
  });
});
