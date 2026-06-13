/**
 * Passive quality-sampling eligibility + axios glue (design §2.3, Q-02).
 *
 * Strategy = central DENY-list + per-request opt-out. An allow-list (GET only)
 * would starve the window in a chat session (almost only POSTs); the
 * compute-dominated endpoints are few, stable and enumerable. Naturally
 * excluded without code: SSE streaming chat (fetch, not axios) and
 * TanStack-cache-served responses (no interceptor event) — US-10.2.
 */
import { recordQualitySample } from './networkQualityTracker';

/**
 * Deny by URL pattern — latency dominated by LLM/STT/TTS compute, not the
 * network (INV-09: a 12 s LLM reply must NEVER push toward `slow`).
 * End-anchored: sub-resources of denied paths stay eligible.
 */
export const QUALITY_SAMPLE_DENY_PATTERNS: readonly RegExp[] = [
  /\/chat\/sessions\/[^/]+\/messages$/, // LLM generation (send.ts:162)
  /\/chat\/sessions\/[^/]+\/audio$/, // STT + LLM (audio.ts:87)
  /\/messages\/[^/]+\/tts$/, // TTS synthesis (audio.ts:101)
];

/**
 * PURE eligibility predicate (testable as a matrix). Excludes deny-listed
 * URLs, multipart/upload bodies, retries of a same request
 * (`_retryCount > 0`, design P-05) and per-request opt-outs (US-10.2).
 */
export function isQualitySampleEligible(args: {
  url: string;
  isFormData: boolean;
  retryCount: number;
  skip: boolean;
}): boolean {
  if (args.skip) return false;
  if (args.isFormData) return false;
  if (args.retryCount > 0) return false;
  return !QUALITY_SAMPLE_DENY_PATTERNS.some((pattern) => pattern.test(args.url));
}

/** Transport fragment of the axios config the sampler reads (httpClient seam). */
export interface QualitySampleHttpConfig {
  url?: unknown;
  _startedAt?: unknown;
  _retryCount?: number;
  skipQualitySample?: boolean;
  data?: unknown;
}

/** Mirrors `httpRequest.ts:34-39` — `FormData` may be absent in exotic envs. */
const isFormDataBody = (body: unknown): boolean =>
  typeof FormData !== 'undefined' && body instanceof FormData;

/**
 * IMPURE edge — called from the two response interceptors of `httpClient.ts`.
 * No-op when `_startedAt` is absent/non-numeric or the request is ineligible;
 * otherwise forwards `{ rttMs: Date.now() − _startedAt, …outcome }` to the
 * tracker (which applies the AppState gate). Fully try/catch-wrapped: sampling
 * must NEVER break the request flow (same doctrine as `emitHttpBreadcrumb`,
 * httpClient.ts:238-240).
 */
export function recordHttpQualitySample(
  config: QualitySampleHttpConfig,
  outcome: { ok: boolean; timedOut: boolean },
): void {
  try {
    const startedAt = config._startedAt;
    if (typeof startedAt !== 'number') return;
    const eligible = isQualitySampleEligible({
      url: typeof config.url === 'string' ? config.url : '',
      isFormData: isFormDataBody(config.data),
      retryCount: typeof config._retryCount === 'number' ? config._retryCount : 0,
      skip: config.skipQualitySample === true,
    });
    if (!eligible) return;
    recordQualitySample({
      rttMs: Date.now() - startedAt,
      ok: outcome.ok,
      timedOut: outcome.timedOut,
    });
  } catch {
    // Never let sampling break the request flow (US-10.1 — passive only).
  }
}
