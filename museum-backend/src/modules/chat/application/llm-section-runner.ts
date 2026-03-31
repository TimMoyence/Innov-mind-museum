import { Semaphore } from './semaphore';

/** Terminal status of a single section execution attempt. */
export type SectionRunStatus = 'success' | 'timeout' | 'error';

/** A unit of work to execute within the section runner (typically a single LLM call). */
export interface SectionTask<TValue> {
  name: string;
  timeoutMs: number;
  payloadBytes: number;
  /** Executes the task; receives an AbortSignal that fires on timeout. */
  run: (signal: AbortSignal) => Promise<TValue>;
}

/** Successful section result carrying the resolved value. */
export interface SectionRunSuccess<TValue> {
  name: string;
  status: 'success';
  value: TValue;
  attempts: number;
  latencyMs: number;
  timeoutMs: number;
  payloadBytes: number;
}

/** Failed section result carrying the error description. */
export interface SectionRunFailure {
  name: string;
  status: 'timeout' | 'error';
  error: string;
  attempts: number;
  latencyMs: number;
  timeoutMs: number;
  payloadBytes: number;
}

/** Discriminated union of a section's success or failure outcome. */
export type SectionRunResult<TValue> = SectionRunSuccess<TValue> | SectionRunFailure;

interface SectionStartEvent {
  name: string;
  attempt: number;
  timeoutMs: number;
  payloadBytes: number;
  requestId?: string;
}

interface SectionSuccessEvent extends SectionStartEvent {
  latencyMs: number;
}

interface SectionRetryEvent extends SectionStartEvent {
  latencyMs: number;
  error: string;
}

interface SectionFailureEvent extends SectionStartEvent {
  latencyMs: number;
  error: string;
}

/** Lifecycle hooks fired during section execution for logging and observability. */
export interface SectionRunnerHooks {
  onStart?: (event: SectionStartEvent) => void;
  onSuccess?: (event: SectionSuccessEvent) => void;
  onRetry?: (event: SectionRetryEvent) => void;
  onTimeout?: (event: SectionFailureEvent) => void;
  onError?: (event: SectionFailureEvent) => void;
}

/** Configuration for the section runner including concurrency, retry policy, and time budget. */
export interface SectionRunnerOptions {
  maxConcurrent: number;
  retries: number;
  retryBaseDelayMs: number;
  /** Total wall-clock budget in ms for all sections combined. */
  totalBudgetMs: number;
  requestId?: string;
  hooks?: SectionRunnerHooks;
  /** Optional predicate to control which errors are retryable. Defaults to no retries. */
  shouldRetry?: (error: unknown, status: SectionRunStatus) => boolean;
  /** Clock function override for testing. */
  now?: () => number;
  /** Sleep function override for testing. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultNow = (): number => Date.now();
const defaultSleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error);
};

const isTimeoutError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const text = `${error.name} ${error.message}`.toLowerCase();
  return text.includes('timeout') || text.includes('timed out') || text.includes('abort');
};

const jitteredDelay = (baseMs: number, attempt: number, remainingBudgetMs: number): number => {
  if (remainingBudgetMs <= 0) {
    return 0;
  }
  const exponential = baseMs * Math.pow(2, Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * Math.max(1, baseMs)); // eslint-disable-line sonarjs/pseudo-random -- jitter for retry backoff, not security-sensitive
  return Math.min(exponential + jitter, Math.max(0, remainingBudgetMs - 1));
};

/** Common fields used in hook events and failure results. */
interface AttemptContext {
  taskName: string;
  attempt: number;
  timeoutMs: number;
  payloadBytes: number;
  requestId?: string;
}

/** Fires the appropriate failure hook (onTimeout or onError) and returns a failure result. */
const buildFailureResult = (
  ctx: AttemptContext,
  latencyMs: number,
  isTimeout: boolean,
  errorMsg: string,
  hooks?: SectionRunnerHooks,
): SectionRunFailure => {
  const event = {
    name: ctx.taskName,
    attempt: ctx.attempt,
    timeoutMs: ctx.timeoutMs,
    payloadBytes: ctx.payloadBytes,
    latencyMs,
    error: errorMsg,
    requestId: ctx.requestId,
  };

  if (isTimeout) {
    hooks?.onTimeout?.(event);
  } else {
    hooks?.onError?.(event);
  }

  return {
    name: ctx.taskName,
    status: isTimeout ? 'timeout' : 'error',
    error: errorMsg,
    attempts: ctx.attempt,
    latencyMs,
    timeoutMs: ctx.timeoutMs,
    payloadBytes: ctx.payloadBytes,
  };
};

/** Creates an AbortController + timeout-promise pair. Caller must clearTimeout when done. */
const createTimeoutRace = (
  effectiveTimeoutMs: number,
): { controller: AbortController; timeoutId: NodeJS.Timeout; timeoutPromise: Promise<never> } => {
  const controller = new AbortController();
  let timeoutId!: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort(new Error(`LLM timeout after ${String(effectiveTimeoutMs)}ms`));
      reject(new Error(`LLM timeout after ${String(effectiveTimeoutMs)}ms`));
    }, effectiveTimeoutMs);
  });
  return { controller, timeoutId, timeoutPromise };
};

