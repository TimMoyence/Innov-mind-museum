export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
export const HTTPS_URL_PATTERN = /^https:\/\/[^\s]+$/i;
export const SLUG_PATTERN = /^[a-z0-9-]+$/;
export const LATITUDE_RANGE = { min: -90, max: 90 } as const;
export const LONGITUDE_RANGE = { min: -180, max: 180 } as const;

export function isLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= LATITUDE_RANGE.min && value <= LATITUDE_RANGE.max;
}

export function isLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= LONGITUDE_RANGE.min && value <= LONGITUDE_RANGE.max;
}

export function isHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value);
}

export function isHttpsUrl(value: string): boolean {
  return HTTPS_URL_PATTERN.test(value);
}

export function isSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

const LUMINANCE_PIVOT = 0.22;

const linearise = (channel: number): number =>
  channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

export function pickContrastingTextColor(hex: string): string {
  if (!isHexColor(hex)) return '#FFFFFF';
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const luminance = 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
  return luminance > LUMINANCE_PIVOT ? '#000000' : '#FFFFFF';
}
