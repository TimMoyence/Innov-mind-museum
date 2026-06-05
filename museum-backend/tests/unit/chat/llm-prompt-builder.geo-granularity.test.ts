// Cycle 1.5 (RUN_ID 2026-05-26-chat-pipeline-hardening) — 3-level geo consent.
//
// buildVisitorContextLine must branch on the resolver's `consentGranularity`:
//   - `coarse` (location_coarse_to_llm only) → ship CITY only, never the quartier.
//   - `full`   (location_to_llm)             → ship the QUARTIER (neighbourhood + city),
//                                              degrading to city when no quartier (REQ-4a).
// In-museum stays prioritary (museum name only, REQ-7). Non-geocoded → no city/quartier
// (REQ-8). The Cycle 1 GPS barrier (`isCoordinateString`) stays intact (REQ-9/M14).
//
// These exercise `buildOrchestratorMessages` as a pure function over `OrchestratorInput`
// (which carries `resolvedLocation?` already bearing `consentGranularity`). The NEW
// behaviours (coarse-only → city, full → quartier, negative leak assertions) FAIL today
// because the builder currently emits `reverseGeocodeCoarse` unconditionally and the
// `consentGranularity` / `reverseGeocodeNeighbourhood` fields do not exist yet.
//
// Spec/Design: spec-cycle1_5.md (matrix M1-M15), design-cycle1_5.md (§ prompt-builder).

import { buildOrchestratorMessages } from '@modules/chat/useCase/llm/llm-prompt-builder';
import type { OrchestratorInput } from '@modules/chat/domain/ports/chat-orchestrator.port';

import { makeResolvedLocation, makeNearbyMuseum } from '../../helpers/chat/location.fixtures';

const makeGeoInput = (overrides: Partial<OrchestratorInput> = {}): OrchestratorInput => ({
  history: [],
  museumMode: false,
  museumId: null,
  userId: 42,
  text: 'What is this?',
  ...overrides,
});

const userText = (result: ReturnType<typeof buildOrchestratorMessages>): string => {
  const content = result.userMessage.content;
  if (typeof content === 'string') return content;
  const textPart = (content as { type: string; text?: string }[]).find((c) => c.type === 'text');
  return textPart?.text ?? '';
};

/** A `full`-granularity outdoor location with a quartier (Le Marais, Paris). */
const fullWithQuartier = () =>
  makeResolvedLocation({
    consentGranularity: 'full',
    reverseGeocodeNeighbourhood: 'Le Marais, Paris',
    reverseGeocodeCoarse: 'Paris, France',
    reverseGeocode: '12 Rue de Rivoli, 75001 Paris, France',
  });

