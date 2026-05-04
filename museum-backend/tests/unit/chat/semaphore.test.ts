import {
  Semaphore,
  SemaphoreQueueFullError,
  SemaphoreTimeoutError,
} from '@modules/chat/useCase/llm/semaphore';

describe('Semaphore', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows immediate acquisition when slots are available', async () => {
    const sem = new Semaphore(2);
    const results: number[] = [];

    const p = sem.use(async () => {
      results.push(1);
      return 42;
    });

    const value = await p;
    expect(value).toBe(42);
    expect(results).toEqual([1]);
  });

  it('queues tasks when max concurrent is reached', async () => {
    const sem = new Semaphore(1);
    const order: string[] = [];

    let resolveFirst!: () => void;
    const firstBlocker = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    const p1 = sem.use(async () => {
      order.push('first-start');
      await firstBlocker;
      order.push('first-end');
    });

    const p2 = sem.use(async () => {
      order.push('second');
    });

    // Let microtasks run
    await Promise.resolve();
    expect(order).toEqual(['first-start']);
    expect(sem.queueSize).toBe(1);

    resolveFirst();
    await p1;
    await p2;

    expect(order).toEqual(['first-start', 'first-end', 'second']);
  });

  it('respects the concurrent limit', async () => {
    jest.useRealTimers();
    const sem = new Semaphore({ maxConcurrent: 2, maxQueueSize: 200, acquireTimeoutMs: 5_000 });
    let concurrent = 0;
    let maxConcurrent = 0;

    const resolvers: (() => void)[] = [];
    const promises: Promise<void>[] = [];

    for (let i = 0; i < 5; i++) {
      promises.push(
        sem.use(async () => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await new Promise<void>((resolve) => {
            resolvers.push(resolve);
          });
          concurrent--;
        }),
      );
      // Let the task start if a slot is available
      await new Promise((r) => setImmediate(r));
    }

    expect(sem.inFlightCount).toBe(2);

    // Release tasks one by one, letting each queued task start
    while (resolvers.length > 0) {
      const resolve = resolvers.shift()!;
      resolve();
      await new Promise((r) => setImmediate(r));
    }

    await Promise.all(promises);
    expect(maxConcurrent).toBe(2);
    jest.useFakeTimers();
  });

  it('releases semaphore slot even when task throws', async () => {
    const sem = new Semaphore(1);

    await expect(
      sem.use(async () => {
        throw new Error('task failed');
      }),
    ).rejects.toThrow('task failed');

    // Should be able to acquire again
    const result = await sem.use(async () => 'ok');
    expect(result).toBe('ok');
  });

  it('rejects when queue is full', async () => {
    const sem = new Semaphore({
      maxConcurrent: 1,
      maxQueueSize: 1,
      acquireTimeoutMs: 30_000,
    });

    // Fill the slot
    let resolveFirst!: () => void;
    const blocker = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    const p1 = sem.use(async () => {
      await blocker;
    });

    // Fill the queue (1 item)
    const p2 = sem.use(async () => 'queued');

    await Promise.resolve();
    expect(sem.queueSize).toBe(1);

    // This should be rejected
    await expect(sem.use(async () => 'overflow')).rejects.toThrow(SemaphoreQueueFullError);

    resolveFirst();
    await p1;
    await p2;
  });

  it('times out when waiting too long to acquire', async () => {
    const sem = new Semaphore({
      maxConcurrent: 1,
      maxQueueSize: 100,
      acquireTimeoutMs: 100,
    });

    let resolveFirst!: () => void;
    const blocker = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    const p1 = sem.use(async () => {
      await blocker;
    });

    const p2 = sem.use(async () => 'should-timeout');

    // Advance past timeout
    jest.advanceTimersByTime(101);

    await expect(p2).rejects.toThrow(SemaphoreTimeoutError);

    resolveFirst();
    await p1;
  });

  it('correctly reports queueSize and inFlightCount', async () => {
    const sem = new Semaphore(1);

    expect(sem.queueSize).toBe(0);
    expect(sem.inFlightCount).toBe(0);

    let resolveFirst!: () => void;
    const blocker = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    const p1 = sem.use(async () => {
      await blocker;
    });

    await Promise.resolve();
    expect(sem.inFlightCount).toBe(1);
    expect(sem.queueSize).toBe(0);

    const p2 = sem.use(async () => 'queued');
    await Promise.resolve();
    expect(sem.queueSize).toBe(1);

    resolveFirst();
    await p1;
    await p2;

    expect(sem.inFlightCount).toBe(0);
    expect(sem.queueSize).toBe(0);
  });

  it('accepts a numeric shorthand for maxConcurrent', () => {
    const sem = new Semaphore(5);
    expect(sem.inFlightCount).toBe(0);
    expect(sem.queueSize).toBe(0);
  });

  it('releases slot to next queued task in FIFO order', async () => {
    const sem = new Semaphore(1);
    const order: number[] = [];

    let resolveFirst!: () => void;
    const blocker = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    const p1 = sem.use(async () => {
      await blocker;
      order.push(1);
    });

    const p2 = sem.use(async () => {
      order.push(2);
    });

    const p3 = sem.use(async () => {
      order.push(3);
    });

    resolveFirst();
    await p1;
    await p2;
    await p3;

    expect(order).toEqual([1, 2, 3]);
  });
});
