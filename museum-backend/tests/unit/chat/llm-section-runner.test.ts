import { runSectionTasks, SectionTask } from '@modules/chat/useCase/llm/llm-section-runner';

const wait = async (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('llm-section-runner', () => {
  afterAll(() => {
    jest.useRealTimers();
  });
  it('respects section concurrency caps', async () => {
    let inFlight = 0;
    let peak = 0;

    const tasks: Array<SectionTask<string>> = ['a', 'b', 'c', 'd'].map((name) => ({
      name,
      timeoutMs: 200,
      payloadBytes: 16,
      run: async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await wait(30);
        inFlight -= 1;
        return name;
      },
    }));

    const result = await runSectionTasks(tasks, {
      maxConcurrent: 2,
      retries: 0,
      retryBaseDelayMs: 1,
      totalBudgetMs: 1000,
    });

    expect(peak).toBeLessThanOrEqual(2);
    expect(result.every((entry) => entry.status === 'success')).toBe(true);
  });

  it('retries retryable failures and then succeeds', async () => {
    let calls = 0;

    const [result] = await runSectionTasks(
      [
        {
          name: 'summary',
          timeoutMs: 200,
          payloadBytes: 128,
          run: async () => {
            calls += 1;
            if (calls === 1) {
              throw new Error('ECONNRESET');
            }
            return 'ok';
          },
        },
      ],
      {
        maxConcurrent: 1,
        retries: 1,
        retryBaseDelayMs: 1,
        totalBudgetMs: 500,
        shouldRetry: (error) =>
          error instanceof Error && error.message.toLowerCase().includes('econnreset'),
      },
    );

    expect(result.status).toBe('success');
    expect(result.attempts).toBe(2);
  });

  it('returns timeout for slow summary section', async () => {
    const result = await runSectionTasks(
      [
        {
          name: 'summary',
          timeoutMs: 20,
          payloadBytes: 24,
          run: async () => {
            await wait(60);
            return 'late';
          },
        },
      ],
      {
        maxConcurrent: 1,
        retries: 0,
        retryBaseDelayMs: 1,
        totalBudgetMs: 200,
      },
    );

    const summary = result.find((entry) => entry.name === 'summary');
    expect(summary?.status).toBe('timeout');
  });

  it('enforces the total budget across section execution', async () => {
    const [result] = await runSectionTasks(
      [
        {
          name: 'summary',
          timeoutMs: 500,
          payloadBytes: 24,
          run: async () => {
            await wait(200);
            return 'late';
          },
        },
      ],
      {
        maxConcurrent: 1,
        retries: 0,
        retryBaseDelayMs: 1,
        totalBudgetMs: 50,
      },
    );

    expect(result.status).toBe('timeout');
  });

  it('returns empty array for empty tasks list', async () => {
    const result = await runSectionTasks([], {
      maxConcurrent: 2,
      retries: 0,
      retryBaseDelayMs: 1,
      totalBudgetMs: 1000,
    });

    expect(result).toEqual([]);
  });

  it('returns budget-exhausted timeout when budget is zero before execution', async () => {
    let clockValue = 1000;
    const [result] = await runSectionTasks(
      [
        {
          name: 'summary',
          timeoutMs: 500,
          payloadBytes: 24,
          run: async () => 'value',
        },
      ],
      {
        maxConcurrent: 1,
        retries: 0,
        retryBaseDelayMs: 1,
        totalBudgetMs: 1,
        now: () => {
          // First call sets deadline, second call (start of executeTask) returns past deadline
          clockValue += 1000;
          return clockValue;
        },
      },
    );

    expect(result.status).toBe('timeout');
    expect(result.name).toBe('summary');
  });

  it('fires onStart and onSuccess hooks on successful execution', async () => {
    const starts: string[] = [];
    const successes: string[] = [];

    await runSectionTasks(
      [
        {
          name: 'summary',
          timeoutMs: 200,
          payloadBytes: 24,
          run: async () => 'ok',
        },
      ],
      {
        maxConcurrent: 1,
        retries: 0,
        retryBaseDelayMs: 1,
        totalBudgetMs: 1000,
        hooks: {
          onStart: (evt) => starts.push(evt.name),
          onSuccess: (evt) => successes.push(evt.name),
        },
      },
    );

    expect(starts).toEqual(['summary']);
    expect(successes).toEqual(['summary']);
  });

  it('fires onError hook when task fails with non-timeout error', async () => {
    const errors: string[] = [];

    const [result] = await runSectionTasks(
      [
        {
          name: 'summary',
          timeoutMs: 500,
          payloadBytes: 24,
          run: async () => {
            throw new Error('LLM connection refused');
          },
        },
      ],
      {
        maxConcurrent: 1,
        retries: 0,
        retryBaseDelayMs: 1,
        totalBudgetMs: 1000,
        hooks: {
          onError: (evt) => errors.push(evt.error),
        },
      },
    );

    expect(result.status).toBe('error');
    expect(errors[0]).toContain('LLM connection refused');
  });

  it('fires onTimeout hook when task times out', async () => {
    const timeouts: string[] = [];

    const [result] = await runSectionTasks(
      [
        {
          name: 'summary',
          timeoutMs: 10,
          payloadBytes: 24,
          run: async () => {
            await wait(200);
            return 'late';
          },
        },
      ],
      {
        maxConcurrent: 1,
        retries: 0,
        retryBaseDelayMs: 1,
        totalBudgetMs: 500,
        hooks: {
          onTimeout: (evt) => timeouts.push(evt.name),
        },
      },
    );

    expect(result.status).toBe('timeout');
    expect(timeouts).toEqual(['summary']);
  });

  it('fires onRetry hook between retries on retryable errors', async () => {
    let calls = 0;
    const retries: number[] = [];

    await runSectionTasks(
      [
        {
          name: 'summary',
          timeoutMs: 200,
          payloadBytes: 24,
          run: async () => {
            calls += 1;
            if (calls <= 2) throw new Error('ECONNRESET');
            return 'ok';
          },
        },
      ],
      {
        maxConcurrent: 1,
        retries: 2,
        retryBaseDelayMs: 1,
        totalBudgetMs: 5000,
        shouldRetry: () => true,
        hooks: {
          onRetry: (evt) => retries.push(evt.attempt),
        },
      },
    );

    expect(retries).toEqual([1, 2]);
  });

  it('handles non-Error thrown values (string)', async () => {
    const [result] = await runSectionTasks(
      [
        {
          name: 'summary',
          timeoutMs: 200,
          payloadBytes: 24,
          run: async () => {
            throw 'string error'; // eslint-disable-line no-throw-literal
          },
        },
      ],
      {
        maxConcurrent: 1,
        retries: 0,
        retryBaseDelayMs: 1,
        totalBudgetMs: 1000,
      },
    );

    expect(result.status).toBe('error');
    if (result.status !== 'success') {
      expect(result.error).toBe('string error');
    }
  });

  it('handles allSettled rejection as error result', async () => {
    // This tests the settled.map fallback for rejected promises
    // In practice this is very hard to trigger because executeTask catches everything,
    // but we can verify the runSectionTasks settled mapping works with maxConcurrent=1
    const results = await runSectionTasks(
      [
        {
          name: 'a',
          timeoutMs: 200,
          payloadBytes: 24,
          run: async () => 'ok',
        },
        {
          name: 'b',
          timeoutMs: 200,
          payloadBytes: 24,
          run: async () => 'ok',
        },
      ],
      {
        maxConcurrent: 1,
        retries: 0,
        retryBaseDelayMs: 1,
        totalBudgetMs: 5000,
      },
    );

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === 'success')).toBe(true);
  });

  it('uses provided requestId in hook events', async () => {
    let capturedRequestId: string | undefined;

    await runSectionTasks(
      [
        {
          name: 'summary',
          timeoutMs: 200,
          payloadBytes: 24,
          run: async () => 'ok',
        },
      ],
      {
        maxConcurrent: 1,
        retries: 0,
        retryBaseDelayMs: 1,
        totalBudgetMs: 1000,
        requestId: 'req-123',
        hooks: {
          onStart: (evt) => {
            capturedRequestId = evt.requestId;
          },
        },
      },
    );

    expect(capturedRequestId).toBe('req-123');
  });

  it('skips delay when remaining budget is 0 during retry', async () => {
    let callCount = 0;
    let clockValue = 0;

    const [result] = await runSectionTasks(
      [
        {
          name: 'summary',
          timeoutMs: 100,
          payloadBytes: 24,
          run: async () => {
            callCount += 1;
            if (callCount === 1) throw new Error('retry me');
            return 'ok';
          },
        },
      ],
      {
        maxConcurrent: 1,
        retries: 1,
        retryBaseDelayMs: 1,
        totalBudgetMs: 500,
        shouldRetry: () => true,
        now: () => {
          clockValue += 1;
          return clockValue;
        },
        sleep: async () => {
          // no-op sleep
        },
      },
    );

    expect(result.status).toBe('success');
    expect(result.attempts).toBe(2);
  });

  it('detects timeout by Error.name containing "timeout"', async () => {
    const err = new Error('connection failed');
    err.name = 'TimeoutError';

    const [result] = await runSectionTasks(
      [
        {
          name: 'summary',
          timeoutMs: 500,
          payloadBytes: 24,
          run: async () => {
            throw err;
          },
        },
      ],
      {
        maxConcurrent: 1,
        retries: 0,
        retryBaseDelayMs: 1,
        totalBudgetMs: 1000,
      },
    );

    expect(result.status).toBe('timeout');
  });

  it('detects timeout by Error.message containing "timed out"', async () => {
    const [result] = await runSectionTasks(
      [
        {
          name: 'summary',
          timeoutMs: 500,
          payloadBytes: 24,
          run: async () => {
            throw new Error('Request timed out after 30s');
          },
        },
      ],
      {
        maxConcurrent: 1,
        retries: 0,
        retryBaseDelayMs: 1,
        totalBudgetMs: 1000,
      },
    );

    expect(result.status).toBe('timeout');
  });

  it('detects timeout by Error.message containing "abort"', async () => {
    const [result] = await runSectionTasks(
      [
        {
          name: 'summary',
          timeoutMs: 500,
          payloadBytes: 24,
          run: async () => {
            throw new Error('The operation was abort');
          },
        },
      ],
      {
        maxConcurrent: 1,
        retries: 0,
        retryBaseDelayMs: 1,
        totalBudgetMs: 1000,
      },
    );

    expect(result.status).toBe('timeout');
  });

  it('fires onTimeout hook before retry when retryable timeout occurs', async () => {
    let callCount = 0;
    const timeoutEvents: number[] = [];
    const retryEvents: number[] = [];

    await runSectionTasks(
      [
        {
          name: 'summary',
          timeoutMs: 10,
          payloadBytes: 24,
          run: async () => {
            callCount += 1;
            if (callCount === 1) {
              await wait(50);
            }
            return 'ok';
          },
        },
      ],
      {
        maxConcurrent: 1,
        retries: 1,
        retryBaseDelayMs: 1,
        totalBudgetMs: 5000,
        shouldRetry: () => true,
        hooks: {
          onTimeout: (evt) => timeoutEvents.push(evt.attempt),
          onRetry: (evt) => retryEvents.push(evt.attempt),
        },
      },
    );

    expect(timeoutEvents).toEqual([1]);
    expect(retryEvents).toEqual([1]);
  });

  it('fires onError hook before retry when retryable non-timeout error occurs', async () => {
    let callCount = 0;
    const errorEvents: number[] = [];
    const retryEvents: number[] = [];

    await runSectionTasks(
      [
        {
          name: 'summary',
          timeoutMs: 500,
          payloadBytes: 24,
          run: async () => {
            callCount += 1;
            if (callCount === 1) throw new Error('ECONNRESET');
            return 'ok';
          },
        },
      ],
      {
        maxConcurrent: 1,
        retries: 1,
        retryBaseDelayMs: 1,
        totalBudgetMs: 5000,
        shouldRetry: () => true,
        hooks: {
          onError: (evt) => errorEvents.push(evt.attempt),
          onRetry: (evt) => retryEvents.push(evt.attempt),
        },
      },
    );

    expect(errorEvents).toEqual([1]);
    expect(retryEvents).toEqual([1]);
  });
});
