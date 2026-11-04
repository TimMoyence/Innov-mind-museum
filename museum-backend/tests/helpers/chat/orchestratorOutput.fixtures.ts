import type { OrchestratorOutput } from '@modules/chat/domain/ports/chat-orchestrator.port';

export const makeArtOutput = (overrides: Partial<OrchestratorOutput> = {}): OrchestratorOutput => ({
  text: 'This painting by Monet captures the essence of impressionism.',
  metadata: {
    detectedArtwork: {
      title: 'Water Lilies',
      artist: 'Monet',
      confidence: 0.9,
      source: 'test',
    },
    citations: ['catalog'],
    ...overrides.metadata,
  },
  degraded: false,
  ...overrides,
});
