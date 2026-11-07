import { getDictionary, type Locale } from '@/lib/i18n';
import { LegalSections } from '@/components/shared/LegalSections';
import { getAlternates, getOpenGraph } from '@/lib/seo';
import { getPrivacyContent } from '@/lib/privacy-content';
import type { Metadata } from 'next';

interface PrivacyPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PrivacyPageProps): Promise<Metadata> {
  const { locale } = await params;
  const dict = await getDictionary(locale as Locale);
  return {
    title: dict.privacy.title,
    alternates: getAlternates(locale, '/privacy'),
    openGraph: getOpenGraph(locale),
  };
}

export default async function PrivacyPage({ params }: PrivacyPageProps) {
  const { locale } = await params;
  const dict = await getDictionary(locale as Locale);
  const privacy = getPrivacyContent(locale);

  return (
    <div className="bg-white">
      <section className="bg-gradient-to-b from-primary-50 to-white py-16 text-center sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            {dict.privacy.title}
          </h1>
          <p className="mt-3 text-sm text-text-secondary">
            {privacy.version} — {privacy.lastUpdated}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <article className="prose prose-slate max-w-none">
          <LegalSections sections={privacy.sections} />
        </article>
      </section>
    </div>
  );
}
