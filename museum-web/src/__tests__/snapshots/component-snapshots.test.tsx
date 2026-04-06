/**
 * Snapshot tests for museum-web marketing and shared components.
 *
 * These capture the rendered HTML structure so regressions in layout or
 * element hierarchy are caught during review.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import Button from '@/components/ui/Button';
import FeatureCard from '@/components/marketing/FeatureCard';
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
  reviews: { title: '', subtitle: '', cta: '', ctaSubtitle: '', leaveReview: '', stars: '' },
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
  multiDevice: { title: '', subtitle: '' },
  stats: { title: '', items: [] },
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
  admin: {} as Dictionary['admin'],
};

// ============================================================================
// Button snapshots
// ============================================================================

describe('Button snapshots', () => {
  it('primary variant matches snapshot', () => {
    const { container } = render(<Button variant="primary">Primary</Button>);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('secondary variant matches snapshot', () => {
    const { container } = render(
      <Button variant="secondary" size="sm">
        Small Secondary
      </Button>,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('outline variant matches snapshot', () => {
    const { container } = render(
      <Button variant="outline" size="lg">
        Large Outline
      </Button>,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });
});

// ============================================================================
// FeatureCard snapshots
// ============================================================================

describe('FeatureCard snapshots', () => {
  it('matches snapshot with icon, title, and description', () => {
    const { container } = render(
      <FeatureCard
        icon={<span data-testid="icon">IC</span>}
        title="AI Recognition"
        description="Point your camera at any artwork"
      />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });
});

// ============================================================================
// StoreButton snapshots
// ============================================================================

describe('StoreButton snapshots', () => {
  it('Apple store variant matches snapshot', () => {
    const { container } = render(
      <StoreButton store="apple" label="App Store" subLabel="Download on the" />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('Google Play variant matches snapshot', () => {
    const { container } = render(
      <StoreButton store="google" label="Google Play" subLabel="Get it on" />,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });
});

// ============================================================================
// Header snapshot
// ============================================================================

describe('Header snapshots', () => {
  it('matches snapshot with nav links', () => {
    const { container } = render(<Header dict={mockDict} locale="en" />);
    expect(container.innerHTML).toMatchSnapshot();
  });
});

// ============================================================================
// Footer snapshot
// ============================================================================

describe('Footer snapshots', () => {
  it('matches snapshot with links and copyright', () => {
    const { container } = render(<Footer dict={mockDict} locale="en" />);
    expect(container.innerHTML).toMatchSnapshot();
  });
});
