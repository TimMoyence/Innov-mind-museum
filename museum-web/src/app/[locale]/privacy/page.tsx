import { getDictionary, type Locale } from '@/lib/i18n';
import type { Metadata } from 'next';

interface PrivacyPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PrivacyPageProps): Promise<Metadata> {
  const { locale } = await params;
  const dict = await getDictionary(locale as Locale);
  return { title: dict.privacy.title };
}

export default async function PrivacyPage({ params }: PrivacyPageProps) {
  const { locale } = await params;
  const dict = await getDictionary(locale as Locale);

  return (
    <div className="bg-white">
      <section className="bg-gradient-to-b from-primary-50 to-white py-16 text-center sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            {dict.privacy.title}
          </h1>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <article className="prose prose-slate max-w-none">
          {/* Placeholder structure — real content will be migrated from docs/privacy-policy.html */}
          <h2>1. Introduction</h2>
          <p className="text-text-secondary">
            Content will be migrated from the existing privacy policy document.
          </p>

          <h2>2. Data Collection</h2>
          <p className="text-text-secondary">
            Details about data collection practices.
          </p>

          <h2>3. Data Usage</h2>
          <p className="text-text-secondary">
            How collected data is used.
          </p>

          <h2>4. Data Storage &amp; Security</h2>
          <p className="text-text-secondary">
            Information about data storage and security measures.
          </p>

          <h2>5. User Rights</h2>
          <p className="text-text-secondary">
            Your rights regarding your personal data.
          </p>

          <h2>6. Contact</h2>
          <p className="text-text-secondary">
            How to reach us regarding privacy concerns.
          </p>
        </article>
      </section>
    </div>
  );
}
