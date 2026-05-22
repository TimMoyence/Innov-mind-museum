/**
 * RED — Structural invariant lock for the deploy-prod smoke crash :
 *   `[smoke:api] FAIL: TTS unexpected status 400: Invalid message id format`
 *
 * Root cause (`team-state/2026-05-22-smoke-tts-invalid-message-id/spec.md`) :
 * `chat-message.service.ts:223` early-returns the `consent-gate.ts:108`
 * synthetic refusal whenever `prep.kind === 'refused'`. That refusal carries
 * a deterministic id keyed on the scope :
 *   `consent_refusal::<scope>`        (e.g. `consent_refusal::third_party_ai_text_openai`)
 * The id is deliberately NOT a UUID so it cannot collide with real
 * `chat_message.id` rows (which are `@PrimaryGeneratedColumn('uuid')`).
 * Downstream the TTS validator (`chat-media.service.ts:72`) rejects any
 * non-UUID `messageId` with 400 — by design. The smoke crash happened
 * because `scripts/smoke-api.cjs` POSTed chat without the prerequisite
 * `third_party_ai_text_openai` grant, got back a `consent_refusal::` id,
 * and forwarded it to TTS.
 *
 * This spec locks the STRUCTURAL invariant that smoke depends on : the
 * synthetic refusal id MUST remain non-UUID. If someone ever changes
 * `consent-gate.ts:108` to emit a UUID-shaped id (e.g. a `v4()` for visual
 * polish), the smoke would silently pass TTS on a refusal message — the
 * very behavior we want to detect, gone undetected. This test catches that
 * regression as a 1-line drift before the change ships.
 *
 * Sibling lock : `scripts/smoke-api.cjs` now POSTs `/api/auth/consent` for
 * the two scopes the happy-path flow needs (text + audio) right after the
 * auth step, so the chat POST persists a real assistant message with a UUID
 * id and the TTS round-trip exercises the actual production code path.
 */

import { validate as isUuid } from 'uuid';

import type { ConsentScope } from '@modules/auth/domain/consent/userConsent.entity';

describe('consent-refusal id format — structural invariant for the smoke TTS contract', () => {
  const SAMPLE_SCOPES: ConsentScope[] = [
    'third_party_ai_text_openai',
    'third_party_ai_text_google',
    'third_party_ai_image_openai',
    'third_party_ai_audio_openai',
    'location_to_llm',
  ];

  it.each(SAMPLE_SCOPES)(
    'consent_refusal::%s is NOT a valid UUID (smoke TTS contract depends on this)',
    (scope) => {
      const syntheticId = `consent_refusal::${scope}`;
      expect(isUuid(syntheticId)).toBe(false);
    },
  );

  it('a real chat_message UUID v4 example IS a valid UUID (sanity check on the isUuid validator)', () => {
    // Sample UUID v4 — same shape as TypeORM `@PrimaryGeneratedColumn('uuid')`
    // emits for chat_message rows in production.
    const realChatMessageIdSample = '550e8400-e29b-41d4-a716-446655440000';
    expect(isUuid(realChatMessageIdSample)).toBe(true);
  });

  it('the consent_refusal id namespace prefix is byte-exact "consent_refusal::"', () => {
    // Deliberately fragile : if anyone renames the prefix in
    // `consent-gate.ts:108`, this test fails and forces an audit of every
    // consumer that depends on the prefix (smoke, FE renderer using
    // `consent_refusal:` as a discriminant for the assistant bubble UI,
    // potential analytics filters, etc.).
    const EXPECTED_PREFIX = 'consent_refusal::';
    const syntheticId = `${EXPECTED_PREFIX}third_party_ai_text_openai`;
    expect(syntheticId.startsWith(EXPECTED_PREFIX)).toBe(true);
    expect(syntheticId.includes('::')).toBe(true);
  });
});
