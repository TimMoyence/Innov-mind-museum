import { getDictionary, type Locale } from '@/lib/i18n';
import { getAlternates, getOpenGraph } from '@/lib/seo';
import type { Metadata } from 'next';
import ContactForm from './ContactForm';

interface SupportPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: SupportPageProps): Promise<Metadata> {
  const { locale } = await params;
  const dict = await getDictionary(locale as Locale);
  return {
    title: dict.support.title,
    alternates: getAlternates(locale, '/support'),
    openGraph: getOpenGraph(locale),
  };
}

export default async function SupportPage({ params }: SupportPageProps) {
  const { locale } = await params;
  const dict = await getDictionary(locale as Locale);

  return (
    <div className="bg-white">
      {/* Header */}
      <section className="bg-gradient-to-b from-primary-50 to-white py-16 text-center sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            {dict.support.title}
          </h1>
          <p className="mt-4 text-lg text-text-secondary">{dict.support.subtitle}</p>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="space-y-4">
          {dict.support.faq.map((item, i) => (
            <details
              key={i}
              className="group rounded-xl border border-primary-100 bg-surface-elevated open:border-primary-300"
            >
              <summary className="flex cursor-pointer items-center justify-between px-6 py-4 text-left font-medium text-text-primary transition-colors hover:text-primary-600 [&::-webkit-details-marker]:hidden">
                <span>{item.question}</span>
                <svg
                  className="h-5 w-5 shrink-0 text-text-muted transition-transform group-open:rotate-180"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </summary>
              <div className="px-6 pb-5 text-text-secondary">{item.answer}</div>
            </details>
          ))}
        </div>
      </section>

      {/* Contact Form */}
      <section className="mx-auto max-w-xl px-4 pb-20 sm:px-6">
        <h2 className="mb-8 text-center text-2xl font-bold text-text-primary">
          {dict.support.contact.title}
        </h2>
        <ContactForm dict={dict.support.contact} />
      </section>
    </div>
  );
}
