// characterization: null-museum geolocated path verify-first (UFR-022 / Q3 / design §9 D3).
// This test documents the CONTRACT for a chat turn with `museumId === null`
// (a visitor photographing an outdoor monument with no associated museum):
//   1. With a granted `location_to_llm` consent + an outdoor ResolvedLocation,
//      the orchestrator MUST emit a coarse `<visitor_context>` line referencing
//      the city/country and the monument framing, and MUST NOT throw (R8/AC-NM-1).
//   2. A null-museum turn with NO location and NO consent MUST still produce a
//      usable (non-refused, non-thrown) prompt — null `museumId` alone never
//      blocks (R9/AC-NM-2).
//   3. Regression guard: `buildVisitorContextLine` keys off `resolvedLocation`,
//      never `museumId`; the fine street-level value MUST NOT reach the prompt
//      (R3/AC-NM-3 — only the coarse value ships).
//
// `buildOrchestratorMessages` is a pure function over `OrchestratorInput`
// (which carries `museumId?: number | null` + `resolvedLocation?`), so the
// no-museum path is exercised directly here. If this test passes on arrival
// (expected per design §9 D3), it STANDS as the R8/R9 regression guard and NO
// BE source is edited (UFR-013 — no speculative fix for an unproven bug).

import { buildOrchestratorMessages } from '@modules/chat/useCase/llm/llm-prompt-builder';
import type { OrchestratorInput } from '@modules/chat/domain/ports/chat-orchestrator.port';

import { makeResolvedLocation, makeNearbyMuseum } from '../../helpers/chat/location.fixtures';

const makeNullMuseumInput = (overrides: Partial<OrchestratorInput> = {}): OrchestratorInput => ({
  history: [],
  museumMode: false,
  museumId: null,
  userId: 42,
  ...overrides,
});

const userText = (result: ReturnType<typeof buildOrchestratorMessages>): string => {
  const content = result.userMessage.content;
  if (typeof content === 'string') return content;
  const textPart = (content as { type: string; text?: string }[]).find((c) => c.type === 'text');
  return textPart?.text ?? '';
};

describe('no-museum geolocated chat path (museumId === null)', () => {
  it('emits a coarse <visitor_context> for an outdoor monument when location is resolved (R8/AC-NM-1)', () => {
    const resolvedLocation = makeResolvedLocation({
      reverseGeocodeCoarse: 'Bordeaux, France',
      reverseGeocode: '12 Place des Quinconces, 33000 Bordeaux, France',
      nearbyMuseums: [makeNearbyMuseum({ id: 7, name: 'CAPC', distance: 800 })],
    });

    const result = buildOrchestratorMessages(
      makeNullMuseumInput({
        text: 'What is this statue?',
        image: { source: 'base64', value: 'abc123', mimeType: 'image/jpeg' },
        resolvedLocation,
      }),
    );

    const text = userText(result);
    // Geolocated answer is reachable with NO museum: the coarse city ships.
    expect(text).toContain('visitor_context');
    expect(text).toContain('Bordeaux, France');
    // Monument / outdoor framing present (the no-museum value proposition).
    expect(text.toLowerCase()).toContain('monument');
    // GDPR — the fine street-level value MUST NOT reach the LLM prompt.
    expect(text).not.toContain('Place des Quinconces');
    expect(text).not.toMatch(/\b33000\b/);
  });

  it('does not throw and returns a usable prompt for a null-museum turn with no location and no consent (R9/AC-NM-2)', () => {
    let result: ReturnType<typeof buildOrchestratorMessages> | undefined;
    expect(() => {
      result = buildOrchestratorMessages(
        makeNullMuseumInput({
          text: 'Tell me about this place',
          // No resolvedLocation (consent not granted upstream) and no context.location.
        }),
      );
    }).not.toThrow();

    // A usable system prompt is still produced — null museumId alone never blocks.
    expect(result?.systemPrompt).toContain('[END OF SYSTEM INSTRUCTIONS]');
    // With no location signal at all, NO geocoded visitor_context is emitted.
    expect(userText(result!)).not.toContain('visitor_context');
  });

  it('regression guard: visitor_context keys off resolvedLocation, never museumId (R3/AC-NM-3)', () => {
    // Same null museumId, but now a resolved coarse location → context appears.
    const withLocation = buildOrchestratorMessages(
      makeNullMuseumInput({
        text: 'Hello',
        resolvedLocation: makeResolvedLocation({ reverseGeocodeCoarse: 'Lyon, France' }),
      }),
    );
    expect(userText(withLocation)).toContain('Lyon, France');

    // Same null museumId, no resolvedLocation → no context. Proves museumId is
    // not the gate; the resolved location is.
    const withoutLocation = buildOrchestratorMessages(makeNullMuseumInput({ text: 'Hello' }));
    expect(userText(withoutLocation)).not.toContain('visitor_context');
  });
});
