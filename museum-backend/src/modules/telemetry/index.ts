/**
 * Wave C5 / T-C55 — Telemetry module barrel.
 *
 * Public surface :
 *  - `TelemetryPort` / `TelemetryEvent` — port contract (PATTERNS.md §3.2),
 *    type-only re-export.
 *  - `getTelemetryPort()` — composition-root accessor used by emit sites
 *    (route handler, quota middleware).
 *  - `setTelemetryPort(p|null)` — test seam (frozen RED test
 *    `funnel-quota-exceeded.test.ts` calls this to inject a stub).
 *  - `PlausibleAdapter` — secondary adapter, exported for explicit composition
 *    in non-default boot contexts.
 *  - `funnelEventSchema` — Zod schema (re-exported for contract tests).
 *  - `telemetryRouter` — Express router (mounted under `/api/telemetry`).
 */

export type { TelemetryEvent, TelemetryPort } from './domain/telemetry.port';
export { getTelemetryPort, setTelemetryPort } from './composition/telemetry.module';
export { PlausibleAdapter } from './adapters/secondary/plausible.adapter';
export { funnelEventSchema } from './adapters/primary/http/schemas/funnel.schemas';
export type { FunnelEventInput } from './adapters/primary/http/schemas/funnel.schemas';
export { default as telemetryRouter } from './adapters/primary/http/routes/funnel.route';
