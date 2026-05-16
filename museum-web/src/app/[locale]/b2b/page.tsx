import type { Metadata } from 'next';

import { getDictionary, type Locale } from '@/lib/i18n';
import { getAlternates, getOpenGraph } from '@/lib/seo';

import B2bContactForm from './B2bContactForm';

interface B2bPageProps {
  params: Promise<{ locale: string }>;
}

/** Generates B2B page metadata (title / description / hreflang / OG) from the locale dict. */
export async function generateMetadata({ params }: B2bPageProps): Promise<Metadata> {
  const { locale } = await params;
  const dict = await getDictionary(locale as Locale);
  return {
    title: dict.landing.b2b.metadata.title,
    description: dict.landing.b2b.metadata.description,
    alternates: getAlternates(locale, '/b2b'),
    openGraph: getOpenGraph(locale),
  };
}

/**
 * R4 B2B pitch page (W4.3). Server component, mirrors `[locale]/support/page.tsx`
 * shape: hero → problem → solution → 5 differentiators → pricing tease → contact
 * form. No fabricated pricing numbers (per project doctrine pre-launch).
 */
export default async function B2bPage({ params }: B2bPageProps) {
  const { locale } = await params;
  const dict = await getDictionary(locale as Locale);
  const b2b = dict.landing.b2b;

  return (
    <div className="bg-white">
      {/* Hero */}
      <section
        aria-labelledby="b2b-hero-title"
        className="bg-gradient-to-b from-primary-50 to-white py-16 text-center sm:py-20"
      >
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h1
            id="b2b-hero-title"
            className="text-3xl font-bold tracking-tight text-text-primary sm:text-5xl"
          >
            {b2b.hero.title}
          </h1>
          <p className="mt-4 text-lg text-text-secondary sm:text-xl">{b2b.hero.subtitle}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <a
              href="#contact"
              className="inline-flex items-center justify-center rounded-lg bg-primary-500 px-6 py-3 text-base font-medium text-white shadow-sm transition-colors hover:bg-primary-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            >
              {b2b.hero.ctaPrimary}
            </a>
            <a
              href={`/${locale}`}
              className="inline-flex items-center justify-center rounded-lg border border-primary-300 px-6 py-3 text-base font-medium text-primary-600 transition-colors hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            >
              {b2b.hero.ctaSecondary}
            </a>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section
        aria-labelledby="b2b-problem-title"
        className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16"
      >
        <h2 id="b2b-problem-title" className="text-2xl font-bold text-text-primary sm:text-3xl">
          {b2b.problem.title}
        </h2>
        <p className="mt-4 text-base text-text-secondary sm:text-lg">{b2b.problem.body}</p>
      </section>

      {/* Solution */}
      <section aria-labelledby="b2b-solution-title" className="bg-primary-50/40">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
          <h2 id="b2b-solution-title" className="text-2xl font-bold text-text-primary sm:text-3xl">
            {b2b.solution.title}
          </h2>
          <p className="mt-4 text-base text-text-secondary sm:text-lg">{b2b.solution.body}</p>
        </div>
      </section>

      {/* Differentiators */}
      <section
        aria-labelledby="b2b-differentiators-title"
        className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16"
      >
        <h2 id="b2b-differentiators-title" className="sr-only">
          {b2b.metadata.title}
        </h2>
        <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {b2b.differentiators.map((d, i) => (
            <li key={i} className="rounded-2xl border border-primary-100 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-text-primary">{d.title}</h3>
              <p className="mt-2 text-sm text-text-secondary">{d.description}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Pricing tease */}
      <section aria-labelledby="b2b-pricing-title" className="bg-primary-50/40">
        <div className="mx-auto max-w-3xl px-4 py-12 text-center sm:px-6 sm:py-16">
          <h2 id="b2b-pricing-title" className="text-2xl font-bold text-text-primary sm:text-3xl">
            {b2b.pricing.title}
          </h2>
          <p className="mt-4 text-lg text-text-secondary">{b2b.pricing.tease}</p>
          <div className="mt-6">
            <a
              href="#contact"
              className="inline-flex items-center justify-center rounded-lg bg-primary-500 px-6 py-3 text-base font-medium text-white shadow-sm transition-colors hover:bg-primary-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            >
              {b2b.pricing.contactCta}
            </a>
          </div>
        </div>
      </section>

      {/* Contact form */}
      <section
        id="contact"
        aria-labelledby="b2b-contact-title"
        className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16"
      >
        <h2
          id="b2b-contact-title"
          className="mb-3 text-center text-2xl font-bold text-text-primary sm:text-3xl"
        >
          {b2b.contact.title}
        </h2>
        <p className="mb-8 text-center text-base text-text-secondary">{b2b.contact.subtitle}</p>
        <B2bContactForm dict={b2b.contact} locale={locale as Locale} />
      </section>
    </div>
  );
}
