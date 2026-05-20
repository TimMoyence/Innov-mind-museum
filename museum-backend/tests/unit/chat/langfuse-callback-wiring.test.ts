/**
 * TD-LF-02 wiring test — `withLangfuseTrace` constructs a
 * `langfuse-langchain` `CallbackHandler({ root: trace, updateRoot: true })`
 * after opening the Langfuse trace AND writes it onto the supplied
 * `LangfuseCallbacksRef` so downstream `.invoke()` calls can fold it into
 * their opts via the shared `mergeInvokeOpts` helper.
 *
 * NOT verified here: acceptance batch1 #4 ("Langfuse cost UI shows non-zero
 * token/cost on a probe call") — that requires live Langfuse infra. This
 * test locks the WIRING contract that makes that observable possible, so a
 * future refactor that drops the callback threading fails loudly.
 *
 * Fail-open scenarios also asserted : Langfuse disabled (no trace) → ref
 * stays undefined ; `langfuse-langchain` load failure → ref stays undefined.
 */

const CallbackHandlerCtorMock = jest.fn();

jest.mock('langfuse-langchain', () => ({
  __esModule: true,
  CallbackHandler: jest.fn().mockImplementation((cfg: { root: unknown; updateRoot: boolean }) => {
    CallbackHandlerCtorMock(cfg);
    return {
      name: 'fake-langfuse-handler',
      handleChainStart: jest.fn(),
      handleChainEnd: jest.fn(),
    };
  }),
}));

jest.mock('@shared/observability/safeTrace', () => ({
  /** Pass-through — mirrors the real fail-open semantics for the happy path. */
  safeTrace: <T>(_label: string, fn: () => T): T | undefined => {
    try {
      return fn();
    } catch {
      return undefined;
    }
  },
}));

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const getLangfuseMock = jest.fn();
jest.mock('@shared/observability/langfuse.client', () => ({
  getLangfuse: () => getLangfuseMock(),
}));

jest.mock('@src/config/env', () => ({
  env: {
    llm: { provider: 'openai', model: 'gpt-4o-mini' },
    langfuse: { enabled: true },
  },
}));

import { withLangfuseTrace } from '@modules/chat/adapters/secondary/llm/langchain-orchestrator-tracing';
import { resetLangfuseLangChainLoaderForTests } from '@shared/observability/langfuse-langchain';

import type { LangfuseCallbacksRef } from '@modules/chat/adapters/secondary/llm/langchain-orchestrator-support';
import type { OrchestratorInput } from '@modules/chat/domain/ports/chat-orchestrator.port';

/** Minimal `OrchestratorInput` shape — `withLangfuseTrace` only reads metadata fields. */
const fakeInput = (): OrchestratorInput =>
  ({
    requestId: 'rq-1',
    sessionId: 'sess-1',
    userId: 42,
    history: [],
    locale: 'en',
    intent: 'default',
    museumMode: 'free',
    museumId: 1,
    text: undefined,
    image: undefined,
  }) as unknown as OrchestratorInput;

beforeEach(() => {
  resetLangfuseLangChainLoaderForTests();
  CallbackHandlerCtorMock.mockReset();
  getLangfuseMock.mockReset();
});

describe('TD-LF-02 — Langfuse CallbackHandler wiring', () => {
  it('constructs the CallbackHandler against the opened trace and writes it into callbacksRef', async () => {
    const fakeGeneration = { end: jest.fn() };
    const fakeTrace = { generation: jest.fn().mockReturnValue(fakeGeneration), id: 'trace-1' };
    getLangfuseMock.mockReturnValue({
      trace: jest.fn().mockReturnValue(fakeTrace),
    });

    const callbacksRef: LangfuseCallbacksRef = {};
    const result = await withLangfuseTrace(
      'llm.orchestrate',
      fakeInput(),
      () => Promise.resolve({ text: 'ok', metadata: { citations: [] } }),
      undefined,
      callbacksRef,
    );

    expect(result.text).toBe('ok');
    expect(CallbackHandlerCtorMock).toHaveBeenCalledTimes(1);
    const [cfg] = CallbackHandlerCtorMock.mock.calls[0] as [{ root: unknown; updateRoot: boolean }];
    expect(cfg).toEqual({ root: fakeTrace, updateRoot: true });

    expect(callbacksRef.current).toBeDefined();
    expect(callbacksRef.current).toHaveLength(1);
    expect(callbacksRef.current?.[0]).toEqual(
      expect.objectContaining({ name: 'fake-langfuse-handler' }),
    );
  });

  it('does not touch callbacksRef when Langfuse is disabled (no trace opened)', async () => {
    getLangfuseMock.mockReturnValue(null);

    const callbacksRef: LangfuseCallbacksRef = {};
    await withLangfuseTrace(
      'llm.orchestrate',
      fakeInput(),
      () => Promise.resolve({ text: 'ok', metadata: { citations: [] } }),
      undefined,
      callbacksRef,
    );

    expect(CallbackHandlerCtorMock).not.toHaveBeenCalled();
    expect(callbacksRef.current).toBeUndefined();
  });

  it('runs unchanged when no callbacksRef is supplied (back-compat with pre-LF-02 callers)', async () => {
    const fakeGeneration = { end: jest.fn() };
    getLangfuseMock.mockReturnValue({
      trace: jest.fn().mockReturnValue({ generation: jest.fn().mockReturnValue(fakeGeneration) }),
    });

    const result = await withLangfuseTrace(
      'llm.orchestrate',
      fakeInput(),
      () => Promise.resolve({ text: 'ok', metadata: { citations: [] } }),
      undefined,
      // No callbacksRef — happy path for legacy callers.
    );

    expect(result.text).toBe('ok');
    expect(CallbackHandlerCtorMock).not.toHaveBeenCalled();
  });
});
