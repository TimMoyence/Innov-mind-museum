import { verifyChainAndFormat } from '@shared/audit/audit-chain-cli-core';

import { makeChain } from '../../../helpers/audit/chain.fixtures';

describe('audit-chain-cli-core / verifyChainAndFormat', () => {
  it('returns INTACT exit 0 on empty input', () => {
    const result = verifyChainAndFormat([]);
    expect(result.exitCode).toBe(0);
    expect(result.payload).toEqual({ status: 'INTACT', checked: 0 });
    expect(result.alertText).toBeUndefined();
  });

  it('returns INTACT exit 0 for a clean 4-row chain', () => {
    const rows = makeChain(4);
    const result = verifyChainAndFormat(rows);
    expect(result.exitCode).toBe(0);
    expect(result.payload).toEqual({ status: 'INTACT', checked: 4 });
    expect(result.alertText).toBeUndefined();
  });

  it('returns BREAK exit 1 with row info when row #3 action is tampered', () => {
    const rows = makeChain(5);
    rows[2] = { ...rows[2], action: 'TAMPERED' };

    const result = verifyChainAndFormat(rows);

    expect(result.exitCode).toBe(1);
    expect(result.payload).toEqual({
      status: 'BREAK',
      checked: 3,
      firstBreakAt: 2,
      firstBreakId: rows[2].id,
    });
    expect(result.alertText).toContain('AUDIT CHAIN BROKEN');
    expect(result.alertText).toContain(`row id ${rows[2].id}`);
    expect(result.alertText).toContain('total checked 3');
  });

  it('returns BREAK on a prevHash mismatch (out-of-order insertion)', () => {
    const rows = makeChain(3);
    rows[1] = { ...rows[1], prevHash: '0'.repeat(64) };

    const result = verifyChainAndFormat(rows);

    expect(result.exitCode).toBe(1);
    expect(result.payload).toMatchObject({
      status: 'BREAK',
      firstBreakAt: 1,
      firstBreakId: rows[1].id,
    });
    expect(result.alertText).toContain('Investigate IMMEDIATELY');
  });
});
