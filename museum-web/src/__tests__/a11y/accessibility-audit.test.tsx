/**
 * Accessibility tests for museum-web components.
 *
 * Uses @testing-library/react queries that map to ARIA roles and attributes,
 * ensuring components expose proper landmarks, labels, and roles.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Header from '@/components/shared/Header';
import Footer from '@/components/shared/Footer';
import Button from '@/components/ui/Button';
import FeatureCard from '@/components/marketing/FeatureCard';
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
  metadata: { title: 'Musaium', description: 'desc' },
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
    copyright: '(c) {year} Musaium',
    madeBy: 'Made by InnovMind',
    links: { privacy: 'Privacy Policy', support: 'Help' },
  },
  resetPassword: {} as Dictionary['resetPassword'],
  admin: {} as Dictionary['admin'],
};

// ============================================================================
// Header accessibility
// ============================================================================

describe('Header a11y', () => {
  it('has a main navigation landmark with aria-label', () => {
    render(<Header dict={mockDict} locale="en" />);
    expect(screen.getByLabelText('Main')).toBeInTheDocument();
    expect(screen.getByLabelText('Main').tagName).toBe('NAV');
  });

  it('logo image has meaningful alt text', () => {
    render(<Header dict={mockDict} locale="en" />);
    expect(screen.getByAltText('Musaium')).toBeInTheDocument();
  });

  it('hamburger button has aria-label and aria-expanded', () => {
    render(<Header dict={mockDict} locale="en" />);
    const hamburger = screen.getByLabelText('Toggle menu');
    expect(hamburger).toBeInTheDocument();
    expect(hamburger).toHaveAttribute('aria-expanded', 'false');
  });

  it('hamburger aria-expanded updates on toggle', () => {
    render(<Header dict={mockDict} locale="en" />);
    const hamburger = screen.getByLabelText('Toggle menu');
    fireEvent.click(hamburger);
    expect(hamburger).toHaveAttribute('aria-expanded', 'true');
  });

  it('mobile menu nav has aria-label "Mobile"', () => {
    render(<Header dict={mockDict} locale="en" />);
    fireEvent.click(screen.getByLabelText('Toggle menu'));
    expect(screen.getByLabelText('Mobile')).toBeInTheDocument();
    expect(screen.getByLabelText('Mobile').tagName).toBe('NAV');
  });
});

// ============================================================================
// Footer accessibility
// ============================================================================

describe('Footer a11y', () => {
  it('has a footer navigation landmark with aria-label', () => {
    render(<Footer dict={mockDict} locale="en" />);
    expect(screen.getByLabelText('Footer')).toBeInTheDocument();
    expect(screen.getByLabelText('Footer').tagName).toBe('NAV');
  });

  it('logo image has alt text', () => {
    render(<Footer dict={mockDict} locale="en" />);
    expect(screen.getByAltText('Musaium')).toBeInTheDocument();
  });
});

// ============================================================================
// Button accessibility
// ============================================================================

describe('Button a11y', () => {
  it('renders as a button element with correct role', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('disabled button is not interactive (aria-disabled via disabled prop)', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('has visible focus indicator class (focus-visible:outline)', () => {
    render(<Button>Focus</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('focus-visible:outline');
  });
});

// ============================================================================
// FeatureCard accessibility
// ============================================================================

describe('FeatureCard a11y', () => {
  it('title uses an h3 heading element', () => {
    render(
      <FeatureCard
        icon={<span>IC</span>}
        title="Smart Recognition"
        description="Identify artworks"
      />,
    );
    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading).toBeInTheDocument();
    expect(heading.textContent).toBe('Smart Recognition');
  });

  it('description text is present and readable', () => {
    render(
      <FeatureCard
        icon={<span>IC</span>}
        title="Title"
        description="A detailed description of the feature"
      />,
    );
    expect(screen.getByText('A detailed description of the feature')).toBeInTheDocument();
  });
});
