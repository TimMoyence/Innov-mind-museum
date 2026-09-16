/**
 * RED phase — offline probe for `INC-2026-07-14-otel-openai-structured`.
 *
 * Run `2026-07-14-otel-openai-instrumentation-kills-structured-llm`, task T1.4.
 * Contract: design.md §6.3 · cases: test-contract.md UC-1..UC-6, UC-42.
 *
 * WHAT THIS IS
 * ------------
 * A standalone Node script (executed by `ts-node -r tsconfig-paths/register`,
 * NEVER by Jest) that reproduces the production failure offline:
 *
 *     TypeError: Body is unusable: Body has already been read
 *
 * It exercises the REAL boundary end to end — the real Node module loader
 * (`require-in-the-middle`, patched by `InstrumentationBase` **at construction
 * time**), the real `@opentelemetry/auto-instrumentations-node` bundle, the real
 * `openai` SDK, the real `@langchain/openai` structured-output path, and a real
 * HTTP request over undici — against a local `node:http` server. Only the
 * content* of the HTTP response is simulated; never the code path that reads it
 * (spec C-8).
 *
 * NOT MOCKED, ON PURPOSE (spec C-8 / test-contract §Notes 4):
 *   - `getNodeAutoInstrumentations` — the bug lives in the instrumentation it
 *     constructs. Mocking it is exactly how this bug survives a green test suite.
 *   - the `openai` SDK / `@langchain/openai` — `APIPromise._thenUnwrap` is the
 *     memoisation seam that gets read twice.
 *   - the HTTP stack — `Response.json()` is what throws on the 2nd read.
 *
 * WHY A CHILD PROCESS: `InstrumentationBase` patches the module loader from its
 * CONSTRUCTOR. A worker that has ever *built* the bundle is contaminated for
 * every test it runs afterwards (debug-log.md §2, "erreur de banc": a bench that
 * called `getNodeAutoInstrumentations()` "just to list the names" silently
 * enabled everything and invalidated three verdicts). This file therefore lives
 * OUTSIDE Jest and is spawned as a disposable process by
 * `tests/helpers/observability/otel-probe.harness.ts`.
 *
 * MODES
 *   --mode=guarded : arms tracing through the application's REAL
 *                    `initOpenTelemetry()`. This is what makes the probe a proof
 *                    about OUR boot, not about a hand-copied config.
 *   --mode=control : arms the DEFAULT bundle (`getNodeAutoInstrumentations({})`,
 *                    no policy). This mode does NOT test our code — it proves the
 *                    harness still *sees* the upstream bug (non-vacuity), and it
 *                    is the upstream-fix detector: the day
 *                    open-telemetry/opentelemetry-js-contrib#3586 ships a fixed
 *                    release, `control` turns green — that is the SIGNAL TO LIFT
 *                    the guard, not a breakage.
 *
 * OUTPUT (one JSON line on stdout, then exit):
 *   exit 0 → {"ok":true, "parsed":{...}, "hasUsageMetadata":true, "activeInstrumentations":[...]}
 *   exit 1 → {"ok":false,"name":"TypeError","message":"Body is unusable: …", "activeInstrumentations":[...]}
 *
 * FROZEN-TEST (UFR-022): hashed in `red-test-manifest.json`. The red→green flip
 * must come from `src/` alone. If the green phase needs to touch this file, the
 * red phase was wrong → `BLOCK-TEST-WRONG`, re-spawn red.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- LOAD ORDER IS THE WHOLE POINT. `require-in-the-middle` (the mechanism every OTel instrumentation is built on) can only patch a module that is required AFTER the instrumentation is constructed. `@langchain/openai` (and, transitively, the `openai` SDK it wraps) MUST therefore be loaded lazily, once tracing is armed — exactly the order production uses (`instrumentation.ts` is the first import of `src/index.ts`). A top-level ESM import of `ChatOpenAI` is hoisted above everything and makes `instrumentation-openai` a silent no-op: the probe then goes GREEN while the bug is fully present — a vacuous test, which is the very failure class this run exists to close (spec C-8). Verified empirically 2026-07-14: with the top-level import, `--mode=control` exits 0. Approved-by: design.md §6.3 + lib-docs/opentelemetry/PATTERNS.md:43 */
import { createServer } from 'node:http';

import { z } from 'zod';

import { PROBE_RESULT_MARKER } from 'tests/helpers/observability/otel-probe.contract';

