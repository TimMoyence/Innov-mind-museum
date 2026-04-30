/**
 * Behaviour tests for museum-web marketing and shared components.
 *
 * Replaces toMatchSnapshot()-based tests with role-query and class-name
 * contract assertions per ADR-012 + Phase 0 cosmetic-test purge. Each
 * test case pins a specific regression — see inline `// pins:` comments.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import Button from '@/components/ui/Button';
import StoreButton from '@/components/marketing/StoreButton';
import Footer from '@/components/shared/Footer';
import Header from '@/components/shared/Header';
import type { Dictionary } from '@/lib/i18n';

// ── Next.js mocks ───────────────────────────────────────────────────────────
vi.mock('next/navigation', () => ({
  usePathname: () => '/en',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: { alt: string; [key: string]: unknown }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

const mockDict: Dictionary = {
  metadata: { title: 'Musaium', description: 'Museum assistant' },
  nav: {
    home: 'Home',
    support: 'Support',
    privacy: 'Privacy',
    admin: 'Admin',
    login: 'Login',
    download: 'Download',
    language: 'EN',
  },
  hero: { title: '', subtitle: '', cta: '', ctaSecondary: '' },
  features: { title: '', items: [], gridTitle: '', gridSubtitle: '', grid: [] },
  showcase: { title: '', description: '', caption: '', sectionTitle: '', sectionSubtitle: '' },
  download: {
    title: '',
    subtitle: '',
    appStore: '',
    googlePlay: '',
    appStorePrefix: '',
    googlePlayPrefix: '',
  },
  chatShowcase: { title: '', subtitle: '', bullets: [], messages: [] },
  mapsShowcase: { title: '', subtitle: '', bullets: [] },
  faq: { title: '', items: [] },
  support: {
    title: '',
    subtitle: '',
    faq: [],
    contact: {
      title: '',
      namePlaceholder: '',
      emailPlaceholder: '',
      messagePlaceholder: '',
      submit: '',
      sending: '',
      success: '',
      error: '',
    },
  },
  privacy: { title: '' },
  footer: {
    copyright: '(c) 2025 Musaium',
    madeBy: 'Made by InnovMind',
    links: { privacy: 'Privacy Policy', support: 'Help' },
  },
  resetPassword: {} as Dictionary['resetPassword'],
  verifyEmail: {} as Dictionary['verifyEmail'],
  confirmEmailChange: {} as Dictionary['confirmEmailChange'],
  admin: {} as Dictionary['admin'],
};

// ============================================================================
// Button — variant rendering
// ============================================================================

describe('Button — variant rendering', () => {
  // pins: primary variant uses bg-primary-500 (the brand fill — distinct from secondary bg-primary-100)
  it('primary variant carries the primary background class', () => {
    const { getByRole } = render(<Button variant="primary">Primary</Button>);
    const btn = getByRole('button', { name: 'Primary' });
    expect(btn.className).toContain('bg-primary-500');
  });

  // pins: secondary sm renders the secondary background AND the sm padding class
  it('secondary sm variant emits both variant and size classes', () => {
    const { getByRole } = render(
      <Button variant="secondary" size="sm">
        Small Secondary
      </Button>,
    );
    const btn = getByRole('button', { name: 'Small Secondary' });
    // secondary → bg-primary-100; sm → px-3
    expect(btn.className).toContain('bg-primary-100');
    expect(btn.className).toContain('px-3');
  });

  // pins: outline lg renders the border class AND the lg padding class, distinct from sm/md
  it('outline lg variant emits both variant and size classes', () => {
    const { getByRole } = render(
      <Button variant="outline" size="lg">
        Large Outline
      </Button>,
    );
    const btn = getByRole('button', { name: 'Large Outline' });
    // outline → border border-primary-300; lg → px-7
    expect(btn.className).toContain('border');
    expect(btn.className).toContain('px-7');
  });
});

// ============================================================================
// StoreButton — store target
// ============================================================================

describe('StoreButton — store target', () => {
  // pins: apple variant renders an anchor pointing to the provided href
  it('apple variant renders an anchor with the given href', () => {
    const { getByRole } = render(
      <StoreButton
        store="apple"
        label="App Store"
        subLabel="Download on the"
        href="https://apps.apple.com/app/x"
      />,
    );
    const link = getByRole('link');
    expect(link.getAttribute('href')).toContain('apple.com');
  });

  // pins: google variant renders an anchor pointing to a Play Store URL
  it('google variant renders an anchor with the given href', () => {
    const { getByRole } = render(
      <StoreButton
        store="google"
        label="Google Play"
        subLabel="Get it on"
        href="https://play.google.com/store/apps/details?id=x"
      />,
    );
    const link = getByRole('link');
    expect(link.getAttribute('href')).toContain('google');
  });
});

// ============================================================================
// Footer — content rendering
// ============================================================================

describe('Footer — content rendering', () => {
  // pins: copyright string from the dictionary survives rendering
  it('renders the copyright text from the dictionary', () => {
    const { getByText } = render(<Footer dict={mockDict} locale="en" />);
    expect(getByText(/2025 Musaium/i)).toBeTruthy();
  });
});

// ============================================================================
// Header — navigation links
// ============================================================================

describe('Header — navigation links', () => {
  // pins: nav exposes both Home and Support links
  it('renders both home and support nav links', () => {
    const { getAllByRole } = render(<Header dict={mockDict} locale="en" />);
    const links = getAllByRole('link');
    const hrefs = links.map((l) => l.getAttribute('href') ?? '');
    // home link goes to /en
    expect(hrefs.some((h) => h === '/en')).toBe(true);
    // support link goes to /en/support
    expect(hrefs.some((h) => h.includes('/support'))).toBe(true);
  });
});
