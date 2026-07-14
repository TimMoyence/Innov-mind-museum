/**
 * RED phase — disposable-process harnesses for the OTel instrumentation roster.
 *
 * Run `2026-07-14-otel-openai-instrumentation-kills-structured-llm`
 * (test-contract UC-11..UC-22 · design §D3).
 *
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE
 * ----------------------------------------
 * `InstrumentationBase` patches the Node module loader **from its constructor**.
 * Therefore: nothing here ever `require`s `@opentelemetry/auto-instrumentations-node`,
 * and nothing here ever `require`s the sentinel. Both are executed in a CHILD
 * process that exits immediately. A Jest worker that has once built the bundle is
 * contaminated for every test it runs afterwards — that exact mistake ("juste pour
 * lister les noms") silently enabled every instrumentation and invalidated three
 * verdicts during the investigation (debug-log.md §2).
 *
 * The child's env is rebuilt from scratch, and `OTEL_NODE_*` is never inherited:
 * a gate whose verdict depends on the shell that ran it is a gate that lies.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// tests/helpers/observability → museum-backend
const BACKEND_ROOT = resolve(__dirname, '..', '..', '..');
const SENTINEL = resolve(BACKEND_ROOT, 'scripts/sentinels/otel-instrumentation-roster.ts');
const TS_NODE_BIN = require.resolve('ts-node/dist/bin.js');

export interface ChildRun {
  code: number;
  stdout: string;
  stderr: string;
  /**
   * stdout + stderr — gate messages are written to either, and a test that only
   *  greps one of them is a test that can be defeated by a `console.error`.
   */
  output: string;
}

const cleanEnv = (extra: Record<string, string> = {}): Record<string, string> => ({
  PATH: process.env.PATH ?? '',
  HOME: process.env.HOME ?? '',
  NODE_ENV: 'test',
  PGDATABASE: 'museum_test',
  ...extra,
});

const capture = (bin: string, args: string[], env: Record<string, string>): ChildRun => {
  try {
    const stdout = execFileSync(bin, args, {
      cwd: BACKEND_ROOT,
      encoding: 'utf8',
      env,
      timeout: 120_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr: '', output: stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    const stdout = e.stdout ?? '';
    const stderr = e.stderr ?? '';
    return { code: e.status ?? 1, stdout, stderr, output: `${stdout}\n${stderr}` };
  }
};

export interface RosterSentinelOptions {
  /** Env to add to the (otherwise curated) child env — e.g. the OTEL_NODE_* pollution of UC-19. */
  env?: Record<string, string>;
  /** `--expected=<path>` — point the gate at a doctored allowlist (UC-14..UC-16). */
  expectedPath?: string;
  /**
   * `--policy=<json>` — present the gate with a doctored policy (UC-17/UC-18).
   *
   * This seam is a CLI argument OF A GATE SCRIPT, deliberately NOT an environment
   * variable read by `src/` (R11/AC-11): it cannot re-enable an instrumentation in
   * the application, because the application's policy map is priority 1 in the
   * bundle's own resolution order.
   */
  policyOverride?: Record<string, { enabled: boolean }>;
}

/**
 * Runs the real roster sentinel in a disposable process.
 * @param options - CLI seams + env pollution
 * @returns exit code and captured streams (a non-zero exit is DATA here)
 */
export const runRosterSentinel = (options: RosterSentinelOptions = {}): ChildRun => {
  const args = [TS_NODE_BIN, '--transpile-only', '-r', 'tsconfig-paths/register', SENTINEL];
  if (options.expectedPath !== undefined) {
    args.push(`--expected=${options.expectedPath}`);
  }
  if (options.policyOverride !== undefined) {
    args.push(`--policy=${JSON.stringify(options.policyOverride)}`);
  }
  return capture(process.execPath, args, cleanEnv(options.env));
};

/**
 * Runs an arbitrary CommonJS snippet in a disposable Node process rooted at the
 * backend (so `require('@opentelemetry/…')` resolves). The ONLY sanctioned way to
 * touch the real bundle from a test.
 * @param script - CJS source to evaluate
 * @param env - extra environment for the child
 * @returns exit code and captured streams
 */
export const runInDisposableNode = (script: string, env: Record<string, string> = {}): ChildRun =>
  capture(process.execPath, ['-e', script], cleanEnv(env));
