import { ArtTopicClassifier } from '@modules/chat/application/art-topic-classifier';

const mockInvoke = jest.fn();

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: mockInvoke,
  })),
}));

jest.mock('@langchain/core/messages', () => ({
  SystemMessage: jest.fn().mockImplementation((content: string) => ({ content, role: 'system' })),
  HumanMessage: jest.fn().mockImplementation((content: string) => ({ content, role: 'human' })),
}));

describe('ArtTopicClassifier', () => {
  let classifier: ArtTopicClassifier;

  beforeEach(() => {
    jest.clearAllMocks();
    classifier = new ArtTopicClassifier('test-api-key');
  });

  it('returns true when API responds "yes"', async () => {
    mockInvoke.mockResolvedValue({ content: 'yes' });

    const result = await classifier.isArtRelated('Tell me about Renaissance');
    expect(result).toBe(true);
  });

  it('returns false when API responds "no"', async () => {
    mockInvoke.mockResolvedValue({ content: 'no' });

    const result = await classifier.isArtRelated('What is the price of bitcoin?');
    expect(result).toBe(false);
  });

  it('returns false (fail-open) on network error', async () => {
    mockInvoke.mockRejectedValue(new Error('Connection timeout'));

    const result = await classifier.isArtRelated('Some text');
    expect(result).toBe(false);
  });

  it('returns false on empty/malformed response', async () => {
    mockInvoke.mockResolvedValue({ content: '' });

    const result = await classifier.isArtRelated('Some text');
    expect(result).toBe(false);
  });
});
