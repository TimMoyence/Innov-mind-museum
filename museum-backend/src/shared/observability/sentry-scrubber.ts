/**
 * Backend Sentry PII scrubber — injects Node-side `hashEmail` (SHA-256) into the
 * shared scrubber from `@musaium/shared/observability`. Drift between the 3 apps
 * is guarded by `scripts/sentinels/sentry-scrubber-parity.mjs`.
 */
import { createHash } from 'node:crypto';

import {
  scrubEvent as scrubEventInner,
  shouldDropBreadcrumb as shouldDropBreadcrumbInner,
} from '@musaium/shared';

import type { ScrubbableBreadcrumb, ScrubbableEvent } from '@musaium/shared';

export { REDACTED, SENSITIVE_QUERY_KEYS, isUrlLikeValue, scrubUrl } from '@musaium/shared';
export type { ScrubbableBreadcrumb, ScrubbableEvent } from '@musaium/shared';

/** 8-char SHA-256 hex fingerprint. Backend-only — node:crypto, stronger than FE's 32-bit fold. */
export const hashEmail = (email: string): string | undefined => {
  if (!email) return undefined;
  return createHash('sha256').update(email).digest('hex').slice(0, 8);
};

export const scrubEvent = <T extends ScrubbableEvent>(event: T): T =>
  scrubEventInner(event, { hashEmail });

// Stryker disable next-line ArrowFunction: one-line forwarder; inner function fully tested at tests/unit/observability/sentry-scrubber.test.ts L184-205. Stryker's perTest coverage can't map the outer arrow expression mutant through this thin wrapper. Manual mutation verified 2026-05-13.
export const shouldDropBreadcrumb = (breadcrumb: ScrubbableBreadcrumb): boolean =>
  shouldDropBreadcrumbInner(breadcrumb);
