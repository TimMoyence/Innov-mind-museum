import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ChatOpenAI } from '@langchain/openai';
import { config as loadDotenv } from 'dotenv';
import { LangChainChatOrchestrator } from '@modules/chat/adapters/secondary/llm/langchain.orchestrator';
import { LocationResolver } from '@modules/chat/useCase/location-resolver';
import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';

import type {
  LocationConsentChecker,
  LocationConsentScope,
} from '@modules/chat/useCase/location-resolver';
import type { IMuseumRepository } from '@modules/museum/domain/museum/museum.repository.interface';
import type { Museum } from '@modules/museum/domain/museum/museum.entity';
import type { CachedReverseGeocodeFn, NominatimReverseResult } from '@shared/http/nominatim.client';

// The `unit-integration` Jest project only pins PGDATABASE (see jest.config.ts);
// it does NOT inject the host `.env`. Real-LLM ai-tests need `OPENAI_API_KEY`
// (+ LLM_MODEL / LLM_PROVIDER) which live in `museum-backend/.env`. Load them
// here, at module-import time, before any test reads `process.env`. `override:
// false` (dotenv default) means an explicitly-exported env var (e.g. CI secret)
// still wins over the file — we only fill gaps, never clobber.
loadDotenv({ path: resolve(__dirname, '../../../.env') });

const AI_MODEL = process.env.LLM_MODEL?.trim() ? process.env.LLM_MODEL.trim() : 'gpt-4o-mini';

/** Test utility: flag indicating whether live AI tests should execute (requires RUN_AI_TESTS=true). */
export const shouldRunAiTests = process.env.RUN_AI_TESTS === 'true';

/**
 * Test utility: builds a real LangChain orchestrator configured with a live OpenAI key for AI integration tests.
 * @returns LangChainChatOrchestrator wired to the configured model.
 */
export const buildAiTestOrchestrator = (): LangChainChatOrchestrator => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for AI tests');
  }

  const model = new ChatOpenAI({
    apiKey,
    model: AI_MODEL,
    temperature: 0.3,
  });

  return new LangChainChatOrchestrator({ model } as unknown as ConstructorParameters<
    typeof LangChainChatOrchestrator
  >[0]);
};

/** Test utility: builds a ChatService backed by a live AI orchestrator for end-to-end AI tests. */
export const buildAiTestService = () => {
  return buildChatTestService(buildAiTestOrchestrator());
};

/**
 * Test utility: asserts that an AI-generated response looks like a valid art-related answer.
 * @param text - The assistant response text to validate.
 */
export const assertArtResponse = (text: string): void => {
  expect(text).toBeDefined();
  expect(text.length).toBeGreaterThan(20);
  expect(text).not.toContain('running without an LLM key');
};

/** Test utility: base64-encoded 1x1 red pixel PNG used as minimal valid image input for vision pipeline tests. */
export const TEST_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

// ---------------------------------------------------------------------------
// Real-image fixtures (public-domain, committed under tests/ai/fixtures/).
//   art-mona-lisa.jpg      — Leonardo da Vinci, Mona Lisa (ART)
//   building-monument.jpg  — Pont de Pierre, Bordeaux (MONUMENT / outdoors)
//   nonart-banana.jpg      — a single banana (NON-ART everyday object)
// Sourced from Wikimedia Commons (see RETURN note in the test report).
// ---------------------------------------------------------------------------

const FIXTURES_DIR = resolve(__dirname, '../fixtures');

/**
 * Reads a committed image fixture and returns its raw base64 (no data-URL prefix).
 * @param filename - Fixture file name under tests/ai/fixtures/ (literal allow-list).
 * @returns The file contents base64-encoded.
 */
export const readFixtureBase64 = (filename: string): string => {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filename is a hard-coded literal from the fixtures allow-list below, never user input.
  return readFileSync(resolve(FIXTURES_DIR, filename)).toString('base64');
};

/**
 * Reads a committed image fixture and returns a `data:<mime>;base64,...` URL.
 * @param filename - Fixture file name under tests/ai/fixtures/.
 * @param mime - MIME type for the data URL (default image/jpeg).
 * @returns A `data:` URL string consumable by the chat image input.
 */
export const readFixtureDataUrl = (filename: string, mime = 'image/jpeg'): string =>
  `data:${mime};base64,${readFixtureBase64(filename)}`;

/**
 * Committed real-image fixtures, by semantic role (all public-domain, Wikimedia
 * Commons, downscaled to ~900px for cheap vision calls):
 *   art        — Leonardo da Vinci, Mona Lisa (2D painting, in-museum ART)
 *   sculpture  — Venus de Milo (3D sculpture, distinct from 2D painting)
 *   monument   — Pont de Pierre, Bordeaux (MONUMENT / outdoors)
 *   nonArt     — a single banana (NON-ART everyday object)
 *   person     — Albert Einstein head, PD-US 1947 (PHOTO of a person, NOT an
 *                artwork — exercises the privacy / don't-identify-a-person path)
 */
