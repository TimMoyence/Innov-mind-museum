export const raceSignal = <T>(
  work: Promise<T>,
  signal: AbortSignal,
  abortError: () => Error,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    let settled = false;

    function settle(finish: () => void): void {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      finish();
    }

    function onAbort(): void {
      settle(() => {
        reject(abortError());
      });
    }

    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });

    work.then(
      (value) => {
        settle(() => {
          resolve(value);
        });
      },
      (err: unknown) => {
        settle(() => {
          reject(err instanceof Error ? err : new Error(String(err)));
        });
      },
    );
  });
