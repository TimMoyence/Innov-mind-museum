/**
 * R2 / R3 / R5 / D3 — `third_party_ai_<text|image>_<provider>` consent gate
 * for {@link PrepareMessagePipeline} (cluster A, RUN_ID=2026-05-21-p0-gdpr).
 *
 * The gate sits BEFORE `persistMessage` + enrichment fan-out so a denied turn
 * never lands in the message table and raw user text never reaches
 * Redis/BullMQ (R9 parity + GDPR Art. 5(1)(c)). It is extracted to keep
 * `prepare-message.pipeline.ts` under the project-wide 400-line cap
 * (eslint.config.mjs §4 COMPLEXITY).
 *
 * Mirrors {@link LocationConsentChecker}'s wiring pattern
 * (`location-resolver.ts:196-200`) — the orchestrator owns the call and
 * short-circuits on a deny, the checker port only answers boolean.
 *
 * D3 fail-CLOSED is enforced inside the checker itself for nullish userId
 * (`third-party-ai-consent-checker.ts:42-44`) — no special case here.
 *
 * Q2 AND-intersection: if a turn carries BOTH text and image, BOTH scopes
 * must be granted; refusing ANY denies the turn (design.md §9 Q2).
 *
 * **Why no persistence here.** The refusal returned by this gate is
 * transitory: `chat.service.ts` (design §3 R6, §9 D7) wraps the
 * {@link PrepareRefused} into `AppError({code: 'CONSENT_REQUIRED', scope})`
 * before HTTP egress, and AppError surfacing does not require a persisted
 * message row. Persisting via `persistBlockedExchange` would (a) double the
 * write path for what is effectively an HTTP-422-style domain rejection and
 * (b) couple the gate to the moderation-audit schema (which exists for the
 * guardrail-block branch precisely BECAUSE the user attempted something the
 * model would otherwise have answered — consent denial is the opposite: the
 * user wants an answer the provider may not legally give).
 */
import { resolveActiveProviderForScope } from '@modules/chat/useCase/orchestration/provider-resolver';

import type { ConsentScope } from '@modules/auth/domain/consent/userConsent.entity';
import type { PostMessageInput } from '@modules/chat/domain/chat.types';
import type { PrepareRefused } from '@modules/chat/useCase/orchestration/prepare-message.pipeline';
import type { ThirdPartyAiConsentChecker } from '@modules/chat/useCase/third-party-ai-consent-checker';

export interface ConsentGateInput {
  sessionId: string;
  text: string | undefined;
  image: PostMessageInput['image'];
  imageRef: string | undefined;
  currentUserId: number | undefined;
  requestedLocale: string | undefined;
}

/**
 * Runs the third-party-AI consent gate. Returns `null` when allowed (caller
 * proceeds with `persistMessage` + enrichment) or a {@link PrepareRefused}
 * short-circuit when ANY required scope is denied. Without a checker the
 * legacy always-allow path is preserved (pre-launch migration window +
 * unit-test surfaces that exercise unrelated branches).
 */
export async function checkThirdPartyAiConsent(args: {
  checker: ThirdPartyAiConsentChecker | undefined;
  input: ConsentGateInput;
}): Promise<PrepareRefused | null> {
  const { checker, input } = args;
  if (!checker) return null;

  const requiredScopes: ConsentScope[] = [];
  if (input.text && input.text.length > 0) {
    requiredScopes.push(resolveActiveProviderForScope('text').scope);
  }
  if (input.image) {
    requiredScopes.push(resolveActiveProviderForScope('image').scope);
  }
  if (requiredScopes.length === 0) return null;

  for (const scope of requiredScopes) {
    const granted = await checker.isGranted(input.currentUserId, scope);
    if (!granted) {
      return buildConsentRefusal({
        sessionId: input.sessionId,
        scope,
        requestedLocale: input.requestedLocale,
      });
    }
  }
  return null;
}

/**
 * Builds the {@link PrepareRefused} payload for a consent denial. The result
 * carries a stable shape consumable by the assistant bubble UI; the
 * structured error context (scope name) is surfaced to HTTP clients by
 * `chat.service.ts` via `AppError({code: 'CONSENT_REQUIRED', scope})` (design
 * §3 R6, §9 D7).
 */
function buildConsentRefusal(params: {
  sessionId: string;
  scope: ConsentScope;
  requestedLocale: string | undefined;
}): PrepareRefused {
  const refusalText = buildConsentRefusalText(params.requestedLocale);
  const refusalMetadata: Record<string, unknown> = {
    // Stable terminal phase mirrors guardrail-block + chat-stages contract
    // (A5 — refusals follow standard `composing → done`).
    phase: 'done',
    refusalReason: 'consent_required',
    consentScope: params.scope,
  };
  // Deterministic synthetic id keyed on the scope keeps the assistant-bubble
  // contract stable for the FE renderer (which uses the id as a React key)
  // without touching the message table. The `consent_refusal::` prefix is
  // namespaced to avoid collisions with real `chat_message.id` UUIDs.
  const refusal = {
    id: `consent_refusal::${params.scope}`,
    role: 'assistant' as const,
    text: refusalText,
    createdAt: new Date().toISOString(),
  };

  return {
    kind: 'refused',
    result: {
      sessionId: params.sessionId,
      message: refusal,
      metadata: refusalMetadata,
    },
  };
}

/**
 * Locale-aware refusal copy. Kept deliberately short + generic (no scope name
 * leaked to the user-facing bubble); the structured error context is surfaced
 * on the HTTP path via `chat.service.ts` `AppError({code: 'CONSENT_REQUIRED',
 * scope})` (design §3 R6, §9 D7). FR / EN coverage matches the existing
 * `buildGuardrailRefusal` semantics so the assistant bubble reads
 * consistently across the two refusal classes.
 */
function buildConsentRefusalText(requestedLocale: string | undefined): string {
  const lang = (requestedLocale ?? 'en').slice(0, 2).toLowerCase();
  if (lang === 'fr') {
    return "Pour répondre à ce message, j'ai besoin de votre consentement pour partager vos données avec notre fournisseur d'IA. Vous pouvez l'activer dans Paramètres › Confidentialité.";
  }
  return 'To answer this message I need your consent to share your data with our AI provider. You can enable it in Settings › Privacy.';
}
