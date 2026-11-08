import { isHexColor, isHttpsUrl } from '@musaium/shared/museum';

export { pickContrastingTextColor } from '@musaium/shared/museum';

/**
 * Per-museum co-branding domain (C4 slice, run 2026-05-26-kr-product).
 *
 * Pure TypeScript: no React / React Native / react-query imports so the parser
 * stays trivially testable without a renderer. The colour / URL rules and the
 * contrast picker live in `@musaium/shared/museum`, shared with the backend
 * (write guard) and the web admin (preview).
 *
 * Scope: the mobile consumer applies ONLY a per-museum primary color + a logo
 * URL — they are the only branding fields the product exposes.
 */

/**
 * Validated per-museum branding parsed from the untyped `MuseumDTO.config`
 * jsonb blob. Both fields are optional — a field is present only when it passed
 * validation; an unbranded museum yields `{}`.
 */
export interface MuseumBranding {
  /** Validated `#RRGGBB` brand primary color, or `undefined`. */
  primaryColor?: string;
  /** Validated HTTPS logo URL, or `undefined`. */
  logoUrl?: string;
}

/**
 * Defensively parses `MuseumDTO.config.branding` into a typed
 * {@link MuseumBranding}. jsonb-drift-guard (feedback_jsonb_drift_guard): every
 * level is `typeof`-guarded even though TS claims a shape — `config` is
 * `Record<string, unknown>` at runtime. Never throws; returns `{}` when nothing
 * valid is present (R3/R4/R5).
 */
export const parseMuseumBranding = (
  config: Record<string, unknown> | null | undefined,
): MuseumBranding => {
  if (config == null || typeof config !== 'object' || Array.isArray(config)) {
    return {};
  }

  const raw = config.branding;
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const branding = raw as Record<string, unknown>;
  const result: MuseumBranding = {};

  const primaryColor = branding.primaryColor;
  if (typeof primaryColor === 'string' && isHexColor(primaryColor)) {
    result.primaryColor = primaryColor;
  }

  const logoUrl = branding.logoUrl;
  if (typeof logoUrl === 'string' && isHttpsUrl(logoUrl)) {
    result.logoUrl = logoUrl;
  }

  return result;
};
