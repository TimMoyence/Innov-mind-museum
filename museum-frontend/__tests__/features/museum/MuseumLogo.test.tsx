/**
 * RED-3 — `MuseumLogo` component (C4 co-branding, run 2026-05-26-kr-product).
 *
 * Phase: RED (UFR-022). MUST FAIL — `features/museum/ui/MuseumLogo` does not
 * exist yet.
 *
 * Asserts (spec-c4 R8/R9/R5):
 *   - valid HTTPS logoUrl → renders an `expo-image` <Image> with
 *     `source.uri === logoUrl`, `accessibilityRole === 'image'` and an
 *     `accessibilityLabel` derived from the museum name;
 *   - firing the <Image> `onError` → flips to the no-logo fallback
 *     (`testID="museum-logo-fallback"`, a `business` Ionicon), no crash;
 *   - absent/empty logoUrl → fallback rendered immediately, NO <Image>.
 *
 * lib-docs consulted: expo-image/PATTERNS.md:8,46 (Image, contentFit, onError,
 * accessibilityLabel), react-native/PATTERNS.md §7 (a11y role/label on images).
 *
 * No emoji (PNG / Ionicons only). Logo = expo-image; fallback = Ionicon.
 */

// Local i18n mock that interpolates {{name}} so the a11y label can be asserted
// against the museum name (the global test-utils mock returns the raw key).
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { name?: string }) =>
      opts?.name ? `${opts.name} logo` : key,
    i18n: { language: 'en' },
  }),
}));

import { Image } from 'expo-image';
import { fireEvent, render, screen } from '@testing-library/react-native';

const loadComponent = () => {
  const mod = require('@/features/museum/ui/MuseumLogo') as {
    MuseumLogo: React.ComponentType<{
      logoUrl?: string;
      museumName: string;
    }>;
  };
  return mod.MuseumLogo;
};

describe('MuseumLogo (R8) — valid HTTPS logo', () => {
  it('renders an expo-image <Image> with the logoUrl as source.uri', () => {
    const MuseumLogo = loadComponent();
    const { UNSAFE_getAllByType } = render(
      <MuseumLogo logoUrl="https://cdn.example.org/logo.png" museumName="Musée d'Aquitaine" />,
    );

    const images = UNSAFE_getAllByType(Image);
    expect(images.length).toBeGreaterThanOrEqual(1);
    const sources = images.map((img) => (img.props as { source?: { uri?: string } }).source);
    expect(sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ uri: 'https://cdn.example.org/logo.png' }),
      ]),
    );
  });

  it('sets accessibilityRole="image" and an accessibilityLabel from the name', () => {
    const MuseumLogo = loadComponent();
    render(<MuseumLogo logoUrl="https://cdn.example.org/logo.png" museumName="CAPC" />);

    const node = screen.getByLabelText(/CAPC/);
    expect(node).toBeTruthy();
    expect((node.props as { accessibilityRole?: string }).accessibilityRole).toBe('image');
  });

  it('does NOT render the fallback while a valid logo is shown', () => {
    const MuseumLogo = loadComponent();
    render(<MuseumLogo logoUrl="https://cdn.example.org/logo.png" museumName="CAPC" />);
    expect(screen.queryByTestId('museum-logo-fallback')).toBeNull();
  });
});

describe('MuseumLogo (R9) — onError fallback', () => {
  it('flips to the no-logo fallback when the image errors, without throwing', () => {
    const MuseumLogo = loadComponent();
    const { UNSAFE_getAllByType } = render(
      <MuseumLogo logoUrl="https://cdn.example.org/broken.png" museumName="Cité du Vin" />,
    );

    const image = UNSAFE_getAllByType(Image)[0];
    if (!image) throw new Error('expected a rendered Image');
    expect(() => {
      fireEvent(image, 'error', { error: 'load failed' });
    }).not.toThrow();

    expect(screen.getByTestId('museum-logo-fallback')).toBeTruthy();
    expect(screen.queryByTestId('museum-logo-fallback')).not.toBeNull();
  });
});

describe('MuseumLogo (R5/R9) — absent logo', () => {
  it('renders the fallback immediately and no <Image> when logoUrl is undefined', () => {
    const MuseumLogo = loadComponent();
    const { UNSAFE_queryAllByType } = render(<MuseumLogo museumName="CAPC" />);

    expect(screen.getByTestId('museum-logo-fallback')).toBeTruthy();
    expect(UNSAFE_queryAllByType(Image)).toHaveLength(0);
  });

  it('renders the fallback when logoUrl is an empty string', () => {
    const MuseumLogo = loadComponent();
    const { UNSAFE_queryAllByType } = render(<MuseumLogo logoUrl="" museumName="CAPC" />);

    expect(screen.getByTestId('museum-logo-fallback')).toBeTruthy();
    expect(UNSAFE_queryAllByType(Image)).toHaveLength(0);
  });
});