/* eslint-disable complexity, max-lines-per-function -- retry loop with timeout, jitter backoff, and hooks requires sequential branching that cannot be meaningfully decomposed */
const executeTask = async <TValue>(
  task: SectionTask<TValue>,
  options: SectionRunnerOptions,
  deadlineMs: number,
): Promise<SectionRunResult<TValue>> => {
  const now = options.now ?? defaultNow;
  const sleep = options.sleep ?? defaultSleep;
  const retries = Math.max(0, options.retries);
  const maxAttempts = retries + 1;
  const shouldRetry = options.shouldRetry ?? (() => false);

  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts += 1;
    const remainingBudget = deadlineMs - now();
    if (remainingBudget <= 0) {
      return {
        name: task.name,
        status: 'timeout',
        error: 'Total LLM budget exhausted before section execution',
        attempts,
        latencyMs: 0,
        timeoutMs: task.timeoutMs,
        payloadBytes: task.payloadBytes,
      };
    }

    const effectiveTimeoutMs = Math.max(1, Math.min(task.timeoutMs, remainingBudget));
    const startedAt = now();
    const ctx: AttemptContext = {
      taskName: task.name,
      attempt: attempts,
      timeoutMs: effectiveTimeoutMs,
      payloadBytes: task.payloadBytes,
      requestId: options.requestId,
    };

    options.hooks?.onStart?.({
      name: task.name,
      attempt: attempts,
      timeoutMs: effectiveTimeoutMs,
      payloadBytes: task.payloadBytes,
      requestId: options.requestId,
    });

    const { controller, timeoutId, timeoutPromise } = createTimeoutRace(effectiveTimeoutMs);

    try {
      const value = await Promise.race([task.run(controller.signal), timeoutPromise]);
      clearTimeout(timeoutId);

      const latencyMs = now() - startedAt;
      options.hooks?.onSuccess?.({
        name: task.name,
        attempt: attempts,
        timeoutMs: effectiveTimeoutMs,
        payloadBytes: task.payloadBytes,
        latencyMs,
        requestId: options.requestId,
      });

      return {
        name: task.name,
        status: 'success',
        value,
        attempts,
        latencyMs,
        timeoutMs: effectiveTimeoutMs,
        payloadBytes: task.payloadBytes,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      const latencyMs = now() - startedAt;
      const timeout = controller.signal.aborted || isTimeoutError(error);
      const status: SectionRunStatus = timeout ? 'timeout' : 'error';
      const message = toErrorMessage(error);

      const canRetry = attempts < maxAttempts && shouldRetry(error, status);

      if (!canRetry) {
        return buildFailureResult(ctx, latencyMs, timeout, message, options.hooks);
      }

      // Fire failure hook before retry
      if (timeout) {
        options.hooks?.onTimeout?.({
          name: task.name,
          attempt: attempts,
          timeoutMs: effectiveTimeoutMs,
          payloadBytes: task.payloadBytes,
          latencyMs,
          error: message,
          requestId: options.requestId,
        });
      } else {
        options.hooks?.onError?.({
          name: task.name,
          attempt: attempts,
          timeoutMs: effectiveTimeoutMs,
          payloadBytes: task.payloadBytes,
          latencyMs,
          error: message,
          requestId: options.requestId,
        });
      }

      options.hooks?.onRetry?.({
        name: task.name,
        attempt: attempts,
        timeoutMs: effectiveTimeoutMs,
        payloadBytes: task.payloadBytes,
        latencyMs,
        error: message,
        requestId: options.requestId,
      });

      const remainingForDelay = deadlineMs - now();
      const delayMs = jitteredDelay(
        Math.max(1, options.retryBaseDelayMs),
        attempts,
        remainingForDelay,
      );

      if (delayMs > 0) {
        await sleep(delayMs);
      }
    }
  }

  return {
    name: task.name,
    status: 'error',
    error: 'Unknown section execution failure',
    attempts: Math.max(1, options.retries + 1),
    latencyMs: 0,
    timeoutMs: task.timeoutMs,
    payloadBytes: task.payloadBytes,
  };
};
/* eslint-enable complexity, max-lines-per-function */

/**
 * Executes section tasks concurrently (bounded by {@link SectionRunnerOptions.maxConcurrent})
 * with per-task timeouts, jittered exponential-backoff retries, and a global time budget.
 *
 * @param tasks - The section tasks to run.
 * @param options - Runner configuration (concurrency, retries, budget, hooks).
 * @returns An array of results in the same order as the input tasks.
 */
export const runSectionTasks = async <TValue>(
  tasks: SectionTask<TValue>[],
  options: SectionRunnerOptions,
): Promise<SectionRunResult<TValue>[]> => {
  if (!tasks.length) {
    return [];
  }

  const now = options.now ?? defaultNow;
  const deadlineMs = now() + Math.max(1, options.totalBudgetMs);
  const limiter = new Semaphore(Math.max(1, options.maxConcurrent));

  const scheduled = tasks.map((task) => limiter.use(() => executeTask(task, options, deadlineMs)));

  const settled = await Promise.allSettled(scheduled);

  return settled.map((entry, index) => {
    if (entry.status === 'fulfilled') {
      return entry.value;
    }

    return {
      name: tasks[index].name,
      status: 'error',
      error: toErrorMessage(entry.reason),
      attempts: 1,
      latencyMs: 0,
      timeoutMs: tasks[index].timeoutMs,
      payloadBytes: tasks[index].payloadBytes,
    } as SectionRunFailure;
  });
};
