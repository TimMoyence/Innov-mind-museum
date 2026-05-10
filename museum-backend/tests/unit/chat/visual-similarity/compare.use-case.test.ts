/**
 * RED — T5.4 — composition `compareImageUseCase(deps)(input)`.
 *
 * Locks down tasks.md T5.4 + design.md §1 + spec R1, R12:
 *   - Reuses the existing `ImageProcessingService` (NO duplication of EXIF
 *     strip / magic / mime / OCR-guardrail) — R12,
 *   - Calls `VisualSimilarityService.compare` with the sanitised buffer
 *     produced by the image processor,
 *   - Persists the assistant message via `ChatService.appendAssistantMessage`
 *     with `metadata.compareResults` and `metadata.fallbackReason` (when set),
 *   - When the image processor rejects (corrupted image / OCR injection),
 *     re-throws WITHOUT calling the similarity service or persisting anything,
 *   - Empty matches still persist an assistant message that carries the
 *     `fallbackReason` text (R10 + chat audit trail).
 *
 * SUT does not yet exist (Phase 5). Tests are RED until the editor lands
 * `compare.use-case.ts`.
 */

import {
  DEFAULT_MODEL_VERSION,
  makeCompareMatch,
  makeCompareResult,
} from '../../../helpers/chat/visual-similarity/compare.fixtures';
import { makeSiglipJpegBuffer } from '../../../helpers/chat/visual-similarity/image-fixtures';

import { badRequest } from '@shared/errors/app.error';

import type { CompareResult } from '@modules/chat/domain/visual-similarity/compare-result.types';

// ---------------------------------------------------------------------------
// SUT — Phase 5 file, must not yet exist. Loaded dynamically so the suite
// produces a "Cannot find module …" RED rather than a compile failure.
// ---------------------------------------------------------------------------

interface CompareUseCaseInput {
  sessionId: string;
  buffer: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  topK: number;
  locale: 'fr' | 'en';
  museumQids?: string[];
  ownerId?: number;
}

