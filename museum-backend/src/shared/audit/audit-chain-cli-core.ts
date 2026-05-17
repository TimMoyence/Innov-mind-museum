import { verifyAuditChain, type AuditChainRow } from './audit-chain';

export interface AuditChainCliResult {
  /** 0 = intact, 1 = chain break, 2 = unexpected error (caller-set). */
  exitCode: 0 | 1;
  /** Single-line JSON for stdout. */
  payload:
    | { status: 'INTACT'; checked: number }
    | { status: 'BREAK'; checked: number; firstBreakAt: number; firstBreakId: string };
  /**
   * Plain-text Slack alert. Defined when broken. POST verbatim to
   * `process.env.DEPLOY_ALERT_SLACK_WEBHOOK`.
   */
  alertText?: string;
}

/**
 * Pure orchestrator for nightly audit-chain CLI. Decoupled from DB + I/O so
 * unit-testable without database or fetch shim.
 */
export function verifyChainAndFormat(rowsInOrder: readonly AuditChainRow[]): AuditChainCliResult {
  const result = verifyAuditChain(rowsInOrder);

  if (result.valid) {
    return {
      exitCode: 0,
      payload: { status: 'INTACT', checked: result.checked },
    };
  }

  const firstBreakAt = result.firstBreakAt ?? -1;
  const firstBreakId = result.firstBreakId ?? 'unknown';

  return {
    exitCode: 1,
    payload: {
      status: 'BREAK',
      checked: result.checked,
      firstBreakAt,
      firstBreakId,
    },
    alertText: [
      ':rotating_light: AUDIT CHAIN BROKEN',
      `first break at index ${firstBreakAt}, row id ${firstBreakId}`,
      `total checked ${result.checked}`,
      'Investigate IMMEDIATELY — possible audit-log tampering.',
    ].join(' — '),
  };
}
