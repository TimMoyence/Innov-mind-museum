import { createLlmSectionPlan } from '@modules/chat/useCase/llm/llm-sections';
import { mainAssistantOutputSchema } from '@modules/chat/useCase/llm/llm-sections/main-assistant-output.schema';
import { extractMetadata } from '@modules/chat/useCase/orchestration/assistant-response';

describe('M9 · le serveur ne demande ni ne renvoie de relance', () => {
  it('M9 · la consigne au modèle propose des pistes mais aucune question de relance', () => {
    const [summary] = createLlmSectionPlan({
      locale: 'fr-FR',
      museumMode: true,
      guideLevel: 'beginner',
      timeoutSummaryMs: 10000,
    });

    expect(summary.prompt).toContain('In recommendations');
    expect(summary.prompt).not.toContain('suggestedFollowUp');
    expect(summary.outputSchema?.schema).toBe(mainAssistantOutputSchema);
    expect(Object.keys(mainAssistantOutputSchema.shape)).not.toContain('suggestedFollowUp');
  });

  it('M9 · une réponse du modèle qui contient une relance la perd, les pistes restent', () => {
    const metadata = extractMetadata({
      recommendations: ['Bory et les ponts de Bordeaux'],
      suggestedFollowUp: 'Who designed the Pont de Pierre?',
    });

    expect(metadata.recommendations).toEqual(['Bory et les ponts de Bordeaux']);
    expect(metadata).not.toHaveProperty('suggestedFollowUp');
  });
});
