import { AppDataSource } from '@data/db/data-source';
import { AdminRepositoryPg } from '@modules/admin/adapters/secondary/pg/admin.repository.pg';
import { GetContentAnalyticsUseCase } from '@modules/admin/useCase/analytics/getContentAnalytics.useCase';
import { GetEngagementAnalyticsUseCase } from '@modules/admin/useCase/analytics/getEngagementAnalytics.useCase';
import { GetStatsUseCase } from '@modules/admin/useCase/analytics/getStats.useCase';
import { GetUsageAnalyticsUseCase } from '@modules/admin/useCase/analytics/getUsageAnalytics.useCase';
import { ListAuditLogsUseCase } from '@modules/admin/useCase/audit/listAuditLogs.useCase';
import { AdminReviewFacade } from '@modules/admin/useCase/facades/admin-review.facade';
import { AdminSupportFacade } from '@modules/admin/useCase/facades/admin-support.facade';
import { ListReportsUseCase } from '@modules/admin/useCase/reports/listReports.useCase';
import { ResolveReportUseCase } from '@modules/admin/useCase/reports/resolveReport.useCase';
import { ChangeUserRoleUseCase } from '@modules/admin/useCase/users/changeUserRole.useCase';
import { ChangeUserTierUseCase } from '@modules/admin/useCase/users/changeUserTier.useCase';
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

const adminRepository = new AdminRepositoryPg(AppDataSource);
// Re-instantiated locally to avoid exporting an internal auth-module singleton.
const adminRefreshTokenRepository = new RefreshTokenRepositoryPg(AppDataSource);

export const listUsersUseCase = new ListUsersUseCase(adminRepository);
export const getUserByIdUseCase = new GetUserByIdUseCase(adminRepository);
export const changeUserRoleUseCase = new ChangeUserRoleUseCase(adminRepository);
export const changeUserTierUseCase = new ChangeUserTierUseCase(adminRepository);
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

// R2 W3.4 corrective loop 1 (2026-05-15) — admin CSV export composition lives in
// `@modules/admin/useCase/export/composition.ts` (lazy getters defer AppDataSource
// + auditService until first request). Doctrine `feedback_bury_dead_code`.
