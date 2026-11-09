import { PlausibleAdapter } from '@modules/telemetry/adapters/secondary/plausible.adapter';
import { env } from '@src/config/env';

import type { TelemetryPort } from '@modules/telemetry/domain/telemetry.port';

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
