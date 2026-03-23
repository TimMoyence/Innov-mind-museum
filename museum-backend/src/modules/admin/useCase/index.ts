/**
 * Admin module composition root.
 * Wires the PG repository to use-case classes and exports ready-to-use singletons.
 */
import { AdminRepositoryPg } from '../adapters/secondary/admin.repository.pg';
import { ListUsersUseCase } from './listUsers.useCase';
import { ChangeUserRoleUseCase } from './changeUserRole.useCase';
import { ListAuditLogsUseCase } from './listAuditLogs.useCase';
import { GetStatsUseCase } from './getStats.useCase';
import { ListReportsUseCase } from './listReports.useCase';
import { ResolveReportUseCase } from './resolveReport.useCase';
import { GetUsageAnalyticsUseCase } from './getUsageAnalytics.useCase';
import { GetContentAnalyticsUseCase } from './getContentAnalytics.useCase';
import { GetEngagementAnalyticsUseCase } from './getEngagementAnalytics.useCase';

const adminRepository = new AdminRepositoryPg();

export const listUsersUseCase = new ListUsersUseCase(adminRepository);
export const changeUserRoleUseCase = new ChangeUserRoleUseCase(adminRepository);
export const listAuditLogsUseCase = new ListAuditLogsUseCase(adminRepository);
export const getStatsUseCase = new GetStatsUseCase(adminRepository);
export const listReportsUseCase = new ListReportsUseCase(adminRepository);
export const resolveReportUseCase = new ResolveReportUseCase(adminRepository);
export const getUsageAnalyticsUseCase = new GetUsageAnalyticsUseCase(adminRepository);
export const getContentAnalyticsUseCase = new GetContentAnalyticsUseCase(adminRepository);
export const getEngagementAnalyticsUseCase = new GetEngagementAnalyticsUseCase(adminRepository);
