/**
 * RED phase — "the cause survives" (R7), and survives WITHOUT taking the prompt with it.
 *
 * Run `2026-07-14-otel-openai-instrumentation-kills-structured-llm`
 * Cases: test-contract UC-26..UC-32, UC-34, UC-35 · design §D5/§7 · spec AC-7.
 *
 * WHY THIS EXISTS. `toErrorMessage` (`llm-section-runner.ts:88`) keeps only
 * `error.message`. The stack is thrown away. Not one of the 42 production errors
 * carried a trace — which is exactly what let three false leads survive the
 * investigation for two months (debug-log.md §Phase 1). This is a diagnosability
 * fix, and it is worth doing only if it does not become a data leak.
 *
 * THE RISK THIS RUN INTRODUCES, NAMED. Preserving "the cause" is tempting to do
 * with `JSON.stringify(error)` / `util.inspect(error, {depth})` / `{...error}`.
 * All three drain an `openai` `APIError`'s `.request` — i.e. the REQUEST BODY,
 * i.e. THE USER'S PROMPT — and its `.headers` — i.e. the API KEY — into the server
 * log. `SectionErrorDetail` must therefore be built by a strict field ALLOWLIST.
 * UC-29 proves it with canaries.
 *
 * `require()` (not `import`) for `toErrorDetail`: the export does not exist yet,
 * and an `import` would break `tsc --noEmit` for the whole tests/ tree instead of
 * producing an honest run-time red.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  API_KEY_CANARY,
  PII_CANARY,
  PROMPT_CANARY,
  makeCyclicCauseError,
  makeCyclicPlainObject,
  makeErrorWithCauseChain,
  makeHugeStackError,
  makeLlmError,
  makeMutualCauseErrors,
  makeOpenAiApiErrorLike,
} from 'tests/helpers/chat/llm-error.fixtures';
import { makeSectionTask } from 'tests/helpers/chat/section-task.fixtures';

import { runSectionTasks } from '@modules/chat/useCase/llm/llm-section-runner';

const BACKEND_ROOT = resolve(__dirname, '..', '..', '..');
const RUNNER_SRC = resolve(BACKEND_ROOT, 'src/modules/chat/useCase/llm/llm-section-runner.ts');

interface SectionErrorDetail {
  name: string;
  message: string;
  stack?: string;
  causes?: { name: string; message: string }[];
}

const loadToErrorDetail = (): ((error: unknown) => SectionErrorDetail) => {
  const mod: {
    toErrorDetail?: (error: unknown) => SectionErrorDetail;
  } = require('@modules/chat/useCase/llm/llm-section-runner');
  if (typeof mod.toErrorDetail !== 'function') {
    throw new Error('llm-section-runner does not export toErrorDetail');
  }
  return mod.toErrorDetail;
};

const runnerOptions = {
  maxConcurrent: 1,
  retries: 0,
  retryBaseDelayMs: 1,
  totalBudgetMs: 5_000,
};

describe('UC-26 — the cause survives: name, message, stack', () => {
  it('keeps the error name, the message and the stack (including the breaking frame)', () => {
    const toErrorDetail = loadToErrorDetail();
    const detail = toErrorDetail(makeLlmError());

    expect(detail.name).toBe('TypeError');
    expect(detail.message).toBe('Body is unusable: Body has already been read');
    expect(detail.stack ?? '').not.toBe('');
    // The point of rupture. Without it, the 42 errors said nothing at all.
    expect(detail.stack).toContain('consumeBody');
    expect(detail.stack).toContain('api-promise');
  });
});

describe('UC-27 — the CHAIN of causes survives (depth <= 3)', () => {
  it('keeps { name, message } per link, in order, and nothing else', () => {
    const toErrorDetail = loadToErrorDetail();
    const detail = toErrorDetail(makeErrorWithCauseChain(3));

    expect(detail.causes).toHaveLength(2);
    expect(detail.causes?.[0].message).toBe('cause-1');
    expect(detail.causes?.[1].message).toBe('cause-2');
    for (const cause of detail.causes ?? []) {
      expect(Object.keys(cause).sort()).toEqual(['message', 'name']);
    }
  });
});

describe('UC-28 — LIMIT: a chain too deep, and a CYCLIC chain', () => {
  it('truncates a 6-link chain to 3', () => {
    const toErrorDetail = loadToErrorDetail();
    const detail = toErrorDetail(makeErrorWithCauseChain(6));
    expect(detail.causes).toHaveLength(3);
  });

  it.each([
    ['self-referencing', makeCyclicCauseError],
    ['mutual', makeMutualCauseErrors],
  ])('terminates on a %s cycle instead of blowing the stack', (_label, factory) => {
    // An error serialiser that loops turns an LLM outage into a PROCESS outage.
    const toErrorDetail = loadToErrorDetail();
    const started = Date.now();
    const detail = toErrorDetail(factory());

    expect(Date.now() - started).toBeLessThan(50);
    expect((detail.causes ?? []).length).toBeLessThanOrEqual(3);
  });
});

describe('UC-29 — SECURITY: an openai APIError carries the prompt; none of it may leak', () => {
  it('drops every field outside the allowlist — prompt, API key and PII included', () => {
    const toErrorDetail = loadToErrorDetail();
    const detail = toErrorDetail(makeOpenAiApiErrorLike());
    const serialised = JSON.stringify(detail);

    expect(serialised).not.toContain(PROMPT_CANARY);
    expect(serialised).not.toContain(API_KEY_CANARY);
    expect(serialised).not.toContain(PII_CANARY);
    // `.request`, `.headers`, `.error`, `.status` are NOT part of the detail.
    expect(Object.keys(detail).sort()).toEqual(['causes', 'message', 'name', 'stack']);
    for (const cause of detail.causes ?? []) {
      expect(Object.keys(cause).sort()).toEqual(['message', 'name']);
    }
  });

  it('the source uses no generic serialiser (the three leaking idioms)', () => {
    const source = readFileSync(RUNNER_SRC, 'utf8');
    expect(source).not.toMatch(/JSON\.stringify\(\s*error/);
    expect(source).not.toMatch(/util\.inspect/);
    expect(source).not.toMatch(/\{\s*\.\.\.error\s*\}/);
  });
});

describe('UC-30 — values thrown that are not Errors', () => {
  it.each([
    ['string', 'boom'],
    ['null', null],
    ['undefined', undefined],
    ['bare object', { name: 'x' }],
    ['cyclic object', makeCyclicPlainObject()],
    ['symbol', Symbol('s')],
    ['number', 42],
  ])('builds a detail without throwing for %s', (_label, value) => {
    // The cyclic object is the killer: `JSON.stringify` throws
    // "Converting circular structure to JSON" INSIDE the error handler — the
    // original error is lost AND a new one is manufactured.
    const toErrorDetail = loadToErrorDetail();
    const detail = toErrorDetail(value);

    expect(detail.name).not.toBe('');
    expect(typeof detail.message).toBe('string');
    expect(detail.stack).toBeUndefined(); // no invented stack
    expect(detail.causes ?? []).toEqual([]);
  });
});

describe('UC-31 — LIMIT: a huge stack is truncated, HEAD kept', () => {
  it('caps the stack, keeps the first frame, and marks the truncation', () => {
    // An unbounded stack on EVERY log line at a 100 % failure rate = a log bill
    // and a drowned pipeline. The breaking frame is always in the first frames.
    const toErrorDetail = loadToErrorDetail();
    const detail = toErrorDetail(makeHugeStackError({ frames: 500 }));
    const stack = detail.stack ?? '';

    expect(stack.length).toBeLessThanOrEqual(4_096);
    expect(stack.split('\n').length).toBeLessThanOrEqual(21);
    expect(stack).toContain('deeplyNestedFrame0');
    expect(stack).toMatch(/truncated/i);
  });
});

describe('UC-32 — the failure LOG carries the cause (error, timeout, retry)', () => {
  const wireLogger = (): { warn: jest.Mock; info: jest.Mock } => {
    const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    jest.doMock('@shared/logger/logger', () => ({ logger: loggerMock }));
    return loggerMock;
  };

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it.each([
    ['onError', 'llm_section_error'],
    ['onTimeout', 'llm_section_timeout'],
    ['onRetry', 'llm_section_retry'],
  ])(
    '%s → %s carries errorName / errorStack / errorCauses AND every legacy field',
    (hookName, label) => {
      const loggerMock = wireLogger();
      const toErrorDetail = loadToErrorDetail();
      const support: {
        sectionRunnerHooks: Record<string, ((event: Record<string, unknown>) => void) | undefined>;
      } = require('@modules/chat/adapters/secondary/llm/langchain-orchestrator-support');

      const detail = toErrorDetail(makeOpenAiApiErrorLike());
      // The retry path emits its own event (`fireRetryHooks`) — a fix that only
      // enriched the FINAL failure would leave retry logs blind, and the first
      // attempt is often the one carrying the true cause.
      support.sectionRunnerHooks[hookName]?.({
        name: 'summary',
        attempt: 1,
        timeoutMs: 8_000,
        payloadBytes: 10_436,
        latencyMs: 2_392,
        error: 'Body is unusable: Body has already been read',
        requestId: 'req-1',
        detail,
      });

      const call = loggerMock.warn.mock.calls.find((c) => c[0] === label);
      expect(call).toBeDefined();
      const payload = (call?.[1] ?? {}) as Record<string, unknown>;

      expect(payload.errorName).toBe('BadRequestError');
      expect(typeof payload.errorStack).toBe('string');
      expect(Array.isArray(payload.errorCauses)).toBe(true);

      // R4 — nothing that was logged before disappears.
      expect(payload.section).toBe('summary');
      expect(payload.attempt).toBe(1);
      expect(payload.latencyMs).toBe(2_392);
      expect(payload.timeoutMs).toBe(8_000);
      expect(payload.payloadBytes).toBe(10_436);
      expect(payload.error).toBe('Body is unusable: Body has already been read');
      expect(payload.provider).toBeDefined();
      expect(payload.model).toBeDefined();

      // …and the canaries never reach the logger either.
      const serialised = JSON.stringify(payload);
      expect(serialised).not.toContain(PROMPT_CANARY);
      expect(serialised).not.toContain(API_KEY_CANARY);
      expect(serialised).not.toContain(PII_CANARY);
    },
  );
});

describe('UC-34 — `detail` is OPTIONAL: the allSettled branch and the stream path stay intact', () => {
  it('a hook that throws in onStart still yields a valid SectionRunFailure (no detail at all)', async () => {
    // This is the `Promise.allSettled` REJECTED branch of `runSectionTasks`
    // (llm-section-runner.ts:332-340): it builds a SectionRunFailure WITHOUT going
    // through the hooks, hence with no `detail` whatsoever. If `detail` were made
    // required, this path would not compile — and the stream consumer, which never
    // reads it, would break at run time.
    const results = await runSectionTasks(
      [makeSectionTask({ run: () => Promise.resolve('never reached') })],
      {
        ...runnerOptions,
        hooks: {
          onStart: () => {
            throw new Error('hook exploded');
          },
        },
      },
    );

    expect(results).toHaveLength(1);
    const failure = results[0];
    expect(failure.status).toBe('error');
    expect(failure).not.toHaveProperty('detail');
    if (failure.status === 'success') return;
    expect(failure.error).toBe('hook exploded');
  });

  it('hooks that ignore `detail` receive their events without error', async () => {
    const seen: string[] = [];
    const results = await runSectionTasks(
      [makeSectionTask({ run: () => Promise.reject(makeLlmError()) })],
      {
        ...runnerOptions,
        hooks: {
          onStart: (event) => seen.push(`start:${event.name}`),
          onError: (event) => seen.push(`error:${event.error}`),
        },
      },
    );

    expect(seen).toEqual(['start:summary', 'error:Body is unusable: Body has already been read']);
    expect(results[0].status).toBe('error');
  });
});

describe('UC-35 — `toErrorMessage` is UNCHANGED: the diagnostics contract does not drift', () => {
  it.each([
    ['a normal Error', () => new Error('plain failure'), 'plain failure'],
    ['an Error with no message', () => makeLlmError({ message: '' }), 'TypeError'],
    ['a non-Error value', () => 'raw string failure', 'raw string failure'],
  ])(
    '%s still produces the exact same SectionRunFailure.error string',
    async (_label, factory, expected) => {
      // `toErrorDetail` is ADDED next to `toErrorMessage`, it does not replace it.
      // `SectionRunFailure.error` feeds ChatAssistantDiagnostics, which is exposed to
      // the client: "improving" this string in passing would break that contract with
      // nothing to say so.
      const results = await runSectionTasks(
        [makeSectionTask({ run: () => Promise.reject(factory()) })],
        runnerOptions,
      );

      const failure = results[0];
      if (failure.status === 'success') {
        throw new Error('expected a failure');
      }
      expect(failure.error).toBe(expected);
    },
  );
});
