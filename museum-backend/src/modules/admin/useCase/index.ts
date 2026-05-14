/**
 * Admin module composition root.
 * Wires the PG repository to use-case classes and exports ready-to-use singletons.
 * Cross-module facades (review, support) are also composed here to keep the
 * primary adapter free of peer-module imports.
 */
import { AppDataSource } from '@data/db/data-source';
import { AdminExportRepositoryPg } from '@modules/admin/adapters/secondary/pg/admin-export.repository.pg';
import { AdminRepositoryPg } from '@modules/admin/adapters/secondary/pg/admin.repository.pg';
import { GetContentAnalyticsUseCase } from '@modules/admin/useCase/analytics/getContentAnalytics.useCase';
import { GetEngagementAnalyticsUseCase } from '@modules/admin/useCase/analytics/getEngagementAnalytics.useCase';
import { GetStatsUseCase } from '@modules/admin/useCase/analytics/getStats.useCase';
import { GetUsageAnalyticsUseCase } from '@modules/admin/useCase/analytics/getUsageAnalytics.useCase';
import { ListAuditLogsUseCase } from '@modules/admin/useCase/audit/listAuditLogs.useCase';
import { ExportChatSessionsUseCase } from '@modules/admin/useCase/export/exportChatSessions.useCase';
import { ExportReviewsUseCase } from '@modules/admin/useCase/export/exportReviews.useCase';
import { ExportSupportTicketsUseCase } from '@modules/admin/useCase/export/exportSupportTickets.useCase';
import { AdminReviewFacade } from '@modules/admin/useCase/facades/admin-review.facade';
import { AdminSupportFacade } from '@modules/admin/useCase/facades/admin-support.facade';
import { ListReportsUseCase } from '@modules/admin/useCase/reports/listReports.useCase';
import { ResolveReportUseCase } from '@modules/admin/useCase/reports/resolveReport.useCase';
import { ChangeUserRoleUseCase } from '@modules/admin/useCase/users/changeUserRole.useCase';
import { DeleteUserUseCase } from '@modules/admin/useCase/users/deleteUser.useCase';
import { GetUserByIdUseCase } from '@modules/admin/useCase/users/getUserById.useCase';
import { ListUsersUseCase } from '@modules/admin/useCase/users/listUsers.useCase';
import { SuspendUserUseCase } from '@modules/admin/useCase/users/suspendUser.useCase';
import { UnsuspendUserUseCase } from '@modules/admin/useCase/users/unsuspendUser.useCase';
import { RefreshTokenRepositoryPg } from '@modules/auth/adapters/secondary/pg/refresh-token.repository.pg';
import {
  listAllReviewsUseCase as peerListAllReviewsUseCase,
  moderateReviewUseCase as peerModerateReviewUseCase,
} from '@modules/review/useCase';
import {
  listAllTicketsUseCase as peerListAllTicketsUseCase,
  updateTicketStatusUseCase as peerUpdateTicketStatusUseCase,
} from '@modules/support/useCase';
import { auditService } from '@shared/audit';

const adminRepository = new AdminRepositoryPg(AppDataSource);
// Composed locally — TypeORM Repository<T> is stateless, so re-instantiating
// the refresh-token repo is free and avoids exporting an internal auth-module
// singleton. Used by DeleteUserUseCase to revoke every active session.
const adminRefreshTokenRepository = new RefreshTokenRepositoryPg(AppDataSource);

export const listUsersUseCase = new ListUsersUseCase(adminRepository);
export const getUserByIdUseCase = new GetUserByIdUseCase(adminRepository);
export const changeUserRoleUseCase = new ChangeUserRoleUseCase(adminRepository);
export const suspendUserUseCase = new SuspendUserUseCase(adminRepository);
export const unsuspendUserUseCase = new UnsuspendUserUseCase(adminRepository);
export const deleteUserUseCase = new DeleteUserUseCase(
  adminRepository,
  adminRefreshTokenRepository,
);
export const listAuditLogsUseCase = new ListAuditLogsUseCase(adminRepository);
export const getStatsUseCase = new GetStatsUseCase(adminRepository);
export const listReportsUseCase = new ListReportsUseCase(adminRepository);
export const resolveReportUseCase = new ResolveReportUseCase(adminRepository);
export const getUsageAnalyticsUseCase = new GetUsageAnalyticsUseCase(adminRepository);
export const getContentAnalyticsUseCase = new GetContentAnalyticsUseCase(adminRepository);
export const getEngagementAnalyticsUseCase = new GetEngagementAnalyticsUseCase(adminRepository);

export const adminReviewFacade = new AdminReviewFacade(
  peerListAllReviewsUseCase,
  peerModerateReviewUseCase,
);
export const adminSupportFacade = new AdminSupportFacade(
  peerListAllTicketsUseCase,
  peerUpdateTicketStatusUseCase,
);

// R2 W3.4 — admin CSV export composition. Single repo backs the three
// use cases (sessions / reviews / tickets) ; audit emission shares the
// global auditService singleton.
const adminExportRepository = new AdminExportRepositoryPg(AppDataSource);
export const exportChatSessionsUseCase = new ExportChatSessionsUseCase(
  adminExportRepository,
  auditService,
);
export const exportReviewsUseCase = new ExportReviewsUseCase(adminExportRepository, auditService);
export const exportSupportTicketsUseCase = new ExportSupportTicketsUseCase(
  adminExportRepository,
  auditService,
);
