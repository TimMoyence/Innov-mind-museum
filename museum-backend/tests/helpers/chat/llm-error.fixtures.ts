/**
 * Shared factories for LLM error shapes (UFR-002 — never inline in a test).
 *
 * Run `2026-07-14-otel-openai-instrumentation-kills-structured-llm`
 * (test-contract §Notes 6 · UC-26..UC-32, UC-35).
 *
 * These fixtures encode the error shapes that actually reach
 * `llm-section-runner.ts` in production, including the ONE that makes preserving
 * "the cause" dangerous: an `openai` `APIError` carries `.request` (hence the
 * REQUEST BODY, hence the user's prompt), `.headers` (hence the API key) and
 * `.error`. A generic serialiser (`JSON.stringify(error)`, `util.inspect`,
 * `{...error}`) drains all of it into the server log. The canaries below exist so
 * a test can PROVE none of it leaks.
 */

/**
 * Canaries — if any of these strings appears in a serialised error detail or in
 *  a logged payload, we have a prompt/PII/secret egress.
 */
export const PROMPT_CANARY = '<PROMPT-SECRET-CANARY>';
export const API_KEY_CANARY = 'sk-CANARY-KEY';
export const PII_CANARY = '<PII-CANARY>';

interface LlmErrorOverrides {
  name?: string;
  message?: string;
  stack?: string;
}

/**
 * The production error, verbatim (debug-log.md §Phase 1): a `TypeError` whose
 *  stack points at the double-read of the HTTP body.
 * @param overrides
 */
export function makeLlmError(overrides: LlmErrorOverrides = {}): Error {
  const error = new TypeError(overrides.message ?? 'Body is unusable: Body has already been read');
  if (overrides.name !== undefined) {
    error.name = overrides.name;
  }
  error.stack =
    overrides.stack ??
    [
      'TypeError: Body is unusable: Body has already been read',
      '    at consumeBody (node:internal/deps/undici/undici:5854:15)',
      '    at _Response.json (node:internal/deps/undici/undici:5807:18)',
      '    at openai/internal/parse.js:36:41',
      '    at APIPromise.defaultParseResponse [as parseResponse] (openai/internal/parse.js:41:7)',
      '    at APIPromise.parseResponse (openai/core/api-promise.js:26:188)',
      '    at @langchain/openai/dist/chat_models/completions.cjs:224:54',
      '    at async Object.pRetry (@langchain/core/dist/utils/p-retry/index.cjs:122:19)',
    ].join('\n');
  return error;
}

/**
 * `Error('cause-0', { cause: Error('cause-1', { cause: … }) })` — the shape a
 * LangChain / `p-retry` wrap produces around an SDK error.
 * @param depth - number of links INCLUDING the outermost error
 */
export function makeErrorWithCauseChain(depth: number): Error {
  let current = new Error(`cause-${String(depth - 1)}`);
  for (let i = depth - 2; i >= 0; i -= 1) {
    current = new Error(`cause-${String(i)}`, { cause: current });
  }
  return current;
}

/** `e.cause === e` — a self-referencing cause. A naive walker recurses forever. */
export function makeCyclicCauseError(): Error {
  const error = new Error('self-referencing');
  (error as Error & { cause: unknown }).cause = error;
  return error;
}

/** `a.cause = b ; b.cause = a` — the two-link cycle a `seen` set must also catch. */
export function makeMutualCauseErrors(): Error {
  const a = new Error('mutual-a');
  const b = new Error('mutual-b');
  (a as Error & { cause: unknown }).cause = b;
  (b as Error & { cause: unknown }).cause = a;
  return a;
}

/**
 * Hundreds of frames / tens of kB of stack — an unbounded stack on EVERY log
 *  line at a 100 % failure rate is a log bill and a drowned pipeline.
 * @param options
 * @param options.frames
 */
export function makeHugeStackError(options: { frames: number }): Error {
  const error = new Error('deep recursion');
  const frames = Array.from(
    { length: options.frames },
    (_v, i) =>
      `    at deeplyNestedFrame${String(i)} (/app/src/modules/chat/frame-${String(i)}.ts:${String(i + 1)}:7)`,
  );
  error.stack = ['Error: deep recursion', ...frames].join('\n');
  return error;
}

interface OpenAiApiErrorOverrides {
  requestBody?: string;
  apiKey?: string;
  userText?: string;
}

/**
 * Duck-types an `openai` `APIError`: it carries the outbound request (so, the
 * user's prompt), the auth header (so, the API key) and the provider's error
 * envelope — AND a `cause` that carries a request body of its own, because a
 * serialiser that allowlists the top level but recurses naively on `cause` leaks
 * just the same.
 *
 * This is the single most dangerous input of this run (design §7).
 * @param overrides
 */
export function makeOpenAiApiErrorLike(overrides: OpenAiApiErrorOverrides = {}): Error {
  const requestBody = overrides.requestBody ?? PROMPT_CANARY;
  const apiKey = overrides.apiKey ?? API_KEY_CANARY;
  const userText = overrides.userText ?? PII_CANARY;

  const inner = new Error('upstream connection reset');
  Object.assign(inner, {
    request: { body: `{"messages":[{"role":"user","content":"${userText}"}]}` },
  });

  const error = new Error('400 Invalid schema for response_format');
  error.name = 'BadRequestError';
  Object.assign(error, {
    status: 400,
    request: {
      body: `{"messages":[{"role":"user","content":"${requestBody}"}],"model":"gpt-4o-mini"}`,
      method: 'POST',
      url: 'https://api.openai.com/v1/chat/completions',
    },
    headers: { authorization: `Bearer ${apiKey}` },
    error: { message: 'Invalid schema', param: 'response_format', type: 'invalid_request_error' },
    cause: inner,
  });
  return error;
}

/**
 * A plain object with a cycle — `JSON.stringify` throws
 *  `TypeError: Converting circular structure to JSON` ON IT, i.e. inside the
 *  error handler: the original error is lost AND a new one is created.
 */
export function makeCyclicPlainObject(): Record<string, unknown> {
  const obj: Record<string, unknown> = { kind: 'not-an-error' };
  obj.self = obj;
  return obj;
}
