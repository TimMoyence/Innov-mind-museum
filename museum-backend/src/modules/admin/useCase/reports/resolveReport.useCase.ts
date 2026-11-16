import { REPORT_STATUSES } from '@modules/admin/domain/admin/admin.types';
import { auditService, AUDIT_ADMIN_REPORT_RESOLVED } from '@shared/audit';
import { invalidInput, notFound } from '@shared/errors/app.error';

import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
import type { AdminReportDTO, ReportStatus } from '@modules/admin/domain/admin/admin.types';

interface ResolveReportUseCaseInput {
  reportId: string;
  status: string;
  reviewerNotes?: string;
  reviewedBy: number;
  ip?: string;
  requestId?: string;
}

export class ResolveReportUseCase {
  constructor(private readonly repository: IAdminRepository) {}

  async execute(input: ResolveReportUseCaseInput): Promise<AdminReportDTO> {
    if (!REPORT_STATUSES.includes(input.status as ReportStatus)) {
      throw invalidInput(`Invalid status. Must be one of: ${REPORT_STATUSES.join(', ')}`);
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

    await auditService.logActorAction({
      action: AUDIT_ADMIN_REPORT_RESOLVED,
      actorId: input.reviewedBy,
      targetType: 'message_report',
      targetId: input.reportId,
      metadata: { status: input.status, reviewerNotes: input.reviewerNotes ?? null },
      ip: input.ip,
      requestId: input.requestId,
    });

    return result;
  }
}
