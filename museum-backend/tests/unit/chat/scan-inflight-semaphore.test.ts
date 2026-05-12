import {
  ScanInflightSemaphore,
  ScanSemaphoreOverflowError,
} from '@modules/chat/adapters/secondary/guardrails/scan-inflight-semaphore';

describe('ScanInflightSemaphore', () => {
  it('admits up to maxInflight callers without queuing', async () => {
    const sem = new ScanInflightSemaphore(3, 0);
    await sem.acquire();
    await sem.acquire();
    await sem.acquire();
    expect(sem.getStats()).toEqual({ inFlight: 3, queued: 0, maxInflight: 3, queueMax: 0 });
  });

  it('queues the (maxInflight + 1)-th caller until a release', async () => {
    const sem = new ScanInflightSemaphore(1, 5);
    await sem.acquire();

    let resolved = false;
    const queuedPromise = sem.acquire().then(() => {
      resolved = true;
    });

    await Promise.resolve(); // let the queued promise settle into the queue
    expect(sem.getStats().queued).toBe(1);
    expect(resolved).toBe(false);

    sem.release(); // hands slot to the queued caller
    await queuedPromise;
    expect(resolved).toBe(true);
    expect(sem.getStats()).toEqual({ inFlight: 1, queued: 0, maxInflight: 1, queueMax: 5 });
  });

  it('throws ScanSemaphoreOverflowError when the queue is full', async () => {
    const sem = new ScanInflightSemaphore(1, 2);
    await sem.acquire(); // inFlight=1
    void sem.acquire(); // queued #1
    void sem.acquire(); // queued #2 (queue full)

    // The third pending caller raises overflow.
    await expect(sem.acquire()).rejects.toBeInstanceOf(ScanSemaphoreOverflowError);
    expect(sem.getStats().queued).toBe(2);
  });

  it('hands the released slot directly to the queue head (inFlight stays put)', async () => {
    const sem = new ScanInflightSemaphore(1, 5);
    await sem.acquire(); // inFlight=1
    const order: string[] = [];
    const q1 = sem.acquire().then(() => order.push('q1'));
    const q2 = sem.acquire().then(() => order.push('q2'));
    await Promise.resolve();

    sem.release();
    await q1;
    expect(order).toEqual(['q1']);
    expect(sem.getStats().inFlight).toBe(1); // slot directly handed over

    sem.release();
    await q2;
    expect(order).toEqual(['q1', 'q2']);
    expect(sem.getStats()).toEqual({ inFlight: 1, queued: 0, maxInflight: 1, queueMax: 5 });

    sem.release();
    expect(sem.getStats().inFlight).toBe(0);
  });

  it('release on an empty queue with inFlight=0 is a safe no-op (does not go negative)', () => {
    const sem = new ScanInflightSemaphore(2, 0);
    sem.release();
    sem.release();
    expect(sem.getStats().inFlight).toBe(0);
  });

  it('rejects invalid maxInflight / queueMax at construction', () => {
    expect(() => new ScanInflightSemaphore(0, 1)).toThrow();
    expect(() => new ScanInflightSemaphore(-1, 1)).toThrow();
    expect(() => new ScanInflightSemaphore(1, -1)).toThrow();
    expect(() => new ScanInflightSemaphore(Number.NaN, 1)).toThrow();
  });
});
