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
  queueName: string;
  summarize?: (data: TData) => Record<string, unknown>;
  treatNoAttemptsAsFinal?: boolean;
}

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
