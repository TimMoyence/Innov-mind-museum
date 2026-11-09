import { AUDIT_ADMIN_EXPORT_SESSIONS } from '@shared/audit/audit.types';
import { forbidden } from '@shared/errors/app.error';
import { pseudonymise } from '@shared/security/pseudonym';

import type { ExportInput, ExportRowSessions } from '@modules/admin/domain/export/csv-export.types';
import type { ExportSessionsRepository } from '@modules/admin/domain/export/export-repositories.port';
import type { LogActorActionInput } from '@shared/audit/audit.service';
import type { AuditLogEntry } from '@shared/audit/audit.types';

export type { ExportSessionsRepository };

export interface ExportAuditService {
  log(entry: AuditLogEntry): Promise<void>;
  logActorAction(input: LogActorActionInput): Promise<void>;
}

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
