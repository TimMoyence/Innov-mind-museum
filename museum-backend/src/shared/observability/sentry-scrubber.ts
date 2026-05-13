/**
 * Backend Sentry PII scrubber.
 *
 * Logic — regex constants, traversal, URL/header/record scrubbing, breadcrumb
 * dropping — lives in `@musaium/shared/observability`. This file ONLY injects
 * the Node-side `hashEmail` (SHA-256 truncated) and re-exports the bound API
 * so existing `sentry.ts` imports keep working.
 *
 * Drift between the 3 apps is guarded by `scripts/sentinels/sentry-scrubber-parity.mjs`.
 */
import { createHash } from 'node:crypto';

import {
  scrubEvent as scrubEventInner,
  shouldDropBreadcrumb as shouldDropBreadcrumbInner,
} from '@musaium/shared';

import type { ScrubbableBreadcrumb, ScrubbableEvent } from '@musaium/shared';

export { REDACTED, SENSITIVE_QUERY_KEYS } from '@musaium/shared';
export type { ScrubbableBreadcrumb, ScrubbableEvent } from '@musaium/shared';

/**
 * Hashes an email down to an 8-char SHA-256 fingerprint (hex, truncated).
 * Backend-only — uses `node:crypto` for stronger collision resistance than
 * the frontend's 32-bit fold (a node has the dep readily available, the
 * client/web bundles do not without polyfill).
 */
export const hashEmail = (email: string): string | undefined => {
  if (!email) return undefined;
  return createHash('sha256').update(email).digest('hex').slice(0, 8);
};

/** Applies all scrubbing rules to a Sentry event (new object). */
export const scrubEvent = <T extends ScrubbableEvent>(event: T): T =>
  scrubEventInner(event, { hashEmail });

/** Returns `true` when the breadcrumb should be dropped (auth-adjacent HTTP call). */
// Stryker disable next-line ArrowFunction: one-line forwarder to shouldDropBreadcrumbInner; the inner function is fully tested (tests/unit/observability/sentry-scrubber.test.ts L184-205 cover both branches with `.toBe(true)` and `.toBe(false)`), but Stryker's perTest coverage analysis cannot map the outer arrow-function expression mutant to the tests that exercise it through this thin wrapper. Manual mutation check confirmed: replacing the body with `undefined` would flip every existing assertion. Verified 2026-05-13.
export const shouldDropBreadcrumb = (breadcrumb: ScrubbableBreadcrumb): boolean =>
  shouldDropBreadcrumbInner(breadcrumb);
