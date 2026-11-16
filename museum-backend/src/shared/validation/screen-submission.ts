import { logger } from '@shared/logger/logger';
import { judgeSubmission, type SubmissionVerdict } from '@shared/validation/honeypot';

export function screenSubmission(
  submission: { website?: string; fillMs?: number; ip?: string; requestId?: string },
  form: 'b2b_lead' | 'beta_signup' | 'paywall_interest' | 'support_contact',
): SubmissionVerdict {
  const verdict = judgeSubmission(submission);
  if (verdict === 'bot') {
    logger.warn(`${form}_honeypot_triggered`, {
      requestId: submission.requestId,
      hasIp: Boolean(submission.ip),
    });
  }
  return verdict;
}
