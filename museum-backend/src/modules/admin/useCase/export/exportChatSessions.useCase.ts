import { AUDIT_ADMIN_EXPORT_SESSIONS } from '@shared/audit/audit.types';
import { forbidden } from '@shared/errors/app.error';
import { pseudonymise } from '@shared/security/pseudonym';

import type { ExportInput, ExportRowSessions } from '@modules/admin/domain/export/csv-export.types';
import type { ExportSessionsRepository } from '@modules/admin/domain/export/export-repositories.port';
import type { LogActorActionInput } from '@shared/audit/audit.service';
import type { AuditLogEntry } from '@shared/audit/audit.types';

// Re-exported (identity-preserving, spec R5) — `ExportSessionsRepository`
// moved to `domain/export/export-repositories.port.ts` (C1 close, run
// 2026-06-04-hexagonal-boundaries-enforcement).
export type { ExportSessionsRepository };

/** Narrowed surface so unit tests can pass a `jest.fn()` spy. */
export interface ExportAuditService {
  log(entry: AuditLogEntry): Promise<void>;
  logActorAction(input: LogActorActionInput): Promise<void>;
}

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
 *
 * I-SEC5 (2026-05-21) — `salt` is injected at construction (mirror
 * `AdminExportRepositoryPg`). The historical committed-literal fallback was
 * REMOVED — a checked-in constant is a trivial dictionary-attack surface
 * against the pseudonymised export (spec §1.1 / R2).
 * Prod boot fail-fast at `env.production-validation.ts::validateExportPseudonymSalt`
 * guarantees `env.exportPseudonymSalt` is set ≥ 32 chars before composition root
 * wires this class. Rotation doctrine : `docs/SECURITY.md#export-salt-rotation`.
 */
export class ExportChatSessionsUseCase {
  private readonly salt: string;

  constructor(
    private readonly repository: ExportSessionsRepository,
    private readonly audit: ExportAuditService,
    salt: string,
  ) {
    if (!salt) {
      throw new Error(
        'ExportChatSessionsUseCase: salt is unset — pass env.exportPseudonymSalt ' +
          '(>= 32 chars in prod, validated at boot). See docs/SECURITY.md#export-salt-rotation.',
      );
    }
    this.salt = salt;
  }

  async execute(input: ExportInput): Promise<AsyncIterable<ExportRowSessions>> {
    const scopeMuseumId = computeSessionsScope(input);

    await this.audit.logActorAction({
      action: AUDIT_ADMIN_EXPORT_SESSIONS,
      actorId: input.actorId,
      metadata: {
        kind: 'sessions',
        scopeMuseumId,
      },
    });

    const rowStream = this.repository.streamChatSessions({ scopeMuseumId });
    return mapSessionsRows(rowStream, input.actorRole, this.salt);
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

/**
 * R17/D6 — rewrites `user_id` per role. Streams 1-by-1, no extra memory.
 *
 * @yields {ExportRowSessions} role-aware row with pseudonymised user_id.
 */
async function* mapSessionsRows(
  source: AsyncIterable<ExportRowSessions>,
  actorRole: ExportInput['actorRole'],
  salt: string,
): AsyncIterable<ExportRowSessions> {
  const shouldPseudonymise = actorRole === 'museum_manager' || actorRole === 'admin';
  for await (const row of source) {
    if (!shouldPseudonymise) {
      yield row;
      continue;
    }
    yield {
      ...row,
      user_id: pseudonymise(row.user_id, salt),
    };
  }
}
