import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import Button from '@/components/ui/Button';
import StoreButton from '@/components/marketing/StoreButton';
import Footer from '@/components/shared/Footer';
import Header from '@/components/shared/Header';
import type { Dictionary } from '@/lib/i18n';

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
    <img alt={alt} {...props} />
  ),
}));

const mockDict: Dictionary = {
  a11y: { skipToContent: 'Skip to main content' },
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
      errorEmail: '',
      errorName: '',
      errorMessage: '',
    },
  },
  privacy: { title: '' },
  footer: {
    copyright: '(c) 2025 Musaium',
    madeBy: 'Made by InnovMind',
    links: {
      privacy: 'Privacy Policy',
      support: 'Help',
      accessibility: 'Accessibility',
      security: 'Security',
      b2b: 'For museums',
      terms: 'Terms of Service',
      subprocessors: 'Subprocessors',
      cookies: 'Cookies',
    },
  },
  resetPassword: {} as Dictionary['resetPassword'],
  verifyEmail: {} as Dictionary['verifyEmail'],
  confirmEmailChange: {} as Dictionary['confirmEmailChange'],
  landing: {} as Dictionary['landing'],
  admin: {} as Dictionary['admin'],
};

describe('Button — variant rendering', () => {
  it('primary variant carries the primary background class', () => {
    const { getByRole } = render(<Button variant="primary">Primary</Button>);
    const btn = getByRole('button', { name: 'Primary' });
    expect(btn.className).toContain('bg-primary-500');
  });

  it('secondary sm variant emits both variant and size classes', () => {
    const { getByRole } = render(
      <Button variant="secondary" size="sm">
        Small Secondary
      </Button>,
    );
    const btn = getByRole('button', { name: 'Small Secondary' });
    expect(btn.className).toContain('bg-primary-100');
    expect(btn.className).toContain('px-3');
  });

  it('outline lg variant emits both variant and size classes', () => {
    const { getByRole } = render(
      <Button variant="outline" size="lg">
        Large Outline
      </Button>,
    );
    const btn = getByRole('button', { name: 'Large Outline' });
    expect(btn.className).toContain('border');
    expect(btn.className).toContain('px-7');
  });
});

describe('StoreButton — store target', () => {
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

describe('Footer — content rendering', () => {
  it('renders the copyright text from the dictionary', () => {
    const { getByText } = render(<Footer dict={mockDict} locale="en" />);
    expect(getByText(/2025 Musaium/i)).toBeTruthy();
  });
});

describe('Header — navigation links', () => {
  it('renders both home and support nav links', () => {
    const { getAllByRole } = render(<Header dict={mockDict} locale="en" />);
    const links = getAllByRole('link');
    const hrefs = links.map((l) => l.getAttribute('href') ?? '');
    expect(hrefs.some((h) => h === '/en')).toBe(true);
    expect(hrefs.some((h) => h.includes('/support'))).toBe(true);
  });
});
