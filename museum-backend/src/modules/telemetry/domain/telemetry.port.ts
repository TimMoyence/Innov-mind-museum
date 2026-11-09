export interface TelemetryEvent {
  name: string;
  url: string;
  domain: string;
  userAgent?: string;
  clientIp?: string;
  referrer?: string;
  props?: Record<string, string | number | boolean>;
}

export interface TelemetryPort {
  emit(event: TelemetryEvent): Promise<void>;
}
