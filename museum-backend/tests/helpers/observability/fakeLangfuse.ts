/**
 * Shared fake Langfuse client factory for unit tests (DRY — docs/TEST_FACTORIES.md).
 *
 * Mirrors the canonical inline pattern in
 * `tests/unit/observability/langchain-orchestrator-tracing.test.ts:78-91`, but
 * adds an `event()` spy alongside `generation()` so the LLM-Guard `event` path
 * (TD-20 R4) can use the same fake. Each call site is a jest spy; assert on
 * `spy.mock.calls[n][0]` shapes.
 *
 * Shape covered = the SUBSET of the Langfuse v3.38.20 SDK the instrumented
 * paths call:
 *   lf.trace({...}).generation({...}).end({...})
 *   lf.trace({...}).event({...})
 * (PATTERNS.md §2.3 trace().generation()/.event() chain — lib-docs/langfuse/PATTERNS.md:94-117.)
 */

export interface FakeLangfuse {
  /** The fake client to return from a mocked `getLangfuse()`. */
  fakeClient: { trace: jest.Mock };
  /** Spy on `lf.trace(body)`. */
  clientTrace: jest.Mock;
  /** Spy on `trace.generation(body)`. */
  traceGeneration: jest.Mock;
  /** Spy on `generation.end(body)`. */
  generationEnd: jest.Mock;
  /** Spy on `trace.event(body)`. */
  traceEvent: jest.Mock;
}

/**
 * Builds a fake Langfuse client whose every call site is a jest spy.
 * The trace exposes `generation()` (chainable to `.end()`) and `event()`.
 * @returns the fake client + the spies for direct assertion.
 */
export function makeFakeLangfuseClient(): FakeLangfuse {
  const generationEnd = jest.fn();
  const fakeGeneration = { end: generationEnd };
  const traceGeneration = jest.fn().mockReturnValue(fakeGeneration);
  const traceEvent = jest.fn();
  const fakeTrace = { generation: traceGeneration, event: traceEvent };
  const clientTrace = jest.fn().mockReturnValue(fakeTrace);
  const fakeClient = { trace: clientTrace };
  return {
    fakeClient,
    clientTrace,
    traceGeneration,
    generationEnd,
    traceEvent,
  };
}
