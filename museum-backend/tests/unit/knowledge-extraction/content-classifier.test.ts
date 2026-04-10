jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockInvoke = jest.fn();
const mockWithStructuredOutput = jest.fn().mockReturnValue({ invoke: mockInvoke });

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    withStructuredOutput: mockWithStructuredOutput,
  })),
}));

jest.mock('@langchain/core/messages', () => ({
  SystemMessage: jest.fn().mockImplementation((content: string) => ({ content, role: 'system' })),
  HumanMessage: jest.fn().mockImplementation((content: string) => ({ content, role: 'human' })),
}));

import { ContentClassifierService } from '@modules/knowledge-extraction/useCase/content-classifier.service';
import type {
  ClassificationResult,
  ClassifiedArtworkData,
  ClassifiedMuseumData,
} from '@modules/knowledge-extraction/domain/ports/content-classifier.port';

const ARTWORK_RESULT: ClassificationResult = {
  type: 'artwork',
  confidence: 0.95,
  data: {
    title: 'Mona Lisa',
    artist: 'Leonardo da Vinci',
    period: 'Renaissance',
    technique: 'Oil on poplar panel',
    description: 'Portrait of a woman with an enigmatic smile.',
    historicalContext: 'Painted in the early 16th century.',
    dimensions: '77 cm × 53 cm',
    currentLocation: 'Louvre Museum, Paris',
  } satisfies ClassifiedArtworkData,
};

const MUSEUM_RESULT: ClassificationResult = {
  type: 'museum',
  confidence: 0.9,
  data: {
    name: 'Louvre Museum',
    openingHours: { monday: 'closed', tuesday: '9h-18h' },
    admissionFees: { adult: 17, child: 0 },
    website: 'https://www.louvre.fr',
    collections: { paintings: true, sculptures: true },
    currentExhibitions: { name: 'Art of Ancient Egypt' },
    accessibility: { wheelchair: true },
  } satisfies ClassifiedMuseumData,
};

const IRRELEVANT_RESULT: ClassificationResult = {
  type: 'irrelevant',
  confidence: 0.8,
  data: null,
};

describe('ContentClassifierService', () => {
  let service: ContentClassifierService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ContentClassifierService('test-api-key', 'gpt-4o-mini');
  });

  it('classifies artwork content correctly', async () => {
    mockInvoke.mockResolvedValue(ARTWORK_RESULT);

    const result = await service.classify(
      'The Mona Lisa is a Renaissance portrait painted by Leonardo da Vinci.',
      'en',
    );

    expect(result).not.toBeNull();
    expect(result?.type).toBe('artwork');
    expect(result?.confidence).toBe(0.95);
    const artworkResult = result as Extract<ClassificationResult, { type: 'artwork' }>;
    expect(artworkResult.data.title).toBe('Mona Lisa');
    expect(artworkResult.data.artist).toBe('Leonardo da Vinci');
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('classifies museum content correctly', async () => {
    mockInvoke.mockResolvedValue(MUSEUM_RESULT);

    const result = await service.classify(
      'The Louvre Museum is open Tuesday to Sunday from 9am to 6pm.',
      'en',
    );

    expect(result).not.toBeNull();
    expect(result?.type).toBe('museum');
    expect(result?.confidence).toBe(0.9);
    const museumResult = result as Extract<ClassificationResult, { type: 'museum' }>;
    expect(museumResult.data.name).toBe('Louvre Museum');
    expect(museumResult.data.website).toBe('https://www.louvre.fr');
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('returns irrelevant for off-topic content', async () => {
    mockInvoke.mockResolvedValue(IRRELEVANT_RESULT);

    const result = await service.classify(
      'Today the stock market closed up 2% on strong earnings reports.',
      'en',
    );

    expect(result).not.toBeNull();
    expect(result?.type).toBe('irrelevant');
    expect(result?.confidence).toBe(0.8);
    expect(result?.data).toBeNull();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('returns null when LLM throws an error', async () => {
    mockInvoke.mockRejectedValue(new Error('OpenAI API unavailable'));

    const result = await service.classify('Some content about an artwork.', 'en');

    expect(result).toBeNull();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('returns null for empty text without calling LLM', async () => {
    const result = await service.classify('   ', 'en');

    expect(result).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('returns null when LLM throws a non-Error value', async () => {
    mockInvoke.mockRejectedValue('string error');

    const result = await service.classify('Some artwork content.', 'en');

    expect(result).toBeNull();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });
});
