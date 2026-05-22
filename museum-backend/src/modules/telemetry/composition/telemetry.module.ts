import { PlausibleAdapter } from '@modules/telemetry/adapters/secondary/plausible.adapter';
import { env } from '@src/config/env';

import type { TelemetryPort } from '@modules/telemetry/domain/telemetry.port';

/**
 * Wave C5 / T-C55 — Telemetry composition root.
 *
 * Lazy default : a {@link PlausibleAdapter} built from `env.plausible.*`.
 * Tests / the integration harness override via {@link setTelemetryPort} to
 * inject a stub port (see `funnel-quota-exceeded.test.ts`).
 *
 * Passing `null` to {@link setTelemetryPort} resets to the env-derived
 * default — used by `afterEach` teardown so leakage between suites is
 * impossible.
 */

let activePort: TelemetryPort | null = null;

const buildDefaultPort = (): TelemetryPort =>
  new PlausibleAdapter(env.plausible?.endpointUrl, env.plausible?.domain);

export const getTelemetryPort = (): TelemetryPort => {
  activePort ??= buildDefaultPort();
  return activePort;
};

export const setTelemetryPort = (next: TelemetryPort | null): void => {
  activePort = next;
};
