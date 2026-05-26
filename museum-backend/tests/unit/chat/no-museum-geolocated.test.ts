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

// ---------------------------------------------------------------------------
// Cycle 1 (RUN_ID 2026-05-26-chat-pipeline-hardening) — A-01 GPS-leak guard.
//
// Bug A-01 (CRITICAL): when geo consent is REFUSED / anonymous
// (`resolvedLocation === undefined`) but the raw client GPS string is still
// propagated unconditionally into `context.location` (format
// `"lat:X,lng:Y"`), `buildVisitorContextLine` falls into its `!rl` branch and
// interpolates the raw coordinates verbatim into the `<visitor_context>` sent
// to the third-party LLM (`sanitizePromptInput` does NOT strip them).
//
// GDPR inversion (Art. 7): a visitor who ACCEPTS only leaks the coarse city;
// a visitor who REFUSES leaks exact GPS. Refusing must never leak MORE than
// accepting.
//
// Spec/Design: spec-cycle1.md (REQ-1/2/3/4/5, AC-1/3/4/5/8) AS AMENDED by
// spec-cycle1-amendment.md (Narrow contract — PREVAILS over Décision D2).
// These tests EXTEND the file (they do not rewrite the R8/R9/R3 characterization
// above).
//
// Narrow contract (chemin principal P, branche `!resolvedLocation`):
//   - `context.location` parseable as GPS (`lat:X,lng:Y`) → NO `<visitor_context>` (drop). [A-01]
//   - `context.location` non-GPS free-text label → M4 behaviour preserved (anti-injection
//     guardrail; a legitimate label is still emitted). This is covered, unchanged, by the
//     existing M4 tests `llm-prompt-builder.test.ts:617,710` + the `location field guardrail`
//     block — so there is NO test here asserting absence for a non-GPS label (the old D2 "T6"
//     case was removed: under Narrow a non-GPS label MUST be emitted, not dropped).
//
// Expected status on CURRENT (pre-fix) code:
//   - T1 (refused/anon + GPS)            → FAILS (leaks lat:/lng:/coords). Proof of A-01.
//   - T3 (granted outdoor + GPS coexist) → PASSES (hardened with coexisting GPS).
//   - T4 (granted museum  + GPS coexist) → PASSES (hardened).
//   - T5 (granted nearby  + GPS coexist) → PASSES (hardened).
// ---------------------------------------------------------------------------

/** Asserts a prompt text never leaks raw GPS markers nor the given coord numbers. */
const expectNoCoordinateLeak = (text: string, ...coordTokens: string[]): void => {
  expect(text).not.toContain('lat:');
  expect(text).not.toContain('lng:');
  for (const token of coordTokens) {
    expect(text).not.toContain(token);
  }
};

describe('no-museum geolocated chat path — A-01 raw GPS never reaches the LLM (cycle 1)', () => {
  it('T1: refused/anonymous consent + raw context.location GPS → no geo visitor_context, no coords leak (AC-1, FAILS pre-fix)', () => {
    const result = buildOrchestratorMessages(
      makeNullMuseumInput({
        text: 'What is this statue?',
        userId: null, // anonymous → resolveLocationForMessage returns undefined upstream
        // No resolvedLocation (consent refused / anonymous), but the client still
        // shipped the raw GPS in context.location — the exact A-01 condition.
        resolvedLocation: undefined,
        context: { location: 'lat:48.8606,lng:2.3376' },
      }),
    );

    const text = userText(result);
    // Narrow contract (REQ-2'): with resolvedLocation undefined, a GPS-parseable
    // context.location is dropped — no visitor_context emitted.
    expect(text).not.toContain('visitor_context');
    // And — defense in depth — the raw coordinates must never appear anywhere.
    expectNoCoordinateLeak(text, '48.8606', '2.3376');
  });

  it('T3: granted consent, outdoor coarse, with coexisting raw GPS → ships city only, never coords (AC-3, AC-5)', () => {
    const result = buildOrchestratorMessages(
      makeNullMuseumInput({
        text: 'What is this monument?',
        resolvedLocation: makeResolvedLocation({
          reverseGeocodeCoarse: 'Bordeaux, France',
          reverseGeocode: '12 Place des Quinconces, 33000 Bordeaux, France',
        }),
        // Raw GPS coexists in the payload — must NOT leak even when granted.
        context: { location: 'lat:44.8378,lng:-0.5792' },
      }),
    );

    const text = userText(result);
    expect(text).toContain('visitor_context');
    expect(text).toContain('Bordeaux, France');
    // Coarse only — the fine street-level value and the raw GPS never ship.
    expect(text).not.toContain('Place des Quinconces');
    expect(text).not.toMatch(/\b33000\b/);
    expectNoCoordinateLeak(text, '44.8378', '-0.5792');
  });

  it('T4: granted consent, inside museum, with coexisting raw GPS → ships museum name only, never coords (AC-4, AC-5)', () => {
    const result = buildOrchestratorMessages(
      makeNullMuseumInput({
        text: 'Tell me about this room',
        resolvedLocation: makeResolvedLocation({
          isInsideMuseum: true,
          reverseGeocodeCoarse: null,
          reverseGeocode: null,
          nearestMuseumDistance: 50,
          nearbyMuseums: [makeNearbyMuseum({ id: 7, name: 'CAPC musée', distance: 50 })],
        }),
        context: { location: 'lat:44.8631,lng:-0.5620' },
      }),
    );

    const text = userText(result);
    expect(text).toContain('visitor_context');
    expect(text).toContain('CAPC musée');
    expectNoCoordinateLeak(text, '44.8631', '-0.5620');
  });

  it('T5: granted consent, outdoor non-geocoded but nearby museums, with coexisting raw GPS → ships museum names only, never coords (AC-5)', () => {
    const result = buildOrchestratorMessages(
      makeNullMuseumInput({
        text: 'What can I see nearby?',
        resolvedLocation: makeResolvedLocation({
          reverseGeocodeCoarse: null,
          reverseGeocode: null,
          isInsideMuseum: false,
          nearestMuseumDistance: 900,
          nearbyMuseums: [makeNearbyMuseum({ id: 9, name: 'Musée Mer Marine', distance: 900 })],
        }),
        context: { location: 'lat:44.8500,lng:-0.5700' },
      }),
    );

    const text = userText(result);
    expect(text).toContain('visitor_context');
    expect(text).toContain('Musée Mer Marine');
    expectNoCoordinateLeak(text, '44.8500', '-0.5700');
  });
});
