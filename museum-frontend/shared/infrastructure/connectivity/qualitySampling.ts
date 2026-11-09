import { recordQualitySample } from './networkQualityTracker';

export const QUALITY_SAMPLE_DENY_PATTERNS: readonly RegExp[] = [
  /\/chat\/sessions\/[^/]+\/messages$/,
  /\/chat\/sessions\/[^/]+\/audio$/,
  /\/messages\/[^/]+\/tts$/,
];

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

export interface QualitySampleHttpConfig {
  url?: unknown;
  _startedAt?: unknown;
  _retryCount?: number;
  skipQualitySample?: boolean;
  data?: unknown;
}

const isFormDataBody = (body: unknown): boolean =>
  typeof FormData !== 'undefined' && body instanceof FormData;

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
    const rttMs = Date.now() - startedAt;
    if (!eligible || rttMs < 0) return;
    recordQualitySample({
      rttMs,
      ok: outcome.ok,
      timedOut: outcome.timedOut,
    });
  } catch {}
}
