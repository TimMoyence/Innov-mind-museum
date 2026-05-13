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
