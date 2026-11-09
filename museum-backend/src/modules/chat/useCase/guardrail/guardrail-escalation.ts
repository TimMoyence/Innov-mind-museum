import { hashIp } from '@modules/chat/useCase/guardrail/guardrail-friction.store';
import { env } from '@src/config/env';

import type { OrchestratorOutput } from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { GuardrailEvaluationService } from '@modules/chat/useCase/guardrail/guardrail-evaluation.service';
import type {
  FrictionScope,
  IGuardrailFrictionStore,
} from '@modules/chat/useCase/guardrail/guardrail-friction.store';

export interface FrictionScopes {
  session: FrictionScope;
  principal?: FrictionScope;
}

export type FrictionTurnOutcome =
  | { kind: 'answer'; aiResult: OrchestratorOutput }
  | { kind: 'cooldown' };

interface FrictionAudit {
  sessionId: string;
  userId?: number;
  requestId?: string;
  ip?: string;
}

export interface FrictionEscalationDeps {
  guardrail: GuardrailEvaluationService;
  frictionStore?: IGuardrailFrictionStore;
  frictionSessionThreshold: number;
  frictionUserThreshold: number;
}

export class FrictionEscalationService {
  private readonly guardrail: GuardrailEvaluationService;
  private readonly store?: IGuardrailFrictionStore;
  private readonly sessionThreshold: number;
  private readonly userThreshold: number;

  constructor(deps: FrictionEscalationDeps) {
    this.guardrail = deps.guardrail;
    this.store = deps.frictionStore;
    this.sessionThreshold = deps.frictionSessionThreshold;
    this.userThreshold = deps.frictionUserThreshold;
  }

  scopesFor(sessionId: string, userId: number | undefined, ip: string | undefined): FrictionScopes {
    const session: FrictionScope = { kind: 'session', sessionId };
    if (userId !== undefined) {
      return { session, principal: { kind: 'user', userId } };
    }
    if (ip !== undefined && ip.length > 0) {
      return { session, principal: { kind: 'ip', ipHash: hashIp(ip) } };
    }
    return { session };
  }

  async isAnyScopeCoolingDown(scopes: FrictionScopes): Promise<boolean> {
    const store = this.store;
    if (!store) return false;
    try {
      if (await store.isCoolingDown(scopes.session)) return true;
      if (scopes.principal && (await store.isCoolingDown(scopes.principal))) return true;
      return false;
    } catch {
      return false;
    }
  }

  async runParallel(
    generate: () => Promise<OrchestratorOutput>,
    sanitizedText: string,
    scopes: FrictionScopes,
    audit: FrictionAudit,
  ): Promise<FrictionTurnOutcome> {
    const [judgeRes, genRes] = await Promise.allSettled([
      this.guardrail.evaluateInputSemantic(sanitizedText, {
        sessionId: audit.sessionId,
        userId: audit.userId,
        requestId: audit.requestId,
        ip: audit.ip,
      }),
      generate(),
    ]);

    if (genRes.status === 'rejected') throw genRes.reason;
    const aiResult = genRes.value;

    if (judgeRes.status === 'rejected' || judgeRes.value.verdict === 'allow') {
      return { kind: 'answer', aiResult };
    }

    await this.recordStrikeSafely(scopes, env.guardrails.frictionWeightOfftopic);
    const { sessionCount, userCount } = await this.frictionCounts(scopes);

    const escalate = sessionCount >= this.sessionThreshold || userCount >= this.userThreshold;
    if (!escalate) {
      return { kind: 'answer', aiResult };
    }

    if (userCount >= this.userThreshold) {
      await this.armCoolDownSafely(scopes.principal);
    }
    await this.guardrail.logFrictionBlock({
      reason: 'off_topic',
      fullText: sanitizedText,
      context: {
        sessionId: audit.sessionId,
        userId: audit.userId,
        requestId: audit.requestId,
        ip: audit.ip,
      },
    });
    return { kind: 'cooldown' };
  }

  async recordSecurityStrike(scopes: FrictionScopes, audit: FrictionAudit): Promise<void> {
    if (!this.store) return;
    await this.recordStrikeSafely(scopes, env.guardrails.frictionWeightSecurity);
    const { userCount } = await this.frictionCounts(scopes);
    if (userCount >= this.userThreshold) {
      await this.armCoolDownSafely(scopes.principal);
      await this.guardrail.logFrictionBlock({
        reason: 'prompt_injection',
        fullText: '[security strike escalation]',
        context: {
          sessionId: audit.sessionId,
          userId: audit.userId,
          requestId: audit.requestId,
          ip: audit.ip,
        },
      });
    }
  }

  private async recordStrikeSafely(scopes: FrictionScopes, weight: number): Promise<void> {
    const store = this.store;
    if (!store) return;
    try {
      await store.recordStrike(scopes.session, weight);
      if (scopes.principal) await store.recordStrike(scopes.principal, weight);
    } catch {}
  }

  private async frictionCounts(
    scopes: FrictionScopes,
  ): Promise<{ sessionCount: number; userCount: number }> {
    const store = this.store;
    if (!store) return { sessionCount: 0, userCount: 0 };
    try {
      const sessionCount = await store.count(scopes.session);
      const userCount = scopes.principal ? await store.count(scopes.principal) : 0;
      return { sessionCount, userCount };
    } catch {
      return { sessionCount: 0, userCount: 0 };
    }
  }

  private async armCoolDownSafely(scope: FrictionScope | undefined): Promise<void> {
    const store = this.store;
    if (!store || !scope) return;
    try {
      await store.armCoolDown(scope);
    } catch {}
  }
}
