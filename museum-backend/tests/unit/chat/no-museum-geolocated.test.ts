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
      consentGranularity: 'coarse',
      reverseGeocodeNeighbourhood: null,
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
    expect(text).toContain('visitor_context');
    expect(text).toContain('Bordeaux, France');
    expect(text.toLowerCase()).toContain('monument');
    expect(text).not.toContain('Place des Quinconces');
    expect(text).not.toMatch(/\b33000\b/);
  });

  it('does not throw and returns a usable prompt for a null-museum turn with no location and no consent (R9/AC-NM-2)', () => {
    let result: ReturnType<typeof buildOrchestratorMessages> | undefined;
    expect(() => {
      result = buildOrchestratorMessages(
        makeNullMuseumInput({
          text: 'Tell me about this place',
        }),
      );
    }).not.toThrow();

    expect(result?.systemPrompt).toContain('[END OF SYSTEM INSTRUCTIONS]');
    expect(userText(result!)).not.toContain('visitor_context');
  });

  it('regression guard: visitor_context keys off resolvedLocation, never museumId (R3/AC-NM-3)', () => {
    const withLocation = buildOrchestratorMessages(
      makeNullMuseumInput({
        text: 'Hello',
        resolvedLocation: makeResolvedLocation({
          consentGranularity: 'coarse',
          reverseGeocodeNeighbourhood: null,
          reverseGeocodeCoarse: 'Lyon, France',
        }),
      }),
    );
    expect(userText(withLocation)).toContain('Lyon, France');

    const withoutLocation = buildOrchestratorMessages(makeNullMuseumInput({ text: 'Hello' }));
    expect(userText(withoutLocation)).not.toContain('visitor_context');
  });
});

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
        userId: null,
        resolvedLocation: undefined,
        context: { location: 'lat:48.8606,lng:2.3376' },
      }),
    );

    const text = userText(result);
    expect(text).not.toContain('visitor_context');
    expectNoCoordinateLeak(text, '48.8606', '2.3376');
  });

  it('T3: granted consent, outdoor coarse, with coexisting raw GPS → ships city only, never coords (AC-3, AC-5)', () => {
    const result = buildOrchestratorMessages(
      makeNullMuseumInput({
        text: 'What is this monument?',
        resolvedLocation: makeResolvedLocation({
          consentGranularity: 'coarse',
          reverseGeocodeNeighbourhood: null,
          reverseGeocodeCoarse: 'Bordeaux, France',
          reverseGeocode: '12 Place des Quinconces, 33000 Bordeaux, France',
        }),
        context: { location: 'lat:44.8378,lng:-0.5792' },
      }),
    );

    const text = userText(result);
    expect(text).toContain('visitor_context');
    expect(text).toContain('Bordeaux, France');
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