describe('buildVisitorContextLine — 3-level geo consent granularity (cycle 1.5)', () => {
  describe('coarse level (location_coarse_to_llm only)', () => {
    it('M3: outdoor with quartier available → ships CITY only, never the quartier label', () => {
      const result = buildOrchestratorMessages(
        makeGeoInput({
          resolvedLocation: makeResolvedLocation({
            consentGranularity: 'coarse',
            reverseGeocodeNeighbourhood: 'Le Marais, Paris',
            reverseGeocodeCoarse: 'Paris, France',
          }),
        }),
      );
      const text = userText(result);
      expect(text).toContain('visitor_context');
      expect(text).toContain('Paris, France');
      // Coarse must NOT escalate to the quartier even when it is resolved.
      expect(text).not.toContain('Le Marais');
    });

    it('M4: outdoor city-only (no quartier) → ships city', () => {
      const result = buildOrchestratorMessages(
        makeGeoInput({
          resolvedLocation: makeResolvedLocation({
            consentGranularity: 'coarse',
            reverseGeocodeNeighbourhood: 'Bordeaux, France',
            reverseGeocodeCoarse: 'Bordeaux, France',
          }),
        }),
      );
      const text = userText(result);
      expect(text).toContain('visitor_context');
      expect(text).toContain('Bordeaux, France');
    });

    it('M5: coarse + non-geocoded (null) → no city/quartier emitted (REQ-8)', () => {
      const result = buildOrchestratorMessages(
        makeGeoInput({
          resolvedLocation: makeResolvedLocation({
            consentGranularity: 'coarse',
            reverseGeocodeNeighbourhood: null,
            reverseGeocodeCoarse: null,
            reverseGeocode: null,
          }),
        }),
      );
      const text = userText(result);
      expect(text).not.toContain('visitor_context');
    });

    it('M6: coarse + in-museum → museum name only, never city/quartier (REQ-7)', () => {
      const result = buildOrchestratorMessages(
        makeGeoInput({
          resolvedLocation: makeResolvedLocation({
            consentGranularity: 'coarse',
            isInsideMuseum: true,
            reverseGeocodeCoarse: null,
            reverseGeocodeNeighbourhood: null,
            reverseGeocode: null,
            nearestMuseumDistance: 50,
            nearbyMuseums: [makeNearbyMuseum({ id: 7, name: 'CAPC musée', distance: 50 })],
          }),
        }),
      );
      const text = userText(result);
      expect(text).toContain('visitor_context');
      expect(text).toContain('CAPC musée');
      expect(text).not.toContain('Paris');
    });
  });

  describe('full level (location_to_llm)', () => {
    it('M7: outdoor with quartier → ships QUARTIER + city (Le Marais, Paris)', () => {
      const result = buildOrchestratorMessages(
        makeGeoInput({ resolvedLocation: fullWithQuartier() }),
      );
      const text = userText(result);
      expect(text).toContain('visitor_context');
      expect(text).toContain('Le Marais');
      expect(text).toContain('Paris');
    });

    it('M8: outdoor city-only (quartier degraded to city, REQ-4a) → ships city, no dangling comma', () => {
      const result = buildOrchestratorMessages(
        makeGeoInput({
          resolvedLocation: makeResolvedLocation({
            consentGranularity: 'full',
            // REQ-4a: when no quartier, neighbourhood field already degraded to city.
            reverseGeocodeNeighbourhood: 'Bordeaux, France',
            reverseGeocodeCoarse: 'Bordeaux, France',
          }),
        }),
      );
      const text = userText(result);
      expect(text).toContain('visitor_context');
      expect(text).toContain('Bordeaux');
      // No empty quartier / dangling separator artefact.
      expect(text).not.toMatch(/outdoors in:\s*,/);
    });

    it('M9: full + non-geocoded (null neighbourhood AND coarse) → no city/quartier (REQ-8)', () => {
      const result = buildOrchestratorMessages(
        makeGeoInput({
          resolvedLocation: makeResolvedLocation({
            consentGranularity: 'full',
            reverseGeocodeNeighbourhood: null,
            reverseGeocodeCoarse: null,
            reverseGeocode: null,
          }),
        }),
      );
      const text = userText(result);
      expect(text).not.toContain('visitor_context');
    });

    it('M10: full + in-museum → museum name only, never city/quartier (REQ-7)', () => {
      const result = buildOrchestratorMessages(
        makeGeoInput({
          resolvedLocation: makeResolvedLocation({
            consentGranularity: 'full',
            isInsideMuseum: true,
            reverseGeocodeCoarse: null,
            reverseGeocodeNeighbourhood: null,
            reverseGeocode: null,
            nearestMuseumDistance: 50,
            nearbyMuseums: [makeNearbyMuseum({ id: 7, name: 'Louvre', distance: 50 })],
          }),
        }),
      );
      const text = userText(result);
      expect(text).toContain('visitor_context');
      expect(text).toContain('Louvre');
      expect(text).not.toContain('Le Marais');
    });

    it('M11: both scopes granted (full dominates, REQ-1) → ships QUARTIER + city', () => {
      // A `full` ResolvedLocation models "both granted" — full wins per REQ-1.
      const result = buildOrchestratorMessages(
        makeGeoInput({ resolvedLocation: fullWithQuartier() }),
      );
      const text = userText(result);
      expect(text).toContain('Le Marais');
      expect(text).toContain('Paris');
    });

    it('M15: full + quartier → prompt NEVER contains road / house number / postcode / coordinate (REQ-10)', () => {
      const result = buildOrchestratorMessages(
        makeGeoInput({
          resolvedLocation: makeResolvedLocation({
            consentGranularity: 'full',
            reverseGeocodeNeighbourhood: 'Le Marais, Paris',
            reverseGeocodeCoarse: 'Paris, France',
            // Fine analytics value carries street/postcode — must NEVER ship.
            reverseGeocode: '12 Rue de Rivoli, 75001 Paris, France',
          }),
        }),
      );
      const text = userText(result);
      expect(text).toContain('Le Marais');
      // Negative assertions: no road, no house number, no postcode, no GPS marker.
      expect(text).not.toContain('Rue de Rivoli');
      expect(text).not.toContain('75001');
      expect(text).not.toContain('lat:');
      expect(text).not.toContain('lng:');
    });
  });

  describe('none level + GPS barrier (M1/M12/M14, non-regression of cycle 1)', () => {
    it('M1: no resolvedLocation (none) + no context.location → nothing emitted', () => {
      const result = buildOrchestratorMessages(makeGeoInput({ resolvedLocation: undefined }));
      const text = userText(result);
      expect(text).not.toContain('visitor_context');
    });

    it('M12: anonymous (userId null) + no resolvedLocation → nothing emitted', () => {
      const result = buildOrchestratorMessages(
        makeGeoInput({ userId: null, resolvedLocation: undefined }),
      );
      const text = userText(result);
      expect(text).not.toContain('visitor_context');
    });

    it('M14: GPS barrier intact — resolvedLocation undefined + raw GPS context.location → dropped, no coords leak (REQ-9)', () => {
      const result = buildOrchestratorMessages(
        makeGeoInput({
          resolvedLocation: undefined,
          context: { location: 'lat:48.8606,lng:2.3376' },
        }),
      );
      const text = userText(result);
      expect(text).not.toContain('visitor_context');
      expect(text).not.toContain('lat:');
      expect(text).not.toContain('lng:');
      expect(text).not.toContain('48.8606');
      expect(text).not.toContain('2.3376');
    });
  });
});
