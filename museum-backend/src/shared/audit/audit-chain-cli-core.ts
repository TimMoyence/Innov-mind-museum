import { verifyAuditChain, type AuditChainRow } from './audit-chain';

export interface AuditChainCliResult {
  exitCode: 0 | 1;
  payload:
    | { status: 'INTACT'; checked: number }
    | { status: 'BREAK'; checked: number; firstBreakAt: number; firstBreakId: string };
  alertText?: string;
}

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
