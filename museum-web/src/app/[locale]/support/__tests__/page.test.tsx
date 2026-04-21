import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Dictionary } from '@/lib/i18n';

// ── Module mocks ──────────────────────────────────────────────────────────────

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
import SupportPage from '../page';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const supportEN: Dictionary['support'] = {
  title: 'Help Center',
  subtitle: 'Find answers to your questions or contact us directly.',
  faq: [
    { question: 'Is the app free?', answer: 'Yes, Musaium is free.' },
    { question: 'Which museums are compatible?', answer: 'All museums.' },
    { question: 'Is my data protected?', answer: 'Absolutely. See our privacy policy.' },
    { question: 'How do I contact support?', answer: 'Use the form below.' },
  ],
  contact: {
    title: 'Contact us',
    namePlaceholder: 'Your name',
    emailPlaceholder: 'Your email',
    messagePlaceholder: 'Describe your question or issue...',
    submit: 'Send',
    sending: 'Sending...',
    success: 'Thank you! Message sent.',
    error: 'Unable to send right now.',
  },
};

const supportFR: Dictionary['support'] = {
  title: "Centre d'aide",
  subtitle: 'Trouvez des réponses à vos questions ou contactez-nous directement.',
  faq: [
    { question: "L'application est-elle gratuite ?", answer: 'Oui, Musaium est gratuit.' },
    { question: 'Quels musées sont compatibles ?', answer: 'Tous les musées.' },
    { question: 'Mes données sont-elles protégées ?', answer: 'Absolument.' },
    { question: 'Comment contacter le support ?', answer: 'Utilisez le formulaire ci-dessous.' },
  ],
  contact: {
    title: 'Nous contacter',
    namePlaceholder: 'Votre nom',
    emailPlaceholder: 'Votre email',
    messagePlaceholder: 'Décrivez votre question ou problème...',
    submit: 'Envoyer',
    sending: 'Envoi...',
    success: 'Merci ! Message envoyé.',
    error: "Impossible d'envoyer.",
  },
};

function makeDict(support: Dictionary['support']): Dictionary {
  return { support } as unknown as Dictionary;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SupportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page title and subtitle (EN)', async () => {
    vi.mocked(getDictionary).mockResolvedValue(makeDict(supportEN));

    const jsx = await SupportPage({ params: Promise.resolve({ locale: 'en' }) });
    render(jsx);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Help Center');
    expect(
      screen.getByText('Find answers to your questions or contact us directly.'),
    ).toBeInTheDocument();
  });

  it('renders all FAQ questions', async () => {
    vi.mocked(getDictionary).mockResolvedValue(makeDict(supportEN));

    const jsx = await SupportPage({ params: Promise.resolve({ locale: 'en' }) });
    render(jsx);

    expect(screen.getByText('Is the app free?')).toBeInTheDocument();
    expect(screen.getByText('Which museums are compatible?')).toBeInTheDocument();
    expect(screen.getByText('Is my data protected?')).toBeInTheDocument();
    expect(screen.getByText('How do I contact support?')).toBeInTheDocument();
  });

  it('renders FAQ answers', async () => {
    vi.mocked(getDictionary).mockResolvedValue(makeDict(supportEN));

    const jsx = await SupportPage({ params: Promise.resolve({ locale: 'en' }) });
    render(jsx);

    expect(screen.getByText('Yes, Musaium is free.')).toBeInTheDocument();
  });

  it('renders contact form section with heading', async () => {
    vi.mocked(getDictionary).mockResolvedValue(makeDict(supportEN));

    const jsx = await SupportPage({ params: Promise.resolve({ locale: 'en' }) });
    render(jsx);

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Contact us');
    expect(screen.getByPlaceholderText('Your name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('renders French page title and subtitle (FR)', async () => {
    vi.mocked(getDictionary).mockResolvedValue(makeDict(supportFR));

    const jsx = await SupportPage({ params: Promise.resolve({ locale: 'fr' }) });
    render(jsx);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Centre d'aide");
    expect(
      screen.getByText('Trouvez des réponses à vos questions ou contactez-nous directement.'),
    ).toBeInTheDocument();
  });

  it('renders French FAQ questions', async () => {
    vi.mocked(getDictionary).mockResolvedValue(makeDict(supportFR));

    const jsx = await SupportPage({ params: Promise.resolve({ locale: 'fr' }) });
    render(jsx);

    expect(screen.getByText("L'application est-elle gratuite ?")).toBeInTheDocument();
    expect(screen.getByText('Quels musées sont compatibles ?')).toBeInTheDocument();
  });

  it('renders French contact form', async () => {
    vi.mocked(getDictionary).mockResolvedValue(makeDict(supportFR));

    const jsx = await SupportPage({ params: Promise.resolve({ locale: 'fr' }) });
    render(jsx);

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Nous contacter');
    expect(screen.getByPlaceholderText('Votre nom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeInTheDocument();
  });
});
