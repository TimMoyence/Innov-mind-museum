import Image from 'next/image';
import ShowcaseSection from '@/components/marketing/ShowcaseSection';
import PhoneMockup from '@/components/marketing/PhoneMockup';
import DemoMapLoader from '@/components/marketing/DemoMapLoader';

interface LandingMapsShowcaseProps {
  dict: {
    title: string;
    subtitle: string;
    bullets: string[];
  };
}

export default function LandingMapsShowcase({ dict }: LandingMapsShowcaseProps) {
  return (
    <ShowcaseSection
      title={dict.title}
      subtitle={dict.subtitle}
      bullets={dict.bullets}
      theme="light"
      reverse
    >
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-end sm:justify-center sm:gap-4">
        <PhoneMockup scale={0.7}>
          <Image
            src="/images/screenshots/iPhone 16 Pro Max /iPhone 16 Pro Max - list Nearby museum.png"
            alt="Museum list view"
            fill
            sizes="210px"
            style={{ objectFit: 'cover' }}
          />
        </PhoneMockup>
        <PhoneMockup variant="floating" scale={0.85}>
          <DemoMapLoader />
        </PhoneMockup>
      </div>
    </ShowcaseSection>
  );
}
