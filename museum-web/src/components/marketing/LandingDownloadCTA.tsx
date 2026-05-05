import Image from 'next/image';
import AnimatedSection from '@/components/marketing/AnimatedSection';
import StoreButton from '@/components/marketing/StoreButton';

interface LandingDownloadCTAProps {
  dict: {
    title: string;
    subtitle: string;
    appStore: string;
    googlePlay: string;
    appStorePrefix: string;
    googlePlayPrefix: string;
  };
}

export default function LandingDownloadCTA({ dict }: LandingDownloadCTAProps) {
  return (
    <section
      id="download"
      className="relative overflow-hidden py-24 sm:py-32"
      style={{
        background:
          'linear-gradient(180deg, var(--sem-section-dark-background) 0%, var(--sem-section-dark-background-alt) 50%, var(--sem-section-dark-background) 100%)',
      }}
    >
      <div
        className="pointer-events-none absolute left-1/4 top-10 h-[350px] w-[350px] rounded-full bg-primary-500/10 blur-3xl orb"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute bottom-10 right-1/4 h-[300px] w-[300px] rounded-full bg-accent-400/8 blur-3xl orb orb-delay-1"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <AnimatedSection variant="scale">
          <div className="mx-auto max-w-2xl text-center">
            <Image
              src="/images/logo.png"
              alt="Musaium"
              width={72}
              height={72}
              className="mx-auto mb-6 rounded-2xl shadow-lg shadow-primary-500/20"
            />
            <h2
              className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl"
              style={{ letterSpacing: '-0.03em' }}
            >
              {dict.title}
            </h2>
            <p className="mt-4 text-lg text-white/60">{dict.subtitle}</p>
          </div>
        </AnimatedSection>

        <AnimatedSection delay={0.2}>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <StoreButton store="apple" label={dict.appStore} subLabel={dict.appStorePrefix} />
            <StoreButton store="google" label={dict.googlePlay} subLabel={dict.googlePlayPrefix} />
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
