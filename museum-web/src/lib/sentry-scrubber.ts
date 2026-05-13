/**
 * Web Sentry PII scrubber.
 *
 * Logic — regex constants, traversal, URL/header/record scrubbing, breadcrumb
 * dropping — lives in `@musaium/shared/observability`. This file ONLY injects
 * the runtime-agnostic `hashEmail` (deterministic 32-bit fold; works in
 * client, server, and edge Next.js runtimes without depending on `crypto`)
 * and re-exports the bound API so the three sentry.*.config.ts files keep
 * working unchanged.
 *
 * Drift between the 3 apps is guarded by `scripts/sentinels/sentry-scrubber-parity.mjs`.
 */
import {
  scrubEvent as scrubEventInner,
  shouldDropBreadcrumb as shouldDropBreadcrumbInner,
} from '@musaium/shared/observability';
import type { ScrubbableBreadcrumb, ScrubbableEvent } from '@musaium/shared/observability';

export { REDACTED } from '@musaium/shared/observability';
export type { ScrubbableBreadcrumb, ScrubbableEvent } from '@musaium/shared/observability';

/**
 * Hashes an email to an 8-char fingerprint using a deterministic 32-bit fold.
 * Not cryptographic — used only to correlate events without leaking the
 * address. Same algorithm as the mobile bundle so client/server/edge can
 * agree on a user identity hash without a `crypto` polyfill.
 */
export const hashEmail = (email: string): string | undefined => {
  if (!email) return undefined;
  let hash = 0xdeadbeef;
  for (let i = 0; i < email.length; i += 1) {
    hash = Math.imul(hash ^ email.charCodeAt(i), 2654435761);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 8);
};

/** Applies all scrubbing rules to a Sentry event (new object). */
export const scrubEvent = <T extends ScrubbableEvent>(event: T): T =>
  scrubEventInner(event, { hashEmail });

/** Returns `true` when the breadcrumb should be dropped (auth-adjacent HTTP call). */
export const shouldDropBreadcrumb = (breadcrumb: ScrubbableBreadcrumb): boolean =>
  shouldDropBreadcrumbInner(breadcrumb);
