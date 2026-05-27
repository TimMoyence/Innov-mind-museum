/**
 * Per-museum co-branding domain (C4 slice, run 2026-05-26-kr-product).
 *
 * Pure TypeScript: no React / React Native / react-query imports so the parser
 * and the contrast picker stay trivially testable without a renderer.
 *
 * Scope (dispatcher override): the mobile consumer applies ONLY a per-museum
 * primary color + a logo URL. There is no `secondary` / `accent` channel in
 * `ThemePalette` (0 consumers), so parsing those would be dead code — they are
 * deliberately absent from {@link MuseumBranding}.
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

// Mirrors museum-web/src/lib/validation.ts:14-15 (cross-app duplication — the
// mobile app cannot import from the web app; same shape, different package).
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const HTTPS_RE = /^https:\/\/[^\s]+$/i;

/** True when `v` is a strict `#RRGGBB` hex color (6 digits, leading `#`). */
export const isValidHexColor = (v: string): boolean => HEX_RE.test(v);

/**
 * True when `v` is a well-formed HTTPS URL with no whitespace. Rejects
 * `http:`, `javascript:`, `data:`, `ftp:`, relative paths and malformed input
 * (NFR Security R5 — the only sink is `<Image source={{ uri }}>`).
 */
export const isValidHttpsUrl = (v: string): boolean => HTTPS_RE.test(v);

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
  if (typeof primaryColor === 'string' && isValidHexColor(primaryColor)) {
    result.primaryColor = primaryColor;
  }

  const logoUrl = branding.logoUrl;
  if (typeof logoUrl === 'string' && isValidHttpsUrl(logoUrl)) {
    result.logoUrl = logoUrl;
  }

  return result;
};

/**
 * Picks a legible CTA text color (black or white) for a given brand background
 * `hex`, using the WCAG relative-luminance formula. A light brand color (high
 * luminance) returns black text; a dark one returns white. Invalid hex falls
 * back to white and never throws (dispatcher override: EXIGÉ).
 *
 * WCAG relative luminance:
 *   L = 0.2126·R + 0.7152·G + 0.0722·B, each channel sRGB-linearised.
 * Pivot at 0.22 keeps a light lavender `#9F7AEA` (L≈0.272) → black while a deep
 * violet `#6B46C1` (L≈0.114) and a mid-grey `#808080` (L≈0.216) stay → white,
 * matching the human-legibility break for label text on a brand tint.
 */
const LUMINANCE_PIVOT = 0.22;

export const pickContrastingTextColor = (hex: string): string => {
  if (typeof hex !== 'string' || !isValidHexColor(hex)) {
    return '#FFFFFF';
  }

  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const linearise = (channel: number): number =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

  const luminance = 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);

  return luminance > LUMINANCE_PIVOT ? '#000000' : '#FFFFFF';
};
