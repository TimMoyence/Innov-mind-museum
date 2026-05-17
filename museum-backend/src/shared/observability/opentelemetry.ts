/* eslint-disable @typescript-eslint/no-require-imports -- OpenTelemetry conditional loading requires CJS require() */
import { env } from '@src/config/env';

interface OtelSdkLike {
  start: () => void;
  shutdown: () => Promise<void>;
}

let sdkInstance: OtelSdkLike | null = null;

/** Dynamic `require()` so OTel packages only load when enabled. */
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

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        // Disabled: RouterInstrumentation attaches `prependListener('finish')` PER router
        // layer → with ~15 middlewares stacks 11+ finish listeners on ServerResponse,
        // tripping MaxListenersExceededWarning (2026-05-12). instrumentation-http (1 span/
        // request) + instrumentation-express (chain span) cover our needs. DO NOT re-enable;
        // bumping setMaxListeners is NOT the fix.
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

export async function shutdownOpenTelemetry(): Promise<void> {
  if (sdkInstance) {
    try {
      await sdkInstance.shutdown();
    } catch {
      // swallow shutdown errors
    }
  }
}
