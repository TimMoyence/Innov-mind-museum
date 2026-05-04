/**
 * Admin module composition root.
 * Wires the PG repository to use-case classes and exports ready-to-use singletons.
 * Cross-module facades (review, support) are also composed here to keep the
 * primary adapter free of peer-module imports.
 */
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
import { ListUsersUseCase } from '@modules/admin/useCase/users/listUsers.useCase';
import {
  listAllReviewsUseCase as peerListAllReviewsUseCase,
  moderateReviewUseCase as peerModerateReviewUseCase,
} from '@modules/review/useCase';
import {
  listAllTicketsUseCase as peerListAllTicketsUseCase,
  updateTicketStatusUseCase as peerUpdateTicketStatusUseCase,
} from '@modules/support/useCase';

const adminRepository = new AdminRepositoryPg(AppDataSource);

export const listUsersUseCase = new ListUsersUseCase(adminRepository);
export const changeUserRoleUseCase = new ChangeUserRoleUseCase(adminRepository);
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
