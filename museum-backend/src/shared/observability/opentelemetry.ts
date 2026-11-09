import { env } from '@src/config/env';

interface OtelSdkLike {
  start: () => void;
  shutdown: () => Promise<void>;
}

let sdkInstance: OtelSdkLike | null = null;

export function initOpenTelemetry(): void {
  if (!env.otel?.enabled) return;

  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
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
        '@opentelemetry/instrumentation-router': { enabled: false },
        '@opentelemetry/instrumentation-openai': { enabled: false },
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

export async function shutdownOpenTelemetry(): Promise<void> {
  if (sdkInstance) {
    try {
      await sdkInstance.shutdown();
    } catch {}
  }
}
