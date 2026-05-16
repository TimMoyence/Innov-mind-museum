/**
 * Admin CSV export composition root (lazy).
 *
 * R2 corrective loop 1 (2026-05-15) — separated from `useCase/index.ts` so the
 * `admin-export.route.ts` import chain does NOT pull in `AppDataSource` at
 * module load. The barrel `useCase/index.ts` eagerly builds `AdminRepositoryPg`
 * + `RefreshTokenRepositoryPg` (lines 39 + 43), which evaluates `env.db.host`
 * immediately — that crashes the env-stubbed `api-router-resolve.test.ts`
 * harness because the test intentionally omits the `db` block from its env mock.
 *
 * Mirrors the `resolveEnrichMuseumUseCase()` lazy template in
 * `api.router.ts:399-423` : the repo + the three use cases are built on first
 * access, cached for subsequent calls. `AppDataSource` itself is pulled in via
 * `require()` inside the lazy factory so `data-source.ts:38` (which evaluates
 * `env.db.host` at module load) only fires on the first real request, not on
 * `admin-export.route.ts` import.
 */
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

/**
 * Lazily resolves `AppDataSource` via `require()` so the (eager) DataSource
 * constructor in `@data/db/data-source.ts:38` is NOT triggered at module
 * load. `type DataSource` (import-only) keeps the public surface typed.
 */
function loadAppDataSource(): DataSource {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional lazy require to defer env.db.host evaluation past module load (see file-level docblock).
  const mod = require('@data/db/data-source') as { AppDataSource: DataSource };
  return mod.AppDataSource;
}

/**
 * Lazily resolves the singleton `auditService` via `require()` because the
 * audit barrel `@shared/audit/index.ts` eagerly instantiates `AuditRepositoryPg`
 * with `AppDataSource` at module load — same env.db.host trap as data-source.ts.
 * Deferring this require to first call lets `api-router-resolve.test.ts` stub
 * env without instantiating the DataSource at import time.
 */
function loadAuditService(): AuditService {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional lazy require to defer auditService instantiation past module load (see file-level docblock).
  const mod = require('@shared/audit') as { auditService: AuditService };
  return mod.auditService;
}

function getAdminExportRepository(): AdminExportRepositoryPg {
  cachedRepository ??= new AdminExportRepositoryPg(loadAppDataSource());
  return cachedRepository;
}

/** Lazy-resolved sessions export use case (built on first call). */
export function getExportChatSessionsUseCase(): ExportChatSessionsUseCase {
  cachedSessionsUseCase ??= new ExportChatSessionsUseCase(
    getAdminExportRepository(),
    loadAuditService(),
  );
  return cachedSessionsUseCase;
}

/** Lazy-resolved reviews export use case (built on first call). */
export function getExportReviewsUseCase(): ExportReviewsUseCase {
  cachedReviewsUseCase ??= new ExportReviewsUseCase(getAdminExportRepository(), loadAuditService());
  return cachedReviewsUseCase;
}

/** Lazy-resolved tickets export use case (built on first call). */
export function getExportSupportTicketsUseCase(): ExportSupportTicketsUseCase {
  cachedTicketsUseCase ??= new ExportSupportTicketsUseCase(
    getAdminExportRepository(),
    loadAuditService(),
  );
  return cachedTicketsUseCase;
}
