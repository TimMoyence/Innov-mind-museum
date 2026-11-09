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

loadDotenv({ path: resolve(__dirname, '../../../.env') });

const AI_MODEL = process.env.LLM_MODEL?.trim() ? process.env.LLM_MODEL.trim() : 'gpt-4o-mini';

export const shouldRunAiTests = process.env.RUN_AI_TESTS === 'true';

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

export const buildAiTestService = () => {
  return buildChatTestService(buildAiTestOrchestrator());
};

export const assertArtResponse = (text: string): void => {
  expect(text).toBeDefined();
  expect(text.length).toBeGreaterThan(20);
  expect(text).not.toContain('running without an LLM key');
};

const FIXTURES_DIR = resolve(__dirname, '../fixtures');

export const readFixtureBase64 = (filename: string): string => {
  return readFileSync(resolve(FIXTURES_DIR, filename)).toString('base64');
};

export const readFixtureDataUrl = (filename: string, mime = 'image/jpeg'): string =>
  `data:${mime};base64,${readFixtureBase64(filename)}`;

export const AI_IMAGE_FIXTURES = {
  art: 'art-mona-lisa.jpg',
  sculpture: 'art-sculpture-venus.jpg',
  monument: 'building-monument.jpg',
  nonArt: 'nonart-banana.jpg',
  person: 'person-portrait.jpg',
} as const;

export const REFUSAL_CITATIONS = [
  'policy:insult',
  'policy:prompt_injection',
  'policy:off_topic',
  'policy:unsafe_output',
  'policy:service_unavailable',
] as const;

export const hasRefusalCitation = (citations: string[] | undefined): boolean => {
  const list = citations ?? [];
  return REFUSAL_CITATIONS.some((c) => list.includes(c));
};

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

export const assertGracefulNonEmpty = (result: { message: { text: string } }): void => {
  expect(result.message.text).toBeDefined();
  expect(typeof result.message.text).toBe('string');
  expect(result.message.text.trim().length).toBeGreaterThan(0);
  expect(result.message.text).not.toContain('running without an LLM key');
};

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

export interface GeoMuseumSeed {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
}

export const GEO_MUSEUMS = {
  louvre: { id: 1, name: 'Musée du Louvre', latitude: 48.8606, longitude: 2.3376 },
  orsay: { id: 2, name: "Musée d'Orsay", latitude: 48.86, longitude: 2.3265 },
  aquitaine: { id: 10, name: "Musée d'Aquitaine", latitude: 44.8346, longitude: -0.5745 },
  capc: { id: 11, name: "CAPC Musée d'art contemporain", latitude: 44.8497, longitude: -0.5714 },
  citeDuVin: { id: 12, name: 'La Cité du Vin', latitude: 44.8625, longitude: -0.5502 },
} as const satisfies Record<string, GeoMuseumSeed>;

export const GEO_COORDS = {
  insideLouvre: 'lat:48.8606,lng:2.3376',
  bordeauxCityCentre: 'lat:44.8450,lng:-0.5900',
} as const;

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

export const ALLOW_ALL_CONSENT: LocationConsentChecker = {
  isGranted: async (_userId: number, _scope: LocationConsentScope): Promise<boolean> => true,
};

export const DENY_ALL_CONSENT: LocationConsentChecker = {
  isGranted: async (_userId: number, _scope: LocationConsentScope): Promise<boolean> => false,
};

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
