/**
 * THE GUARD POINT — the auto-instrumentation configuration map of this service.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY `instrumentation-openai` IS DISABLED (INC-2026-07-14-otel-openai-structured)
 * ─────────────────────────────────────────────────────────────────────────────
 * Nobody installed `@opentelemetry/instrumentation-openai`. It arrived as a
 * transitive dependency of `@opentelemetry/auto-instrumentations-node` and has
 * been ACTIVE BY DEFAULT since that bundle's 0.66.0.
 *
 * It patches `chat.completions.create()` and calls `.then(...)` on the SDK's
 * `APIPromise` — which CONSUMES the HTTP response body. Musaium never calls the
 * model bare: every chat section goes through `withStructuredOutput()`, i.e.
 * `response_format: json_schema`, i.e. `client.chat.completions.parse()`, i.e.
 * `APIPromise._thenUnwrap()` — a SECOND `APIPromise` over the SAME body, with
 * its own per-instance memoisation. Two `response.json()` on one body:
 *
 *     TypeError: Body is unusable: Body has already been read
 *
 * Measured consequence with `OTEL_ENABLED=true`: 0 success / 42 calls, every
 * chat answer served as the canned `createSummaryFallback` template. The
 * assistant never answered. The V2 "LLM judge" guardrail and the
 * knowledge-extraction classifier ride the same structured path and were
 * silently disarmed with it.
 *
 * Upstream: open-telemetry/opentelemetry-js-contrib#3586 (OPEN, p1). The faulty
 * patch is byte-identical from 0.15.0 to 0.18.0 — bumping repairs NOTHING.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE NAME MUST BE THE FULL PACKAGE NAME
 * ─────────────────────────────────────────────────────────────────────────────
 * `getNodeAutoInstrumentations()` indexes its `InstrumentationMap` by PACKAGE
 * NAME. An unknown key (`'openai'`, a typo, an upstream rename) only triggers a
 * `diag.error(...)` inside `checkManuallyProvidedInstrumentationNames` — and we
 * wire no `DiagLogger`, so it is MUTE. A short key is therefore a SILENT NO-OP:
 * the config reads as if it were fixed, and the instrumentation stays armed.
 * (The env vars take the opposite form — the short suffix — which is exactly why
 * this is so easy to get wrong.) The `sentinel:otel-roster` gate exists to make
 * that mistake impossible to merge.
 *
 * This map is PRIORITY 1 in the bundle's own resolution order (`enabled: false`
 * is evaluated before any environment variable), so no operator-set
 * `OTEL_NODE_ENABLED_INSTRUMENTATIONS` can resurrect the broken path. R11 is
 * true by construction, not by discipline — no feature flag is needed, and none
 * is offered (UFR-015).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW TO LIFT THE GUARD (the condition, so nobody has to do archaeology)
 * ─────────────────────────────────────────────────────────────────────────────
 * When a published `@opentelemetry/instrumentation-openai` stops consuming the
 * body (the reference remedy is to patch `_thenUnwrap` rather than `.then()` the
 * `APIPromise` — cf. DataDog/dd-trace-js#5253), the `control` mode of
 * `tests/fixtures/otel/structured-output-probe.ts` STOPS reproducing the bug and
 * its assertion turns red. That red IS the signal to lift: drop the entry below,
 * refresh the roster allowlist, delete the control mode.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO IMPORTS IN THIS FILE — ON PURPOSE
 * ─────────────────────────────────────────────────────────────────────────────
 * `opentelemetry.ts` loads the OTel packages with `require()` INSIDE
 * `initOpenTelemetry()`, never at module top level: that is what preserves the
 * cold start when `OTEL_ENABLED=false` (the ~40 instrumentations are never even
 * loaded, so the module loader is never patched). A single
 * `import { getNodeAutoInstrumentations } from '@opentelemetry/…'` at the top of
 * this module would destroy that property. This module is PURE DATA, and the
 * roster sentinel imports the very same constant — one source of truth, so the
 * gate cannot end up guarding a fiction.
 */

/** One entry of the auto-instrumentation configuration map. */
export interface OtelInstrumentationToggle {
  readonly enabled: boolean;
}

/** The configuration map handed to `getNodeAutoInstrumentations()`. */
export type OtelAutoInstrumentationPolicy = Readonly<Record<string, OtelInstrumentationToggle>>;

/**
 * Frozen so a hot mutation cannot quietly re-arm an offender at runtime.
 *
 * - `instrumentation-fs`     — noise (also the bundle's ONLY default exclusion).
 * - `instrumentation-dns`    — noise.
 * - `instrumentation-router` — `prependListener('finish')` per router layer →
 *   MaxListenersExceededWarning past ~10 middlewares (2026-05-12). NOT a
 *   decorative disable: the key IS in the installed bundle's `InstrumentationMap`
 *   (verified against `node_modules`, contrary to what our own lib-docs claim).
 *   Do NOT re-enable; raising `setMaxListeners` is not the fix.
 * - `instrumentation-openai` — INC-2026-07-14: double-reads the HTTP response
 *   body and kills every structured-output LLM call. See the header.
 */
export const OTEL_AUTO_INSTRUMENTATION_POLICY: OtelAutoInstrumentationPolicy = Object.freeze({
  '@opentelemetry/instrumentation-fs': Object.freeze({ enabled: false }),
  '@opentelemetry/instrumentation-dns': Object.freeze({ enabled: false }),
  '@opentelemetry/instrumentation-router': Object.freeze({ enabled: false }),
  '@opentelemetry/instrumentation-openai': Object.freeze({ enabled: false }),
});

/**
 * The instrumentations this policy turns OFF, in declaration order. Logged at
 * boot next to the roster that is actually ARMED (R6): "which instrumentations
 * run on this instance?" must be answerable from the logs, not from
 * `node_modules`.
 */
export const OTEL_DISABLED_INSTRUMENTATIONS: readonly string[] = Object.freeze(
  Object.entries(OTEL_AUTO_INSTRUMENTATION_POLICY)
    .filter(([, toggle]) => !toggle.enabled)
    .map(([name]) => name),
);
