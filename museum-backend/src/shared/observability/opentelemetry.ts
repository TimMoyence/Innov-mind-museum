/* eslint-disable @typescript-eslint/no-require-imports -- OpenTelemetry conditional loading requires CJS require() */
import { env } from '@src/config/env';

let sdkInstance: any = null;

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
  const { Resource } = require('@opentelemetry/resources');
  const {
    ATTR_SERVICE_NAME,
    ATTR_SERVICE_VERSION,
  } = require('@opentelemetry/semantic-conventions');

  const resource = new Resource({
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
