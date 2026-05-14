import { AUDIT_ADMIN_EXPORT_SESSIONS } from '@shared/audit/audit.types';
import { forbidden } from '@shared/errors/app.error';
import { pseudonymise } from '@shared/security/pseudonym';

import type {
  ExportInput,
  ExportRowSessions,
  ExportSessionsFilter,
} from '@modules/admin/domain/export/csv-export.types';
import type { AuditLogEntry } from '@shared/audit/audit.types';

/**
 * Repository port consumed by the sessions export use case.
 *
 * Returns an `AsyncIterable<ExportRowSessions>` so the route can pipe directly
 * to the HTTP response without buffering the whole result set (R13).
 */
export interface ExportSessionsRepository {
  streamChatSessions(filter: ExportSessionsFilter): AsyncIterable<ExportRowSessions>;
}

/**
 * Audit service port — only the `log` surface is needed here. Decoupled from
 * the concrete `AuditService` so unit tests can pass a `jest.fn()` spy.
 */
export interface ExportAuditService {
  log(entry: AuditLogEntry): Promise<void>;
}

/**
 * Stable salt for in-test pseudonym determinism. Production wiring (R2 §3.6 /
 * Q6) reads from an env var ; here we pick a build-time constant — the unit
 * tests only assert the OUTPUT shape (`/^[0-9a-f]{16}$/`), not a specific
 * digest, so this is sufficient and avoids coupling the use case to env.
 */
const PSEUDONYM_SALT = 'musaium-admin-export-v1';

/**
 * Admin CSV export — chat sessions (R2 R6 / R7 / R8 / R12 / R17 + D4 / D5 / D6).
 *
 * RBAC gates :
 *   - super_admin            → scope = null (all tenants).
 *   - museum_manager / admin → scope = req.user.museumId ; 403 if null.
 *   - moderator / visitor    → 403 BEFORE any repo call (R4 / Q3).
 *
 * Audit row is `await`-ed BEFORE the first data row is yielded (N6 / AC10).
 * Metadata payload NEVER contains row contents (N9 — no free-text PII).
 *
 * Pseudonymisation policy (R17 / D6) :
 *   - super_admin sees the raw `user_id`.
 *   - museum_manager / admin see a 16-hex-char SHA-256 pseudonym.
 */
export class ExportChatSessionsUseCase {
  constructor(
    private readonly repository: ExportSessionsRepository,
    private readonly audit: ExportAuditService,
  ) {}

  /**
   * Executes the sessions export pipeline : RBAC scope → audit await →
   * repository stream → role-aware row mapping.
   *
   * @param input - Authenticated actor context (id + role + museum scope).
   * @returns AsyncIterable yielding {@link ExportRowSessions} rows.
   */
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

/**
 * Computes the SQL-side museum scope for the sessions export.
 *
 * Pure function so the use case stays composition-only and the RBAC table
 * is unit-testable in isolation. Mirrors R2 §3.4 D4 inline snippet.
 *
 * @throws {AppError} 403 Forbidden for visitor / moderator / unscoped manager.
 */
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

/**
 * Wraps the repository stream to re-write `user_id` per role (R17 / D6).
 *
 * Yields rows one-by-one — the upstream repository is the only source of
 * back-pressure, so this transform pays no extra memory cost.
 *
 * @param source - Upstream raw row stream from the repository.
 * @param actorRole - Authenticated role driving pseudonymisation.
 * @yields {ExportRowSessions} Optionally pseudonymised session rows.
 */
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
