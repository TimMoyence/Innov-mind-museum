// Admin CSV export composition root (lazy). R2 corrective loop 1 (2026-05-15) —
// separated from `useCase/index.ts` so admin-export.route.ts import chain does
// NOT pull AppDataSource at module load (eager DataSource ctor evaluates
// env.db.host, crashes env-stubbed api-router-resolve.test.ts harness).
// Mirrors `resolveEnrichMuseumUseCase()` lazy template in api.router.ts:399-423.
import { AdminExportRepositoryPg } from '@modules/admin/adapters/secondary/pg/admin-export.repository.pg';
import { ExportChatSessionsUseCase } from '@modules/admin/useCase/export/exportChatSessions.useCase';
import { ExportReviewsUseCase } from '@modules/admin/useCase/export/exportReviews.useCase';
import { ExportSupportTicketsUseCase } from '@modules/admin/useCase/export/exportSupportTickets.useCase';

import type { AuditService } from '@shared/audit';
import type { DataSource } from 'typeorm';

let cachedRepository: AdminExportRepositoryPg | undefined;
let cachedSessionsUseCase: ExportChatSessionsUseCase | undefined;
let cachedReviewsUseCase: ExportReviewsUseCase | undefined;
let cachedTicketsUseCase: ExportSupportTicketsUseCase | undefined;

/** Lazy require — defers DataSource ctor (env.db.host eval) past module load. */
function loadAppDataSource(): DataSource {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional lazy require to defer env.db.host evaluation past module load (see file-level docblock).
  const mod = require('@data/db/data-source') as { AppDataSource: DataSource };
  return mod.AppDataSource;
}

/** Lazy require — `@shared/audit` barrel eagerly instantiates AuditRepositoryPg w/ AppDataSource. */
function loadAuditService(): AuditService {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional lazy require to defer auditService instantiation past module load (see file-level docblock).
  const mod = require('@shared/audit') as { auditService: AuditService };
  return mod.auditService;
}

function getAdminExportRepository(): AdminExportRepositoryPg {
  cachedRepository ??= new AdminExportRepositoryPg(loadAppDataSource());
  return cachedRepository;
}

export function getExportChatSessionsUseCase(): ExportChatSessionsUseCase {
  cachedSessionsUseCase ??= new ExportChatSessionsUseCase(
    getAdminExportRepository(),
    loadAuditService(),
  );
  return cachedSessionsUseCase;
}

export function getExportReviewsUseCase(): ExportReviewsUseCase {
  cachedReviewsUseCase ??= new ExportReviewsUseCase(getAdminExportRepository(), loadAuditService());
  return cachedReviewsUseCase;
}

export function getExportSupportTicketsUseCase(): ExportSupportTicketsUseCase {
  cachedTicketsUseCase ??= new ExportSupportTicketsUseCase(
    getAdminExportRepository(),
    loadAuditService(),
  );
  return cachedTicketsUseCase;
}
