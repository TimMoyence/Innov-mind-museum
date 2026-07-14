/**
 * RED phase — execution harness for the offline structured-output probe.
 *
 * Run `2026-07-14-otel-openai-instrumentation-kills-structured-llm`
 * (design §6.2/§6.3 · test-contract UC-1..UC-6, UC-42 · Gate C §Notes 1).
 *
 * THIS IS THE REAL BOUNDARY OF THE `integration`-tier driver. The boundary this
 * run is about is the **Node module loader** (`require-in-the-middle`) + the real
 * `openai` SDK + a real HTTP round-trip — and it can only be crossed in a
 * process that has NOT already loaded them. So the boundary is crossed **in the
 * child**, and this harness is the thing that crosses it. That is not a
 * work-around of the tier sentinel; it is the accurate name for what this is.
 *
 * NON-NEGOTIABLE (test-contract §Notes 3, debug-log.md §2): the probe is spawned,
 * never imported. `InstrumentationBase` patches the module loader **from its
 * constructor** — a Jest worker that has once built the bundle is contaminated
 * for every test it runs afterwards. That mistake already invalidated one whole
 * bisection bench during the investigation.
 *
 * The child's environment is **built from scratch**, not inherited: an ambient
 * `OTEL_NODE_ENABLED_INSTRUMENTATIONS` in a developer's shell must not be able to
 * flip a verdict (and `OTEL_ENABLED=true` in someone's `.env` must not leak in
 * either — `NODE_ENV=test` already makes `env.ts` skip `dotenv.config()`).
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { PROBE_RESULT_MARKER } from './otel-probe.contract';

import type { ProbeMode, ProbeResult } from './otel-probe.contract';

// tests/helpers/observability → museum-backend
const BACKEND_ROOT = resolve(__dirname, '..', '..', '..');
const PROBE = resolve(BACKEND_ROOT, 'tests/fixtures/otel/structured-output-probe.ts');
const TS_NODE_BIN = require.resolve('ts-node/dist/bin.js');

export interface ProbeRunOptions {
  mode: ProbeMode;
  /** Extra env for the child. Overrides the curated baseline below. */
  env?: Record<string, string>;
}

export interface ProbeRun {
  code: number;
  stdout: string;
  stderr: string;
  /**
   * Parsed from the `##PROBE-RESULT##` line. `undefined` = the probe never got
   *  that far (a harness failure — NOT the bug under test; exit code 2).
   */
  result: ProbeResult | undefined;
}

/**
 * Curated child environment. Everything the probe needs, nothing it doesn't.
 *
 * - `NODE_ENV=test`  → `env.ts` skips `dotenv.config()`, so no `.env` on the dev
 *                      box can decide the outcome.
 * - `PGDATABASE`     → `env.ts` reads it eagerly via `required()` (no fallback).
 * - `OTEL_ENABLED=true` → the trigger variable; `guarded` cases that want the
 *                      cold-start path override it to `false`.
 * - No OpenAI key of any kind: the probe talks to a loopback stub.
 */
const baseChildEnv = (): Record<string, string> => ({
  PATH: process.env.PATH ?? '',
  HOME: process.env.HOME ?? '',
  NODE_ENV: 'test',
  PGDATABASE: 'museum_test',
  OTEL_ENABLED: 'true',
  // Keep the child's own logs quiet-ish; the result line carries a marker anyway.
  LOG_LEVEL: 'error',
});

const parseResultLine = (stdout: string): ProbeResult | undefined => {
  const line = stdout.split('\n').find((l) => l.startsWith(PROBE_RESULT_MARKER));
  if (line === undefined) {
    return undefined;
  }
  return JSON.parse(line.slice(PROBE_RESULT_MARKER.length)) as ProbeResult;
};

/**
 * Spawns the probe in a disposable Node process and returns its exit code +
 * parsed result. A non-zero exit is DATA here (the bug), not a thrown failure.
 * @param options - probe mode and environment overrides
 * @returns exit code, raw streams and the parsed probe result
 */
export const runStructuredOutputProbe = (options: ProbeRunOptions): ProbeRun => {
  const env = { ...baseChildEnv(), ...(options.env ?? {}) };
  const args = [
    TS_NODE_BIN,
    '--transpile-only',
    '-r',
    'tsconfig-paths/register',
    PROBE,
    `--mode=${options.mode}`,
  ];

  try {
    const stdout = execFileSync(process.execPath, args, {
      cwd: BACKEND_ROOT,
      encoding: 'utf8',
      env,
      timeout: 120_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr: '', result: parseResultLine(stdout) };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    const stdout = e.stdout ?? '';
    return {
      code: e.status ?? 1,
      stdout,
      stderr: e.stderr ?? '',
      result: parseResultLine(stdout),
    };
  }
};
