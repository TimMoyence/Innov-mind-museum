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

import { AdminReviewFacade } from './admin-review.facade';
import { AdminSupportFacade } from './admin-support.facade';
import { ChangeUserRoleUseCase } from './changeUserRole.useCase';
import { GetContentAnalyticsUseCase } from './getContentAnalytics.useCase';
import { GetEngagementAnalyticsUseCase } from './getEngagementAnalytics.useCase';
import { GetStatsUseCase } from './getStats.useCase';
import { GetUsageAnalyticsUseCase } from './getUsageAnalytics.useCase';
import { ListAuditLogsUseCase } from './listAuditLogs.useCase';
import { ListReportsUseCase } from './listReports.useCase';
import { ListUsersUseCase } from './listUsers.useCase';
import { ResolveReportUseCase } from './resolveReport.useCase';
import { AdminRepositoryPg } from '../adapters/secondary/admin.repository.pg';

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
