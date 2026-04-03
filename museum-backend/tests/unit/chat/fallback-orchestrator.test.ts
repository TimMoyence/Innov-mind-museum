import type {
  ChatOrchestrator,
  OrchestratorInput,
  OrchestratorOutput,
} from '@modules/chat/domain/ports/chat-orchestrator.port';

jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { FallbackChatOrchestrator } from '@modules/chat/adapters/secondary/fallback-orchestrator';

const makeInput = (overrides: Partial<OrchestratorInput> = {}): OrchestratorInput => ({
  history: [],
  text: 'Tell me about the Mona Lisa',
  museumMode: false,
  requestId: 'req-123',
  ...overrides,
});

const makeOutput = (text = 'response'): OrchestratorOutput => ({
  text,
  metadata: {},
});

const makeMockOrchestrator = (): jest.Mocked<ChatOrchestrator> => ({
  generate: jest.fn(),
  generateStream: jest.fn(),
});

describe('FallbackChatOrchestrator', () => {
  describe('generate', () => {
    it('returns primary result when primary succeeds', async () => {
      const primary = makeMockOrchestrator();
      const fallback = makeMockOrchestrator();
      primary.generate.mockResolvedValue(makeOutput('primary-response'));

      const orchestrator = new FallbackChatOrchestrator(primary, fallback);
      const result = await orchestrator.generate(makeInput());

      expect(result.text).toBe('primary-response');
      expect(primary.generate).toHaveBeenCalledTimes(1);
      expect(fallback.generate).not.toHaveBeenCalled();
    });

    it('falls back to secondary when primary fails', async () => {
      const primary = makeMockOrchestrator();
      const fallback = makeMockOrchestrator();
      primary.generate.mockRejectedValue(new Error('primary down'));
      fallback.generate.mockResolvedValue(makeOutput('fallback-response'));

      const orchestrator = new FallbackChatOrchestrator(primary, fallback);
      const result = await orchestrator.generate(makeInput());

      expect(result.text).toBe('fallback-response');
      expect(fallback.generate).toHaveBeenCalledTimes(1);
    });

    it('propagates error when primary fails and no fallback is configured', async () => {
      const primary = makeMockOrchestrator();
      primary.generate.mockRejectedValue(new Error('primary down'));

      const orchestrator = new FallbackChatOrchestrator(primary, null);

      await expect(orchestrator.generate(makeInput())).rejects.toThrow('primary down');
    });

    it('propagates error when both primary and fallback fail', async () => {
      const primary = makeMockOrchestrator();
      const fallback = makeMockOrchestrator();
      primary.generate.mockRejectedValue(new Error('primary down'));
      fallback.generate.mockRejectedValue(new Error('fallback also down'));

      const orchestrator = new FallbackChatOrchestrator(primary, fallback);

      await expect(orchestrator.generate(makeInput())).rejects.toThrow('fallback also down');
    });

    it('logs a warning when falling back', async () => {
      const { logger } = jest.requireMock('@shared/logger/logger') as {
        logger: { warn: jest.Mock };
      };

      const primary = makeMockOrchestrator();
      const fallback = makeMockOrchestrator();
      primary.generate.mockRejectedValue(new Error('timeout'));
      fallback.generate.mockResolvedValue(makeOutput('ok'));

      const orchestrator = new FallbackChatOrchestrator(primary, fallback);
      await orchestrator.generate(makeInput());

      expect(logger.warn).toHaveBeenCalledWith(
        'llm_primary_failed_fallback',
        expect.objectContaining({
          error: 'timeout',
          requestId: 'req-123',
        }),
      );
    });
  });

  describe('generateStream', () => {
    it('returns primary result when primary stream succeeds', async () => {
      const primary = makeMockOrchestrator();
      const fallback = makeMockOrchestrator();
      primary.generateStream.mockResolvedValue(makeOutput('stream-primary'));

      const orchestrator = new FallbackChatOrchestrator(primary, fallback);
      const onChunk = jest.fn();
      const result = await orchestrator.generateStream(makeInput(), onChunk);

      expect(result.text).toBe('stream-primary');
      expect(primary.generateStream).toHaveBeenCalledTimes(1);
      expect(fallback.generateStream).not.toHaveBeenCalled();
    });

    it('falls back to secondary stream when primary stream fails', async () => {
      const primary = makeMockOrchestrator();
      const fallback = makeMockOrchestrator();
      primary.generateStream.mockRejectedValue(new Error('stream error'));
      fallback.generateStream.mockResolvedValue(makeOutput('stream-fallback'));

      const orchestrator = new FallbackChatOrchestrator(primary, fallback);
      const onChunk = jest.fn();
      const result = await orchestrator.generateStream(makeInput(), onChunk);

      expect(result.text).toBe('stream-fallback');
    });

    it('propagates error when primary stream fails and no fallback', async () => {
      const primary = makeMockOrchestrator();
      primary.generateStream.mockRejectedValue(new Error('no fallback'));

      const orchestrator = new FallbackChatOrchestrator(primary, null);
      const onChunk = jest.fn();

      await expect(orchestrator.generateStream(makeInput(), onChunk)).rejects.toThrow(
        'no fallback',
      );
    });

    it('propagates error when both streams fail', async () => {
      const primary = makeMockOrchestrator();
      const fallback = makeMockOrchestrator();
      primary.generateStream.mockRejectedValue(new Error('primary err'));
      fallback.generateStream.mockRejectedValue(new Error('fallback err'));

      const orchestrator = new FallbackChatOrchestrator(primary, fallback);
      const onChunk = jest.fn();

      await expect(orchestrator.generateStream(makeInput(), onChunk)).rejects.toThrow(
        'fallback err',
      );
    });
  });
});
