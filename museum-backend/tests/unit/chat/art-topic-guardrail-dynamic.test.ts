import { evaluateUserInputGuardrail } from '@modules/chat/application/art-topic-guardrail';
import type { ArtTopicClassifier } from '@modules/chat/application/art-topic-classifier';

const makeClassifier = (returnValue: boolean) =>
  ({
    isArtRelated: jest.fn().mockResolvedValue(returnValue),
  }) as unknown as jest.Mocked<ArtTopicClassifier>;

const makeFailingClassifier = () =>
  ({
    isArtRelated: jest.fn().mockRejectedValue(new Error('API timeout')),
  }) as unknown as jest.Mocked<ArtTopicClassifier>;

describe('evaluateUserInputGuardrail — dynamic keywords (step 5b)', () => {
  it('allows message matching a dynamic keyword not in static list', async () => {
    const dynamicKeywords = new Set(['ceramique', 'fresque-numerique']);
    const result = await evaluateUserInputGuardrail({
      text: 'Parlez-moi de la ceramique ici',
      history: [],
      dynamicKeywords,
    });
    expect(result).toEqual({ allow: true });
  });

  it('falls through when dynamic keywords set is empty', async () => {
    const result = await evaluateUserInputGuardrail({
      text: 'Tell me about quantum physics please',
      history: [],
      dynamicKeywords: new Set(),
    });
    expect(result.allow).toBe(true);
    expect(typeof result.redirectHint).toBe('string');
    expect(result.redirectHint!.length).toBeGreaterThan(0);
  });

  it('falls through when dynamic keywords set is undefined', async () => {
    const result = await evaluateUserInputGuardrail({
      text: 'How do I cook pasta properly',
      history: [],
    });
    expect(result.allow).toBe(true);
    expect(typeof result.redirectHint).toBe('string');
    expect(result.redirectHint!.length).toBeGreaterThan(0);
  });
});

describe('evaluateUserInputGuardrail — classifier (step 9)', () => {
  it('allows message when classifier returns true', async () => {
    const classifier = makeClassifier(true);
    const result = await evaluateUserInputGuardrail({
      text: 'What can you tell me about this specific restoration technique here',
      history: [],
      classifier,
    });
    expect(result).toEqual({ allow: true });
    expect(classifier.isArtRelated).toHaveBeenCalledWith(
      'What can you tell me about this specific restoration technique here',
    );
  });

  it('calls onKeywordDiscovered when classifier returns true', async () => {
    const classifier = makeClassifier(true);
    const onKeywordDiscovered = jest.fn();
    await evaluateUserInputGuardrail({
      text: 'What about this specific restoration technique here today',
      history: [],
      classifier,
      onKeywordDiscovered,
    });
    expect(onKeywordDiscovered).toHaveBeenCalledWith(expect.any(String), 'en');
  });

  it('returns redirectHint when classifier returns false', async () => {
    const classifier = makeClassifier(false);
    const result = await evaluateUserInputGuardrail({
      text: 'What is the meaning of life and everything else',
      history: [],
      classifier,
    });
    expect(result.allow).toBe(true);
    expect(typeof result.redirectHint).toBe('string');
    expect(result.redirectHint!.length).toBeGreaterThan(0);
  });

  it('returns redirectHint (fail-open) when classifier throws', async () => {
    const classifier = makeFailingClassifier();
    const result = await evaluateUserInputGuardrail({
      text: 'Tell me about this interesting thing over there please',
      history: [],
      classifier,
    });
    // fail-open: classifier error should NOT block the user
    expect(result.allow).toBe(true);
    expect(typeof result.redirectHint).toBe('string');
    expect(result.redirectHint!.length).toBeGreaterThan(0);
  });

  it('skips classifier when no classifier provided', async () => {
    const result = await evaluateUserInputGuardrail({
      text: 'What about this interesting thing over there please',
      history: [],
      // no classifier
    });
    expect(result.allow).toBe(true);
    expect(typeof result.redirectHint).toBe('string');
    expect(result.redirectHint!.length).toBeGreaterThan(0);
  });

  it('does not call classifier when static keyword matches', async () => {
    const classifier = makeClassifier(true);
    const result = await evaluateUserInputGuardrail({
      text: 'Tell me about this painting',
      history: [],
      classifier,
    });
    expect(result).toEqual({ allow: true });
    // Should match at step 5a (static keyword "painting"), classifier NOT called
    expect(classifier.isArtRelated).not.toHaveBeenCalled();
  });
});
