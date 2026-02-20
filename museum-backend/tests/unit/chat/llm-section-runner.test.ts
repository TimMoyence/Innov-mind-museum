import {
  runSectionTasks,
  SectionTask,
} from '@modules/chat/application/llm-section-runner';

const wait = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe('llm-section-runner', () => {
  it('respects section concurrency caps', async () => {
    let inFlight = 0;
    let peak = 0;

    const tasks: Array<SectionTask<string>> = ['a', 'b', 'c', 'd'].map(
      (name) => ({
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
      }),
    );

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
          error instanceof Error &&
          error.message.toLowerCase().includes('econnreset'),
      },
    );

    expect(result.status).toBe('success');
    expect(result.attempts).toBe(2);
  });

  it('returns timeout for slow sections without failing fast globally', async () => {
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
        {
          name: 'expertCompact',
          timeoutMs: 100,
          payloadBytes: 24,
          run: async () => {
            await wait(10);
            return 'on-time';
          },
        },
      ],
      {
        maxConcurrent: 2,
        retries: 0,
        retryBaseDelayMs: 1,
        totalBudgetMs: 200,
      },
    );

    const summary = result.find((entry) => entry.name === 'summary');
    const expert = result.find((entry) => entry.name === 'expertCompact');

    expect(summary?.status).toBe('timeout');
    expect(expert?.status).toBe('success');
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
});
