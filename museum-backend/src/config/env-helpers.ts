// Pure env-var parsers. No I/O, no logging, referentially transparent.

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
 * Parses an ISO-8601 timestamp env var, returning a normalised UTC ISO string.
 * Invalid / unparseable values fall back to `fallbackIso` (and emit a structured
 * stderr warning) so a typo'd `NPS_SCALE_EPOCH` never silently disables the NPS
 * cutoff — it degrades to the documented default instead of `Invalid Date`.
 * The output is always a valid ISO string safe to bind as a SQL `timestamptz`
 * parameter.
 */
export const toIsoTimestamp = (value: string | undefined, fallbackIso: string): string => {
  const raw = value?.trim();
  if (!raw) return fallbackIso;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    process.stderr.write(
      JSON.stringify({
        level: 'warn',
        event: 'env_iso_timestamp_invalid',
        raw,
        fallback: fallbackIso,
      }) + '\n',
    );
    return fallbackIso;
  }
  return parsed.toISOString();
};