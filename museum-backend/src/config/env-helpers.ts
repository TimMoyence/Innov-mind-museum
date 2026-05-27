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

/** Clamp to [0, 1]. NaN/non-finite → 0, >1 saturates at 1. */
export const clampUnitInterval = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
};

// Single literal that authorises non-zero `GUARDRAIL_CHAOS_RATE` in prod.
// Typo'd values silently coerce to 0 — chaos in prod is deliberate, not accident.
const PROD_CHAOS_ESCAPE_HATCH = 'I-know-what-I-am-doing' as const;

/**
 * Parses chaos-injection rate. Escape hatch at helper boundary (not AppEnv
 * literal) so gate is unit-testable without env mutation. Spec §6 RO3, ADR-048.
 *
 * Order:
 *   1. Invalid / missing → 0 (disabled).
 *   2. prod AND value > 0 AND escape hatch ≠ `I-know-what-I-am-doing`
 *      → coerce 0 + structured stderr log. Prevents accidental sidecar aborts on real traffic.
 *   3. Otherwise → clamped [0, 1].
 */
export const resolveChaosRate = (
  raw: string | undefined,
  nodeEnv: string | undefined,
  escapeHatch: string | undefined,
): number => {
  const clamped = clampUnitInterval(toNumber(raw, 0));
  if (clamped === 0) return 0;
  if (nodeEnv === 'production' && escapeHatch !== PROD_CHAOS_ESCAPE_HATCH) {
    // Stderr structured line — observability surfaces refusal even if logger module not yet init.
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
