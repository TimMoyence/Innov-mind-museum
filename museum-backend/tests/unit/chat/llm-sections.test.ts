import {
  createLlmSectionPlan,
  createSummaryFallback,
} from '@modules/chat/application/llm-sections';
import { ChatMessage } from '@modules/chat/domain/chatMessage.entity';

const createMessage = (
  id: string,
  role: 'user' | 'assistant',
  text: string,
): ChatMessage =>
  ({
    id,
    role,
    text,
    imageRef: null,
    metadata: null,
    createdAt: new Date('2026-02-18T10:00:00.000Z'),
    session: undefined as never,
    artworkMatches: [],
  }) as ChatMessage;

describe('llm-sections', () => {
  it('creates a single summary section', () => {
    const plan = createLlmSectionPlan({
      locale: 'en-US',
      museumMode: true,
      guideLevel: 'intermediate',
      timeoutSummaryMs: 10000,
    });

    expect(plan).toHaveLength(1);
    expect(plan[0].name).toBe('summary');
    expect(plan[0].required).toBe(true);
  });

  it('includes image analysis guidance when hasImage is true', () => {
    const plan = createLlmSectionPlan({
      locale: 'en-US',
      museumMode: true,
      guideLevel: 'beginner',
      timeoutSummaryMs: 10000,
      hasImage: true,
    });

    expect(plan[0].prompt).toContain('[IMAGE ANALYSIS]');
    expect(plan[0].prompt).toContain('imageDescription');
  });

  it('does not include image guidance when hasImage is false', () => {
    const plan = createLlmSectionPlan({
      locale: 'en-US',
      museumMode: true,
      guideLevel: 'beginner',
      timeoutSummaryMs: 10000,
      hasImage: false,
    });

    expect(plan[0].prompt).not.toContain('[IMAGE ANALYSIS]');
  });

  it('includes followUpQuestions in JSON schema', () => {
    const plan = createLlmSectionPlan({
      locale: 'en-US',
      museumMode: false,
      guideLevel: 'expert',
      timeoutSummaryMs: 10000,
    });

    expect(plan[0].prompt).toContain('followUpQuestions');
    expect(plan[0].prompt).toContain('deeperContext');
    expect(plan[0].prompt).toContain('openQuestion');
  });

  it('uses English-only prompts with Reply in French directive for fr locale', () => {
    const plan = createLlmSectionPlan({
      locale: 'fr-FR',
      museumMode: false,
      guideLevel: 'beginner',
      timeoutSummaryMs: 10000,
    });

    expect(plan[0].prompt).toContain('Reply in French.');
    // Prompts are now English-only with a language directive
    expect(plan[0].prompt).not.toContain('Reponds en francais');
  });

  it.each([
    ['es-ES', 'Reply in Spanish.'],
    ['de-DE', 'Reply in German.'],
    ['it-IT', 'Reply in Italian.'],
    ['ja-JP', 'Reply in Japanese.'],
    ['zh-CN', 'Reply in Chinese.'],
    ['en-US', 'Reply in English.'],
  ])('generates correct language directive for %s', (locale, expected) => {
    const plan = createLlmSectionPlan({
      locale,
      museumMode: false,
      guideLevel: 'beginner',
      timeoutSummaryMs: 10000,
    });

    expect(plan[0].prompt).toContain(expected);
  });

  it('builds deterministic summary fallback', () => {
    const fallback = createSummaryFallback({
      history: [
        createMessage('m1', 'assistant', 'The artist explores light contrast.'),
        createMessage('m2', 'user', 'What should I observe next?'),
      ],
      question: 'Tell me more',
      location: 'Room 12',
      locale: 'en-US',
      museumMode: true,
    });

    expect(fallback).toContain('Room 12');
    expect(fallback).toContain('Quick summary');
    expect(fallback).toContain('Next step');
  });
});
