/**
 * FE-only in-memory telemetry counters.
 *
 * Light-weight observability for features that need to count discrete events
 * (carnet list viewed, carnet detail viewed, carnet continue pressed — B1
 * §1.6 R34-R36). No Prometheus push V1 — counters live in process memory
 * and are read by tests via a getter. Production-side consumers can poll
 * the snapshot if/when we wire an FE telemetry pipeline (V1.1+).
 *
 * Side-effect-free under tests because jest mocks the module before the
 * counters object ever materialises — the test suite spies on the exported
 * function, not on the in-memory map. Production callers see a Map-backed
 * counter that is safe to call from any render or effect.
 */

const counters = new Map<string, number>();

/**
 * Increments the named counter by 1. Idempotent w.r.t. test-time mocking —
 * jest can swap the export for a spy without disturbing call sites.
 *
 * @param name Counter name, e.g. `'carnet_list_viewed_total'`.
 */
export function incrementCounter(name: string): void {
  counters.set(name, (counters.get(name) ?? 0) + 1);
}

/**
 * Reads the current counter value (0 when never incremented). Exposed for
 * future telemetry pipeline / test introspection — not used by feature code.
 */
export function getCounter(name: string): number {
  return counters.get(name) ?? 0;
}

/** Resets all counters — test-only helper. Production code must not call it. */
export function resetCountersForTest(): void {
  counters.clear();
}
