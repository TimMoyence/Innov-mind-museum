/**
 * T2.3 / B18 — Footer extension: terms, subprocessors, cookies (RED phase, UFR-022).
 *
 * Spec.md §3 R12 / R16 / R17 require the footer to expose three new public
 * links: `/<locale>/terms`, `/<locale>/subprocessors`, `/<locale>/cookies`.
 * Each link is read from `dict.footer.links.{terms,subprocessors,cookies}`.
 *
 * Pre-impl state (RED): these three keys do not exist on `Dictionary['footer']
 * ['links']`, and `Footer.tsx:42-73` does not render them. The first issue
 * makes the fixture type-error (caught by `pnpm lint` typecheck step); the
 * second makes the runtime assertions fail. Vitest will exit ≠ 0.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Footer from './Footer';
import type { Dictionary } from '@/lib/i18n';

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

// ---------------------------------------------------------------------------
// Fixture: a minimal Dictionary with the three new footer.links keys.
// After GREEN, `Dictionary['footer']['links']` MUST type-allow these keys.
// Pre-impl, this cast surfaces a typecheck failure (one of the two RED
// signals — see file header).
// ---------------------------------------------------------------------------
const mockDict = {
  metadata: { title: '', description: '' },
  nav: { home: '', support: '', privacy: '', admin: '', login: '', download: '', language: '' },
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
    appStoreHref: '',
    googlePlayComingSoon: '',
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
    copyright: '(c) {year} Musaium',
    madeBy: 'Made by InnovMind',
    links: {
      privacy: 'Privacy Policy',
      support: 'Help',
      accessibility: 'Accessibility',
      security: 'Security',
      b2b: 'For museums',
      // T2.3 / R12 / R16 / R17 — three new footer entries.
      terms: 'Terms of Service',
      subprocessors: 'Subprocessors',
      cookies: 'Cookies',
    },
  },
  resetPassword: {},
  verifyEmail: {},
  confirmEmailChange: {},
  landing: {},
  admin: {},
} as unknown as Dictionary;

describe('Footer — B18 / R12 / R16 / R17 link additions', () => {
  it('renders the /terms footer link with the locale-prefixed href (FR)', () => {
    render(<Footer dict={mockDict} locale="fr" />);
    const termsLink = screen.getByText('Terms of Service');
    expect(termsLink).toHaveAttribute('href', '/fr/terms');
  });

  it('renders the /subprocessors footer link with the locale-prefixed href (FR)', () => {
    render(<Footer dict={mockDict} locale="fr" />);
    const subprocessorsLink = screen.getByText('Subprocessors');
    expect(subprocessorsLink).toHaveAttribute('href', '/fr/subprocessors');
  });

  it('renders the /cookies footer link with the locale-prefixed href (FR)', () => {
    render(<Footer dict={mockDict} locale="fr" />);
    const cookiesLink = screen.getByText('Cookies');
    expect(cookiesLink).toHaveAttribute('href', '/fr/cookies');
  });

  it('renders the three new links with EN locale prefix', () => {
    render(<Footer dict={mockDict} locale="en" />);
    expect(screen.getByText('Terms of Service')).toHaveAttribute('href', '/en/terms');
    expect(screen.getByText('Subprocessors')).toHaveAttribute('href', '/en/subprocessors');
    expect(screen.getByText('Cookies')).toHaveAttribute('href', '/en/cookies');
  });

  it('preserves pre-existing public links (privacy / support / accessibility / security / b2b)', () => {
    render(<Footer dict={mockDict} locale="fr" />);
    // Regression guard: GREEN MUST NOT drop any existing footer link.
    expect(screen.getByText('Privacy Policy')).toHaveAttribute('href', '/fr/privacy');
    expect(screen.getByText('Help')).toHaveAttribute('href', '/fr/support');
    expect(screen.getByText('Accessibility')).toHaveAttribute('href', '/fr/accessibility');
    expect(screen.getByText('Security')).toHaveAttribute('href', '/fr/security');
    expect(screen.getByText('For museums')).toHaveAttribute('href', '/fr/b2b');
  });
});
