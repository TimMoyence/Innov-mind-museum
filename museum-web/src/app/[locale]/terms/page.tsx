import { getDictionary, type Locale } from '@/lib/i18n';
import { getAlternates, getOpenGraph } from '@/lib/seo';
import termsCanonical from '../../../../../museum-backend/src/shared/legal/terms-content.canonical.json';
import type { Metadata } from 'next';

interface TermsPageProps {
  params: Promise<{ locale: string }>;
}

type LegalLocale = 'en' | 'fr';

interface TermsSection {
  id: string;
  title: string;
  paragraphs: string[];
}

interface TermsLocaleContent {
  title: string;
  sections: TermsSection[];
}

interface TermsCanonical {
  version: string;
  lastUpdated: string;
  locales: Record<LegalLocale, TermsLocaleContent>;
}

const typedTerms = termsCanonical as TermsCanonical;

function pickLocale(locale: string): LegalLocale {
  return locale === 'fr' ? 'fr' : 'en';
}

export async function generateMetadata({ params }: TermsPageProps): Promise<Metadata> {
  const { locale } = await params;
  const dict = await getDictionary(locale as Locale);
  return {
    title: dict.footer.links.terms,
    alternates: getAlternates(locale, '/terms'),
    openGraph: getOpenGraph(locale),
  };
}

export default async function TermsPage({ params }: TermsPageProps) {
  const { locale } = await params;
  const loc = pickLocale(locale);
  const content = typedTerms.locales[loc];

  return (
    <div className="bg-white">
      <section className="bg-gradient-to-b from-primary-50 to-white py-16 text-center sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            {content.title}
          </h1>
          <p className="mt-3 text-sm text-text-secondary">
            {typedTerms.version} — {typedTerms.lastUpdated}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <article className="prose prose-slate max-w-none">
          {content.sections.map((section) => (
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
