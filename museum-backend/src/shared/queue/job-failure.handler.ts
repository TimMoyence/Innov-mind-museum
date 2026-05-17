/**
 * Shared BullMQ job-failure handler. Uniform DLQ policy:
 *   - Every failure logged (warn) with diagnosable context.
 *   - Only **final attempt** pages Sentry — intermediate retries are noise.
 *   - `removeOnFail` on queue retains dead jobs for Bull-board / `queue.getFailed()`.
 * Pure — sinks injected (unit-testable without Redis).
 */

/** Narrowed to fields handler reads. */
export interface FailedJobSnapshot<TData = Record<string, unknown>> {
  id?: string;
  data: TData;
  attemptsMade: number;
  opts: { attempts?: number };
}

export interface JobFailureSinks {
  log: (event: string, meta: Record<string, unknown>) => void;
  capture: (err: unknown, context?: Record<string, string | undefined>) => void;
}

export interface HandleJobFailureOptions<TData> {
  /** Log-event key + Sentry context tag. */
  queueName: string;
  /** Flat map for log + Sentry context. Small + non-sensitive (URLs, IDs — never secrets). */
  summarize?: (data: TData) => Record<string, unknown>;
  /**
   * Crons w/o retries: treat every failure as terminal. Default `false` preserves
   * pre-shared-handler semantics (`attemptsMax > 0 && attemptsMade >= attemptsMax`).
   */
  treatNoAttemptsAsFinal?: boolean;
}

/** Preserves historic KE log-event key for backward-compat. */
const DEFAULT_QUEUE_NAME = 'knowledge-extraction';

const resolveLogEventName = (queueName: string): string =>
  queueName === 'knowledge-extraction' ? 'extraction_job_failed' : `${queueName}_job_failed`;

const isFinalAttempt = (
  attemptsMax: number,
  attemptsMade: number,
  treatNoAttemptsAsFinal: boolean,
): boolean => (attemptsMax > 0 ? attemptsMade >= attemptsMax : treatNoAttemptsAsFinal);

const buildSummary = <TData>(
  job: FailedJobSnapshot<TData> | null,
  options: HandleJobFailureOptions<TData> | undefined,
): Record<string, unknown> => {
  if (!options?.summarize || !job?.data) return {};
  return options.summarize(job.data);
};

/** Drops null/undefined. */
const toSentryContext = (
  baseContext: Record<string, string | undefined>,
  summary: Record<string, unknown>,
): Record<string, string | undefined> => {
  const context = { ...baseContext };
  for (const [key, value] of Object.entries(summary)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      context[key] = value;
    } else if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      context[key] = value.toString();
    } else {
      context[key] = JSON.stringify(value);
    }
  }
  return context;
};

/** Every backend worker funnels through this. */
export function handleJobFailure<TData = Record<string, unknown>>(
  job: FailedJobSnapshot<TData> | null,
  err: Error,
  sinks: JobFailureSinks,
  options?: HandleJobFailureOptions<TData>,
): void {
  const queueName = options?.queueName ?? DEFAULT_QUEUE_NAME;
  const attemptsMax = job?.opts.attempts ?? 0;
  const attemptsMade = job?.attemptsMade ?? 0;
  const finalAttempt = isFinalAttempt(
    attemptsMax,
    attemptsMade,
    options?.treatNoAttemptsAsFinal ?? false,
  );
  const summary = buildSummary(job, options);

  sinks.log(resolveLogEventName(queueName), {
    jobId: job?.id,
    error: err.message,
    attemptsMade,
    attemptsMax,
    finalAttempt,
    ...summary,
  });

  if (finalAttempt) {
    sinks.capture(
      err,
      toSentryContext(
        { queue: queueName, jobId: job?.id, attemptsMade: String(attemptsMade) },
        summary,
      ),
    );
  }
}
