import { captureExceptionWithContext } from '@shared/observability/sentry';

export type BullmqErrorKind = 'queue_error' | 'worker_error';

interface ErrorSource {
  readonly name: string;
  on(event: 'error', listener: (error: Error) => void): unknown;
}

export const reportBullmqErrors = <T extends ErrorSource>(
  source: T,
  kind: BullmqErrorKind,
  context: Record<string, string> = {},
): T => {
  source.on('error', (error) => {
    captureExceptionWithContext(error, { queue: source.name, kind, ...context });
  });
  return source;
};