import type { ProbeMode } from 'tests/helpers/observability/otel-probe.contract';
import type { ChatOpenAI as ChatOpenAICtor } from '@langchain/openai';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

interface ChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details: { cached_tokens: number };
}

/**
 * Mirrors the shape of the real `summary` section schema
 * (`llm-sections/main-assistant-output.schema.ts`): a strict object, every field
 * required, no `.optional()` — which is what makes LangChain emit
 * `response_format: { type: 'json_schema' }` and therefore route through
 * `client.chat.completions.parse()` — the `_thenUnwrap` path that double-reads
 * the HTTP body when `@opentelemetry/instrumentation-openai` is active.
 */
const probeOutputSchema = z.object({
  text: z.string().describe('The assistant answer.'),
  confidence: z.number().describe('Confidence between 0 and 1.'),
});

const PROBE_ANSWER = {
  text: 'La Vénus de Milo est une statue grecque conservée au Louvre.',
  confidence: 0.92,
};

const PROBE_USAGE: ChatCompletionUsage = {
  prompt_tokens: 137,
  completion_tokens: 24,
  total_tokens: 161,
  prompt_tokens_details: { cached_tokens: 64 },
};

/**
 * A valid, schema-conforming `chat.completion` — with a `usage` block so the
 * real `@langchain/openai` derives `usage_metadata` from it (C-5 / R4 / UC-2).
 */
const chatCompletionBody = (): string =>
  JSON.stringify({
    id: 'chatcmpl-probe',
    object: 'chat.completion',
    created: 1_752_400_000,
    model: 'gpt-4o-mini',
    system_fingerprint: 'fp_probe',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: JSON.stringify(PROBE_ANSWER),
          refusal: null,
          tool_calls: [],
        },
        finish_reason: 'stop',
        logprobs: null,
      },
    ],
    usage: PROBE_USAGE,
  });

/** Ephemeral loopback OpenAI-compatible endpoint. No outbound network, no key. */
const startStubProvider = async (): Promise<{ server: Server; baseURL: string }> => {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
    });
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(chatCompletionBody());
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const { port } = server.address() as AddressInfo;
  return { server, baseURL: `http://127.0.0.1:${String(port)}/v1` };
};

/**
 * Records the instrumentation roster ACTUALLY armed in this process.
 *
 * This is a PASS-THROUGH RECORDER, **not a mock**: the real
 * `getNodeAutoInstrumentations` runs, the real instrumentations are constructed
 * (and therefore really patch the loader), and the real array is returned
 * untouched. We only read `instrumentationName` off the instances on their way
 * out. Anything stronger would fake the very boundary this probe exists to
 * exercise (spec C-8).
 *
 * The redefinition must happen BEFORE `initOpenTelemetry()` lazily `require()`s
 * the package — the CJS module cache hands it the same exports object.
 * @returns a getter for the names captured on the call the app made
 */
const installRosterRecorder = (): (() => string[]) => {
  const captured: string[] = [];
  const bundle = require('@opentelemetry/auto-instrumentations-node') as Record<string, unknown>;
  const original = bundle.getNodeAutoInstrumentations as (
    config?: unknown,
  ) => { instrumentationName: string }[];

  Object.defineProperty(bundle, 'getNodeAutoInstrumentations', {
    configurable: true,
    get: () => (config?: unknown) => {
      const instrumentations = original(config);
      captured.push(...instrumentations.map((i) => i.instrumentationName));
      return instrumentations;
    },
  });

  return () => [...captured];
};

interface ArmedTracing {
  shutdown: () => Promise<void>;
}

/**
 * `guarded` — the application's REAL boot path (this is what makes UC-1 a proof
 * about our tree). `OTEL_ENABLED=false` short-circuits inside it: nothing is
 * required, nothing is constructed, the loader stays unpatched (UC-6 / UC-25).
 */
const armGuarded = (): ArmedTracing => {
  const boot =
    require('@shared/observability/opentelemetry') as typeof import('@shared/observability/opentelemetry');
  boot.initOpenTelemetry();
  return { shutdown: () => boot.shutdownOpenTelemetry() };
};

/**
 * `control` — the DEFAULT bundle, no policy. Does not exercise our code; proves
 * the harness still sees the upstream bug (non-vacuity + upstream-fix detector).
 */
