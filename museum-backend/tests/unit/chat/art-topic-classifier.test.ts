import { ArtTopicClassifier } from '@modules/chat/application/art-topic-classifier';

// Mock the Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  const mockCreate = jest.fn();
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
    _mockCreate: mockCreate,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports -- access mock internals
const { _mockCreate: mockCreate } = require('@anthropic-ai/sdk') as { _mockCreate: jest.Mock };

describe('ArtTopicClassifier', () => {
  let classifier: ArtTopicClassifier;

  beforeEach(() => {
    jest.clearAllMocks();
    classifier = new ArtTopicClassifier('test-api-key');
  });

  it('returns true when API responds "yes"', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'yes' }],
    });

    const result = await classifier.isArtRelated('Tell me about Renaissance');
    expect(result).toBe(true);
  });

  it('returns false when API responds "no"', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'no' }],
    });

    const result = await classifier.isArtRelated('What is the price of bitcoin?');
    expect(result).toBe(false);
  });

  it('returns false (fail-open) on network error', async () => {
    mockCreate.mockRejectedValue(new Error('Connection timeout'));

    const result = await classifier.isArtRelated('Some text');
    expect(result).toBe(false);
  });

  it('returns false on empty/malformed response', async () => {
    mockCreate.mockResolvedValue({
      content: [],
    });

    const result = await classifier.isArtRelated('Some text');
    expect(result).toBe(false);
  });
});
