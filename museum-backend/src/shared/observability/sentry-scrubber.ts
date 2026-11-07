import { hashEmail, scrubEvent as scrubEventInner } from '@musaium/shared';

import type { ScrubbableEvent } from '@musaium/shared';

export {
  REDACTED,
  SENSITIVE_QUERY_KEYS,
  hashEmail,
  isUrlLikeValue,
  scrubUrl,
  shouldDropBreadcrumb,
} from '@musaium/shared';
export type { ScrubbableBreadcrumb, ScrubbableEvent } from '@musaium/shared';

export const scrubEvent = <T extends ScrubbableEvent>(event: T): T =>
  scrubEventInner(event, { hashEmail });
