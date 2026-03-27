import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Header from './Header';
import type { Dictionary } from '@/lib/i18n';

// Mock Next.js modules
vi.mock('next/navigation', () => ({
  usePathname: () => '/fr',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
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
    language: 'FR',
  },
  hero: { title: '', subtitle: '', cta: '', ctaSecondary: '' },
  features: { title: '', items: [], gridTitle: '', gridSubtitle: '', grid: [] },
  showcase: { title: '', description: '', caption: '' },
  reviews: { title: '', subtitle: '', cta: '', ctaSubtitle: '', leaveReview: '', stars: '' },
  download: { title: '', subtitle: '', appStore: '', googlePlay: '', appStorePrefix: '', googlePlayPrefix: '' },
  support: { title: '', subtitle: '', faq: [], contact: { title: '', namePlaceholder: '', emailPlaceholder: '', messagePlaceholder: '', submit: '', success: '' } },
  privacy: { title: '' },
  footer: { copyright: '', madeBy: '', links: { privacy: '', support: '' } },
  admin: {} as Dictionary['admin'],
};

describe('Header', () => {
  it('renders the Musaium brand name', () => {
    render(<Header dict={mockDict} locale="fr" />);
    expect(screen.getByText('Musaium')).toBeInTheDocument();
  });

  it('renders navigation links', () => {
    render(<Header dict={mockDict} locale="fr" />);
    expect(screen.getAllByText('Home').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Support').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Privacy').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the download CTA button', () => {
    render(<Header dict={mockDict} locale="fr" />);
    expect(screen.getAllByText('Download').length).toBeGreaterThanOrEqual(1);
  });

  it('toggles mobile menu on hamburger click', () => {
    render(<Header dict={mockDict} locale="fr" />);
    const hamburger = screen.getByLabelText('Toggle menu');

    // Menu should not be visible initially (mobile nav has aria-label "Mobile")
    expect(screen.queryByLabelText('Mobile')).not.toBeInTheDocument();

    // Click hamburger
    fireEvent.click(hamburger);
    expect(screen.getByLabelText('Mobile')).toBeInTheDocument();

    // Click again to close
    fireEvent.click(hamburger);
    expect(screen.queryByLabelText('Mobile')).not.toBeInTheDocument();
  });
});
