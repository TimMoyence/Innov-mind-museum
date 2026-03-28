import {
  LLMCircuitBreaker,
  CircuitOpenError,
} from '@modules/chat/adapters/secondary/llm-circuit-breaker';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('LLMCircuitBreaker', () => {
  let breaker: LLMCircuitBreaker;

  beforeEach(() => {
    jest.useFakeTimers();
    breaker = new LLMCircuitBreaker({
      failureThreshold: 5,
      windowMs: 60_000,
      openDurationMs: 30_000,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('CLOSED — allows calls through', async () => {
    const result = await breaker.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(breaker.state).toBe('CLOSED');
  });

  it('5 failures within window → transitions to OPEN', () => {
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure();
    }
    expect(breaker.state).toBe('OPEN');
  });

  it('OPEN → throws CircuitOpenError immediately', async () => {
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure();
    }

    expect(breaker.state).toBe('OPEN');
    await expect(breaker.execute(() => Promise.resolve('should not run'))).rejects.toThrow(
      CircuitOpenError,
    );
  });

  it('OPEN → after openDurationMs → transitions to HALF_OPEN', () => {
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure();
    }
    expect(breaker.state).toBe('OPEN');

    jest.advanceTimersByTime(30_000);
    expect(breaker.state).toBe('HALF_OPEN');
  });

  it('HALF_OPEN + success → transitions back to CLOSED', () => {
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure();
    }
    jest.advanceTimersByTime(30_000);
    expect(breaker.state).toBe('HALF_OPEN');

    breaker.recordSuccess();
    expect(breaker.state).toBe('CLOSED');
  });

  it('HALF_OPEN + failure → transitions back to OPEN', () => {
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure();
    }
    jest.advanceTimersByTime(30_000);
    expect(breaker.state).toBe('HALF_OPEN');

    breaker.recordFailure();
    expect(breaker.state).toBe('OPEN');
  });

  it('failures expire after windowMs', () => {
    for (let i = 0; i < 4; i++) {
      breaker.recordFailure();
    }
    expect(breaker.state).toBe('CLOSED');

    // Advance past the window so the first 4 failures expire
    jest.advanceTimersByTime(61_000);

    // One more failure — should NOT trip (only 1 in window)
    breaker.recordFailure();
    expect(breaker.state).toBe('CLOSED');
  });

  it('reset() returns to CLOSED', () => {
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure();
    }
    expect(breaker.state).toBe('OPEN');

    breaker.reset();
    expect(breaker.state).toBe('CLOSED');
  });

  it('execute() records failure and rethrows on fn rejection', async () => {
    const error = new Error('LLM unavailable');

    await expect(breaker.execute(() => Promise.reject(error))).rejects.toThrow('LLM unavailable');

    // Should have recorded the failure
    // 4 more to trip
    for (let i = 0; i < 4; i++) {
      breaker.recordFailure();
    }
    expect(breaker.state).toBe('OPEN');
  });

  it('execute() in HALF_OPEN succeeds → returns to CLOSED', async () => {
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure();
    }
    jest.advanceTimersByTime(30_000);
    expect(breaker.state).toBe('HALF_OPEN');

    const result = await breaker.execute(() => Promise.resolve('recovered'));
    expect(result).toBe('recovered');
    expect(breaker.state).toBe('CLOSED');
  });
});
