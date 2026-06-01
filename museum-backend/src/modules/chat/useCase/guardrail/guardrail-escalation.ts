/**
 * Hybrid-gravity guardrail — friction escalation orchestration (2026-06-01).
 *
 * Extracted from `chat-message.service.ts` (max-lines cap + hexagonal
 * cohesion). Owns the 2-level friction policy (design §5):
 *
 *   - OFF-TOPIC (`runParallel`) — the SEMANTIC judge runs IN PARALLEL of
 *     generation; an isolated off-topic is SOFT-REDIRECTED (the answer is
 *     returned, the section prompt recentres), escalating to a HARD-BLOCK
 *     cool-down only once the session / user-or-IP thresholds are crossed.
 *   - SECURITY (`recordSecurityStrike`) — a V1-keyword / sidecar BLOCK is
 *     ALWAYS a hard-block inline (handled upstream by `prepare`); on top of
 *     that this records a strike of the SECURITY weight (2) on both scopes so
 *     an injection / PII spammer escalates into the same global cool-down. The
 *     hard-block itself is independent of the strike — a store outage MUST NOT
 *     weaken the security block (FAIL-SOFT).
 *
 * Every friction-store call is FAIL-SOFT: a store outage degrades to plain
 * soft-redirect / no escalation, never a 500 nor a spurious hard-block (R14).
 */
import { hashIp } from '@modules/chat/useCase/guardrail/guardrail-friction.store';
import { env } from '@src/config/env';

import type { OrchestratorOutput } from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { GuardrailEvaluationService } from '@modules/chat/useCase/guardrail/guardrail-evaluation.service';
import type {
  FrictionScope,
  IGuardrailFrictionStore,
} from '@modules/chat/useCase/guardrail/guardrail-friction.store';

/** Friction scopes for a turn: always `session`, plus `user` xor `ip` (hashed). */
export interface FrictionScopes {
  session: FrictionScope;
  principal?: FrictionScope;
}

/**
 * Outcome of running the off-topic judge in parallel of generation + applying
 * the escalation policy. `answer` → commit the generated response (soft-redirect
 * or on-topic); `cooldown` → suppress it and return the localised cool-down.
 */
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
  frictionEnabled: boolean;
  frictionSessionThreshold: number;
  frictionUserThreshold: number;
}

/**
 * Collaborator that applies the hybrid-gravity friction policy. Stateless
 * across turns (all state lives in the injected `frictionStore`).
 */
export class FrictionEscalationService {
  private readonly guardrail: GuardrailEvaluationService;
  private readonly store?: IGuardrailFrictionStore;
  private readonly enabled: boolean;
  private readonly sessionThreshold: number;
  private readonly userThreshold: number;

  constructor(deps: FrictionEscalationDeps) {
    this.guardrail = deps.guardrail;
    this.store = deps.frictionStore;
    this.enabled = deps.frictionEnabled;
    this.sessionThreshold = deps.frictionSessionThreshold;
    this.userThreshold = deps.frictionUserThreshold;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Builds the friction scopes for a turn: always `session`, plus `user` (when
   * authenticated) OR `ip` (hashed — RGPD, never the raw value). `undefined`
   * user/ip → only the session scope participates (anon without an IP).
   */
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

  /** R11 cool-down pre-check across both scopes. FAIL-SOFT → false on outage. */
  async isAnyScopeCoolingDown(scopes: FrictionScopes): Promise<boolean> {
    const store = this.store;
    if (!store) return false;
    try {
      if (await store.isCoolingDown(scopes.session)) return true;
      if (scopes.principal && (await store.isCoolingDown(scopes.principal))) return true;
      return false;
    } catch {
      // FAIL-SOFT — a store outage MUST NOT block the chat (spec R14).
      return false;
    }
  }

  /**
   * Runs the off-topic judge IN PARALLEL of generation, then applies the
   * 2-level escalation policy (design §5):
   *   - judge allow / null (fail-OPEN) → return the generated answer.
   *   - judge off-topic, under both thresholds → record a strike, SOFT-REDIRECT.
   *   - judge off-topic, session ≥ S_soft OR user/IP ≥ U_floor → HARD-BLOCK
   *     cool-down (suppress the answer), arm the user/IP cool-down at U_floor.
   *
   * `generate` is a thunk so the caller owns generation error mapping: a
   * generation throw is rethrown verbatim. All store calls are FAIL-SOFT.
   */
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

    // A generation throw is the only failure that must surface (judge is
    // no-throw + fail-OPEN). Rethrow so the caller maps it to 503.
    if (genRes.status === 'rejected') throw genRes.reason;
    const aiResult = genRes.value;

    // Judge threw (should not — `judgeWithLlm` is no-throw) OR allowed → answer.
    if (judgeRes.status === 'rejected' || judgeRes.value.verdict === 'allow') {
      return { kind: 'answer', aiResult };
    }

    // Off-topic. Record a strike on both scopes (FAIL-SOFT), then decide.
    await this.recordStrikeSafely(scopes, env.guardrails.frictionWeightOfftopic);
    const { sessionCount, userCount } = await this.frictionCounts(scopes);

    const escalate = sessionCount >= this.sessionThreshold || userCount >= this.userThreshold;
    if (!escalate) {
      // SOFT-REDIRECT — the section prompt recentres; no `policy:off_topic`.
      return { kind: 'answer', aiResult };
    }

    // HARD-BLOCK cool-down. Arm the global user/IP cool-down at the floor so the
    // next message (any session) is rate-limited for FRICTION_COOLDOWN_MS.
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

  /**
   * SECURITY strike (R2 / design §5). Called AFTER the security hard-block has
   * already been decided upstream (V1 keyword OR sidecar block in `prepare`).
   * Records a strike of the SECURITY weight (2) on session + principal so a
   * repeat injection / PII spammer crosses the user floor and arms the global
   * cool-down. The hard-block is independent of this strike — FAIL-SOFT: a
   * store outage here NEVER weakens the security block.
   */
  async recordSecurityStrike(scopes: FrictionScopes, audit: FrictionAudit): Promise<void> {
    if (!this.enabled || !this.store) return;
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
    } catch {
      // FAIL-SOFT — never escalate a store outage into a chat failure.
    }
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
      // FAIL-SOFT — outage reads as 0 strikes → no escalation.
      return { sessionCount: 0, userCount: 0 };
    }
  }

  private async armCoolDownSafely(scope: FrictionScope | undefined): Promise<void> {
    const store = this.store;
    if (!store || !scope) return;
    try {
      await store.armCoolDown(scope);
    } catch {
      // FAIL-SOFT.
    }
  }
}
