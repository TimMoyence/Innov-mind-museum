import { ChatPhaseTimer } from '@shared/observability/chat-phase-timer';
import { getLangfuse } from '@shared/observability/langfuse.client';
import {
  chatPhaseDurationSeconds,
  chatPhaseErrorsTotal,
  registry,
} from '@shared/observability/prometheus-metrics';

import { logger } from '@shared/logger/logger';

jest.mock('@shared/observability/langfuse.client', () => ({
  getLangfuse: jest.fn(() => null),
}));

jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const getLangfuseMock = getLangfuse as jest.MockedFunction<typeof getLangfuse>;
const loggerInfoMock = logger.info as jest.MockedFunction<typeof logger.info>;
const loggerWarnMock = logger.warn as jest.MockedFunction<typeof logger.warn>;

describe('ChatPhaseTimer', () => {
  beforeEach(() => {
    registry.resetMetrics();
    getLangfuseMock.mockReset();
    loggerInfoMock.mockReset();
    loggerWarnMock.mockReset();
  });

  it('records the histogram observation on end()', async () => {
    getLangfuseMock.mockReturnValue(null);
    const timer = ChatPhaseTimer.start('llm', 'openai', 'req-1');
    timer.end('success');
    const dump = await registry.metrics();
    expect(dump).toContain(
      'chat_phase_duration_seconds_bucket{le="0.1",phase="llm",provider="openai"}',
    );
    expect(dump).toContain(
      'chat_phase_duration_seconds_count{phase="llm",provider="openai"} 1',
    );
  });

  it('emits chat_phase_complete log with structured fields on success', () => {
    getLangfuseMock.mockReturnValue(null);
    const timer = ChatPhaseTimer.start('tts', 'openai', 'req-2', { model: 'gpt-4o-mini-tts' });
    timer.end('success');
    expect(loggerInfoMock).toHaveBeenCalledWith(
      'chat_phase_complete',
      expect.objectContaining({
        phase: 'tts',
        provider: 'openai',
        requestId: 'req-2',
        outcome: 'success',
        latencyMs: expect.any(Number),
      }),
    );
  });

  it('increments chat_phase_errors_total on outcome=error', async () => {
    getLangfuseMock.mockReturnValue(null);
    const timer = ChatPhaseTimer.start('stt', 'openai', 'req-3');
    timer.end('error', 'timeout');
    const dump = await registry.metrics();
    expect(dump).toContain(
      'chat_phase_errors_total{phase="stt",provider="openai",error_type="timeout"} 1',
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(
      'chat_phase_complete',
      expect.objectContaining({ outcome: 'error', errorType: 'timeout' }),
    );
  });

  it('opens and updates a Langfuse trace via safeTrace when client is present', () => {
    const updateSpy = jest.fn();
    const fakeTrace = { update: updateSpy };
    const fakeClient = { trace: jest.fn().mockReturnValue(fakeTrace) };
    // Cast through unknown — we only honour the subset of the Langfuse API
    // the timer actually calls.
    getLangfuseMock.mockReturnValue(
      fakeClient as unknown as ReturnType<typeof getLangfuse>,
    );

    const timer = ChatPhaseTimer.start('stt', 'openai', 'req-4', {
      model: 'gpt-4o-mini-transcribe',
      metadata: { audioBytes: 12345 },
    });
    timer.end('success');

    expect(fakeClient.trace).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'audio.stt.transcribe',
        metadata: expect.objectContaining({
          phase: 'stt',
          provider: 'openai',
          requestId: 'req-4',
          model: 'gpt-4o-mini-transcribe',
          audioBytes: 12345,
        }),
      }),
    );
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({ outcome: 'success' }),
        metadata: expect.objectContaining({
          latencyMs: expect.any(Number),
          outcome: 'success',
        }),
      }),
    );
  });

  it('does not propagate Langfuse SDK throws (fail-open)', async () => {
    getLangfuseMock.mockReturnValue({
      trace: () => {
        throw new Error('langfuse boom');
      },
    } as unknown as ReturnType<typeof getLangfuse>);

    const timer = ChatPhaseTimer.start('llm', 'openai', 'req-5');
    expect(() => {
      timer.end('success');
    }).not.toThrow();

    const dump = await registry.metrics();
    expect(dump).toContain(
      'chat_phase_duration_seconds_count{phase="llm",provider="openai"} 1',
    );
  });

  it('does not propagate trace.update throws (fail-open)', () => {
    const fakeTrace = {
      update: () => {
        throw new Error('update boom');
      },
    };
    const fakeClient = { trace: jest.fn().mockReturnValue(fakeTrace) };
    getLangfuseMock.mockReturnValue(
      fakeClient as unknown as ReturnType<typeof getLangfuse>,
    );

    const timer = ChatPhaseTimer.start('tts', 'openai', 'req-6');
    expect(() => {
      timer.end('success');
    }).not.toThrow();
  });

  it('end() called twice is a no-op', async () => {
    getLangfuseMock.mockReturnValue(null);
    const timer = ChatPhaseTimer.start('llm', 'openai', 'req-7');
    timer.end('success');
    timer.end('error', 'unknown');

    const dump = await registry.metrics();
    // Histogram count must be 1, not 2 (idempotent).
    expect(dump).toContain(
      'chat_phase_duration_seconds_count{phase="llm",provider="openai"} 1',
    );
    // Error counter must NOT have been bumped by the second call.
    expect(dump).not.toContain(
      'chat_phase_errors_total{phase="llm",provider="openai"',
    );
    // chat_phase_complete log must have been emitted exactly once.
    expect(loggerInfoMock).toHaveBeenCalledTimes(1);
  });

  it('survives a Prom client throw (fail-open via warn log)', () => {
    getLangfuseMock.mockReturnValue(null);
    const observeSpy = jest
      .spyOn(chatPhaseDurationSeconds, 'observe')
      .mockImplementation(() => {
        throw new Error('prom boom');
      });
    try {
      const timer = ChatPhaseTimer.start('llm', 'openai', 'req-8');
      expect(() => {
      timer.end('success');
    }).not.toThrow();
      expect(loggerWarnMock).toHaveBeenCalledWith(
        'chat_phase_metric_drop',
        expect.objectContaining({ phase: 'llm', provider: 'openai', requestId: 'req-8' }),
      );
    } finally {
      observeSpy.mockRestore();
    }
  });

  it('does not bump error counter on success outcome', async () => {
    getLangfuseMock.mockReturnValue(null);
    const incSpy = jest.spyOn(chatPhaseErrorsTotal, 'inc');
    const timer = ChatPhaseTimer.start('llm', 'openai', 'req-9');
    timer.end('success');
    expect(incSpy).not.toHaveBeenCalled();
    incSpy.mockRestore();
  });

  it('honours all default arguments (options omitted, end() with no args)', async () => {
    // Closes the default-parameter branch coverage gap. Exercises:
    //   start(phase, provider, requestId)         — options=`{}`
    //   end()                                      — outcome=`'success'`, errorType=`'unknown'`
    getLangfuseMock.mockReturnValue(null);
    const timer = ChatPhaseTimer.start('llm', 'openai', 'req-defaults');
    timer.end();
    const dump = await registry.metrics();
    expect(dump).toContain(
      'chat_phase_duration_seconds_count{phase="llm",provider="openai"} 1',
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(
      'chat_phase_complete',
      expect.objectContaining({ outcome: 'success' }),
    );
  });
});
