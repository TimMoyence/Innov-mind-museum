import { isHexColor, isHttpsUrl } from '@musaium/shared/museum';

export { pickContrastingTextColor } from '@musaium/shared/museum';

export interface MuseumBranding {
  primaryColor?: string;
  logoUrl?: string;
}

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
