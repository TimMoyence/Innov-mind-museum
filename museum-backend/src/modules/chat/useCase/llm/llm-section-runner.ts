/**
 * Parallel LLM section runner. V1 = only 'summary'; architecture supports
 * adding analysis/metadata/multi-language sections without infra changes.
 */
import { Semaphore } from './semaphore';

type SectionRunStatus = 'success' | 'timeout' | 'error';

export interface SectionTask<TValue> {
  name: string;
  timeoutMs: number;
  payloadBytes: number;
  /** Receives an AbortSignal that fires on timeout. */
  run: (signal: AbortSignal) => Promise<TValue>;
}

interface SectionRunSuccess<TValue> {
  name: string;
  status: 'success';
  value: TValue;
  attempts: number;
  latencyMs: number;
  timeoutMs: number;
  payloadBytes: number;
}

interface SectionRunFailure {
  name: string;
  status: 'timeout' | 'error';
  error: string;
  attempts: number;
  latencyMs: number;
  timeoutMs: number;
  payloadBytes: number;
}

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

/**
 * The causal detail of a failed attempt (R7). Diagnostics ONLY — it travels to
 * the logging hooks and stops there; `SectionRunFailure.error` (the string the
 * client-facing `ChatAssistantDiagnostics` exposes) is unchanged.
 *
 * SECURITY — this shape is an ALLOWLIST, and that is the whole point. See
 * `toErrorDetail()`.
 */
export interface SectionErrorDetail {
  name: string;
  message: string;
  /** Truncated: head frames only — the point of rupture is always near the top. */
  stack?: string;
  /** `.cause` chain, depth <= 3, `{ name, message }` per link and nothing else. */
  causes?: { name: string; message: string }[];
}

interface SectionRetryEvent extends SectionStartEvent {
  latencyMs: number;
  error: string;
  /** OPTIONAL — the `Promise.allSettled` rejected branch builds a failure without hooks. */
  detail?: SectionErrorDetail;
}

interface SectionFailureEvent extends SectionStartEvent {
  latencyMs: number;
  error: string;
  /** OPTIONAL — see `SectionRetryEvent.detail`; the stream consumer never reads it. */
  detail?: SectionErrorDetail;
}

export interface SectionRunnerHooks {
  onStart?: (event: SectionStartEvent) => void;
  onSuccess?: (event: SectionSuccessEvent) => void;
  onRetry?: (event: SectionRetryEvent) => void;
  onTimeout?: (event: SectionFailureEvent) => void;
  onError?: (event: SectionFailureEvent) => void;
}

