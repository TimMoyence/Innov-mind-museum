import {
  createLlmSectionPlan,
  createSummaryFallback,
  mainAssistantOutputSchema,
} from '@modules/chat/useCase/llm/llm-sections';
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

  it('asks for deeperContext and openQuestion, never a follow-up question', () => {
    const plan = createLlmSectionPlan({
      locale: 'en-US',
      museumMode: false,
      guideLevel: 'expert',
      timeoutSummaryMs: 10000,
    });

    expect(plan[0].prompt).toContain('deeperContext');
    expect(plan[0].prompt).toContain('openQuestion');
    expect(plan[0].prompt).not.toContain('followUpQuestions');
  });

  it('emits the v2 SuggestedImage shape (rationale + caption REQUIRED) — C2 R6', () => {
    const plan = createLlmSectionPlan({
      locale: 'en-US',
      museumMode: false,
      guideLevel: 'intermediate',
      timeoutSummaryMs: 10000,
    });
    const prompt = plan[0].prompt;
    expect(prompt).toContain('1-4 short search queries');
    expect(prompt).toContain('single-subject answers');
    expect(prompt).toContain('comparative or multi-subject answers');
    expect(prompt).toContain('2-4 entries');
    expect(prompt).toContain('rationale');
    expect(prompt).toContain('caption');
    expect(prompt).toContain('Rationale MUST NOT include any visitor PII');
  });

  it('attaches the structured-output schema to the summary section (C2 fix 2026-05)', () => {
    const plan = createLlmSectionPlan({
      locale: 'en-US',
      museumMode: false,
      guideLevel: 'intermediate',
      timeoutSummaryMs: 10000,
    });
    const summary = plan[0];
    expect(summary.outputSchema).toBeDefined();
    expect(summary.outputSchema?.name).toBe('MainAssistantOutput');
    expect(summary.outputSchema?.schema).toBe(mainAssistantOutputSchema);
  });

  it('never emits a legacy JSON-tail directive in the summary prompt', () => {
    const plan = createLlmSectionPlan({
      locale: 'en-US',
      museumMode: false,
      guideLevel: 'intermediate',
      timeoutSummaryMs: 10000,
    });
    expect(plan[0].prompt).not.toContain('[META]');
    expect(plan[0].prompt).not.toContain('"detectedArtwork":{');
    expect(plan[0].prompt).toContain('Place your visitor-facing reply in the `text` field');
  });

  it('uses English-only prompts with Reply in French directive for fr locale', () => {
    const plan = createLlmSectionPlan({
      locale: 'fr-FR',
      museumMode: false,
      guideLevel: 'beginner',
      timeoutSummaryMs: 10000,
    });

    expect(plan[0].prompt).toContain('Reply in French.');
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

  it('omits the content-preferences hint when none are provided', () => {
    const plan = createLlmSectionPlan({
      locale: 'en-US',
      museumMode: false,
      guideLevel: 'beginner',
      timeoutSummaryMs: 10000,
    });
    expect(plan[0].prompt).not.toContain('USER CONTENT PREFERENCES');
  });

  it('omits the content-preferences hint when an empty array is provided', () => {
    const plan = createLlmSectionPlan({
      locale: 'en-US',
      museumMode: false,
      guideLevel: 'beginner',
      timeoutSummaryMs: 10000,
      contentPreferences: [],
    });
    expect(plan[0].prompt).not.toContain('USER CONTENT PREFERENCES');
  });

  it('injects a single content preference as an emphasize-when-relevant hint', () => {
    const plan = createLlmSectionPlan({
      locale: 'en-US',
      museumMode: true,
      guideLevel: 'beginner',
      timeoutSummaryMs: 10000,
      contentPreferences: ['history'],
    });
    expect(plan[0].prompt).toContain('USER CONTENT PREFERENCES');
    expect(plan[0].prompt).toContain('historical context');
    expect(plan[0].prompt).toContain('Emphasize these angles when naturally relevant');
    expect(plan[0].prompt).toContain('do not force them');
  });

  it('injects all three content preferences with their respective labels', () => {
    const plan = createLlmSectionPlan({
      locale: 'en-US',
      museumMode: true,
      guideLevel: 'intermediate',
      timeoutSummaryMs: 10000,
      contentPreferences: ['history', 'technique', 'artist'],
    });
    expect(plan[0].prompt).toContain('historical context');
    expect(plan[0].prompt).toContain('visual representation');
    expect(plan[0].prompt).toContain("artist's biography");
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

  it('T7: omits location prefix and never leaks coords when location is a raw GPS string (AC-6, FAILS pre-fix)', () => {
    const fallback = createSummaryFallback({
      history: [makeMessage({ role: 'assistant', text: 'Art details.' })],
      question: 'Tell me more',
      location: 'lat:48.86,lng:2.33',
      locale: 'en-US',
      museumMode: false,
    });

    expect(fallback).not.toContain('You are currently near');
    expect(fallback).not.toContain('lat:');
    expect(fallback).not.toContain('lng:');
    expect(fallback).not.toContain('48.86');
    expect(fallback).not.toContain('2.33');
  });

  it('T10: omits prefix and never leaks zero-bounds coords (lat:0,lng:0) (FAILS pre-fix)', () => {
    const fallback = createSummaryFallback({
      history: [makeMessage({ role: 'assistant', text: 'Art details.' })],
      question: 'Tell me more',
      location: 'lat:0,lng:0',
      locale: 'en-US',
      museumMode: false,
    });

    expect(fallback).not.toContain('You are currently near');
    expect(fallback).not.toContain('lat:0');
    expect(fallback).not.toContain('lng:0');
  });

  describe('voiceMode (C9.10)', () => {
    it('includes [VOICE_MODE] instruction and 80-word cap when voiceMode=true', () => {
      const plan = createLlmSectionPlan({
        locale: 'en-US',
        museumMode: false,
        guideLevel: 'beginner',
        timeoutSummaryMs: 10000,
        voiceMode: true,
      });

      expect(plan[0].prompt).toContain('[VOICE_MODE]');
      expect(plan[0].prompt).toContain('under 80 words');
      expect(plan[0].prompt).toContain('no markdown');
    });

    it('omits [VOICE_MODE] when voiceMode is false/undefined and applies default word limit', () => {
      const plan = createLlmSectionPlan({
        locale: 'en-US',
        museumMode: false,
        guideLevel: 'beginner',
        timeoutSummaryMs: 10000,
      });

      expect(plan[0].prompt).not.toContain('[VOICE_MODE]');
      expect(plan[0].prompt).toContain('under 250 words');
    });

    it('voiceMode overrides audioDescriptionMode word limit (80w wins)', () => {
      const plan = createLlmSectionPlan({
        locale: 'en-US',
        museumMode: true,
        guideLevel: 'beginner',
        timeoutSummaryMs: 10000,
        audioDescriptionMode: true,
        voiceMode: true,
      });

      expect(plan[0].prompt).toContain('under 80 words');
      expect(plan[0].prompt).not.toContain('under 300 words');
    });
  });
});
