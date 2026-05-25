import { LlmCostGuard, LlmCostGuardError } from '@shared/llm-cost-guard/llm-cost-guard';
import { logger } from '@shared/logger/logger';
// I-FIX3 · T1.2 RED — the anon-bypass observability counter the guard must
// increment when `userId === null` reaches the guard (design §D3/D5). Does NOT
// exist at RED HEAD → import resolves to `undefined`, so the metric-counter
// test below fails when it calls `.get()` on it (feature-absent proof).
import { musaiumLlmCostAnonBypassTotal } from '@shared/observability/prometheus-metrics';

import {
  FailingLlmCostCounter,
  InMemoryLlmCostCounter,
} from 'tests/helpers/llm-cost-guard/in-memory-llm-cost-counter';

/**
 * P0-4 (audit 2026-05-12, docs/audit-2026-05-12/details/04-kiss.md §P0-U-2).
 *
 * RED phase: these tests pin the contract for the cost guard the implementer
 * will build. The module being imported does not exist yet — every test fails
 * at module-resolution time. Once green:
 *
 *   - LLM_KILL_SWITCH=true short-circuits every outbound LLM call BEFORE any
 *     HTTP request leaves the process (kill-switch global ON).
 *   - OPENAI_USER_DAILY_USD_CAP enforces a per-user daily cost ceiling, backed
 *     by a Redis counter at key `llm_cost:user:{userId}:{YYYY-MM-DD}` with
 *     TTL 25h.
 *   - Anonymous (no userId) calls are NOT capped per-user — no stable key —
 *     but the global kill-switch still applies. This is the documented policy
 *     codified by the `anonymous user` tests below.
 *   - Redis unavailable → fail-CLOSED (deny, not allow). Matches the
 *     llm-guard sidecar pattern restored at commit e45490c1 and the
 *     UFR-013 honesty doctrine (`feedback_honesty_no_pretense.md`).
 *   - Every block emits a structured `logger.warn` so ops can flag hot users.
 *
 * The exact day key uses ISO YYYY-MM-DD in UTC; tests freeze the system clock
 * to 2026-05-12T12:00:00Z so the key is deterministic.
 */

const FROZEN_NOW_MS = Date.UTC(2026, 4, 12, 12, 0, 0); // 2026-05-12T12:00:00Z
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

      // Critical: the over-cap delta must NOT be consumed — otherwise a tight
      // loop bumps the running total above the cap on every iteration, which
      // would also exfiltrate budget signal to attackers.
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

      // user-B's small call easily passes — they have their own bucket.
      await expect(guard.assertAllowed('user-B', 0.1)).resolves.toBeUndefined();
      await expect(counter.get('user-B', FROZEN_DAY)).resolves.toBeCloseTo(0.1, 10);

      // user-A's tiny call breaches their own bucket.
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
    /**
     * Codified policy: anonymous callers are NOT capped per-user — there is no
     * stable key (the audit calls out IP/session as too unreliable for cost
     * gating). Per-IP rate-limiting already exists at the HTTP layer
     * (`rate-limit.middleware.ts`), so the cost guard delegates volume control
     * to that layer for anon traffic, and only enforces the global kill-switch
     * here. If the implementer wants to extend with a global anon bucket
     * later, that is a separate gate; this test pins the V1 behaviour.
     *
     * I-FIX3 · T1.2 RED (CONTRACT CHANGE / SWEEP — spec §R3, design §D3):
     * the early-return is KEPT (no hard block, no per-user key possible) BUT it
     * is no longer SILENT. Before returning, the guard MUST emit a
     * `logger.warn('llm_cost_anon_bypass', { capUsd })` so a future un-authed
     * paid route surfaces loudly instead of bypassing the cap with zero signal.
     * This assertion is ADDED here in the red phase deliberately — the
     * frozen-test contract forbids a green-phase self-edit of this file.
     */
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

      // The per-user counter must not be touched for anon — there's no stable
      // key. Volume control is delegated to IP rate-limit middleware.
      expect(getSpy).not.toHaveBeenCalled();
      expect(incrSpy).not.toHaveBeenCalled();

      // NEW (T1.2) — the bypass is now observable. FAILS at RED HEAD where the
      // `userId === null` branch returns silently (llm-cost-guard.ts:103-105).
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

      // Snapshot the labelless counter value before, exercise the anon path,
      // then assert the counter went up by exactly 1. At RED HEAD
      // `musaiumLlmCostAnonBypassTotal` does not exist (import === undefined) →
      // `.get()` throws → feature-absent red.
      const before = (await musaiumLlmCostAnonBypassTotal.get()).values[0]?.value ?? 0;

      await expect(guard.assertAllowed(null, 0.1)).resolves.toBeUndefined();

      const after = (await musaiumLlmCostAnonBypassTotal.get()).values[0]?.value ?? 0;
      expect(after - before).toBe(1);
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

      // R4 — the kill-switch short-circuits BEFORE the anon branch, so the anon
      // bypass warn MUST NOT fire when the kill-switch denies. The only warn is
      // the kill-switch block.
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