interface SectionRunnerOptions {
  maxConcurrent: number;
  retries: number;
  retryBaseDelayMs: number;
  /** Total wall-clock budget (ms) across all sections. */
  totalBudgetMs: number;
  requestId?: string;
  hooks?: SectionRunnerHooks;
  /** Defaults to no retries. */
  shouldRetry?: (error: unknown, status: SectionRunStatus) => boolean;
  now?: () => number;
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

/** Head frames kept. The breaking frame is always in the first few. */
const MAX_STACK_LINES = 20;
/** Hard character cap — a 100 % failure rate must not become a log bill. */
const MAX_STACK_CHARS = 4096;
const MAX_CAUSE_DEPTH = 3;
const STACK_TRUNCATION_MARKER = '    … [stack truncated]';

const truncateStack = (stack: string): string => {
  const lines = stack.split('\n');
  const kept = lines.slice(0, MAX_STACK_LINES);
  let text = kept.join('\n');
  let truncated = kept.length < lines.length;

  const budget = MAX_STACK_CHARS - STACK_TRUNCATION_MARKER.length - 1;
  if (text.length > budget) {
    text = text.slice(0, budget);
    truncated = true;
  }

  return truncated ? `${text}\n${STACK_TRUNCATION_MARKER}` : text;
};

/** Non-empty, never invented. `String()` (not a template literal) — a Symbol throws on interpolation. */
const errorName = (value: unknown): string => {
  if (value instanceof Error && value.name !== '') {
    return value.name;
  }
  if (typeof value === 'object' && value !== null) {
    const named = (value as { name?: unknown }).name;
    if (typeof named === 'string' && named !== '') {
      return named;
    }
  }
  return `NonError(${typeof value})`;
};

const errorMessage = (value: unknown): string =>
  value instanceof Error ? value.message || value.name : String(value);

/**
 * Walks `.cause`, keeping `{ name, message }` per link. Bounded by depth AND by
 * a `seen` set: `e.cause === e` (and the two-link mutual variant) are real shapes,
 * and a serialiser that loops on them turns an LLM outage into a PROCESS outage.
 *
 * @param root - the thrown value whose causal chain to walk
 * @returns at most MAX_CAUSE_DEPTH links, outermost first
 */
const toCauseChain = (root: unknown): { name: string; message: string }[] => {
  const chain: { name: string; message: string }[] = [];
  const seen = new Set<unknown>([root]);

  let current: unknown =
    typeof root === 'object' && root !== null ? (root as { cause?: unknown }).cause : undefined;

  while (current !== undefined && current !== null && chain.length < MAX_CAUSE_DEPTH) {
    if (seen.has(current)) break;
    seen.add(current);
    chain.push({ name: errorName(current), message: errorMessage(current) });
    current = typeof current === 'object' ? (current as { cause?: unknown }).cause : undefined;
  }

  return chain;
};

/**
 * R7 — the causal detail of a failed section, built by a strict field ALLOWLIST.
 *
 * NO GENERIC SERIALISER IS PERMITTED HERE — not whole-object JSON serialisation, not
 * Node's object inspector, not an object spread of the error. All three drain an
 * `openai` `APIError`, which carries `.request` (hence the outbound request BODY,
 * hence the USER'S PROMPT), `.headers` (hence the API key) and `.error`. Any of them
 * would turn "preserve the cause" into a prompt / PII / secret egress straight into
 * the server log — the one real risk this diagnosability fix introduces, closed by
 * construction. A generic serialiser also throws outright on a cyclic value,
 * manufacturing a brand-new error INSIDE the error handler and losing the original.
 *
 * (The three forbidden idioms are named, and their absence from this file asserted,
 * in `tests/unit/chat/llm-error-detail.test.ts` — deliberately not spelled out here,
 * since that assertion greps this source.)
 *
 * Sibling of `toErrorMessage`, NOT a replacement: that one still produces the
 * `SectionRunFailure.error` string exposed through `ChatAssistantDiagnostics`.
 *
 * @param error - the thrown value
 * @returns name + message + truncated stack + bounded cause chain, and nothing else
 */
export const toErrorDetail = (error: unknown): SectionErrorDetail => {
  const stack = error instanceof Error && typeof error.stack === 'string' ? error.stack : undefined;

  return {
    name: errorName(error),
    message: errorMessage(error),
    stack: stack === undefined ? undefined : truncateStack(stack),
    causes: toCauseChain(error),
  };
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

interface AttemptContext {
  taskName: string;
  attempt: number;
  timeoutMs: number;
  payloadBytes: number;
  requestId?: string;
}

/** One classified failed attempt: what went wrong, how long it took, and WHY (R7). */
interface AttemptFailure {
  latencyMs: number;
  isTimeout: boolean;
  message: string;
  detail: SectionErrorDetail;
}

const toFailureEvent = (ctx: AttemptContext, failure: AttemptFailure): SectionFailureEvent => ({
  name: ctx.taskName,
  attempt: ctx.attempt,
  timeoutMs: ctx.timeoutMs,
  payloadBytes: ctx.payloadBytes,
  latencyMs: failure.latencyMs,
  error: failure.message,
  requestId: ctx.requestId,
  detail: failure.detail,
});

const buildFailureResult = (
  ctx: AttemptContext,
  failure: AttemptFailure,
  hooks?: SectionRunnerHooks,
): SectionRunFailure => {
  const event = toFailureEvent(ctx, failure);

  if (failure.isTimeout) {
    hooks?.onTimeout?.(event);
  } else {
    hooks?.onError?.(event);
  }

  return {
    name: ctx.taskName,
    status: failure.isTimeout ? 'timeout' : 'error',
    error: failure.message,
    attempts: ctx.attempt,
    latencyMs: failure.latencyMs,
    timeoutMs: ctx.timeoutMs,
    payloadBytes: ctx.payloadBytes,
  };
};

/** Caller MUST clearTimeout when done. */
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

const classifyAttemptError = (
  controller: AbortController,
  error: unknown,
  latencyMs: number,
): AttemptFailure & { status: SectionRunStatus } => {
  const isTimeout = controller.signal.aborted || isTimeoutError(error);
  return {
    latencyMs,
    isTimeout,
    status: isTimeout ? 'timeout' : 'error',
    message: toErrorMessage(error),
    detail: toErrorDetail(error),
  };
};

const fireRetryHooks = (
  hooks: SectionRunnerHooks | undefined,
  ctx: AttemptContext,
  failure: AttemptFailure,
): void => {
  // The RETRY path emits its own event: enriching only the FINAL failure would
  // leave retry logs blind, and the first attempt is often the one carrying the
  // true cause.
  const event = toFailureEvent(ctx, failure);
  if (failure.isTimeout) {
    hooks?.onTimeout?.(event);
  } else {
    hooks?.onError?.(event);
  }
  hooks?.onRetry?.(event);
};

const toStartEvent = (ctx: AttemptContext): SectionStartEvent => ({
  name: ctx.taskName,
  attempt: ctx.attempt,
  timeoutMs: ctx.timeoutMs,
  payloadBytes: ctx.payloadBytes,
  requestId: ctx.requestId,
});

/** Jittered exponential backoff, capped by remaining budget. */
const sleepWithBackoff = async (
  sleepFn: (ms: number) => Promise<void>,
  baseMs: number,
  attempt: number,
  remainingBudgetMs: number,
): Promise<void> => {
  const delayMs = jitteredDelay(Math.max(1, baseMs), attempt, remainingBudgetMs);
  if (delayMs > 0) {
    await sleepFn(delayMs);
  }
};

const executeTask = async <TValue>(
  task: SectionTask<TValue>,
  options: SectionRunnerOptions,
  deadlineMs: number,
): Promise<SectionRunResult<TValue>> => {
  const now = options.now ?? defaultNow;
  const sleep = options.sleep ?? defaultSleep;
  const maxAttempts = Math.max(0, options.retries) + 1;
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

    options.hooks?.onStart?.(toStartEvent(ctx));
    const { controller, timeoutId, timeoutPromise } = createTimeoutRace(effectiveTimeoutMs);

    try {
      const value = await Promise.race([task.run(controller.signal), timeoutPromise]);
      clearTimeout(timeoutId);
      const latencyMs = now() - startedAt;
      options.hooks?.onSuccess?.({ ...toStartEvent(ctx), latencyMs });
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
      const classified = classifyAttemptError(controller, error, now() - startedAt);

      if (attempts >= maxAttempts || !shouldRetry(error, classified.status)) {
        return buildFailureResult(ctx, classified, options.hooks);
      }

      fireRetryHooks(options.hooks, ctx, classified);
      await sleepWithBackoff(sleep, options.retryBaseDelayMs, attempts, deadlineMs - now());
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

/** Bounded concurrency + per-task timeouts + jittered backoff + global budget. */
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
    };
  });
};