/** Minimal ChatService-like surface the compare use-case depends on. */
interface ChatServiceLike {
  appendAssistantMessage: (input: {
    sessionId: string;
    text?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<{ id: string }>;
}

/** Minimal ImageProcessingService-like surface the compare use-case depends on. */
interface ImageProcessorLike {
  process: (input: {
    sessionId: string;
    buffer: Buffer;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    ownerId?: number;
  }) => Promise<{ buffer: Buffer; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' }>;
}

interface SimilarityServiceLike {
  compare: (input: {
    buffer: Buffer;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    topK: number;
    locale: 'fr' | 'en';
    museumQids?: string[];
  }) => Promise<CompareResult>;
}

interface CompareUseCaseDeps {
  imageProcessor: ImageProcessorLike;
  similarityService: SimilarityServiceLike;
  chatService: ChatServiceLike;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic SUT load
const { compareImageUseCase } = require('@modules/chat/useCase/visual-similarity/compare.use-case') as {
  compareImageUseCase: (
    deps: CompareUseCaseDeps,
  ) => (input: CompareUseCaseInput) => Promise<CompareResult>;
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function buildDeps(initialBuffer: Buffer): {
  imageProcessor: { process: jest.Mock };
  similarityService: { compare: jest.Mock };
  chatService: { appendAssistantMessage: jest.Mock };
} {
  return {
    imageProcessor: {
      process: jest.fn().mockResolvedValue({ buffer: initialBuffer, mimeType: 'image/jpeg' }),
    },
    similarityService: {
      compare: jest
        .fn<Promise<CompareResult>, [Parameters<SimilarityServiceLike['compare']>[0]]>()
        .mockResolvedValue(makeCompareResult({ matches: [makeCompareMatch()] })),
    },
    chatService: {
      appendAssistantMessage: jest.fn().mockResolvedValue({ id: 'msg-001' }),
    },
  };
}

const DEFAULT_INPUT: Omit<CompareUseCaseInput, 'buffer'> = {
  sessionId: 'session-001',
  mimeType: 'image/jpeg',
  topK: 5,
  locale: 'fr',
  ownerId: 42,
};

describe('compareImageUseCase (T5.4 — orchestration use-case)', () => {
  let buffer: Buffer;

  beforeAll(async () => {
    buffer = await makeSiglipJpegBuffer();
  });

  it('R1 — happy path: processes image, calls similarity, persists assistant message with matches', async () => {
    const { imageProcessor, similarityService, chatService } = buildDeps(buffer);
    const useCase = compareImageUseCase({
      imageProcessor: imageProcessor as unknown as ImageProcessorLike,
      similarityService: similarityService as unknown as SimilarityServiceLike,
      chatService: chatService as unknown as ChatServiceLike,
    });

    const result = await useCase({ ...DEFAULT_INPUT, buffer });

    expect(imageProcessor.process).toHaveBeenCalledTimes(1);
    expect(similarityService.compare).toHaveBeenCalledTimes(1);
    expect(chatService.appendAssistantMessage).toHaveBeenCalledTimes(1);

    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.modelVersion).toBe(DEFAULT_MODEL_VERSION);

    const persistArg = chatService.appendAssistantMessage.mock.calls[0]?.[0] as {
      sessionId: string;
      metadata?: { compareResults?: unknown };
    };
    expect(persistArg.sessionId).toBe(DEFAULT_INPUT.sessionId);
    expect(persistArg.metadata?.compareResults).toBeDefined();
  });

  it('R12 — invokes the existing imageProcessor BEFORE similarity (no pipeline duplication)', async () => {
    const order: string[] = [];
    const { imageProcessor, similarityService, chatService } = buildDeps(buffer);

    imageProcessor.process.mockImplementationOnce(async () => {
      order.push('process');
      return { buffer, mimeType: 'image/jpeg' };
    });
    similarityService.compare.mockImplementationOnce(async () => {
      order.push('compare');
      return makeCompareResult({ matches: [makeCompareMatch()] });
    });

    const useCase = compareImageUseCase({
      imageProcessor: imageProcessor as unknown as ImageProcessorLike,
      similarityService: similarityService as unknown as SimilarityServiceLike,
      chatService: chatService as unknown as ChatServiceLike,
    });

    await useCase({ ...DEFAULT_INPUT, buffer });

    expect(order).toEqual(['process', 'compare']);
    expect(imageProcessor.process).toHaveBeenCalledTimes(1);
  });

  it('R12 — forwards the SANITISED buffer (output of imageProcessor.process) into similarityService.compare', async () => {
    const sanitised = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a]); // tiny jpeg-ish
    const { imageProcessor, similarityService, chatService } = buildDeps(buffer);
    imageProcessor.process.mockResolvedValueOnce({ buffer: sanitised, mimeType: 'image/jpeg' });

    const useCase = compareImageUseCase({
      imageProcessor: imageProcessor as unknown as ImageProcessorLike,
      similarityService: similarityService as unknown as SimilarityServiceLike,
      chatService: chatService as unknown as ChatServiceLike,
    });

    await useCase({ ...DEFAULT_INPUT, buffer });

    const compareCallArg = similarityService.compare.mock.calls[0]?.[0] as { buffer: Buffer };
    expect(compareCallArg.buffer).toBe(sanitised);
  });

  it('rethrows when imageProcessor rejects (corrupted image / OCR injection); does NOT call similarity nor persist', async () => {
    const { imageProcessor, similarityService, chatService } = buildDeps(buffer);
    imageProcessor.process.mockRejectedValueOnce(badRequest('Image contains disallowed content'));

    const useCase = compareImageUseCase({
      imageProcessor: imageProcessor as unknown as ImageProcessorLike,
      similarityService: similarityService as unknown as SimilarityServiceLike,
      chatService: chatService as unknown as ChatServiceLike,
    });

    await expect(useCase({ ...DEFAULT_INPUT, buffer })).rejects.toThrow();

    expect(similarityService.compare).not.toHaveBeenCalled();
    expect(chatService.appendAssistantMessage).not.toHaveBeenCalled();
  });

  it('R11 — encoder_unavailable fallbackReason: returns result WITHOUT persisting an assistant message (no phantom audit turn)', async () => {
    const { imageProcessor, similarityService, chatService } = buildDeps(buffer);
    similarityService.compare.mockResolvedValueOnce(
      makeCompareResult({
        matches: [],
        modelVersion: '',
        fallbackReason: 'encoder_unavailable',
      }),
    );

    const useCase = compareImageUseCase({
      imageProcessor: imageProcessor as unknown as ImageProcessorLike,
      similarityService: similarityService as unknown as SimilarityServiceLike,
      chatService: chatService as unknown as ChatServiceLike,
    });

    const result = await useCase({ ...DEFAULT_INPUT, buffer });

    // The route will map this to a 503; the use case must surface the result
    // verbatim so the route can branch on the fallbackReason.
    expect(result.matches).toEqual([]);
    expect(result.fallbackReason).toBe('encoder_unavailable');

    // R11 — no ChatMessage is persisted on encoder outage. This is the
    // contract that prevents the audit trail from showing an assistant
    // "reply" the user never received.
    expect(chatService.appendAssistantMessage).not.toHaveBeenCalled();
  });

  it('R10 — empty matches: still persists an assistant message carrying the fallbackReason', async () => {
    const { imageProcessor, similarityService, chatService } = buildDeps(buffer);
    similarityService.compare.mockResolvedValueOnce(
      makeCompareResult({ matches: [], fallbackReason: 'no_visual_neighbor' }),
    );

    const useCase = compareImageUseCase({
      imageProcessor: imageProcessor as unknown as ImageProcessorLike,
      similarityService: similarityService as unknown as SimilarityServiceLike,
      chatService: chatService as unknown as ChatServiceLike,
    });

    const result = await useCase({ ...DEFAULT_INPUT, buffer });

    expect(result.matches).toEqual([]);
    expect(result.fallbackReason).toBe('no_visual_neighbor');

    expect(chatService.appendAssistantMessage).toHaveBeenCalledTimes(1);
    const persistArg = chatService.appendAssistantMessage.mock.calls[0]?.[0] as {
      metadata?: { compareResults?: unknown; fallbackReason?: string };
    };
    expect(persistArg.metadata).toBeDefined();
    // fallbackReason MUST surface in the persisted metadata so downstream
    // (FE rendering, audit) can show the empty-result UX (R10 / Q7).
    expect(
      persistArg.metadata?.fallbackReason ??
        // Tolerate nesting under metadata.compareResults (impl detail).
        (persistArg.metadata?.compareResults as { fallbackReason?: string } | undefined)
          ?.fallbackReason,
    ).toBe('no_visual_neighbor');
  });
});
