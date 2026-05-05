import { getDictionary, type Locale } from '@/lib/i18n';
import { getAlternates, getOpenGraph } from '@/lib/seo';
import type { Metadata } from 'next';
import ScrollProgress from '@/components/marketing/ScrollProgress';
import FAQSection from '@/components/marketing/FAQSection';
import { StorySection } from '@/components/marketing/StorySection';
import LandingJsonLd from '@/components/marketing/LandingJsonLd';
import LandingSvgFilters from '@/components/marketing/LandingSvgFilters';
import LandingHero from '@/components/marketing/LandingHero';
import LandingAppPreview from '@/components/marketing/LandingAppPreview';
import LandingSteps from '@/components/marketing/LandingSteps';
import LandingChatShowcase from '@/components/marketing/LandingChatShowcase';
import LandingMapsShowcase from '@/components/marketing/LandingMapsShowcase';
import LandingFeatureGrid from '@/components/marketing/LandingFeatureGrid';
import LandingDownloadCTA from '@/components/marketing/LandingDownloadCTA';

interface LandingPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: LandingPageProps): Promise<Metadata> {
  const { locale } = await params;
  const dict = await getDictionary(locale as Locale);
  return {
    title: dict.metadata.title,
    description: dict.metadata.description,
    alternates: getAlternates(locale),
    openGraph: { ...getOpenGraph(locale), description: dict.metadata.description },
  };
}

export default async function LandingPage({ params }: LandingPageProps) {
  const { locale } = await params;
  const dict = await getDictionary(locale as Locale);
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://musaium.com';

  return (
    <>
      <ScrollProgress />
      <LandingJsonLd
        locale={locale}
        baseUrl={baseUrl}
        description={dict.metadata.description}
        faqItems={dict.faq.items}
      />
      <LandingSvgFilters />

      <LandingHero dict={dict.hero} />

      <StorySection
        title={dict.landing.story.title}
        subtitle={dict.landing.story.subtitle}
        steps={dict.landing.story.steps}
      />

      <LandingAppPreview dict={dict.showcase} />
      <LandingSteps dict={dict.features} />
      <LandingChatShowcase dict={dict.chatShowcase} />
      <LandingMapsShowcase dict={dict.mapsShowcase} />
      <LandingFeatureGrid dict={dict.features} />

      <FAQSection title={dict.faq.title} items={dict.faq.items} />

      <LandingDownloadCTA dict={dict.download} />
    </>
  );
}
