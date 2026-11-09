import {
  EncoderUnavailableError,
  type EmbeddingsPort,
  type EncodeInput,
  type EncodeOutput,
} from '@modules/chat/domain/ports/embeddings.port';
import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';

const REPLICATE_PREDICTIONS_URL = 'https://api.replicate.com/v1/predictions';
const POLL_INTERVAL_MS = 25;
const EXPECTED_VECTOR_LEN = 768;

export interface ReplicateEmbeddingsAdapterOptions {
  apiToken: string;
  model: string;
  timeoutMs: number;
}

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: number[] | number[][] | null;
  error?: string | null;
  urls?: { get?: string };
}

export class ReplicateEmbeddingsAdapter implements EmbeddingsPort {
  private readonly apiToken: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  public constructor(opts: ReplicateEmbeddingsAdapterOptions) {
    this.apiToken = opts.apiToken;
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs;
  }

  public async encode(input: EncodeInput): Promise<EncodeOutput> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const dataUri = bufferToDataUri(input.buffer, input.mimeType);
      const initial = await this.createPrediction(dataUri, controller.signal);
      const finalPrediction = await this.awaitTerminal(initial, controller.signal);

      const rawVector = extractVector(finalPrediction);
      const normalised = l2Normalise(rawVector);

      return {
        vector: normalised,
        modelVersion: buildModelVersion(this.model),
      };
    } catch (err) {
      if (err instanceof EncoderUnavailableError) throw err;
      if (isAbortError(err)) {
        throw new EncoderUnavailableError(
          `Replicate prediction timed out after ${this.timeoutMs}ms`,
          err,
        );
      }
      throw new EncoderUnavailableError(`Replicate prediction failed: ${errorMessage(err)}`, err);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private async createPrediction(
    dataUri: string,
    signal: AbortSignal,
  ): Promise<ReplicatePrediction> {
    const body: Record<string, unknown> = {
      input: { image: dataUri },
    };
    if (this.model.includes(':')) {
      body.version = this.model.split(':')[1];
    } else {
      body.model = this.model;
    }

    const response = await fetch(REPLICATE_PREDICTIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Token ${this.apiToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });

    return await parseResponseOrFail(response, 'create');
  }

  private async awaitTerminal(
    initial: ReplicatePrediction,
    signal: AbortSignal,
  ): Promise<ReplicatePrediction> {
    let current = initial;

    while (current.status !== 'succeeded') {
      if (current.status === 'failed' || current.status === 'canceled') {
        throw new EncoderUnavailableError(
          `Replicate prediction terminated with status="${current.status}"${
            current.error ? `: ${current.error}` : ''
          }`,
        );
      }

      if (signal.aborted) {
        throw new EncoderUnavailableError(
          `Replicate prediction timed out after ${this.timeoutMs}ms (last status="${current.status}")`,
        );
      }

      const pollUrl = current.urls?.get;
      if (!pollUrl) {
        throw new EncoderUnavailableError(
          'Replicate prediction missing `urls.get` polling endpoint',
        );
      }

      await sleep(POLL_INTERVAL_MS, signal);

      const response = await fetch(pollUrl, {
        method: 'GET',
        headers: {
          Authorization: `Token ${this.apiToken}`,
          Accept: 'application/json',
        },
        signal,
      });

      current = await parseResponseOrFail(response, 'poll');
    }

    return current;
  }
}

function bufferToDataUri(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

async function parseResponseOrFail(
  response: Response,
  stage: 'create' | 'poll',
): Promise<ReplicatePrediction> {
  if (!response.ok) {
    let detail = '';
    try {
      const body = (await response.json()) as { detail?: string } | undefined;
      detail = body?.detail ? ` (${body.detail})` : '';
    } catch {}
    logger.warn('replicate_embeddings_http_error', {
      stage,
      status: response.status,
    });
    throw new EncoderUnavailableError(
      `Replicate ${stage} failed with HTTP ${response.status}${detail}`,
    );
  }

  return (await response.json()) as ReplicatePrediction;
}

function extractVector(prediction: ReplicatePrediction): number[] {
  const { output } = prediction;
  if (output == null) {
    throw new EncoderUnavailableError(
      'Replicate prediction succeeded but `output` was null/undefined',
    );
  }

  const flat: number[] =
    Array.isArray(output) && output.length > 0 && Array.isArray(output[0])
      ? output[0]
      : (output as number[]);

  if (!Array.isArray(flat) || flat.length !== EXPECTED_VECTOR_LEN) {
    throw new EncoderUnavailableError(
      `Replicate output has unexpected shape (expected length ${EXPECTED_VECTOR_LEN}, got ${
        Array.isArray(flat) ? String(flat.length) : typeof flat
      })`,
    );
  }

  return flat;
}

function l2Normalise(vec: number[]): Float32Array {
  let sumSq = 0;
  for (const v of vec) {
    sumSq += v * v;
  }
  const norm = Math.sqrt(sumSq);
  const out = new Float32Array(vec.length);
  if (norm === 0) return out;
  for (let i = 0; i < vec.length; i++) {
    out[i] = (vec[i] ?? 0) / norm;
  }
  return out;
}

function buildModelVersion(model: string): string {
  const noOwner = model.includes('/') ? (model.split('/')[1] ?? model) : model;
  const noSha = noOwner.includes(':') ? (noOwner.split(':')[0] ?? noOwner) : noOwner;
  return `${noSha}@replicate-v1`;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const handle = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(handle);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function isAbortError(err: unknown): boolean {
  if (err instanceof Error && err.name === 'AbortError') return true;
  if (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: unknown }).name === 'AbortError'
  ) {
    return true;
  }
  return false;
}
