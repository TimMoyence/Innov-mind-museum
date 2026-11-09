export type { TelemetryEvent, TelemetryPort } from './domain/telemetry.port';
export { getTelemetryPort, setTelemetryPort } from './composition/telemetry.module';
export { PlausibleAdapter } from './adapters/secondary/plausible.adapter';
export { funnelEventSchema } from './adapters/primary/http/schemas/funnel.schemas';
export type { FunnelEventInput } from './adapters/primary/http/schemas/funnel.schemas';
export { default as telemetryRouter } from './adapters/primary/http/routes/funnel.route';
