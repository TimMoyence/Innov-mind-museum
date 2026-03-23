// This file must be imported FIRST in index.ts, before any other modules.
// OTel auto-instrumentation requires patching modules before they are imported.
import { initOpenTelemetry } from '@shared/observability/opentelemetry';
initOpenTelemetry();
