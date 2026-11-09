import { LegalSections } from '@/components/shared/LegalSections';
import { footerPageMetadata } from '@/lib/seo';
import { getAccessibilityContent } from '@/lib/accessibility-content';

interface AccessibilityPageProps {
  params: Promise<{ locale: string }>;
}

export const generateMetadata = footerPageMetadata('accessibility', '/accessibility');

export default async function AccessibilityPage({ params }: AccessibilityPageProps) {
  const { locale } = await params;
  const accessibility = getAccessibilityContent(locale);

  return (
    <div className="bg-white">
      <section className="bg-gradient-to-b from-primary-50 to-white py-16 text-center sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            {accessibility.title}
          </h1>
          <p className="mt-3 text-sm text-text-secondary">
            {accessibility.version} — {accessibility.lastUpdated}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <article className="prose prose-slate max-w-none">
          <LegalSections sections={accessibility.sections} />
        </article>
      </section>
    </div>
  );
}
