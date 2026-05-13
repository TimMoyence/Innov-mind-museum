/**
 * Pure parsers for environment-variable strings. Extracted from env.ts so the
 * main file can focus on the AppEnv literal. No I/O, no logging, no fallbacks
 * to module state — every helper is referentially transparent.
 */

export const toNumber = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const toBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

export const toList = (value: string | undefined): string[] => {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

export const toOptionalString = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

export const required = (name: string, value: string | undefined): string => {
  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

/**
 * Clamps a number into the closed unit interval [0, 1]. NaN / non-finite
 * inputs collapse to 0, > 1 saturates at 1. Pure — used for env-supplied
 * probability knobs (e.g. chaos injection rate).
 */
export const clampUnitInterval = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
};

/**
 * The single literal that authorises a non-zero `GUARDRAIL_CHAOS_RATE` in
 * production. Typo'd values are silently coerced to 0 — chaos in prod is a
 * deliberate, conscious decision, not an accident.
 */
const PROD_CHAOS_ESCAPE_HATCH = 'I-know-what-I-am-doing' as const;

/**
 * Parses the chaos-injection rate envelope. The escape hatch lives at the
 * helper boundary (not inside the AppEnv literal) so the gate is unit-testable
 * without env mutation and the helper stays pure.
 *
 * Resolution order:
 *   1. Invalid / missing input → 0 (chaos disabled).
 *   2. NODE_ENV=production AND value > 0 AND escape hatch ≠
 *      `I-know-what-I-am-doing` → coerce to 0 + log a structured stderr line.
 *      A misconfigured prod env var cannot accidentally inject sidecar aborts
 *      on real traffic.
 *   3. Otherwise → clamped to [0, 1].
 *
 * Spec §6 RO3, ADR-048 sign-off criterion. Used at composition time only.
 */
export const resolveChaosRate = (
  raw: string | undefined,
  nodeEnv: string | undefined,
  escapeHatch: string | undefined,
): number => {
  const clamped = clampUnitInterval(toNumber(raw, 0));
  if (clamped === 0) return 0;
  if (nodeEnv === 'production' && escapeHatch !== PROD_CHAOS_ESCAPE_HATCH) {
    // Stderr-only structured line so observability still surfaces the refusal
    // even if the logger module is not yet initialised at this point.
    process.stderr.write(
      JSON.stringify({
        level: 'error',
        event: 'guardrail_chaos_rate_refused',
        reason: 'production_without_escape_hatch',
        raw: raw ?? '',
      }) + '\n',
    );
    return 0;
  }
  return clamped;
};
