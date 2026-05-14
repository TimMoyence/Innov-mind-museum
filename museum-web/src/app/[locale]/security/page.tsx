import { type Locale } from '@/lib/i18n';
import { getAlternates, getOpenGraph } from '@/lib/seo';
import { getSecurityContent } from '@/lib/security-content';
import type { Metadata } from 'next';

interface SecurityPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: SecurityPageProps): Promise<Metadata> {
  const { locale } = await params;
  const security = getSecurityContent(locale as Locale);
  return {
    title: security.title,
    description: security.subtitle,
    alternates: getAlternates(locale, '/security'),
    openGraph: getOpenGraph(locale),
  };
}

export default async function SecurityPage({ params }: SecurityPageProps) {
  const { locale } = await params;
  const security = getSecurityContent(locale as Locale);

  return (
    <div className="bg-white">
      <section className="bg-gradient-to-b from-primary-50 to-white py-16 text-center sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            {security.title}
          </h1>
          <p className="mt-4 text-base text-text-secondary">{security.subtitle}</p>
          <p className="mt-3 text-sm text-text-tertiary">
            {security.version} — {security.lastUpdated}
          </p>
          <p className="mt-6 text-sm text-text-secondary">
            <a
              href="mailto:security@musaium.com"
              className="font-semibold text-primary-600 hover:underline"
            >
              security@musaium.com
            </a>
            {' · '}
            <a href="/.well-known/security.txt" className="text-primary-600 hover:underline">
              security.txt
            </a>
            {' · '}
            <a
              href="https://github.com/InnovMind/musaium/blob/main/SECURITY.md"
              className="text-primary-600 hover:underline"
              rel="noopener"
            >
              SECURITY.md
            </a>
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <article className="prose prose-slate max-w-none">
          {security.sections.map((section) => (
            <div key={section.id} id={section.id} className="mb-10">
              <h2 className="text-xl font-semibold text-text-primary">{section.title}</h2>
              {section.paragraphs.map((paragraph, i) => (
                <p key={i} className="mt-3 text-text-secondary leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </div>
          ))}
        </article>
      </section>
    </div>
  );
}
