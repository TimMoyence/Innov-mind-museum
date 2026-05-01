/**
 * F4 (2026-04-30) — guardrail budget helper tests.
 *
 * In-memory daily budget for the LLM judge. Resets at UTC midnight on first
 * call after the boundary. Budget is per-process (multi-instance prod will
 * have per-instance budgets — accepted v1 trade-off, Phase 2 moves to Redis).
 */
import {
  getBudgetExhausted,
  recordJudgeCost,
  resetBudget,
  __setNowForTest,
} from '@modules/chat/useCase/guardrail-budget';

describe('guardrail-budget', () => {
  beforeEach(() => {
    resetBudget();
    __setNowForTest(undefined);
  });

  it('starts un-exhausted', () => {
    expect(getBudgetExhausted()).toBe(false);
  });

  it('stays un-exhausted while cumulative cost is under the cap', () => {
    recordJudgeCost(50);
    recordJudgeCost(100);
    recordJudgeCost(200);
    expect(getBudgetExhausted()).toBe(false);
  });

  it('flips to exhausted once cumulative cost meets the cap', () => {
    // Default cap = 500 cents
    recordJudgeCost(300);
    recordJudgeCost(150);
    expect(getBudgetExhausted()).toBe(false);
    recordJudgeCost(60); // total now 510 — over the cap
    expect(getBudgetExhausted()).toBe(true);
  });

  it('stays exhausted on further cost recording within the same day', () => {
    recordJudgeCost(600);
    expect(getBudgetExhausted()).toBe(true);
    recordJudgeCost(1);
    expect(getBudgetExhausted()).toBe(true);
  });

  it('resets after UTC midnight rollover', () => {
    __setNowForTest(new Date('2026-04-30T12:00:00Z'));
    recordJudgeCost(600);
    expect(getBudgetExhausted()).toBe(true);

    // Advance past UTC midnight — first call after rollover should auto-reset.
    __setNowForTest(new Date('2026-05-01T00:30:00Z'));
    expect(getBudgetExhausted()).toBe(false);
    recordJudgeCost(50);
    expect(getBudgetExhausted()).toBe(false);
  });

  it('resetBudget() force-clears the counter for tests', () => {
    recordJudgeCost(600);
    expect(getBudgetExhausted()).toBe(true);
    resetBudget();
    expect(getBudgetExhausted()).toBe(false);
  });

  it('ignores non-positive cost recordings (defensive)', () => {
    recordJudgeCost(0);
    recordJudgeCost(-50);
    expect(getBudgetExhausted()).toBe(false);
  });
});
