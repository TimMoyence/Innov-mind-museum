/* eslint-disable @typescript-eslint/no-require-imports -- OpenTelemetry conditional loading requires CJS require() */
import {
  OTEL_AUTO_INSTRUMENTATION_POLICY,
  OTEL_DISABLED_INSTRUMENTATIONS,
} from '@shared/observability/otel-instrumentation-policy';
import { env } from '@src/config/env';

interface OtelSdkLike {
  start: () => void;
  shutdown: () => Promise<void>;
}

/** What `getNodeAutoInstrumentations()` hands back — one entry per ARMED instrumentation. */
interface InstrumentationLike {
  instrumentationName: string;
}

let sdkInstance: OtelSdkLike | null = null;

/**
 * Dynamic `require()` so OTel packages only load when enabled.
 *
 * The `require()`s below MUST stay inside this function. Hoisting any of them to
 * a top-level `import` would load AND CONSTRUCT the ~40 bundled instrumentations
 * even when `OTEL_ENABLED=false` — `InstrumentationBase` patches the Node module
 * loader from its CONSTRUCTOR — destroying the cold-start guarantee.
 *
 * The instrumentation policy itself (`OTEL_AUTO_INSTRUMENTATION_POLICY`) is pure
 * data with zero imports, so importing it at the top costs nothing and keeps ONE
 * source of truth shared with the `sentinel:otel-roster` gate.
 */
export function initOpenTelemetry(): void {
  if (!env.otel?.enabled) return;

  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  // `@opentelemetry/resources` v2 removed `Resource` constructor — use
  // `resourceFromAttributes()` factory (Renovate PR #224 hotfix 2026-05-12,
  // "Resource is not a constructor" crashed every container start in prod).
  const { resourceFromAttributes } = require('@opentelemetry/resources');
  const {
    ATTR_SERVICE_NAME,
    ATTR_SERVICE_VERSION,
  } = require('@opentelemetry/semantic-conventions');

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: env.otel.serviceName,
    [ATTR_SERVICE_VERSION]: env.appVersion,
  });

  const traceExporter = new OTLPTraceExporter({
    url: `${env.otel.exporterEndpoint}/v1/traces`,
  });

  // The disabled set (fs, dns, router, openai) lives in ONE place — the policy
  // module — because the roster sentinel reads that same constant. A literal
  // copied here would give the gate a second source of truth to guard, i.e. a
  // fiction. See otel-instrumentation-policy.ts for why each entry is there and
  // for the condition under which the openai one may be lifted.
  const autoInstrumentations: InstrumentationLike[] = getNodeAutoInstrumentations(
    OTEL_AUTO_INSTRUMENTATION_POLICY,
  );

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    instrumentations: [autoInstrumentations],
  });

  sdk.start();
  sdkInstance = sdk;

  const { logger } = require('@shared/logger/logger');
  // R6 — ENUMERATE the roster at boot. "Which instrumentations are running on
  // this instance?" had no answer short of reading node_modules; that is a large
  // part of why a 100 %-failure outage lived ~2 months. The list is DERIVED from
  // the real return value — a hand-written list would lie from the first bump
  // onwards, i.e. on the exact day it is needed.
  logger.info('opentelemetry_initialized', {
    endpoint: env.otel.exporterEndpoint,
    serviceName: env.otel.serviceName,
    instrumentations: autoInstrumentations.map((instr) => instr.instrumentationName),
    disabledInstrumentations: [...OTEL_DISABLED_INSTRUMENTATIONS],
  });
}

export async function shutdownOpenTelemetry(): Promise<void> {
  if (sdkInstance) {
    try {
      await sdkInstance.shutdown();
    } catch {
      // swallow shutdown errors
    }
  }
}
