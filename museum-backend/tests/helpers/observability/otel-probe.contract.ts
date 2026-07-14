/**
 * RED phase — the wire contract shared by the offline probe and its Jest driver.
 *
 * Run `2026-07-14-otel-openai-instrumentation-kills-structured-llm` (design §6.3).
 *
 * This module is deliberately **side-effect free and dependency free**. It is the
 * ONLY thing the Jest worker and the child process are allowed to share: the
 * harness must NEVER `import`/`require` the probe itself, because merely loading
 * the probe would build the OTel bundle inside the worker and
 * `InstrumentationBase` patches the module loader **from its constructor** —
 * contaminating every test that worker runs afterwards (debug-log.md §2).
 */

/**
 * Prefixes the probe's single result line on stdout.
 *
 * A bare "last line of stdout" convention would be a bet, not a contract: in
 * `guarded` mode the application's real winston logger also writes to stdout
 * (`opentelemetry_initialized`). The marker makes the result unambiguous.
 */
export const PROBE_RESULT_MARKER = '##PROBE-RESULT##';

export type ProbeMode = 'guarded' | 'control';

export interface ProbeSuccess {
  ok: true;
  mode: ProbeMode;
  parsed: unknown;
  hasUsageMetadata: boolean;
  activeInstrumentations: string[];
}

export interface ProbeFailure {
  ok: false;
  mode: ProbeMode;
  name: string;
  message: string;
  stack: string;
  activeInstrumentations: string[];
}

export type ProbeResult = ProbeSuccess | ProbeFailure;
