// This file must be imported FIRST in index.ts, before any other modules.
// OTel auto-instrumentation requires patching modules before they are imported.
import { initOpenTelemetry } from '@shared/observability/opentelemetry';

initOpenTelemetry();

// Diagnostic: intercept Node's MaxListenersExceededWarning and surface its
// stack trace through our structured logger. Default Node behaviour writes
// the trace to stderr only via `--trace-warnings`, which is harder to
// correlate in JSON-aggregated logs. Remove once the offending attach site
// (likely OTel http auto-instrumentation transient span listeners) is
// identified and fixed.
interface MaxListenersWarning extends Error {
  readonly emitter?: { constructor?: { name?: string } };
  readonly type?: string;
  readonly count?: number;
}
process.on('warning', (warning: Error) => {
  if (warning.name !== 'MaxListenersExceededWarning') return;
  const w = warning as MaxListenersWarning;
  // Avoid logger import (circular at process.on time) — write JSON to stderr.
  process.stderr.write(
    `${JSON.stringify({
      level: 'warn',
      message: 'max_listeners_exceeded_stack',
      timestamp: new Date().toISOString(),
      emitter: w.emitter?.constructor?.name ?? 'unknown',
      type: w.type ?? 'unknown',
      count: w.count ?? 0,
      stack: w.stack ?? '',
    })}\n`,
  );
});
