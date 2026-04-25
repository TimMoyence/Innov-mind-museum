/**
 * Shared BullMQ job-failure handler. Used by every worker in the backend to
 * implement a uniform dead-letter policy:
 *
 *   - Every failure is logged (warn level) with enough context to diagnose.
 *   - Only the **final attempt** pages Sentry. Intermediate retries are
 *     expected noise; Sentry alerts only when the job is truly dead.
 *   - `removeOnFail` on the BullMQ queue retains the dead jobs so operators
 *     can inspect them via Bull-board or `queue.getFailed()`.
 *
 * Pure function — side-effect sinks are injected, enabling unit testing
 * without a Redis dependency.
 */

/** Minimal BullMQ job snapshot. Narrowed to the fields the handler reads. */
export interface FailedJobSnapshot<TData = Record<string, unknown>> {
  id?: string;
  data: TData;
  attemptsMade: number;
  opts: { attempts?: number };
}

/** Injectable side-effect sinks. */
export interface JobFailureSinks {
  log: (event: string, meta: Record<string, unknown>) => void;
  capture: (err: unknown, context?: Record<string, string | undefined>) => void;
}

/** Per-call options to customise event name, summary fields, and DLQ semantics. */
export interface HandleJobFailureOptions<TData> {
  /** Queue name, used as the log-event key and Sentry context tag. */
  queueName: string;
  /**
   * Extracts a flat map of job-data fields to include in log + Sentry context.
   * Keep this small and non-sensitive (URLs, IDs, names — never secrets).
   */
  summarize?: (data: TData) => Record<string, unknown>;
  /**
   * For queues without retries configured (e.g. crons), treat every failure as
   * terminal and page Sentry. Defaults to `false` so legacy callers preserve
   * the pre-shared-handler semantics (`attemptsMax > 0 && attemptsMade >= attemptsMax`).
   */
  treatNoAttemptsAsFinal?: boolean;
}

/** Legacy default — preserves the historic KE log-event key for backward-compat. */
const DEFAULT_QUEUE_NAME = 'knowledge-extraction';

/** Resolves the log event name, preserving the historic `extraction_job_failed` key for KE. */
const resolveLogEventName = (queueName: string): string =>
  queueName === 'knowledge-extraction' ? 'extraction_job_failed' : `${queueName}_job_failed`;

/** Decides if the given failure event is the terminal one (DLQ trigger). */
const isFinalAttempt = (
  attemptsMax: number,
  attemptsMade: number,
  treatNoAttemptsAsFinal: boolean,
): boolean => (attemptsMax > 0 ? attemptsMade >= attemptsMax : treatNoAttemptsAsFinal);

/** Builds the summary fields by delegating to the caller-supplied summarizer. */
const buildSummary = <TData>(
  job: FailedJobSnapshot<TData> | null,
  options: HandleJobFailureOptions<TData> | undefined,
): Record<string, unknown> => {
  if (!options?.summarize || !job?.data) return {};
  return options.summarize(job.data);
};

/** Converts summary values to strings for Sentry context. Drops null / undefined values. */
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

/**
 * Classifies a BullMQ `failed` event and routes it to the correct sinks.
 * Every worker in the backend funnels through this function.
 */
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
