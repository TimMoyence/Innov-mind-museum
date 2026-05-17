/**
 * Tests for C9.0 — Langfuse `trace + nested generation` shape on the LLM
 * orchestrator wrapper. Asserts EARS requirements R1..R7 from
 * `.claude/skills/team/team-state/2026-05-17-w1-c9-0-langfuse-spans/spec.md`.
 *
 * Strategy: mock `getLangfuse()` to return a fake client whose `trace()` /
 * `trace.generation()` / `generation.end()` are jest spies. Run the real
 * `withLangfuseTrace()` against a `fn()` that resolves a fixed
 * `OrchestratorOutput`. Inspect spy call args. PII discipline is verified via
 * a sentinel substring grep on the JSON-stringified spy args (R6).
 */

import { withLangfuseTrace } from '@modules/chat/adapters/secondary/llm/langchain-orchestrator-tracing';
import { getLangfuse } from '@shared/observability/langfuse.client';
import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import type {
  OrchestratorInput,
  OrchestratorOutput,
} from '@modules/chat/domain/ports/chat-orchestrator.port';

jest.mock('@shared/observability/langfuse.client', () => ({
  getLangfuse: jest.fn(() => null),
}));

jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const getLangfuseMock = getLangfuse as jest.MockedFunction<typeof getLangfuse>;
const loggerWarnMock = logger.warn as jest.MockedFunction<typeof logger.warn>;

const SENTINEL_RAW_TEXT = 'TOPSECRET_RAW_TEXT';
const SENTINEL_RAW_IMG = 'TOPSECRET_RAW_IMG_BYTES';

/**
 * Minimal OrchestratorInput factory for tracing tests. Lives inline because
 * the port type is a DTO and the legitimate "factory" for it is its callers
 * (chat-message.service.ts, describe.service.ts). This stays in the test file
 * to keep CLAUDE.md test-discipline "shared factories" rule honoured for the
 * Domain Entity side (ChatMessage / ChatSession use `makeMessage`).
 */
function makeOrchestratorInput(overrides: Partial<OrchestratorInput> = {}): OrchestratorInput {
  return {
    history: [],
    text: SENTINEL_RAW_TEXT,
    locale: 'fr',
    museumMode: false,
    requestId: 'req-c90-001',
    userId: 42,
    museumId: 7,
    sessionId: 'sess-c90-001',
    intent: 'default',
    ...overrides,
  };
}

function makeOrchestratorOutput(overrides: Partial<OrchestratorOutput> = {}): OrchestratorOutput {
  return {
    text: 'The Mona Lisa is a portrait painting by Leonardo da Vinci.',
    metadata: { citations: [] },
    ...overrides,
  };
}

/**
 * Builds a fake Langfuse client where every call site is a jest spy. The
 * shape mirrors the SUBSET of the Langfuse SDK the tracing wrapper actually
 * calls — trace().generation().end(). Returns the client + the spies for
 * direct assertion.
 */
function makeFakeLangfuseClient() {
  const generationEnd = jest.fn();
  const fakeGeneration = { end: generationEnd };
  const traceGeneration = jest.fn().mockReturnValue(fakeGeneration);
  const fakeTrace = { generation: traceGeneration };
  const clientTrace = jest.fn().mockReturnValue(fakeTrace);
  const fakeClient = { trace: clientTrace };
  return {
    fakeClient,
    clientTrace,
    traceGeneration,
    generationEnd,
  };
}

