/* eslint-disable @typescript-eslint/no-require-imports -- OpenTelemetry conditional loading requires CJS require() */
import { env } from '@src/config/env';

/** Structural subset of `@opentelemetry/sdk-node`'s NodeSDK that this module touches. */
interface OtelSdkLike {
  start: () => void;
  shutdown: () => Promise<void>;
}

let sdkInstance: OtelSdkLike | null = null;

/**
 * Initializes the OpenTelemetry SDK with auto-instrumentation and OTLP trace export.
 * No-op when `OTEL_ENABLED` is not set — the app runs identically without OTel.
 *
 * Uses dynamic `require()` so OTel packages are only loaded when the feature is enabled,
 * avoiding import errors if the packages aren't installed in some environments.
 */
export function initOpenTelemetry(): void {
  if (!env.otel?.enabled) return;

  // Dynamic imports to avoid loading OTel packages when disabled
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  // `@opentelemetry/resources` v2 removed the `Resource` class constructor —
  // use the `resourceFromAttributes(...)` factory instead (Renovate PR #224
  // bumped the OTel monorepo to ^0.217.0 without migrating this call site,
  // which crashed every container start in prod with "Resource is not a
  // constructor" — see 2026-05-12 hotfix).
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

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        // Root cause of `MaxListenersExceededWarning: 11 finish listeners`
        // (2026-05-12). RouterInstrumentation attaches a `prependListener('finish')`
        // PER router layer to scope its span — Express has ~15 middlewares
        // (requestLogger, cors, rate-limit, helmet, compression, json,
        // urlencoded, cookieParser, csrf, …), so every request stacks 11+
        // finish listeners on its ServerResponse. We keep instrumentation-http
        // (1 span/request) + instrumentation-express (middleware chain span);
        // per-layer router spans are redundant for our needs and pay a high
        // listener-cost. Stack trace captured via process.on('warning') hook
        // in src/instrumentation.ts pointed straight here.
        '@opentelemetry/instrumentation-router': { enabled: false },
      }),
    ],
  });

  sdk.start();
  sdkInstance = sdk;

  const { logger } = require('@shared/logger/logger');
  logger.info('opentelemetry_initialized', {
    endpoint: env.otel.exporterEndpoint,
    serviceName: env.otel.serviceName,
  });
}

/**
 * Gracefully shuts down the OpenTelemetry SDK, flushing pending spans.
 * No-op when the SDK was never started.
 */
export async function shutdownOpenTelemetry(): Promise<void> {
  if (sdkInstance) {
    try {
      await sdkInstance.shutdown();
    } catch {
      // swallow shutdown errors
    }
  }
}
