import { EncoderUnavailableError } from '@modules/chat/domain/ports/embeddings.port';
import { makeSiglipJpegBuffer } from '../../../helpers/chat/visual-similarity/image-fixtures';

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

const FAKE_RAW_OUTPUT = new Float32Array(768).fill(2);

interface SiglipOnnxAdapterCtorArgs {
  modelPath: string;
  timeoutMs: number;
}

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
      shutdown: () => Promise<void>;
    };
  };

describe('SiglipOnnxAdapter (T4.2)', () => {
  const onnxReleaseMock = jest.fn<Promise<void>, []>();

  beforeEach(() => {
    onnxCreateMock.mockReset();
    onnxRunMock.mockReset();
    onnxReleaseMock.mockReset();
    onnxReleaseMock.mockResolvedValue(undefined);
    onnxCreateMock.mockResolvedValue({
      run: onnxRunMock,
      release: onnxReleaseMock,
      inputNames: ['pixel_values'],
      outputNames: ['pooler_output'],
    });
    onnxRunMock.mockResolvedValue({
      pooler_output: { data: FAKE_RAW_OUTPUT, dims: [1, 768] },
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
      outputNames: ['pooler_output'],
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
    onnxRunMock.mockImplementation(() => new Promise(() => {}));

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

  it('retries InferenceSession.create after a transient create failure', async () => {
    onnxCreateMock.mockReset();
    onnxCreateMock.mockRejectedValueOnce(new Error('transient FS error')).mockResolvedValue({
      run: onnxRunMock,
      release: onnxReleaseMock,
      inputNames: ['pixel_values'],
      outputNames: ['pooler_output'],
    });

    const adapter = new SiglipOnnxAdapter({
      modelPath: './models/siglip2-base-patch16-224.onnx',
      timeoutMs: 3000,
    });
    const buffer = await makeSiglipJpegBuffer();

    await expect(adapter.encode({ buffer, mimeType: 'image/jpeg' })).rejects.toBeInstanceOf(
      EncoderUnavailableError,
    );

    const result = await adapter.encode({ buffer, mimeType: 'image/jpeg' });
    expect(result.vector).toBeInstanceOf(Float32Array);
    expect(onnxCreateMock).toHaveBeenCalledTimes(2);
  });
});
