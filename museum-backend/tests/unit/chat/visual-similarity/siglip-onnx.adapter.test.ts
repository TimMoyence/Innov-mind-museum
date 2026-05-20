/**
 * RED — T4.2 — `SiglipOnnxAdapter` (mocked ONNX runtime).
 *
 * Locks down the contract from tasks.md T4.2 and design.md §3:
 *   - encodes a Buffer → 768-dim L2-normalised Float32Array,
 *   - tags the output with `modelVersion: 'siglip2-base-patch16-224@v1'`,
 *   - throws `EncoderUnavailableError` when the ONNX run exceeds the
 *     configured `timeoutMs`,
 *   - lazily initialises the InferenceSession at most once across calls.
 *
 * The SUT does not yet exist. Tests are RED until Phase 4 implementation lands.
 */

import { EncoderUnavailableError } from '@modules/chat/domain/ports/embeddings.port';
import { makeSiglipJpegBuffer } from '../../../helpers/chat/visual-similarity/image-fixtures';

// ---------------------------------------------------------------------------
// Mock onnxruntime-node BEFORE the SUT is loaded.
// `InferenceSession.create` is the lazy entry point the adapter is expected
// to call once and cache.
// ---------------------------------------------------------------------------
const onnxCreateMock = jest.fn();
const onnxRunMock = jest.fn();

jest.mock('onnxruntime-node', () => ({
  InferenceSession: {
    create: (...args: unknown[]) => onnxCreateMock(...args),
  },
  Tensor: jest.fn().mockImplementation((dtype: string, data: unknown, dims: number[]) => ({
    type: dtype,
    data,
    dims,
  })),
}));

// Helper: build a deterministic 768-component float32 vector that, AFTER
// L2-normalisation, has unit norm. We make ONNX return a non-unit vector so
// the adapter is forced to perform the normalisation step itself.
const FAKE_RAW_OUTPUT = new Float32Array(768).fill(2);

interface SiglipOnnxAdapterCtorArgs {
  modelPath: string;
  timeoutMs: number;
}

// SUT — Phase 4 file, must not yet exist.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic SUT load
const { SiglipOnnxAdapter } =
  require('@modules/chat/adapters/secondary/embeddings/siglip-onnx.adapter') as {
    SiglipOnnxAdapter: new (args: SiglipOnnxAdapterCtorArgs) => {
      encode: (input: {
        buffer: Buffer;
        mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
      }) => Promise<{
        vector: Float32Array;
        modelVersion: string;
      }>;
    };
  };

