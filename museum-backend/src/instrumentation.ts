// This file must be imported FIRST in index.ts, before any other modules.
// Order matters:
//   1. Sentry.init() — captures any error thrown by step 2 setup.
//   2. OTel NodeSDK auto-instrumentation — patches modules before app code loads.
//   3. z.config(z.locales.fr()) — TD-ZOD-01: localize Zod default error messages
//      to French for Musaium FR-first audience. Schemas evaluated later will
//      surface FR error strings (lib-docs/zod/PATTERNS.md §3 DO).
// Sentry runs first because Sentry.init is synchronous; OTel's instrumentations
// then attach to a process where Sentry is already collecting errors.
import { z } from 'zod';

import { initOpenTelemetry } from '@shared/observability/opentelemetry';
import { initSentry } from '@shared/observability/sentry';

initSentry();
initOpenTelemetry();
z.config(z.locales.fr());
