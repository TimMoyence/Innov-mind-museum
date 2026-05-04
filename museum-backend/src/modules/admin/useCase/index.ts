/**
 * Admin module composition root.
 * Wires the PG repository to use-case classes and exports ready-to-use singletons.
 * Cross-module facades (review, support) are also composed here to keep the
 * primary adapter free of peer-module imports.
 */
import {
  listAllReviewsUseCase as peerListAllReviewsUseCase,
  moderateReviewUseCase as peerModerateReviewUseCase,
} from '@modules/review/useCase';
import {
  listAllTicketsUseCase as peerListAllTicketsUseCase,
  updateTicketStatusUseCase as peerUpdateTicketStatusUseCase,
} from '@modules/support/useCase';
import { AppDataSource } from '@src/data/db/data-source';

import { GetContentAnalyticsUseCase } from './analytics/getContentAnalytics.useCase';
import { GetEngagementAnalyticsUseCase } from './analytics/getEngagementAnalytics.useCase';
import { GetStatsUseCase } from './analytics/getStats.useCase';
import { GetUsageAnalyticsUseCase } from './analytics/getUsageAnalytics.useCase';
import { ListAuditLogsUseCase } from './audit/listAuditLogs.useCase';
import { AdminReviewFacade } from './facades/admin-review.facade';
import { AdminSupportFacade } from './facades/admin-support.facade';
import { ListReportsUseCase } from './reports/listReports.useCase';
import { ResolveReportUseCase } from './reports/resolveReport.useCase';
import { ChangeUserRoleUseCase } from './users/changeUserRole.useCase';
import { ListUsersUseCase } from './users/listUsers.useCase';
import { AdminRepositoryPg } from '../adapters/secondary/pg/admin.repository.pg';

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
