/**
 * R4 RED tests — B2B landing page (server component).
 *
 * Pins R4 §1 EARS R1/R2/R3/R4 + AC1/AC2 down BEFORE implementation:
 * - page renders 7 sections (Hero / Problem / Solution / Differentiators(5) / Pricing / Contact / Footer-reuse)
 * - hero/problem/solution titles + 5 differentiators in order via i18n keys
 * - pricing tease contains the canonical "Sur devis" / "Custom pricing" copy
 * - contact form is rendered (via the <form> landmark)
 *
 * These tests MUST FAIL at baseline `bc49afee` — the page file doesn't exist
 * yet and the dictionary key `dict.landing.b2b.*` is not declared on the
 * `Dictionary` type. green-code-agent makes them pass in T2.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Dictionary } from '@/lib/i18n';

vi.mock('@/lib/i18n', () => ({
  getDictionary: vi.fn(),
  defaultLocale: 'fr',
  locales: ['fr', 'en'] as const,
}));

vi.mock('@/lib/seo', () => ({
  getAlternates: vi.fn(() => ({})),
  getOpenGraph: vi.fn(() => ({})),
}));

import { getDictionary } from '@/lib/i18n';
import B2bPage from '../page';

// ── i18n fixtures (mirror docs/roadmap-night/specs/R4.md §3.5 shape) ─────────

interface B2bDictShape {
  metadata: { title: string; description: string };
  hero: { title: string; subtitle: string; ctaPrimary: string; ctaSecondary: string };
  problem: { title: string; body: string };
  solution: { title: string; body: string };
  differentiators: { title: string; description: string }[];
  pricing: { title: string; tease: string; contactCta: string };
  contact: {
    title: string;
    subtitle: string;
    fieldEmail: string;
    fieldName: string;
    fieldMuseum: string;
    fieldRole: string;
    roleOptions: { director: string; curator: string; digital: string; other: string };
    fieldMessage: string;
    fieldConsent: string;
    consentPrivacyLink: string;
    submit: string;
    sending: string;
    success: string;
    error: string;
    errorValidation: string;
  };
}

const b2bEN: B2bDictShape = {
  metadata: { title: 'Musaium for museums', description: 'Conversational AI for cultural sites' },
  hero: {
    title: 'Conversational AI built for museums',
    subtitle: 'Multilingual companion for your visitors, on-site and beyond.',
    ctaPrimary: 'Talk to us',
    ctaSecondary: 'See the visitor app',
  },
  problem: { title: 'Audio guides are stuck in 2005', body: 'Costly hardware, limited languages.' },
  solution: { title: 'A companion in every pocket', body: 'Powered by your collection data.' },
  differentiators: [
    { title: 'Multilingual conversational AI', description: 'Eight languages on day one.' },
    { title: 'Visual similarity engine', description: 'Snap and explore comparable works.' },
    { title: 'Multi-museum, single visitor', description: 'One app, every venue.' },
    { title: 'Voice-first, hands-free', description: 'Walk and talk, never tap.' },
    {
      title: 'Designed for before, during, and after the visit',
      description: 'Future-ready companion across the journey.',
    },
  ],
  pricing: {
    title: 'Pricing',
    tease: 'Custom pricing tailored to museum size',
    contactCta: 'Request a quote',
  },
  contact: {
    title: 'Get in touch',
    subtitle: 'Tell us about your museum.',
    fieldEmail: 'Email',
    fieldName: 'Your name',
    fieldMuseum: 'Museum name',
    fieldRole: 'Your role',
    roleOptions: {
      director: 'Director',
      curator: 'Curator',
      digital: 'Digital lead',
      other: 'Other',
    },
    fieldMessage: 'Message',
    fieldConsent: 'I agree to be contacted about Musaium.',
    consentPrivacyLink: 'Privacy policy',
    submit: 'Send',
    sending: 'Sending...',
    success: 'Thanks — we will reply within two business days.',
    error: 'Unable to send right now. Please retry.',
    errorValidation: 'Please complete every required field.',
  },
};

function makeDict(b2b: B2bDictShape): Dictionary {
  return { landing: { b2b } } as unknown as Dictionary;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('B2bPage (R4 §1 R1-R4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders hero title from dict.landing.b2b.hero.title (EN)', async () => {
    vi.mocked(getDictionary).mockResolvedValue(makeDict(b2bEN));
    const jsx = await B2bPage({ params: Promise.resolve({ locale: 'en' }) });
    render(jsx);
    expect(screen.getByRole('heading', { level: 1, name: b2bEN.hero.title })).toBeInTheDocument();
  });

  it('renders problem section title', async () => {
    vi.mocked(getDictionary).mockResolvedValue(makeDict(b2bEN));
    const jsx = await B2bPage({ params: Promise.resolve({ locale: 'en' }) });
    render(jsx);
    expect(screen.getByText(b2bEN.problem.title)).toBeInTheDocument();
  });

  it('renders solution section title', async () => {
    vi.mocked(getDictionary).mockResolvedValue(makeDict(b2bEN));
    const jsx = await B2bPage({ params: Promise.resolve({ locale: 'en' }) });
    render(jsx);
    expect(screen.getByText(b2bEN.solution.title)).toBeInTheDocument();
  });

  it('renders all 5 differentiator titles in spec order (R3)', async () => {
    vi.mocked(getDictionary).mockResolvedValue(makeDict(b2bEN));
    const jsx = await B2bPage({ params: Promise.resolve({ locale: 'en' }) });
    const { container } = render(jsx);

    const text = container.textContent;
    const rendered = b2bEN.differentiators.map((d) => {
      const el = screen.getByText(d.title);
      return { title: d.title, offset: text.indexOf(d.title), el };
    });

    expect(rendered).toHaveLength(5);
    const offsets = rendered.map((r) => r.offset);
    const sorted = [...offsets].sort((a, b) => a - b);
    expect(offsets).toEqual(sorted);
  });

  it('renders pricing tease containing the canonical EN copy (R4)', async () => {
    vi.mocked(getDictionary).mockResolvedValue(makeDict(b2bEN));
    const jsx = await B2bPage({ params: Promise.resolve({ locale: 'en' }) });
    render(jsx);
    expect(screen.getByText(/Custom pricing tailored to museum size/i)).toBeInTheDocument();
  });

  it('renders the contact form (a <form> element is present)', async () => {
    vi.mocked(getDictionary).mockResolvedValue(makeDict(b2bEN));
    const jsx = await B2bPage({ params: Promise.resolve({ locale: 'en' }) });
    const { container } = render(jsx);
    expect(container.querySelector('form')).not.toBeNull();
  });

  it('renders the contact section heading (linking the form to a section)', async () => {
    vi.mocked(getDictionary).mockResolvedValue(makeDict(b2bEN));
    const jsx = await B2bPage({ params: Promise.resolve({ locale: 'en' }) });
    render(jsx);
    expect(screen.getByRole('heading', { name: b2bEN.contact.title })).toBeInTheDocument();
  });
});
