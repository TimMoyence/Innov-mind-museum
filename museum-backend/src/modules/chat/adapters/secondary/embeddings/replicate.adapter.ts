/**
 * Replicate-hosted SigLIP embeddings (R8 fallback, ADR-037).
 * Activated via `EMBEDDINGS_PROVIDER=replicate` when local ONNX is unavailable.
 *
 * Flow: POST /v1/predictions → poll urls.get until terminal → L2-normalise (IP==cosine).
 * All failures (4xx/5xx, status='failed'|'canceled', timeout) → EncoderUnavailableError.
 *
 * Native fetch (not `replicate` npm) so tests can mock global.fetch + the
 * package stays in optionalDependencies.
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

export interface ReplicateEmbeddingsAdapterOptions {
  apiToken: string;
  /** `<owner>/<name>` or `<owner>/<name>:<sha>`. */
  model: string;
  /** Hard deadline in ms for create + polling. */
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

  /** SEC: apiToken held in memory only, never logged. */
  public constructor(opts: ReplicateEmbeddingsAdapterOptions) {
    this.apiToken = opts.apiToken;
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs;
  }

  /** @throws {EncoderUnavailableError} 4xx/5xx/terminal/timeout */
  public async encode(input: EncodeInput): Promise<EncodeOutput> {
    // PR-14: does NOT use `fetchWithTimeout` — single budget shared across
    // multi-fetch flow (createPrediction + awaitTerminal polling). The helper
    // arms a per-call timer; here the same `controller` must span N fetches.
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
      throw new EncoderUnavailableError(
        `Replicate prediction failed: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
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
    // `version` (sha-pinned) vs `model` (owner/name).
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

  /** Returns immediately if initial is 'succeeded'; else polls `urls.get`. */
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

/** Non-2xx (both 4xx + 5xx) → EncoderUnavailableError. */
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

/** Accepts both `number[]` and `number[][]` (single-batch) output shapes. */
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

/**
 * Output shape: `siglip-base-patch16-224@replicate-v1` (owner+sha stripped).
 * Stays at SigLIP v1: Replicate had no SigLIP-2 model at the C9.14 upgrade
 * (2026-05-18) so the hosted fallback lags one generation; the distinct
 * `modelVersion` keeps stale-row detection honest in `artwork_embeddings`.
 */
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

/** Cross-realm-safe AbortError detection. */
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
