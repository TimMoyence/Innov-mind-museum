import { auditService, AUDIT_ADMIN_REPORT_RESOLVED } from '@shared/audit';
import { badRequest, notFound } from '@shared/errors/app.error';

import type { IAdminRepository } from '../domain/admin.repository.interface';
import type { AdminReportDTO, ReportStatus } from '../domain/admin.types';

/** Input for the resolve-report use case. */
export interface ResolveReportUseCaseInput {
  reportId: string;
  status: string;
  reviewerNotes?: string;
  reviewedBy: number;
  ip?: string;
  requestId?: string;
}

const VALID_STATUSES: ReportStatus[] = ['pending', 'reviewed', 'dismissed'];

/** Validates status enum, delegates to the repository, and emits an audit event. */
export class ResolveReportUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  /** Validates the report status, updates the report, and emits an audit event. */
  async execute(input: ResolveReportUseCaseInput): Promise<AdminReportDTO> {
    if (!VALID_STATUSES.includes(input.status as ReportStatus)) {
      throw badRequest(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
    }

    const result = await this.repository.resolveReport({
      reportId: input.reportId,
      status: input.status as ReportStatus,
      reviewerNotes: input.reviewerNotes,
      reviewedBy: input.reviewedBy,
    });

    if (!result) {
      throw notFound('Report not found');
    }

    auditService.log({
      action: AUDIT_ADMIN_REPORT_RESOLVED,
      actorType: 'user',
      actorId: input.reviewedBy,
      targetType: 'message_report',
      targetId: input.reportId,
      metadata: { status: input.status, reviewerNotes: input.reviewerNotes ?? null },
      ip: input.ip ?? null,
      requestId: input.requestId ?? null,
    });

    return result;
  }
}
