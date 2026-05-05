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