describe('withLangfuseTrace (C9.0 — trace + nested generation)', () => {
  beforeEach(() => {
    getLangfuseMock.mockReset();
    loggerWarnMock.mockReset();
  });

  describe('R1 — trace emission with userId/sessionId/museumId', () => {
    it('calls lf.trace() once with userId/sessionId on the trace and museumId in metadata', async () => {
      const { fakeClient, clientTrace } = makeFakeLangfuseClient();
      getLangfuseMock.mockReturnValue(fakeClient as unknown as ReturnType<typeof getLangfuse>);

      const input = makeOrchestratorInput({ userId: 42, sessionId: 'sess-abc', museumId: 7 });
      await withLangfuseTrace('llm.orchestrate', input, async () => makeOrchestratorOutput());

      expect(clientTrace).toHaveBeenCalledTimes(1);
      const traceArg = clientTrace.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(traceArg).toMatchObject({
        name: 'llm.orchestrate',
        userId: '42',
        sessionId: 'sess-abc',
        metadata: expect.objectContaining({ museumId: 7 }),
      });
    });
  });

  describe('R2 — nested generation observation w/ model + input/output + timing', () => {
    it('calls trace.generation() once with model + structured input/output and Date start/end', async () => {
      const { fakeClient, traceGeneration, generationEnd } = makeFakeLangfuseClient();
      getLangfuseMock.mockReturnValue(fakeClient as unknown as ReturnType<typeof getLangfuse>);

      const input = makeOrchestratorInput({
        history: [],
        text: 'short',
        locale: 'en',
        intent: 'walk',
        museumMode: true,
        image: { source: 'base64', value: SENTINEL_RAW_IMG, mimeType: 'image/jpeg' },
      });
      const output = makeOrchestratorOutput({ text: 'twenty character resp' }); // 21 chars

      await withLangfuseTrace('llm.orchestrate', input, async () => output);

      expect(traceGeneration).toHaveBeenCalledTimes(1);
      const genArg = traceGeneration.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(genArg).toMatchObject({
        name: 'llm.orchestrate.generation',
        model: env.llm.model,
        input: expect.objectContaining({
          historyLength: 0,
          locale: 'en',
          hasImage: true,
          intent: 'walk',
          museumMode: true,
        }),
        startTime: expect.any(Date),
      });

      expect(generationEnd).toHaveBeenCalledTimes(1);
      const endArg = generationEnd.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(endArg).toMatchObject({
        output: expect.objectContaining({ textLength: output.text.length }),
        endTime: expect.any(Date),
      });
    });
  });

  describe('R3 — error path closes generation with level=ERROR and re-throws', () => {
    it('calls generation.end({ level: "ERROR", statusMessage }) and re-throws original error', async () => {
      const { fakeClient, generationEnd } = makeFakeLangfuseClient();
      getLangfuseMock.mockReturnValue(fakeClient as unknown as ReturnType<typeof getLangfuse>);

      const boom = new Error('provider timeout');
      const input = makeOrchestratorInput();

      await expect(
        withLangfuseTrace('llm.orchestrate', input, async () => {
          throw boom;
        }),
      ).rejects.toBe(boom);

      expect(generationEnd).toHaveBeenCalledTimes(1);
      const endArg = generationEnd.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(endArg).toMatchObject({
        level: 'ERROR',
        statusMessage: 'provider timeout',
        endTime: expect.any(Date),
      });
    });
  });

  describe('R4 — null client (telemetry disabled) is fully no-op', () => {
    it('never calls trace/generation when getLangfuse() returns null and returns the fn() result', async () => {
      getLangfuseMock.mockReturnValue(null);

      const input = makeOrchestratorInput();
      const output = makeOrchestratorOutput({ text: 'no telemetry path' });

      const result = await withLangfuseTrace('llm.orchestrate', input, async () => output);

      expect(result).toBe(output);
      // No client to spy on — verifying via the mock factory's lack of invocation.
      expect(getLangfuseMock).toHaveBeenCalled();
    });
  });

  describe('R5 — fail-open on SDK throw', () => {
    it('does not propagate when lf.trace() throws — orchestrator path completes', async () => {
      const throwingClient = {
        trace: jest.fn(() => {
          throw new Error('langfuse SDK boom');
        }),
      };
      getLangfuseMock.mockReturnValue(throwingClient as unknown as ReturnType<typeof getLangfuse>);

      const input = makeOrchestratorInput();
      const output = makeOrchestratorOutput();

      await expect(withLangfuseTrace('llm.orchestrate', input, async () => output)).resolves.toBe(
        output,
      );

      // safeTrace swallows + warns via logger
      expect(loggerWarnMock).toHaveBeenCalledWith(
        'langfuse trace dropped (fail-open)',
        expect.objectContaining({ label: expect.stringContaining('langfuse') }),
      );
    });
  });

  describe('R6 — PII discipline: no raw text / image bytes in Langfuse payloads', () => {
    it('never includes raw input.text, image.value, or result.text substrings in trace/generation/end args', async () => {
      const { fakeClient, clientTrace, traceGeneration, generationEnd } = makeFakeLangfuseClient();
      getLangfuseMock.mockReturnValue(fakeClient as unknown as ReturnType<typeof getLangfuse>);

      const input = makeOrchestratorInput({
        text: SENTINEL_RAW_TEXT,
        image: { source: 'base64', value: SENTINEL_RAW_IMG, mimeType: 'image/jpeg' },
      });
      const output = makeOrchestratorOutput({
        text: 'TOPSECRET_RAW_OUTPUT_TEXT — should not leak',
      });

      await withLangfuseTrace('llm.orchestrate', input, async () => output);

      const allArgs = [
        ...clientTrace.mock.calls,
        ...traceGeneration.mock.calls,
        ...generationEnd.mock.calls,
      ];
      const serialized = JSON.stringify(allArgs);
      expect(serialized).not.toContain(SENTINEL_RAW_TEXT);
      expect(serialized).not.toContain(SENTINEL_RAW_IMG);
      expect(serialized).not.toContain('TOPSECRET_RAW_OUTPUT_TEXT');
    });
  });

  describe('R7 — undefined sessionId is honoured (no fabrication)', () => {
    it('passes sessionId: undefined when input.sessionId is undefined — no generated UUID', async () => {
      const { fakeClient, clientTrace } = makeFakeLangfuseClient();
      getLangfuseMock.mockReturnValue(fakeClient as unknown as ReturnType<typeof getLangfuse>);

      const input = makeOrchestratorInput({ sessionId: undefined });
      await withLangfuseTrace('llm.orchestrate', input, async () => makeOrchestratorOutput());

      expect(clientTrace).toHaveBeenCalledTimes(1);
      const traceArg = clientTrace.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      // sessionId key may be present-with-undefined OR absent; both honour R7
      // (no fabrication). Reject any non-empty-string value.
      const sessionId = traceArg?.sessionId;
      expect(sessionId === undefined || sessionId === null).toBe(true);
    });
  });
});
