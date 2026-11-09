import { makeMuseumBranding } from '../../helpers/factories';
import type { MuseumBranding } from '@/features/museum/domain/museum-branding';

const loadModule = () =>
  require('@/features/museum/domain/museum-branding') as {
    parseMuseumBranding: (config: Record<string, unknown> | null | undefined) => MuseumBranding;
    pickContrastingTextColor: (hex: string) => string;
  };

const parseMuseumBranding = (config: Record<string, unknown> | null | undefined) =>
  loadModule().parseMuseumBranding(config);
const pickContrastingTextColor = (hex: string) => loadModule().pickContrastingTextColor(hex);

describe('parseMuseumBranding — valid input', () => {
  it('parses a full valid config.branding into primaryColor + logoUrl', () => {
    const branding = makeMuseumBranding();
    const result = parseMuseumBranding({ branding });

    expect(result.primaryColor).toBe('#6B46C1');
    expect(result.logoUrl).toBe('https://cdn.example.org/logo.png');
  });

  it('keeps a valid #RRGGBB primaryColor and a valid HTTPS logoUrl', () => {
    const result = parseMuseumBranding({
      branding: { primaryColor: '#0a7E33', logoUrl: 'https://cdn.x/l.png' },
    });

    expect(result.primaryColor).toBe('#0a7E33');
    expect(result.logoUrl).toBe('https://cdn.x/l.png');
  });
});

describe('parseMuseumBranding — defensive jsonb guards (R3, never throws)', () => {
  const garbageConfigs: { label: string; value: unknown }[] = [
    { label: 'null', value: null },
    { label: 'undefined', value: undefined },
    { label: 'array', value: [] },
    { label: 'number primitive', value: 42 },
    { label: 'string primitive', value: 'branding' },
    { label: 'empty object (no branding key)', value: {} },
    { label: 'branding = null', value: { branding: null } },
    { label: 'branding = array', value: { branding: [] } },
    { label: 'branding = string', value: { branding: 'x' } },
    { label: 'branding = number', value: { branding: 7 } },
  ];

  it.each(garbageConfigs)('returns {} and never throws for $label', ({ value }) => {
    expect(() =>
      parseMuseumBranding(value as Record<string, unknown> | null | undefined),
    ).not.toThrow();
    expect(parseMuseumBranding(value as Record<string, unknown> | null | undefined)).toEqual({});
  });

  it('drops non-string fields (primaryColor: number, logoUrl: object)', () => {
    const result = parseMuseumBranding({
      branding: { primaryColor: 123, logoUrl: {} },
    });
    expect(result).toEqual({});
  });
});

describe('parseMuseumBranding — HEX validation (R4)', () => {
  const invalidHex = ['red', '#GG0000', '#fff', 'rgb(0,0,0)', '', '6B46C1', '#6B46C1 '];

  it.each(invalidHex)('drops invalid HEX primaryColor %p', (color) => {
    const result = parseMuseumBranding({ branding: { primaryColor: color } });
    expect(result.primaryColor).toBeUndefined();
  });

  it('keeps a valid #RRGGBB primaryColor (mixed case)', () => {
    const result = parseMuseumBranding({ branding: { primaryColor: '#aB12Cd' } });
    expect(result.primaryColor).toBe('#aB12Cd');
  });
});

describe('parseMuseumBranding — HTTPS URL validation + scheme rejection (R5)', () => {
  const rejectedLogo = [
    'http://x',
    'javascript:alert(1)',
    'data:image/png;base64,xxx',
    '/relative/logo.png',
    'not a url',
    'ftp://cdn.x/l.png',
    'https://has space.com/l.png',
  ];

  it.each(rejectedLogo)('drops non-HTTPS / unsafe-scheme logoUrl %p', (url) => {
    const result = parseMuseumBranding({ branding: { logoUrl: url } });
    expect(result.logoUrl).toBeUndefined();
  });

  it('keeps a valid HTTPS logoUrl', () => {
    const result = parseMuseumBranding({
      branding: { logoUrl: 'https://cdn.example.org/logo.png' },
    });
    expect(result.logoUrl).toBe('https://cdn.example.org/logo.png');
  });
});

describe('pickContrastingTextColor — WCAG-AA luminance picker (dispatcher override, EXIGÉ)', () => {
  it('returns black text on a light primary color', () => {
    expect(pickContrastingTextColor('#FFFFFF')).toBe('#000000');
    expect(pickContrastingTextColor('#FFEB3B')).toBe('#000000');
    expect(pickContrastingTextColor('#9F7AEA')).toBe('#000000');
  });

  it('returns white text on a dark primary color', () => {
    expect(pickContrastingTextColor('#000000')).toBe('#FFFFFF');
    expect(pickContrastingTextColor('#6B46C1')).toBe('#FFFFFF');
    expect(pickContrastingTextColor('#0a2540')).toBe('#FFFFFF');
  });

  it('crosses the threshold deterministically around mid-grey', () => {
    const light = pickContrastingTextColor('#BBBBBB');
    const dark = pickContrastingTextColor('#777777');
    expect(light).toBe('#000000');
    expect(dark).toBe('#FFFFFF');
  });

  it('falls back to white text for an invalid hex (never throws)', () => {
    expect(() => pickContrastingTextColor('not-a-hex')).not.toThrow();
    expect(pickContrastingTextColor('not-a-hex')).toBe('#FFFFFF');
  });
});
