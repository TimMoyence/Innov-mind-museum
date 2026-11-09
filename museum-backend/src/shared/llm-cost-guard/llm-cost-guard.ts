import { errorMessage } from '@shared/errors/error-message';
import { logger as defaultLogger } from '@shared/logger/logger';

import type { LlmCostCounter } from '@shared/llm-cost-guard/llm-cost-counter.port';

export type LlmCostGuardCode =
  | 'LLM_KILL_SWITCH_ACTIVE'
  | 'LLM_USER_DAILY_CAP_EXCEEDED'
  | 'LLM_COST_GUARD_REDIS_UNAVAILABLE';

interface Logger {
  warn(message: string, context?: Record<string, unknown>): void;
}

export class LlmCostGuardError extends Error {
  readonly code: LlmCostGuardCode;
  readonly dailySpentUsd?: number;
  readonly capUsd?: number;

  constructor(params: {
    code: LlmCostGuardCode;
    message?: string;
    dailySpentUsd?: number;
    capUsd?: number;
  }) {
    super(params.message ?? params.code);
    this.name = 'LlmCostGuardError';
    this.code = params.code;
    this.dailySpentUsd = params.dailySpentUsd;
    this.capUsd = params.capUsd;
  }
}

export interface LlmCostGuardOptions {
  killSwitchEnabled: boolean;
  dailyCapUsd: number;
  counter: LlmCostCounter;
  logger?: Logger;
  clock?: () => Date;
}

const dayKey = (now: Date): string => now.toISOString().slice(0, 10);

export class LlmCostGuard {
  private readonly killSwitchEnabled: boolean;
  private readonly dailyCapUsd: number;
  private readonly counter: LlmCostCounter;
  private readonly logger: Logger;
  private readonly clock: () => Date;
  private charged: { userId: string; day: string; dollars: number } | null = null;

  constructor(options: LlmCostGuardOptions) {
    this.killSwitchEnabled = options.killSwitchEnabled;
    this.dailyCapUsd = options.dailyCapUsd;
    this.counter = options.counter;
    this.logger = options.logger ?? defaultLogger;
    this.clock = options.clock ?? ((): Date => new Date());
  }

  async assertAllowed(userId: string | null, estimatedCostUsd: number): Promise<void> {
    if (this.killSwitchEnabled) {
      this.logBlock(userId, 'LLM_KILL_SWITCH_ACTIVE');
      throw new LlmCostGuardError({
        code: 'LLM_KILL_SWITCH_ACTIVE',
        message: 'LLM kill-switch is active — outbound LLM calls are globally disabled.',
        capUsd: this.dailyCapUsd,
      });
    }

    if (userId === null) {
      this.logger.warn('llm_cost_anon_bypass', { capUsd: this.dailyCapUsd });
      return;
    }

    const day = dayKey(this.clock());

    let current: number;
    try {
      current = await this.counter.get(userId, day);
    } catch (err) {
      this.logBlock(userId, 'LLM_COST_GUARD_REDIS_UNAVAILABLE', {
        reason: errorMessage(err),
      });
      throw new LlmCostGuardError({
        code: 'LLM_COST_GUARD_REDIS_UNAVAILABLE',
        message: 'LLM cost counter unreachable — failing CLOSED.',
        capUsd: this.dailyCapUsd,
      });
    }

    if (current + estimatedCostUsd > this.dailyCapUsd) {
      this.logBlock(userId, 'LLM_USER_DAILY_CAP_EXCEEDED', {
        dailySpentUsd: current,
      });
      throw new LlmCostGuardError({
        code: 'LLM_USER_DAILY_CAP_EXCEEDED',
        message: 'Per-user daily LLM cost cap exceeded.',
        dailySpentUsd: current,
        capUsd: this.dailyCapUsd,
      });
    }

    try {
      await this.counter.increment(userId, day, estimatedCostUsd);
    } catch (err) {
      this.logBlock(userId, 'LLM_COST_GUARD_REDIS_UNAVAILABLE', {
        reason: errorMessage(err),
        phase: 'increment',
      });
      throw new LlmCostGuardError({
        code: 'LLM_COST_GUARD_REDIS_UNAVAILABLE',
        message: 'LLM cost counter increment failed — failing CLOSED.',
        capUsd: this.dailyCapUsd,
      });
    }
    this.charged = { userId, day, dollars: estimatedCostUsd };
  }

  async refund(): Promise<void> {
    if (!this.charged) return;
    const { userId, day, dollars } = this.charged;
    this.charged = null;
    await this.counter.increment(userId, day, -dollars);
  }

  private logBlock(
    userId: string | null,
    code: LlmCostGuardCode,
    extra?: Record<string, unknown>,
  ): void {
    this.logger.warn('llm_cost_cap_block', {
      userId,
      code,
      capUsd: this.dailyCapUsd,
      ...(extra ?? {}),
    });
  }
}
