import {
  EncoderUnavailableError,
  type EmbeddingsPort,
  type EncodeInput,
  type EncodeOutput,
} from '@modules/chat/domain/ports/embeddings.port';
import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';
import { raceSignal } from '@shared/utils/race-signal';

import { preprocessForSiglip } from './image-preprocess';

const SIGLIP_MODEL_VERSION = 'siglip2-base-patch16-224@v1';

const SIGLIP_INPUT_NAME = 'pixel_values';
const SIGLIP_OUTPUT_NAME = 'pooler_output';
const EXPECTED_VECTOR_LEN = 768;

const SIGLIP_TENSOR_SHAPE: readonly number[] = [1, 3, 224, 224];

export interface SiglipOnnxAdapterOptions {
  modelPath: string;
  timeoutMs: number;
}

interface OnnxSessionOptions {
  executionProviders?: readonly string[];
  graphOptimizationLevel?: 'disabled' | 'basic' | 'extended' | 'all';
  freeDimensionOverrides?: Record<string, number>;
}

const SIGLIP_SESSION_OPTIONS: OnnxSessionOptions = {
  executionProviders: ['cpu'],
  graphOptimizationLevel: 'all',
  freeDimensionOverrides: { batch: 1 },
};

interface OnnxRuntimeModule {
  InferenceSession: {
    create: (modelPath: string, options?: OnnxSessionOptions) => Promise<OnnxInferenceSession>;
  };
  Tensor: new (type: 'float32', data: Float32Array, dims: readonly number[]) => OnnxTensor;
}

interface OnnxTensor {
  type: string;
  data: unknown;
  dims: readonly number[];
}

interface OnnxInferenceSession {
  run(feeds: Record<string, OnnxTensor>): Promise<Record<string, OnnxNamedTensor | undefined>>;
  release(): Promise<void>;
  readonly inputNames: readonly string[];
  readonly outputNames: readonly string[];
}

interface OnnxNamedTensor {
  data: unknown;
  dims?: readonly number[];
}

export class SiglipOnnxAdapter implements EmbeddingsPort {
  private readonly modelPath: string;
  private readonly timeoutMs: number;

  private sessionPromise: Promise<OnnxInferenceSession> | null = null;

  public constructor(opts: SiglipOnnxAdapterOptions) {
    this.modelPath = opts.modelPath;
    this.timeoutMs = opts.timeoutMs;
  }

  public async encode(input: EncodeInput): Promise<EncodeOutput> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const runtime = await loadOnnxRuntime();
      const session = await this.acquireSession(runtime);
      const tensorData = await preprocessForSiglip(input.buffer);
      const inputTensor = new runtime.Tensor('float32', tensorData, SIGLIP_TENSOR_SHAPE);

      const outputs = await runWithTimeout(
        session.run({ [SIGLIP_INPUT_NAME]: inputTensor }),
        controller.signal,
        this.timeoutMs,
      );

      const rawVector = extractEmbedding(outputs);
      const normalised = l2Normalise(rawVector);

      return { vector: normalised, modelVersion: SIGLIP_MODEL_VERSION };
    } catch (err) {
      if (err instanceof EncoderUnavailableError) throw err;
      throw new EncoderUnavailableError(`SigLIP ONNX encode failed: ${errorMessage(err)}`, err);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private async acquireSession(runtime: OnnxRuntimeModule): Promise<OnnxInferenceSession> {
    this.sessionPromise ??= runtime.InferenceSession.create(this.modelPath, SIGLIP_SESSION_OPTIONS)
      .then((session) => {
        if (!session.inputNames.includes(SIGLIP_INPUT_NAME)) {
          throw new EncoderUnavailableError(
            `SigLIP ONNX model at ${this.modelPath} missing input '${SIGLIP_INPUT_NAME}' (got: ${session.inputNames.join(', ')})`,
          );
        }
        if (!session.outputNames.includes(SIGLIP_OUTPUT_NAME)) {
          throw new EncoderUnavailableError(
            `SigLIP ONNX model at ${this.modelPath} missing output '${SIGLIP_OUTPUT_NAME}' (got: ${session.outputNames.join(', ')})`,
          );
        }
        return session;
      })
      .catch((err: unknown) => {
        this.sessionPromise = null;
        if (err instanceof EncoderUnavailableError) throw err;
        logger.warn('siglip_onnx_session_create_failed', {
          modelPath: this.modelPath,
          error: errorMessage(err),
        });
        throw new EncoderUnavailableError(
          `SigLIP ONNX session create failed for ${this.modelPath}: ${errorMessage(err)}`,
          err,
        );
      });
    return await this.sessionPromise;
  }

  public async shutdown(): Promise<void> {
    const pending = this.sessionPromise;
    this.sessionPromise = null;
    if (!pending) return;
    try {
      const session = await pending;
      await session.release();
    } catch (err) {
      logger.warn('siglip_onnx_session_release_failed', {
        modelPath: this.modelPath,
        error: errorMessage(err),
      });
    }
  }
}

async function loadOnnxRuntime(): Promise<OnnxRuntimeModule> {
  try {
    return (await import('onnxruntime-node')) as unknown as OnnxRuntimeModule;
  } catch (err) {
    throw new EncoderUnavailableError(
      `onnxruntime-node module failed to load: ${errorMessage(err)}`,
      err,
    );
  }
}

function runWithTimeout<T>(
  runPromise: Promise<T>,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<T> {
  return raceSignal(
    runPromise,
    signal,
    () => new EncoderUnavailableError(`SigLIP ONNX run timed out after ${timeoutMs}ms`),
  );
}

function extractEmbedding(outputs: Record<string, OnnxNamedTensor | undefined>): Float32Array {
  const tensor = outputs[SIGLIP_OUTPUT_NAME];
  if (tensor === undefined) {
    throw new EncoderUnavailableError(
      `SigLIP ONNX output missing expected key "${SIGLIP_OUTPUT_NAME}" (got: ${
        Object.keys(outputs).join(',') || '<empty>'
      })`,
    );
  }

  const data = tensor.data;
  let flat: Float32Array;
  if (data instanceof Float32Array) {
    flat = data;
  } else if (Array.isArray(data)) {
    flat = Float32Array.from(data as ArrayLike<number>);
  } else {
    throw new EncoderUnavailableError(
      `SigLIP ONNX output "${SIGLIP_OUTPUT_NAME}" has unsupported data type (${typeof data})`,
    );
  }

  if (flat.length !== EXPECTED_VECTOR_LEN) {
    throw new EncoderUnavailableError(
      `SigLIP ONNX output "${SIGLIP_OUTPUT_NAME}" has unexpected length (expected ${EXPECTED_VECTOR_LEN}, got ${flat.length})`,
    );
  }

  return flat;
}

function l2Normalise(vec: Float32Array): Float32Array {
  let sumSq = 0;
  for (const v of vec) {
    sumSq += v * v;
  }
  const norm = Math.sqrt(sumSq);
  const out = new Float32Array(vec.length);
  if (norm === 0) return out;
  for (let i = 0; i < vec.length; i += 1) {
    out[i] = (vec[i] ?? 0) / norm;
  }
  return out;
}
