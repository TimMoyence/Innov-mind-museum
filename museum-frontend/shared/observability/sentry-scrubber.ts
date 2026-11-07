import {
  hashEmail,
  scrubEvent as scrubEventInner,
  shouldDropBreadcrumb as shouldDropBreadcrumbInner,
} from '@musaium/shared/observability';
import type { ScrubbableBreadcrumb, ScrubbableEvent } from '@musaium/shared/observability';

export { REDACTED, hashEmail } from '@musaium/shared/observability';
export type { ScrubbableBreadcrumb, ScrubbableEvent } from '@musaium/shared/observability';

export const scrubEvent = <T extends ScrubbableEvent>(event: T): T =>
  scrubEventInner(event, { hashEmail });

export const shouldDropBreadcrumb = (breadcrumb: ScrubbableBreadcrumb): boolean =>
  shouldDropBreadcrumbInner(breadcrumb);
