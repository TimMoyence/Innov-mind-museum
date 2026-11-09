import { z } from 'zod';

import { initOpenTelemetry } from '@shared/observability/opentelemetry';
import { initSentry } from '@shared/observability/sentry';

initSentry();
initOpenTelemetry();
z.config(z.locales.fr());
