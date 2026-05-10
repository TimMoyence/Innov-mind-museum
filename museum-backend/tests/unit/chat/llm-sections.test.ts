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

  it('emits the v2 SuggestedImage shape (rationale + caption REQUIRED) — C2 R6', () => {
    const plan = createLlmSectionPlan({
      locale: 'en-US',
      museumMode: false,
      guideLevel: 'intermediate',
      timeoutSummaryMs: 10000,
    });
    const prompt = plan[0].prompt;
    // Quantity tune (1-4 range; 1-2 single-subject; 2-4 multi-subject) —
    // applies to both the structured-output path and the legacy [META]
    // fallback path. The single-subject cap (≤2) was tightened from the
    // original "1-4" wording to align with promptfoo c2-enrichment Test 2
    // (Mona Lisa expects 1..2 entries).
    expect(prompt).toContain('1-4 short search queries');
    expect(prompt).toContain('single-subject answers');
    expect(prompt).toContain('comparative or multi-subject answers');
    expect(prompt).toContain('2-4 entries');
    // Structural rationale + caption guidance carried in the prompt (the
    // structured-output schema enforces the field types; this test asserts
    // that the behavioural intent — required rationale & caption — is still
    // expressed in the prompt verbatim).
    expect(prompt).toContain('rationale');
    expect(prompt).toContain('caption');
    // PII safety guidance for rationale (R12 + GDPR)
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

  it('drops the legacy [META] markup directive from the structured-output prompt', () => {
    const plan = createLlmSectionPlan({
      locale: 'en-US',
      museumMode: false,
      guideLevel: 'intermediate',
      timeoutSummaryMs: 10000,
    });
    // Structured-output path is the default — schema enforces the shape, so
    // the prompt MUST NOT instruct the model to emit a `[META]` block.
    expect(plan[0].prompt).not.toContain('[META]');
    expect(plan[0].prompt).not.toContain('"detectedArtwork":{');
    // But the structured directive that anchors the visitor reply field IS
    // present.
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
});
