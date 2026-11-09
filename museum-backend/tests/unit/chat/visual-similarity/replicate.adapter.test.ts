import { EncoderUnavailableError } from '@modules/chat/domain/ports/embeddings.port';
import { makePartialResponse, makeFetchSpy } from '../../../helpers/fetch/fetch-mock.helpers';
import { makeSiglipJpegBuffer } from '../../../helpers/chat/visual-similarity/image-fixtures';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

interface ReplicateAdapterCtorArgs {
  apiToken: string;
  model: string;
  timeoutMs: number;
}

const { ReplicateEmbeddingsAdapter } =
  require('@modules/chat/adapters/secondary/embeddings/replicate.adapter') as {
    ReplicateEmbeddingsAdapter: new (args: ReplicateAdapterCtorArgs) => {
      encode: (input: {
        buffer: Buffer;
        mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
      }) => Promise<{
        vector: Float32Array;
        modelVersion: string;
      }>;
    };
  };

const SIGLIP_OUTPUT = Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0));
const REPLICATE_MODEL = 'lucataco/siglip-base-patch16-224';

const originalFetch = global.fetch;

describe('ReplicateEmbeddingsAdapter (T4.3)', () => {
  let buffer: Buffer;

  beforeAll(async () => {
    buffer = await makeSiglipJpegBuffer();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('returns a 768-dim vector + Replicate-flavoured modelVersion on a synchronous succeeded response', async () => {
    const fetchSpy = makeFetchSpy();
    fetchSpy.mockResolvedValueOnce(
      makePartialResponse({
        ok: true,
        status: 201,
        body: { id: 'pred_1', status: 'succeeded', output: SIGLIP_OUTPUT },
      }),
    );
    global.fetch = fetchSpy;

    const adapter = new ReplicateEmbeddingsAdapter({
      apiToken: 'r8_test_token',
      model: REPLICATE_MODEL,
      timeoutMs: 3000,
    });

    const result = await adapter.encode({ buffer, mimeType: 'image/jpeg' });

    expect(result.vector).toBeInstanceOf(Float32Array);
    expect(result.vector.length).toBe(768);
    expect(result.modelVersion).toMatch(/siglip-base-patch16-224@replicate/);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.replicate.com/v1/predictions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('polls the prediction URL until status="succeeded"', async () => {
    const fetchSpy = makeFetchSpy();
    fetchSpy.mockResolvedValueOnce(
      makePartialResponse({
        ok: true,
        status: 201,
        body: {
          id: 'pred_1',
          status: 'processing',
          urls: { get: 'https://api.replicate.com/v1/predictions/pred_1' },
        },
      }),
    );
    fetchSpy.mockResolvedValueOnce(
      makePartialResponse({
        ok: true,
        status: 200,
        body: {
          id: 'pred_1',
          status: 'processing',
          urls: { get: 'https://api.replicate.com/v1/predictions/pred_1' },
        },
      }),
    );
    fetchSpy.mockResolvedValueOnce(
      makePartialResponse({
        ok: true,
        status: 200,
        body: { id: 'pred_1', status: 'succeeded', output: SIGLIP_OUTPUT },
      }),
    );
    global.fetch = fetchSpy;

    const adapter = new ReplicateEmbeddingsAdapter({
      apiToken: 'r8_test_token',
      model: REPLICATE_MODEL,
      timeoutMs: 3000,
    });

    const result = await adapter.encode({ buffer, mimeType: 'image/jpeg' });

    expect(result.vector.length).toBe(768);
    expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('throws EncoderUnavailableError when polling exceeds timeoutMs', async () => {
    const fetchSpy = makeFetchSpy();
    fetchSpy.mockResolvedValue(
      makePartialResponse({
        ok: true,
        status: 200,
        body: {
          id: 'pred_1',
          status: 'processing',
          urls: { get: 'https://api.replicate.com/v1/predictions/pred_1' },
        },
      }),
    );
    global.fetch = fetchSpy;

    const adapter = new ReplicateEmbeddingsAdapter({
      apiToken: 'r8_test_token',
      model: REPLICATE_MODEL,
      timeoutMs: 50,
    });

    await expect(adapter.encode({ buffer, mimeType: 'image/jpeg' })).rejects.toBeInstanceOf(
      EncoderUnavailableError,
    );
  });

  it('throws EncoderUnavailableError on a 4xx response (e.g. 401 invalid token)', async () => {
    const fetchSpy = makeFetchSpy();
    fetchSpy.mockResolvedValueOnce(
      makePartialResponse({
        ok: false,
        status: 401,
        body: { detail: 'Invalid token' },
      }),
    );
    global.fetch = fetchSpy;

    const adapter = new ReplicateEmbeddingsAdapter({
      apiToken: 'bad_token',
      model: REPLICATE_MODEL,
      timeoutMs: 3000,
    });

    const promise = adapter.encode({ buffer, mimeType: 'image/jpeg' });
    await expect(promise).rejects.toBeInstanceOf(EncoderUnavailableError);
    await expect(promise).rejects.toThrow(/401/);
  });

  it('throws EncoderUnavailableError on a 5xx response', async () => {
    const fetchSpy = makeFetchSpy();
    fetchSpy.mockResolvedValueOnce(
      makePartialResponse({
        ok: false,
        status: 503,
        body: { detail: 'Service unavailable' },
      }),
    );
    global.fetch = fetchSpy;

    const adapter = new ReplicateEmbeddingsAdapter({
      apiToken: 'r8_test_token',
      model: REPLICATE_MODEL,
      timeoutMs: 3000,
    });

    await expect(adapter.encode({ buffer, mimeType: 'image/jpeg' })).rejects.toBeInstanceOf(
      EncoderUnavailableError,
    );
  });
});
