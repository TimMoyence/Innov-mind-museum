import {
  createExpertCompactFallback,
  createLlmSectionPlan,
  createSummaryFallback,
  mergeSectionTexts,
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
  it('creates summary + expert plan when parallel mode is enabled', () => {
    const plan = createLlmSectionPlan({
      locale: 'en-US',
      museumMode: true,
      guideLevel: 'intermediate',
      parallelEnabled: true,
      timeoutSummaryMs: 8000,
      timeoutExpertCompactMs: 20000,
    });

    expect(plan.map((section) => section.name)).toEqual([
      'summary',
      'expertCompact',
    ]);
    expect(plan[0].required).toBe(true);
    expect(plan[1].required).toBe(false);
  });

  it('keeps only summary section when parallel mode is disabled', () => {
    const plan = createLlmSectionPlan({
      locale: 'fr-FR',
      museumMode: false,
      guideLevel: 'beginner',
      parallelEnabled: false,
      timeoutSummaryMs: 8000,
      timeoutExpertCompactMs: 20000,
    });

    expect(plan).toHaveLength(1);
    expect(plan[0].name).toBe('summary');
  });

  it('merges summary then expert in deterministic order', () => {
    const merged = mergeSectionTexts(
      'Summary content',
      'Expert compact enrichment',
    );

    expect(merged).toBe('Summary content\n\nExpert compact enrichment');
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

  it('builds deterministic expert compact fallback', () => {
    const fallback = createExpertCompactFallback({
      summaryText: 'Base summary',
      locale: 'fr-FR',
      location: 'Galerie Nord',
    });

    expect(fallback).toContain('Galerie Nord');
    expect(fallback).toContain('Question guidee');
  });
});
