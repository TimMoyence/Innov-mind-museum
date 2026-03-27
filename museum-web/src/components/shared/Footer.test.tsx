import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Footer from './Footer';
import type { Dictionary } from '@/lib/i18n';

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
  metadata: { title: '', description: '' },
  nav: { home: '', support: '', privacy: '', admin: '', login: '', download: '', language: '' },
  hero: { title: '', subtitle: '', cta: '', ctaSecondary: '' },
  features: { title: '', items: [], gridTitle: '', gridSubtitle: '', grid: [] },
  showcase: { title: '', description: '', caption: '' },
  reviews: { title: '', subtitle: '', cta: '', ctaSubtitle: '', leaveReview: '', stars: '' },
  download: { title: '', subtitle: '', appStore: '', googlePlay: '', appStorePrefix: '', googlePlayPrefix: '' },
  support: { title: '', subtitle: '', faq: [], contact: { title: '', namePlaceholder: '', emailPlaceholder: '', messagePlaceholder: '', submit: '', success: '' } },
  privacy: { title: '' },
  footer: {
    copyright: '(c) {year} Musaium',
    madeBy: 'Made by InnovMind',
    links: { privacy: 'Privacy Policy', support: 'Help' },
  },
  admin: {} as Dictionary['admin'],
};

describe('Footer', () => {
  it('renders the logo image', () => {
    render(<Footer dict={mockDict} locale="fr" />);
    expect(screen.getByAltText('Musaium')).toBeInTheDocument();
  });

  it('renders copyright with current year', () => {
    render(<Footer dict={mockDict} locale="fr" />);
    const year = new Date().getFullYear();
    expect(screen.getByText(`(c) ${year} Musaium`)).toBeInTheDocument();
  });

  it('renders madeBy text', () => {
    render(<Footer dict={mockDict} locale="fr" />);
    expect(screen.getByText('Made by InnovMind')).toBeInTheDocument();
  });

  it('renders privacy and support links', () => {
    render(<Footer dict={mockDict} locale="fr" />);
    const privacyLink = screen.getByText('Privacy Policy');
    const supportLink = screen.getByText('Help');
    expect(privacyLink).toHaveAttribute('href', '/fr/privacy');
    expect(supportLink).toHaveAttribute('href', '/fr/support');
  });

  it('renders footer navigation landmark', () => {
    render(<Footer dict={mockDict} locale="fr" />);
    expect(screen.getByLabelText('Footer')).toBeInTheDocument();
  });
});
