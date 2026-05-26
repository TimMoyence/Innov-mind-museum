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

  it('includes suggestedFollowUp in JSON schema (B3 — singular replaces legacy followUpQuestions)', () => {
    const plan = createLlmSectionPlan({
      locale: 'en-US',
      museumMode: false,
      guideLevel: 'expert',
      timeoutSummaryMs: 10000,
    });

    expect(plan[0].prompt).toContain('suggestedFollowUp');
    expect(plan[0].prompt).toContain('deeperContext');
    expect(plan[0].prompt).toContain('openQuestion');
    // Legacy plural field gone — singularity invariant (B3 NFR13).
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
    // Quantity tune (1-4 range; 1-2 single-subject; 2-4 multi-subject) —
    // applies to the structured-output path (the legacy fallback was retired
    // C9.17). The single-subject cap (≤2) was tightened from the original
    // "1-4" wording to align with promptfoo c2-enrichment Test 2 (Mona Lisa
    // expects 1..2 entries).
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

  it('never emits a legacy JSON-tail directive in the summary prompt', () => {
    const plan = createLlmSectionPlan({
      locale: 'en-US',
      museumMode: false,
      guideLevel: 'intermediate',
      timeoutSummaryMs: 10000,
    });
    // Structured-output path is the default — schema enforces the shape, so
    // the prompt MUST NOT instruct the model to emit a legacy JSON-tail block.
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

  // -------------------------------------------------------------------------
  // Cycle 1 (RUN_ID 2026-05-26-chat-pipeline-hardening) — A-04 GPS-leak guard
  // on the SUMMARY FALLBACK path (text DISPLAYED to the user).
  //
  // Bug A-04 (MEDIUM): when the LLM summary section fails/times out,
  // `createSummaryFallback` interpolates `input.location` verbatim into the
  // `locationPrefix` ("You are currently near <loc>. "). If `location` is the
  // raw client GPS string (`"lat:X,lng:Y"`), the user sees their own exact
  // coordinates. `sanitizePromptInput` does NOT strip them.
  //
  // Spec/Design: spec-cycle1.md (REQ-6/7/8, AC-6/7, T7/T8/T10),
  // design-cycle1.md (chemin fallback résumé F). The non-GPS label case
  // ("Room 12", T8) above MUST stay green (non-regression, NFR-3).
  //
  // Expected status on CURRENT (pre-fix) code:
  //   - T7  (location = 'lat:48.86,lng:2.33') → FAILS (leaks coords + prefix). Proof of A-04.
  //   - T10 (location = 'lat:0,lng:0' bounds) → FAILS (parseable coords still leak).
  // -------------------------------------------------------------------------

  it('T7: omits location prefix and never leaks coords when location is a raw GPS string (AC-6, FAILS pre-fix)', () => {
    const fallback = createSummaryFallback({
      history: [makeMessage({ role: 'assistant', text: 'Art details.' })],
      question: 'Tell me more',
      location: 'lat:48.86,lng:2.33',
      locale: 'en-US',
      museumMode: false,
    });

    // No location prefix at all (the coords are not a place label).
    expect(fallback).not.toContain('You are currently near');
    // And the raw coordinate tokens must never appear in the displayed text.
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

  // C9.10 (2026-05-17) — voiceMode prompt branch.
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
      // Default non-museum + non-audio mode = 250 word cap.
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

      // audioDescriptionMode in museumMode would otherwise be 300w, but voiceMode caps at 80w.
      expect(plan[0].prompt).toContain('under 80 words');
      expect(plan[0].prompt).not.toContain('under 300 words');
    });
  });
});
