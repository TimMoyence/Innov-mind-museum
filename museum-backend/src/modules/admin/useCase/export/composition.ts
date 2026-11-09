import { AppDataSource } from '@data/db/data-source';
import { AdminExportRepositoryPg } from '@modules/admin/adapters/secondary/pg/admin-export.repository.pg';
import { ExportChatSessionsUseCase } from '@modules/admin/useCase/export/exportChatSessions.useCase';
import { ExportReviewsUseCase } from '@modules/admin/useCase/export/exportReviews.useCase';
import { ExportSupportTicketsUseCase } from '@modules/admin/useCase/export/exportSupportTickets.useCase';
import { auditService } from '@shared/audit';
import { env } from '@src/config/env';

let cachedRepository: AdminExportRepositoryPg | undefined;
let cachedSessionsUseCase: ExportChatSessionsUseCase | undefined;
let cachedReviewsUseCase: ExportReviewsUseCase | undefined;
let cachedTicketsUseCase: ExportSupportTicketsUseCase | undefined;

function getAdminExportRepository(): AdminExportRepositoryPg {
  cachedRepository ??= new AdminExportRepositoryPg(AppDataSource);
  return cachedRepository;
}

function resolveExportPseudonymSalt(): string {
  if (!env.exportPseudonymSalt) {
    throw new Error(
      'EXPORT_PSEUDONYM_SALT (env.exportPseudonymSalt) is unset — ' +
        'set it (>= 32 chars) before resolving the admin-export use cases. ' +
        'See docs/SECURITY.md#export-salt-rotation.',
    );
  }
  return env.exportPseudonymSalt;
}

export function getExportChatSessionsUseCase(): ExportChatSessionsUseCase {
  cachedSessionsUseCase ??= new ExportChatSessionsUseCase(
    getAdminExportRepository(),
    auditService,
    resolveExportPseudonymSalt(),
  );
  return cachedSessionsUseCase;
}

export function getExportReviewsUseCase(): ExportReviewsUseCase {
  cachedReviewsUseCase ??= new ExportReviewsUseCase(getAdminExportRepository(), auditService);
  return cachedReviewsUseCase;
}

export function getExportSupportTicketsUseCase(): ExportSupportTicketsUseCase {
  cachedTicketsUseCase ??= new ExportSupportTicketsUseCase(
    getAdminExportRepository(),
    auditService,
  );
  return cachedTicketsUseCase;
}