describe('SiglipOnnxAdapter (T4.2)', () => {
  const onnxReleaseMock = jest.fn<Promise<void>, []>();

  beforeEach(() => {
    onnxCreateMock.mockReset();
    onnxRunMock.mockReset();
    onnxReleaseMock.mockReset();
    onnxReleaseMock.mockResolvedValue(undefined);
    // TD-ONNX-02/03 — the mock session exposes the full contract the adapter
    // now relies on : `release()` for teardown + `inputNames`/`outputNames`
    // for the post-create I/O validation.
    onnxCreateMock.mockResolvedValue({
      run: onnxRunMock,
      release: onnxReleaseMock,
      inputNames: ['pixel_values'],
      outputNames: ['image_embeds'],
    });
    onnxRunMock.mockResolvedValue({
      image_embeds: { data: FAKE_RAW_OUTPUT, dims: [1, 768] },
    });
  });

  it('TD-ONNX-01 — passes explicit SessionOptions (cpu EP, all-opt, batch override) to create', async () => {
    const adapter = new SiglipOnnxAdapter({
      modelPath: './models/siglip2-base-patch16-224.onnx',
      timeoutMs: 3000,
    });
    await adapter.encode({ buffer: await makeSiglipJpegBuffer(), mimeType: 'image/jpeg' });

    expect(onnxCreateMock).toHaveBeenCalledTimes(1);
    const opts = onnxCreateMock.mock.calls[0]?.[1] as {
      executionProviders?: string[];
      graphOptimizationLevel?: string;
      freeDimensionOverrides?: Record<string, number>;
    };
    expect(opts.executionProviders).toEqual(['cpu']);
    expect(opts.graphOptimizationLevel).toBe('all');
    expect(opts.freeDimensionOverrides).toEqual({ batch: 1 });
  });

  it('TD-ONNX-03 — throws EncoderUnavailableError when the model lacks the expected input name', async () => {
    onnxCreateMock.mockResolvedValue({
      run: onnxRunMock,
      release: onnxReleaseMock,
      inputNames: ['wrong_input'],
      outputNames: ['image_embeds'],
    });
    const adapter = new SiglipOnnxAdapter({
      modelPath: './models/bad.onnx',
      timeoutMs: 3000,
    });
    await expect(
      adapter.encode({ buffer: await makeSiglipJpegBuffer(), mimeType: 'image/jpeg' }),
    ).rejects.toBeInstanceOf(EncoderUnavailableError);
  });

  it('TD-ONNX-02 — shutdown() releases the native session + drops the cache', async () => {
    const adapter = new SiglipOnnxAdapter({
      modelPath: './models/siglip2-base-patch16-224.onnx',
      timeoutMs: 3000,
    });
    const buffer = await makeSiglipJpegBuffer();
    await adapter.encode({ buffer, mimeType: 'image/jpeg' });

    await adapter.shutdown();
    expect(onnxReleaseMock).toHaveBeenCalledTimes(1);

    // Next encode re-creates the session (cache was dropped).
    await adapter.encode({ buffer, mimeType: 'image/jpeg' });
    expect(onnxCreateMock).toHaveBeenCalledTimes(2);
  });

  it('TD-ONNX-02 — shutdown() is a no-op when no session was ever created', async () => {
    const adapter = new SiglipOnnxAdapter({
      modelPath: './models/siglip2-base-patch16-224.onnx',
      timeoutMs: 3000,
    });
    await expect(adapter.shutdown()).resolves.toBeUndefined();
    expect(onnxReleaseMock).not.toHaveBeenCalled();
  });

  it('returns a 768-dim Float32Array tagged with the SigLIP v1 modelVersion', async () => {
    const adapter = new SiglipOnnxAdapter({
      modelPath: './models/siglip2-base-patch16-224.onnx',
      timeoutMs: 3000,
    });
    const buffer = await makeSiglipJpegBuffer();

    const result = await adapter.encode({ buffer, mimeType: 'image/jpeg' });

    expect(result.modelVersion).toBe('siglip2-base-patch16-224@v1');
    expect(result.vector).toBeInstanceOf(Float32Array);
    expect(result.vector.length).toBe(768);
  });

  it('returns an L2-normalised vector (norm ≈ 1.0 within 1e-3)', async () => {
    const adapter = new SiglipOnnxAdapter({
      modelPath: './models/siglip2-base-patch16-224.onnx',
      timeoutMs: 3000,
    });
    const buffer = await makeSiglipJpegBuffer();

    const { vector } = await adapter.encode({ buffer, mimeType: 'image/jpeg' });

    let sumSq = 0;
    for (const v of vector) sumSq += v * v;
    const norm = Math.sqrt(sumSq);
    expect(norm).toBeCloseTo(1, 3);
  });

  it('throws EncoderUnavailableError when the ONNX run exceeds timeoutMs', async () => {
    // Hang the run() forever — short timeoutMs forces EncoderUnavailableError.
    onnxRunMock.mockImplementation(
      () =>
        new Promise(() => {
          /* never resolves */
        }),
    );

    const adapter = new SiglipOnnxAdapter({
      modelPath: './models/siglip2-base-patch16-224.onnx',
      timeoutMs: 25,
    });
    const buffer = await makeSiglipJpegBuffer();

    await expect(adapter.encode({ buffer, mimeType: 'image/jpeg' })).rejects.toBeInstanceOf(
      EncoderUnavailableError,
    );
  });

  it('lazily initialises the InferenceSession at most once across encode() calls', async () => {
    const adapter = new SiglipOnnxAdapter({
      modelPath: './models/siglip2-base-patch16-224.onnx',
      timeoutMs: 3000,
    });
    const buffer = await makeSiglipJpegBuffer();

    await adapter.encode({ buffer, mimeType: 'image/jpeg' });
    await adapter.encode({ buffer, mimeType: 'image/jpeg' });

    expect(onnxCreateMock).toHaveBeenCalledTimes(1);
    expect(onnxRunMock).toHaveBeenCalledTimes(2);
  });
});
