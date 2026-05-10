/**
 * Replicate-hosted SigLIP embeddings adapter (R8 fallback).
 *
 * Hits the Replicate Predictions API to encode an image into a 768-dim
 * SigLIP embedding. This adapter is the fallback path documented in
 * design §3 / §9 D6 — activated via `EMBEDDINGS_PROVIDER=replicate` when
 * the local ONNX runtime is unavailable (cold start failures, AVX2 missing,
 * VPS without the model file shipped, etc.).
 *
 * Wire flow:
 *   1. POST `/v1/predictions` with `{ version | model, input: { image } }`.
 *   2. If status `'succeeded'` synchronously → use returned `output`.
 *   3. Otherwise poll `urls.get` until terminal status, with a global
 *      `AbortSignal` deadline derived from `timeoutMs`.
 *   4. L2-normalise the 768-dim vector (repository search assumes
 *      inner-product == cosine).
 *
 * Error mapping → {@link EncoderUnavailableError}:
 *   - HTTP 4xx (auth / bad request)
 *   - HTTP 5xx (provider down)
 *   - Replicate prediction status `'failed'` / `'canceled'`
 *   - AbortSignal fires (timeout exceeded)
 *
 * The adapter uses native `fetch` directly (Node 22 built-in) rather than
 * the `replicate` npm package so:
 *   - Tests can mock `global.fetch` (codebase pattern, see
 *     `searxng.client.ts` for reference).
 *   - The `replicate` package stays in `optionalDependencies` (R8 — only
 *     loaded if/when the official client is required).
 */

import {
  EncoderUnavailableError,
  type EmbeddingsPort,
  type EncodeInput,
  type EncodeOutput,
} from '@modules/chat/domain/ports/embeddings.port';
import { logger } from '@shared/logger/logger';

const REPLICATE_PREDICTIONS_URL = 'https://api.replicate.com/v1/predictions';
const POLL_INTERVAL_MS = 25;
const EXPECTED_VECTOR_LEN = 768;

/** Constructor options for {@link ReplicateEmbeddingsAdapter}. */
export interface ReplicateEmbeddingsAdapterOptions {
  /** Replicate API token (`r8_...`). Sent in `Authorization: Token …`. */
  apiToken: string;
  /**
   * Replicate model identifier — typically `<owner>/<name>` (e.g.
   * `lucataco/siglip-base-patch16-224`) or a pinned `<owner>/<name>:<sha>`.
   * The bare name segment is what surfaces in {@link EncodeOutput.modelVersion}.
   */
  model: string;
  /** Hard deadline for `encode()` (create + polling). */
  timeoutMs: number;
}

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: number[] | number[][] | null;
  error?: string | null;
  urls?: { get?: string };
}

/**
 * Adapter implementing {@link EmbeddingsPort} on top of the Replicate
 * Predictions REST API.
 */
export class ReplicateEmbeddingsAdapter implements EmbeddingsPort {
  private readonly apiToken: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  /**
   * Builds the adapter. The token is held in memory only — never logged.
   *
   * @param opts - API token, target model id, and timeout budget.
   */
  public constructor(opts: ReplicateEmbeddingsAdapterOptions) {
    this.apiToken = opts.apiToken;
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs;
  }

  /**
   * Encodes an image into a 768-dim L2-normalised SigLIP vector via Replicate.
   *
   * @param input - Buffer + validated MIME type (already EXIF-stripped upstream).
   * @returns L2-normalised Float32Array + Replicate-flavoured `modelVersion`.
   * @throws {EncoderUnavailableError} On HTTP 4xx / 5xx, terminal failure, or timeout.
   */
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
      // AbortError from the AbortController firing → timeout.
      if (isAbortError(err)) {
        throw new EncoderUnavailableError(
          `Replicate prediction timed out after ${this.timeoutMs}ms`,
          err,
        );
      }
      throw new EncoderUnavailableError(
        `Replicate prediction failed: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  /** POSTs the create-prediction request and returns the parsed body. */
  private async createPrediction(
    dataUri: string,
    signal: AbortSignal,
  ): Promise<ReplicatePrediction> {
    const body: Record<string, unknown> = {
      input: { image: dataUri },
    };
    // Replicate accepts either `version` (sha-pinned) or `model` (`owner/name`).
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

  /**
   * Polls `urls.get` until the prediction reaches a terminal status. Returns
   * the initial prediction directly if it is already `'succeeded'`.
   */
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

/** Encodes the image bytes as a `data:` URI suitable for Replicate `input.image`. */
function bufferToDataUri(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

/**
 * Parses a Replicate API response. Maps non-2xx to {@link EncoderUnavailableError}
 * (4xx and 5xx alike — both indicate the encoder is unavailable from our PoV).
 */
async function parseResponseOrFail(
  response: Response,
  stage: 'create' | 'poll',
): Promise<ReplicatePrediction> {
  if (!response.ok) {
    let detail = '';
    try {
      const body = (await response.json()) as { detail?: string } | undefined;
      detail = body?.detail ? ` (${body.detail})` : '';
    } catch {
      // ignore — body may not be JSON
    }
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

/**
 * Pulls the 768-dim vector out of a successful Replicate prediction.
 *
 * Replicate models can return either a flat `number[]` or a single-batch
 * `number[][]` — handle both for forward-compatibility.
 */
function extractVector(prediction: ReplicatePrediction): number[] {
  const { output } = prediction;
  if (output == null) {
    throw new EncoderUnavailableError(
      'Replicate prediction succeeded but `output` was null/undefined',
    );
  }

  let flat: number[];
  if (Array.isArray(output) && output.length > 0 && Array.isArray(output[0])) {
    flat = output[0];
  } else {
    flat = output as number[];
  }

  if (!Array.isArray(flat) || flat.length !== EXPECTED_VECTOR_LEN) {
    throw new EncoderUnavailableError(
      `Replicate output has unexpected shape (expected length ${EXPECTED_VECTOR_LEN}, got ${
        Array.isArray(flat) ? String(flat.length) : typeof flat
      })`,
    );
  }

  return flat;
}

/** L2-normalises a numeric vector into a Float32Array (zero-vector → zero). */
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

/**
 * Builds the {@link EncodeOutput.modelVersion} string. Strips the optional
 * Replicate owner prefix and version suffix to surface a stable identifier
 * shaped like `siglip-base-patch16-224@replicate-v1`.
 */
function buildModelVersion(model: string): string {
  const noOwner = model.includes('/') ? (model.split('/')[1] ?? model) : model;
  const noSha = noOwner.includes(':') ? (noOwner.split(':')[0] ?? noOwner) : noOwner;
  return `${noSha}@replicate-v1`;
}

/** Sleeps `ms` milliseconds, aborting early if the supplied signal fires. */
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

/** Detects an AbortError in a way that survives transpile + cross-realm checks. */
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