const armControl = (): ArmedTracing => {
  const { NodeSDK } = require('@opentelemetry/sdk-node') as {
    NodeSDK: new (cfg: unknown) => { start: () => void; shutdown: () => Promise<void> };
  };
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node') as {
    getNodeAutoInstrumentations: (cfg?: unknown) => unknown[];
  };

  const sdk = new NodeSDK({ instrumentations: [getNodeAutoInstrumentations({})] });
  sdk.start();
  return { shutdown: () => sdk.shutdown() };
};

const parseMode = (argv: string[]): ProbeMode => {
  const raw = argv.find((a) => a.startsWith('--mode='))?.slice('--mode='.length);
  if (raw === 'guarded' || raw === 'control') {
    return raw;
  }
  throw new Error(`structured-output-probe: --mode=guarded|control required (got ${String(raw)})`);
};

const emit = (payload: Record<string, unknown>): void => {
  process.stdout.write(`${PROBE_RESULT_MARKER}${JSON.stringify(payload)}\n`);
};

/**
 * The span exporter has NOTHING to do with the behaviour under test, but it can
 * still decide this process's exit code: `BatchSpanProcessor` flushes on
 * shutdown, and with no collector listening the OTLP client raises an
 * **uncaught** `AggregateError [ECONNREFUSED] 127.0.0.1:4318` (observed
 * 2026-07-14) — which would turn a SUCCESSFUL structured call into exit 1, i.e.
 * a false red that the green phase could never clear.
 *
 * Two belts:
 *  1. point both the app's exporter (`OTEL_EXPORTER_ENDPOINT`) and the OTel
 *     default (`OTEL_EXPORTER_OTLP_ENDPOINT`) at our own loopback stub, so the
 *     flush gets a 200 instead of a refused connection;
 *  2. surface — never swallow — any residual async noise on stderr, while
 *     keeping the exit code owned exclusively by `main()`.
 * @param baseURL - the stub provider's `/v1` base URL
 */
const containExporterNoise = (baseURL: string): void => {
  const origin = baseURL.replace(/\/v1$/, '');
  process.env.OTEL_EXPORTER_ENDPOINT = origin;
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = origin;

  process.on('unhandledRejection', (reason: unknown) => {
    process.stderr.write(`structured-output-probe: ignored async noise: ${String(reason)}\n`);
  });
};

const main = async (): Promise<number> => {
  const mode = parseMode(process.argv.slice(2));
  const readRoster = installRosterRecorder();
  const { server, baseURL } = await startStubProvider();
  containExporterNoise(baseURL);

  let tracing: ArmedTracing | undefined;

  try {
    // 1. ARM FIRST. 2. Load the LLM client SECOND. Never the other way round —
    //    see the eslint-disable rationale at the top of this file.
    tracing = mode === 'guarded' ? armGuarded() : armControl();

    const { ChatOpenAI } = require('@langchain/openai') as { ChatOpenAI: typeof ChatOpenAICtor };

    const model = new ChatOpenAI({
      apiKey: 'sk-probe-offline-not-a-real-key',
      model: 'gpt-4o-mini',
      temperature: 0,
      maxRetries: 0,
      configuration: { baseURL },
    });

    const structured = model.withStructuredOutput(probeOutputSchema, {
      name: 'probe_summary',
      includeRaw: true,
    });

    const result = (await structured.invoke([
      ['system', 'You are a museum guide.'],
      ['human', 'Parle-moi de la Vénus de Milo.'],
    ])) as { parsed?: unknown; raw?: { usage_metadata?: unknown } };

    emit({
      ok: true,
      mode,
      parsed: result.parsed ?? null,
      hasUsageMetadata: result.raw?.usage_metadata !== undefined,
      activeInstrumentations: readRoster(),
    });
    return 0;
  } catch (error) {
    const err = error as { name?: string; message?: string; stack?: string };
    emit({
      ok: false,
      mode,
      name: err.name ?? 'UnknownError',
      message: err.message ?? String(error),
      stack: (err.stack ?? '').split('\n').slice(0, 8).join('\n'),
      activeInstrumentations: readRoster(),
    });
    return 1;
  } finally {
    await new Promise<void>((resolve) =>
      server.close(() => {
        resolve();
      }),
    );
    if (tracing) {
      await tracing.shutdown().catch(() => undefined);
    }
  }
};

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error: unknown) => {
    // A crash HERE (module not found, bad argv…) is NOT the bug under test —
    // it must never be mistaken for a red-for-the-right-reason.
    process.stderr.write(`structured-output-probe: harness failure: ${String(error)}\n`);
    process.exit(2);
  });