export const AI_IMAGE_FIXTURES = {
  art: 'art-mona-lisa.jpg',
  sculpture: 'art-sculpture-venus.jpg',
  monument: 'building-monument.jpg',
  nonArt: 'nonart-banana.jpg',
  person: 'person-portrait.jpg',
} as const;

// ---------------------------------------------------------------------------
// Robust assertion helpers — tolerant to LLM nondeterminism. Assert SHAPE /
// CATEGORY (non-empty, no throw, refusal-citation present/absent, language),
// never exact wording.
// ---------------------------------------------------------------------------

/** All `policy:*` refusal citations the V1 keyword guardrail can emit. */
export const REFUSAL_CITATIONS = [
  'policy:insult',
  'policy:prompt_injection',
  'policy:off_topic',
  'policy:unsafe_output',
  'policy:service_unavailable',
] as const;

/**
 * True when the response metadata carries ANY guardrail-refusal citation.
 * @param citations - The `metadata.citations` array (or undefined).
 * @returns True if any `policy:*` refusal citation is present.
 */
export const hasRefusalCitation = (citations: string[] | undefined): boolean => {
  const list = citations ?? [];
  return REFUSAL_CITATIONS.some((c) => list.includes(c));
};

/**
 * Asserts a real, substantive assistant answer was produced (NOT a refusal,
 * NOT empty, NOT the no-LLM-key stub). Use for cases that MUST go through to
 * the model and come back with content.
 * @param result - The postMessage result ({ message.text, metadata.citations }).
 */
export const assertSubstantiveAnswer = (result: {
  message: { text: string };
  metadata: { citations?: string[] };
}): void => {
  expect(result.message.text).toBeDefined();
  expect(typeof result.message.text).toBe('string');
  expect(result.message.text.trim().length).toBeGreaterThan(20);
  expect(result.message.text).not.toContain('running without an LLM key');
  expect(hasRefusalCitation(result.metadata.citations)).toBe(false);
};

/**
 * Asserts the response is a graceful, non-empty reply (no crash) WITHOUT
 * asserting whether it's an answer or a refusal — used for inputs where either
 * a polite redirect or a substantive answer is acceptable (off-topic, ambiguous
 * image, monument). The key contract is: pipeline did not throw, text non-empty.
 * @param result - The postMessage result ({ message.text }).
 */
export const assertGracefulNonEmpty = (result: { message: { text: string } }): void => {
  expect(result.message.text).toBeDefined();
  expect(typeof result.message.text).toBe('string');
  expect(result.message.text.trim().length).toBeGreaterThan(0);
  expect(result.message.text).not.toContain('running without an LLM key');
};

/**
 * Heuristic French-language detector for response-language fidelity assertions.
 * Looks for French function words / accented forms that are extremely unlikely
 * in an English sentence of comparable length. Returns true if ≥2 signals hit.
 * @param text - The assistant response text to classify.
 * @returns True if the text looks French (≥2 signals).
 */
export const looksFrench = (text: string): boolean => {
  const t = ` ${text.toLowerCase()} `;
  const signals = [
    ' le ',
    ' la ',
    ' les ',
    ' une ',
    ' un ',
    ' des ',
    ' est ',
    ' avec ',
    ' pour ',
    ' dans ',
    ' cette ',
    ' œuvre',
    ' peintre',
    ' tableau',
    'é',
    'è',
    'à',
  ];
  return signals.filter((s) => t.includes(s)).length >= 2;
};

/**
 * Heuristic English-language detector (mirror of {@link looksFrench}). Returns
 * true if ≥2 common English function words are present.
 * @param text - The assistant response text to classify.
 * @returns True if the text looks English (≥2 signals).
 */
export const looksEnglish = (text: string): boolean => {
  const t = ` ${text.toLowerCase()} `;
  const signals = [
    ' the ',
    ' is ',
    ' was ',
    ' this ',
    ' that ',
    ' with ',
    ' painting',
    ' artist',
    ' you ',
    ' it ',
    ' of ',
    ' and ',
  ];
  return signals.filter((s) => t.includes(s)).length >= 2;
};

/**
 * Heuristic Spanish-language detector. Spanish-only function words / inverted
 * punctuation that don't collide with FR/EN/IT in a comparable sentence.
 * @param text - The assistant response text to classify.
 * @returns True if the text looks Spanish (≥2 signals).
 */
export const looksSpanish = (text: string): boolean => {
  const t = ` ${text.toLowerCase()} `;
  const signals = [
    ' el ',
    ' los ',
    ' una ',
    ' está ',
    ' como ',
    ' pintura',
    ' obra ',
    ' artista',
    ' fue ',
    ' por ',
    ' pintó',
    '¿',
    'ñ',
  ];
  return signals.filter((s) => t.includes(s)).length >= 2;
};

/**
 * Heuristic German-language detector. German function words + umlaut/ß that are
 * extremely unlikely in FR/EN/ES/IT text of comparable length.
 * @param text - The assistant response text to classify.
 * @returns True if the text looks German (≥2 signals).
 */
