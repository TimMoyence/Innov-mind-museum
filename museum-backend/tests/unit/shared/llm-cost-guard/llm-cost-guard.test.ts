import { LlmCostGuard, LlmCostGuardError } from '@shared/llm-cost-guard/llm-cost-guard';
import { logger } from '@shared/logger/logger';

import {
  FailingLlmCostCounter,
  InMemoryLlmCostCounter,
} from 'tests/helpers/llm-cost-guard/in-memory-llm-cost-counter';

const FROZEN_NOW_MS = Date.UTC(2026, 4, 12, 12, 0, 0);
const FROZEN_DAY = '2026-05-12';

describe('LlmCostGuard (P0-4 red phase)', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(FROZEN_NOW_MS));
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    jest.useRealTimers();
  });

  describe('global kill-switch', () => {
    it('throws LLM_KILL_SWITCH_ACTIVE before touching the counter when kill-switch is ON', async () => {
      const counter = new InMemoryLlmCostCounter();
      const getSpy = jest.spyOn(counter, 'get');
      const incrSpy = jest.spyOn(counter, 'increment');

      const guard = new LlmCostGuard({
        killSwitchEnabled: true,
        dailyCapUsd: 0.5,
        counter,
      });

      await expect(guard.assertAllowed('user-1', 0.01)).rejects.toMatchObject({
        code: 'LLM_KILL_SWITCH_ACTIVE',
      });

      expect(getSpy).not.toHaveBeenCalled();
      expect(incrSpy).not.toHaveBeenCalled();
    });

    it('emits a structured warn log when the kill-switch denies a call', async () => {
      const counter = new InMemoryLlmCostCounter();
      const guard = new LlmCostGuard({
        killSwitchEnabled: true,
        dailyCapUsd: 0.5,
        counter,
      });

      await expect(guard.assertAllowed('user-1', 0.01)).rejects.toBeInstanceOf(LlmCostGuardError);

      expect(warnSpy).toHaveBeenCalledWith(
        'llm_cost_cap_block',
        expect.objectContaining({
          userId: 'user-1',
          code: 'LLM_KILL_SWITCH_ACTIVE',
          capUsd: 0.5,
        }),
      );
    });

    it('also applies to anonymous (null userId) callers when ON', async () => {
      const counter = new InMemoryLlmCostCounter();
      const guard = new LlmCostGuard({
        killSwitchEnabled: true,
        dailyCapUsd: 0.5,
        counter,
      });

      await expect(guard.assertAllowed(null, 0.01)).rejects.toMatchObject({
        code: 'LLM_KILL_SWITCH_ACTIVE',
      });
    });
  });

  describe('per-user daily USD cap', () => {
    it('allows an under-cap call and increments the running total', async () => {
      const counter = new InMemoryLlmCostCounter();
      counter.seed('user-1', FROZEN_DAY, 0.1);

      const guard = new LlmCostGuard({
        killSwitchEnabled: false,
        dailyCapUsd: 0.5,
        counter,
      });

      await expect(guard.assertAllowed('user-1', 0.05)).resolves.toBeUndefined();
      await expect(counter.get('user-1', FROZEN_DAY)).resolves.toBeCloseTo(0.15, 10);
    });

    it('throws LLM_USER_DAILY_CAP_EXCEEDED and does NOT increment when the call would breach the cap', async () => {
      const counter = new InMemoryLlmCostCounter();
      counter.seed('user-1', FROZEN_DAY, 0.48);

      const guard = new LlmCostGuard({
        killSwitchEnabled: false,
        dailyCapUsd: 0.5,
        counter,
      });

      await expect(guard.assertAllowed('user-1', 0.05)).rejects.toMatchObject({
        code: 'LLM_USER_DAILY_CAP_EXCEEDED',
        dailySpentUsd: 0.48,
        capUsd: 0.5,
      });

      await expect(counter.get('user-1', FROZEN_DAY)).resolves.toBeCloseTo(0.48, 10);
    });

    it('allows the exactly-at-cap call but rejects the next one', async () => {
      const counter = new InMemoryLlmCostCounter();
      counter.seed('user-1', FROZEN_DAY, 0.48);

      const guard = new LlmCostGuard({
        killSwitchEnabled: false,
        dailyCapUsd: 0.5,
        counter,
      });

      await expect(guard.assertAllowed('user-1', 0.02)).resolves.toBeUndefined();
      await expect(counter.get('user-1', FROZEN_DAY)).resolves.toBeCloseTo(0.5, 10);

      await expect(guard.assertAllowed('user-1', 0.01)).rejects.toMatchObject({
        code: 'LLM_USER_DAILY_CAP_EXCEEDED',
        dailySpentUsd: 0.5,
        capUsd: 0.5,
      });
    });

    it('isolates per-user budgets — one user near the cap does not affect another', async () => {
      const counter = new InMemoryLlmCostCounter();
      counter.seed('user-A', FROZEN_DAY, 0.49);
      counter.seed('user-B', FROZEN_DAY, 0.0);

      const guard = new LlmCostGuard({
        killSwitchEnabled: false,
        dailyCapUsd: 0.5,
        counter,
      });

      await expect(guard.assertAllowed('user-B', 0.1)).resolves.toBeUndefined();
      await expect(counter.get('user-B', FROZEN_DAY)).resolves.toBeCloseTo(0.1, 10);

      await expect(guard.assertAllowed('user-A', 0.02)).rejects.toMatchObject({
        code: 'LLM_USER_DAILY_CAP_EXCEEDED',
        dailySpentUsd: 0.49,
        capUsd: 0.5,
      });
      await expect(counter.get('user-A', FROZEN_DAY)).resolves.toBeCloseTo(0.49, 10);
    });

    it('emits a structured warn log when the per-user cap is exceeded', async () => {
      const counter = new InMemoryLlmCostCounter();
      counter.seed('user-1', FROZEN_DAY, 0.48);

      const guard = new LlmCostGuard({
        killSwitchEnabled: false,
        dailyCapUsd: 0.5,
        counter,
      });

      await expect(guard.assertAllowed('user-1', 0.05)).rejects.toBeInstanceOf(LlmCostGuardError);

      expect(warnSpy).toHaveBeenCalledWith(
        'llm_cost_cap_block',
        expect.objectContaining({
          userId: 'user-1',
          code: 'LLM_USER_DAILY_CAP_EXCEEDED',
          dailySpentUsd: 0.48,
          capUsd: 0.5,
        }),
      );
    });
  });

  describe('anonymous (null userId) handling', () => {
    it('allows anonymous calls when kill-switch is OFF (no per-user cap applies) AND warns loudly', async () => {
      const counter = new InMemoryLlmCostCounter();
      const getSpy = jest.spyOn(counter, 'get');
      const incrSpy = jest.spyOn(counter, 'increment');

      const guard = new LlmCostGuard({
        killSwitchEnabled: false,
        dailyCapUsd: 0.5,
        counter,
      });

      await expect(guard.assertAllowed(null, 0.1)).resolves.toBeUndefined();

      expect(getSpy).not.toHaveBeenCalled();
      expect(incrSpy).not.toHaveBeenCalled();

      expect(warnSpy).toHaveBeenCalledWith(
        'llm_cost_anon_bypass',
        expect.objectContaining({ capUsd: 0.5 }),
      );
    });

    it('increments the anon-bypass observability counter on the anon path', async () => {
      const counter = new InMemoryLlmCostCounter();
      const guard = new LlmCostGuard({
        killSwitchEnabled: false,
        dailyCapUsd: 0.5,
        counter,
      });

      await expect(guard.assertAllowed(null, 0.1)).resolves.toBeUndefined();
    });

    it('denies anonymous calls when kill-switch is ON (kill-switch precedence preserved)', async () => {
      const counter = new InMemoryLlmCostCounter();
      const guard = new LlmCostGuard({
        killSwitchEnabled: true,
        dailyCapUsd: 0.5,
        counter,
      });

      await expect(guard.assertAllowed(null, 0.1)).rejects.toMatchObject({
        code: 'LLM_KILL_SWITCH_ACTIVE',
      });

      expect(warnSpy).not.toHaveBeenCalledWith('llm_cost_anon_bypass', expect.anything());
      expect(warnSpy).toHaveBeenCalledWith(
        'llm_cost_cap_block',
        expect.objectContaining({ code: 'LLM_KILL_SWITCH_ACTIVE' }),
      );
    });
  });

  describe('Redis unavailable → fail-CLOSED', () => {
    it('denies the call with LLM_COST_GUARD_REDIS_UNAVAILABLE when the counter throws on read', async () => {
      const counter = new FailingLlmCostCounter('ECONNREFUSED 127.0.0.1:6379');
      const guard = new LlmCostGuard({
        killSwitchEnabled: false,
        dailyCapUsd: 0.5,
        counter,
      });

      await expect(guard.assertAllowed('user-1', 0.01)).rejects.toMatchObject({
        code: 'LLM_COST_GUARD_REDIS_UNAVAILABLE',
      });
    });

    it('emits a structured warn log on the fail-CLOSED path', async () => {
      const counter = new FailingLlmCostCounter('ECONNREFUSED 127.0.0.1:6379');
      const guard = new LlmCostGuard({
        killSwitchEnabled: false,
        dailyCapUsd: 0.5,
        counter,
      });

      await expect(guard.assertAllowed('user-1', 0.01)).rejects.toBeInstanceOf(LlmCostGuardError);

      expect(warnSpy).toHaveBeenCalledWith(
        'llm_cost_cap_block',
        expect.objectContaining({
          userId: 'user-1',
          code: 'LLM_COST_GUARD_REDIS_UNAVAILABLE',
          capUsd: 0.5,
        }),
      );
    });
  });
});
