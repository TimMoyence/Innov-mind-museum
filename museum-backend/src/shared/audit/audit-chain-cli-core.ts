import { verifyAuditChain, type AuditChainRow } from './audit-chain';

/** Structured result for the audit-chain-verify CLI. */
export interface AuditChainCliResult {
  /** 0 = intact, 1 = chain break, 2 = unexpected error (set by caller). */
  exitCode: 0 | 1;
  /** JSON payload to write to stdout (one line). */
  payload:
    | { status: 'INTACT'; checked: number }
    | { status: 'BREAK'; checked: number; firstBreakAt: number; firstBreakId: string };
  /**
   * Plain-text Slack alert. Defined when the chain is broken; undefined when
   * intact. Callers who want fail-loud alerting should POST this verbatim to
   * `process.env.DEPLOY_ALERT_SLACK_WEBHOOK`.
   */
  alertText?: string;
}

/**
 * Pure orchestrator for the nightly audit-chain CLI. Takes the audit_logs rows
 * (oldest → newest), runs the canonical hash-chain verifier, and shapes the
 * result for the CLI: an exit code, a JSON payload for stdout, and an alert
 * string for Slack on break.
 *
 * Decoupled from DB + I/O so it can be unit-tested without a database or a
 * fetch shim.
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
