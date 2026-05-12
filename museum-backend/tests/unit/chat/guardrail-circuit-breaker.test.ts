import { GuardrailCircuitBreaker } from '@modules/chat/adapters/secondary/guardrails/guardrail-circuit-breaker';
import { logger } from '@shared/logger/logger';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const loggerInfo = logger.info as unknown as jest.Mock;
const loggerWarn = logger.warn as unknown as jest.Mock;

describe('GuardrailCircuitBreaker', () => {
  beforeEach(() => {
    loggerInfo.mockClear();
    loggerWarn.mockClear();
    // Scrub env to avoid contamination from the host shell.
    delete process.env.LLM_GUARD_CB_FAILURE_THRESHOLD;
    delete process.env.LLM_GUARD_CB_WINDOW_MS;
    delete process.env.LLM_GUARD_CB_OPEN_DURATION_MS;
    delete process.env.LLM_GUARD_CB_HALF_OPEN_MAX_PROBES;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initial state is CLOSED', () => {
    const breaker = new GuardrailCircuitBreaker();
    expect(breaker.state).toBe('CLOSED');
    const snapshot = breaker.getState();
    expect(snapshot.state).toBe('CLOSED');
    expect(snapshot.failureCount).toBe(0);
    expect(snapshot.lastFailureAt).toBeNull();
    expect(snapshot.openedAt).toBeNull();
  });

  it('recordFailure × threshold within window trips OPEN with log + callback', () => {
    const onStateChange = jest.fn();
    const breaker = new GuardrailCircuitBreaker({
      failureThreshold: 5,
      windowMs: 60_000,
      openDurationMs: 30_000,
      onStateChange,
    });

    for (let i = 0; i < 5; i += 1) breaker.recordFailure();

    expect(breaker.state).toBe('OPEN');
    expect(onStateChange).toHaveBeenCalledWith('OPEN', 'CLOSED');
    expect(loggerWarn).toHaveBeenCalledWith(
      'llm_guard_circuit_breaker_open',
      expect.objectContaining({
        failureCount: 5,
        windowMs: 60_000,
        from: 'closed',
      }),
    );
  });

  it('old failures outside the sliding window are pruned', () => {
    const breaker = new GuardrailCircuitBreaker({
      failureThreshold: 5,
      windowMs: 1_000,
      openDurationMs: 30_000,
    });

    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.state).toBe('CLOSED');

    jest.advanceTimersByTime(1_500);

    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.state).toBe('CLOSED');
    expect(breaker.getState().failureCount).toBe(2);
  });

  it('canAttempt returns false in OPEN', () => {
    const breaker = new GuardrailCircuitBreaker({
      failureThreshold: 2,
      windowMs: 60_000,
      openDurationMs: 30_000,
    });

    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.state).toBe('OPEN');
    expect(breaker.canAttempt()).toBe(false);
  });

  it('OPEN → HALF_OPEN lazy transition after openDurationMs with log carrying openedAt + windowMs', () => {
    const breaker = new GuardrailCircuitBreaker({
      failureThreshold: 2,
      windowMs: 60_000,
      openDurationMs: 5_000,
    });
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.state).toBe('OPEN');
    const openedAtIso = breaker.getState().openedAt!.toISOString();

    jest.advanceTimersByTime(5_001);

    expect(breaker.state).toBe('HALF_OPEN');
    expect(loggerInfo).toHaveBeenCalledWith(
      'llm_guard_circuit_breaker_half_open',
      expect.objectContaining({
        openedAt: openedAtIso,
        windowMs: 60_000,
      }),
    );
  });

  it('halfOpenMaxProbes=1 admits one probe then short-circuits until verdict', () => {
    const breaker = new GuardrailCircuitBreaker({
      failureThreshold: 2,
      windowMs: 60_000,
      openDurationMs: 5_000,
      halfOpenMaxProbes: 1,
    });
    breaker.recordFailure();
    breaker.recordFailure();
    jest.advanceTimersByTime(5_001);
    expect(breaker.state).toBe('HALF_OPEN');

    // First call wins the probe slot.
    expect(breaker.canAttempt()).toBe(true);
    // Second call no longer has a slot — must short-circuit.
    expect(breaker.canAttempt()).toBe(false);

    // Probe succeeds → CLOSED, slot restored.
    breaker.recordSuccess();
    expect(breaker.state).toBe('CLOSED');
    expect(breaker.canAttempt()).toBe(true);
  });

  it('HALF_OPEN + recordSuccess → CLOSED, failures cleared, log close with probeDurationMs', () => {
    const breaker = new GuardrailCircuitBreaker({
      failureThreshold: 2,
      windowMs: 60_000,
      openDurationMs: 5_000,
    });
    breaker.recordFailure();
    breaker.recordFailure();
    jest.advanceTimersByTime(5_001);
    expect(breaker.state).toBe('HALF_OPEN'); // triggers the half_open transition that sets halfOpenedAt

    // Advance fake timers so probeDurationMs is a stable, asserted value.
    jest.advanceTimersByTime(123);
    breaker.recordSuccess();

    expect(breaker.state).toBe('CLOSED');
    expect(breaker.getState().failureCount).toBe(0);
    expect(loggerInfo).toHaveBeenCalledWith(
      'llm_guard_circuit_breaker_close',
      expect.objectContaining({ probeDurationMs: 123 }),
    );
  });

  it('HALF_OPEN + recordFailure → OPEN, openedAt updated, log from:half_open', () => {
    const breaker = new GuardrailCircuitBreaker({
      failureThreshold: 2,
      windowMs: 60_000,
      openDurationMs: 5_000,
    });
    breaker.recordFailure();
    breaker.recordFailure();
    const firstOpenedAt = breaker.getState().openedAt;
    expect(firstOpenedAt).not.toBeNull();

    jest.advanceTimersByTime(5_001);
    expect(breaker.state).toBe('HALF_OPEN');

    loggerWarn.mockClear();
    breaker.recordFailure();

    expect(breaker.state).toBe('OPEN');
    const secondSnapshot = breaker.getState();
    expect(secondSnapshot.openedAt).not.toBeNull();
    expect(secondSnapshot.openedAt!.getTime()).toBeGreaterThan(firstOpenedAt!.getTime());
    expect(loggerWarn).toHaveBeenCalledWith(
      'llm_guard_circuit_breaker_open',
      expect.objectContaining({ from: 'half_open' }),
    );
  });

  it('env override LLM_GUARD_CB_FAILURE_THRESHOLD is honoured', () => {
    process.env.LLM_GUARD_CB_FAILURE_THRESHOLD = '3';
    const breaker = new GuardrailCircuitBreaker();

    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.state).toBe('CLOSED');
    breaker.recordFailure();
    expect(breaker.state).toBe('OPEN');
  });

  it('bad env values fall back to the safe default (5)', () => {
    for (const bad of ['abc', '-1', '0', '']) {
      process.env.LLM_GUARD_CB_FAILURE_THRESHOLD = bad;
      const breaker = new GuardrailCircuitBreaker();

      // Should NOT trip at 1, 2, 3, 4 failures — default is 5.
      for (let i = 0; i < 4; i += 1) breaker.recordFailure();
      expect(breaker.state).toBe('CLOSED');

      breaker.recordFailure();
      expect(breaker.state).toBe('OPEN');
    }
  });

  it('reset() clears state and notifies onStateChange', () => {
    const onStateChange = jest.fn();
    const breaker = new GuardrailCircuitBreaker({
      failureThreshold: 2,
      windowMs: 60_000,
      openDurationMs: 30_000,
      onStateChange,
    });
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.state).toBe('OPEN');
    onStateChange.mockClear();

    breaker.reset();

    expect(breaker.state).toBe('CLOSED');
    const snapshot = breaker.getState();
    expect(snapshot.failureCount).toBe(0);
    expect(snapshot.openedAt).toBeNull();
    expect(onStateChange).toHaveBeenCalledWith('CLOSED', 'OPEN');
  });
});
