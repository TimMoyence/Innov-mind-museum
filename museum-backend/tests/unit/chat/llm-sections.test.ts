import { createLlmSectionPlan, createSummaryFallback } from '@modules/chat/useCase/llm-sections';
import { makeMessage } from '../../helpers/chat/message.fixtures';

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
        makeMessage({ id: 'm1', role: 'assistant', text: 'The artist explores light contrast.' }),
        makeMessage({ id: 'm2', role: 'user', text: 'What should I observe next?' }),
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

  it('includes expert guide level hint in prompt', () => {
    const plan = createLlmSectionPlan({
      locale: 'en-US',
      museumMode: false,
      guideLevel: 'expert',
      timeoutSummaryMs: 10000,
    });
    expect(plan[0].prompt).toContain('advanced art-history vocabulary');
  });

  it('includes intermediate guide level hint in prompt', () => {
    const plan = createLlmSectionPlan({
      locale: 'en-US',
      museumMode: false,
      guideLevel: 'intermediate',
      timeoutSummaryMs: 10000,
    });
    expect(plan[0].prompt).toContain('intermediate level');
  });

  it('uses 150 word limit for museumMode and 250 for regular', () => {
    const museumPlan = createLlmSectionPlan({
      locale: 'en-US',
      museumMode: true,
      guideLevel: 'beginner',
      timeoutSummaryMs: 10000,
    });
    expect(museumPlan[0].prompt).toContain('150 words');

    const regularPlan = createLlmSectionPlan({
      locale: 'en-US',
      museumMode: false,
      guideLevel: 'beginner',
      timeoutSummaryMs: 10000,
    });
    expect(regularPlan[0].prompt).toContain('250 words');
  });
});

describe('createSummaryFallback — edge cases', () => {
  it('uses question as recap when history is empty', () => {
    const fallback = createSummaryFallback({
      history: [],
      question: 'Tell me about Monet',
      locale: 'en-US',
      museumMode: false,
    });
    expect(fallback).toContain('Tell me about Monet');
  });

  it('uses defaultQuestion when history is empty and no question', () => {
    const fallback = createSummaryFallback({
      history: [],
      locale: 'en-US',
      museumMode: false,
    });
    expect(fallback).toContain('Artwork question.');
  });

  it('uses defaultQuestion when history is empty and question is whitespace', () => {
    const fallback = createSummaryFallback({
      history: [],
      question: '   ',
      locale: 'en-US',
      museumMode: false,
    });
    expect(fallback).toContain('Artwork question.');
  });

  it('omits location prefix when no location is provided', () => {
    const fallback = createSummaryFallback({
      history: [makeMessage({ role: 'assistant', text: 'Art details.' })],
      locale: 'en-US',
      museumMode: false,
    });
    expect(fallback).not.toContain('You are currently near');
  });
});