export const looksGerman = (text: string): boolean => {
  const t = ` ${text.toLowerCase()} `;
  const signals = [
    ' der ',
    ' die ',
    ' das ',
    ' und ',
    ' ist ',
    ' ein ',
    ' wurde ',
    ' von ',
    ' gemälde',
    ' künstler',
    'ä',
    'ö',
    'ü',
    'ß',
  ];
  return signals.filter((s) => t.includes(s)).length >= 2;
};

// ---------------------------------------------------------------------------
// GEO test wiring — real LLM, deterministic geo source.
//
// The product resolves `context.location` ("lat:X,lng:Y") into a
// `<visitor_context>` line for the LLM prompt: in-museum anchoring, outdoor
// reverse-geocode, and nearby-museum proximity suggestions ("un musée pas
// loin ?"). `buildChatTestService` does NOT wire a LocationResolver by default,
// so these helpers build one with:
//   - an in-memory museum repository seeded with REAL coordinates (so Haversine
//     nearby/in-museum math is genuine), and
//   - an INJECTED deterministic reverse-geocoder (no live Nominatim network).
// The LLM itself stays 100% real — only the geo data source is fixed, exactly
// as image fixtures fix the camera input. Live Nominatim is OOS-05 (catalog).
// ---------------------------------------------------------------------------

/** A seeded museum with the only fields the nearby-museum Haversine reads. */
export interface GeoMuseumSeed {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
}

/**
 * Real museum coordinates lifted verbatim from `scripts/seed-museums.ts` (Paris
 * + Bordeaux demo set). Used so in-museum (<200m) and nearby (<30km) distances
 * are computed from genuine geography, not invented numbers.
 */
export const GEO_MUSEUMS = {
  louvre: { id: 1, name: 'Musée du Louvre', latitude: 48.8606, longitude: 2.3376 },
  orsay: { id: 2, name: "Musée d'Orsay", latitude: 48.86, longitude: 2.3265 },
  aquitaine: { id: 10, name: "Musée d'Aquitaine", latitude: 44.8346, longitude: -0.5745 },
  capc: { id: 11, name: "CAPC Musée d'art contemporain", latitude: 44.8497, longitude: -0.5714 },
  citeDuVin: { id: 12, name: 'La Cité du Vin', latitude: 44.8625, longitude: -0.5502 },
} as const satisfies Record<string, GeoMuseumSeed>;

/** GPS strings for the `context.location` field (validated as "lat:X,lng:Y"). */
export const GEO_COORDS = {
  /** Exactly on the Louvre → isInsideMuseum (distance 0 < 200m). */
  insideLouvre: 'lat:48.8606,lng:2.3376',
  /**
   * Bordeaux city centre: > 200m from every Bordeaux museum (so "outdoors") yet
   * < 30km (so all three appear in `nearbyMuseums`). Drives proximity tests.
   */
  bordeauxCityCentre: 'lat:44.8450,lng:-0.5900',
} as const;

/** Deterministic Bordeaux reverse-geocode result (full granularity available). */
export const BORDEAUX_REVERSE_GEOCODE: NominatimReverseResult = {
  displayName: 'Saint-Pierre, Bordeaux, Gironde, Nouvelle-Aquitaine, France',
  address: {
    neighbourhood: 'Saint-Pierre',
    suburb: 'Bordeaux Centre',
    city: 'Bordeaux',
    country: 'France',
  },
  name: 'Bordeaux',
};

/** Consent checker that always grants the requested scope. */
export const ALLOW_ALL_CONSENT: LocationConsentChecker = {
  isGranted: async (_userId: number, _scope: LocationConsentScope): Promise<boolean> => true,
};

/** Consent checker that denies every scope (GDPR "none" → no location to LLM). */
export const DENY_ALL_CONSENT: LocationConsentChecker = {
  isGranted: async (_userId: number, _scope: LocationConsentScope): Promise<boolean> => false,
};

/**
 * Builds a real-LLM ChatService with geo wired: an in-memory museum repository
 * seeded with `museums`, an injected deterministic `reverseGeocode`, and an
 * optional `consentChecker`. The orchestrator is the live LangChain/gpt-4o-mini.
 * @param opts.museums - Seeded museums for nearby/in-museum Haversine math.
 * @param opts.reverseGeocode - Deterministic reverse-geocoder (default: returns null).
 * @param opts.consentChecker - Optional GDPR consent gate (default: none → 'full').
 */
export const buildAiTestServiceWithGeo = (opts: {
  museums: GeoMuseumSeed[];
  reverseGeocode?: CachedReverseGeocodeFn;
  consentChecker?: LocationConsentChecker;
}) => {
  const museumRepository = {
    findAll: async (): Promise<Museum[]> => opts.museums as unknown as Museum[],
  } as unknown as IMuseumRepository;

  const reverseGeocode: CachedReverseGeocodeFn = opts.reverseGeocode ?? (async () => null);
  const locationResolver = new LocationResolver(museumRepository, { reverseGeocode });

  return buildChatTestService({
    orchestrator: buildAiTestOrchestrator(),
    locationResolver,
    locationConsentChecker: opts.consentChecker,
    museumRepository,
  });
};
