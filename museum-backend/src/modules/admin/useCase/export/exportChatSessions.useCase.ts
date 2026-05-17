import { AUDIT_ADMIN_EXPORT_SESSIONS } from '@shared/audit/audit.types';
import { forbidden } from '@shared/errors/app.error';
import { pseudonymise } from '@shared/security/pseudonym';
import { env } from '@src/config/env';

import type {
  ExportInput,
  ExportRowSessions,
  ExportSessionsFilter,
} from '@modules/admin/domain/export/csv-export.types';
import type { AuditLogEntry } from '@shared/audit/audit.types';

/** Async stream so route pipes to HTTP response without buffering (R13). */
export interface ExportSessionsRepository {
  streamChatSessions(filter: ExportSessionsFilter): AsyncIterable<ExportRowSessions>;
}

/** Narrowed surface so unit tests can pass a `jest.fn()` spy. */
export interface ExportAuditService {
  log(entry: AuditLogEntry): Promise<void>;
}

// R2 corrective loop 1 (2026-05-15) — fallback literal preserved so unit tests
// stubbing env without the field still compute a deterministic /^[0-9a-f]{16}$/
// digest. Rotation procedure: spec §3.6 / Q6.
const PSEUDONYM_SALT = env.exportPseudonymSalt ?? 'musaium-admin-export-v1';

/**
 * Admin CSV export — chat sessions (R2 R6/R7/R8/R12/R17 + D4/D5/D6).
 *
 * RBAC gates:
 *   - super_admin            → scope = null (all tenants)
 *   - museum_manager / admin → scope = req.user.museumId ; 403 if null
 *   - moderator / visitor    → 403 BEFORE any repo call (R4 / Q3)
 *
 * Ordering: audit row is `await`-ed BEFORE the first data row yields (N6/AC10).
 * Metadata payload NEVER contains row contents (N9 — no free-text PII).
 *
 * Pseudonymisation (R17/D6): super_admin sees raw user_id ; manager/admin see
 * a 16-hex-char SHA-256 pseudonym.
 */
export class ExportChatSessionsUseCase {
  constructor(
    private readonly repository: ExportSessionsRepository,
    private readonly audit: ExportAuditService,
  ) {}

  async execute(input: ExportInput): Promise<AsyncIterable<ExportRowSessions>> {
    const scopeMuseumId = computeSessionsScope(input);

    await this.audit.log({
      action: AUDIT_ADMIN_EXPORT_SESSIONS,
      actorType: 'user',
      actorId: input.actorId,
      metadata: {
        kind: 'sessions',
        scopeMuseumId,
      },
    });

    const rowStream = this.repository.streamChatSessions({ scopeMuseumId });
    return mapSessionsRows(rowStream, input.actorRole);
  }
}

/** R2 §3.4 D4. Throws 403 for visitor/moderator/unscoped manager. */
function computeSessionsScope(input: ExportInput): number | null {
  if (input.actorRole === 'super_admin') return null;
  if (input.actorRole === 'museum_manager' || input.actorRole === 'admin') {
    if (input.museumScope === null) {
      throw forbidden('No museum assigned');
    }
    return input.museumScope;
  }
  throw forbidden('Export not allowed for this role');
}

/** R17/D6 — rewrites `user_id` per role. Streams 1-by-1, no extra memory. */
async function* mapSessionsRows(
  source: AsyncIterable<ExportRowSessions>,
  actorRole: ExportInput['actorRole'],
): AsyncIterable<ExportRowSessions> {
  const shouldPseudonymise = actorRole === 'museum_manager' || actorRole === 'admin';
  for await (const row of source) {
    if (!shouldPseudonymise) {
      yield row;
      continue;
    }
    yield {
      ...row,
      user_id: pseudonymise(row.user_id, PSEUDONYM_SALT),
    };
  }
}
