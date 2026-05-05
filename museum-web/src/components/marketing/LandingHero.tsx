import Image from 'next/image';
import AnimatedSection from '@/components/marketing/AnimatedSection';
import HeroOrbs from '@/components/marketing/HeroOrbs';
import HeroPlayerLoader from '@/components/marketing/HeroPlayerLoader';

interface LandingHeroProps {
  dict: {
    title: string;
    subtitle: string;
    cta: string;
    ctaSecondary: string;
  };
}

export default function LandingHero({ dict }: LandingHeroProps) {
  return (
    <section
      className="relative min-h-screen overflow-hidden"
      style={{
        background:
          'linear-gradient(to bottom, var(--sem-section-dark-background-deep), var(--sem-section-dark-background-mid), var(--sem-section-dark-background-accent))',
      }}
    >
      <HeroOrbs />

      <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="text-center lg:text-left">
            <AnimatedSection>
              <div className="mb-8 flex justify-center lg:justify-start">
                <Image
                  src="/images/logo.png"
                  alt="Musaium"
                  width={80}
                  height={80}
                  className="rounded-2xl shadow-lg shadow-primary-500/20"
                  priority
                />
              </div>
            </AnimatedSection>
            <AnimatedSection delay={0.1}>
              <h1
                className="text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl"
                style={{ letterSpacing: '-0.04em', lineHeight: 1.05 }}
              >
                {dict.title}
              </h1>
            </AnimatedSection>
            <AnimatedSection delay={0.2}>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/60 sm:text-xl lg:max-w-none">
                {dict.subtitle}
              </p>
            </AnimatedSection>
            <AnimatedSection delay={0.3}>
              <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:justify-center lg:justify-start">
                <a
                  href="#download"
                  className="inline-flex items-center justify-center rounded-2xl bg-primary-500 px-8 py-3.5 text-lg font-semibold text-white shadow-lg shadow-primary-500/30 transition-all hover:bg-primary-400 hover:shadow-xl hover:shadow-primary-500/40 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400"
                >
                  {dict.cta}
                </a>
                <a
                  href="#how-it-works"
                  className="liquid-glass inline-flex items-center justify-center !rounded-2xl px-8 py-3.5 text-lg font-semibold text-white/90 transition-all hover:bg-white/20 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
                >
                  {dict.ctaSecondary}
                </a>
              </div>
            </AnimatedSection>
          </div>

          <AnimatedSection delay={0.2} direction="right" className="flex justify-center">
            <HeroPlayerLoader />
          </AnimatedSection>
        </div>
      </div>

      <div
        className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
        aria-hidden="true"
      >
        <div className="flex flex-col items-center gap-2 opacity-60">
          <div className="h-8 w-5 rounded-full border-2 border-white/30 p-1">
            <div className="h-2 w-1 rounded-full bg-white/50 animate-scroll-bounce mx-auto" />
          </div>
        </div>
      </div>

      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-32"
        style={{ background: 'linear-gradient(to top, var(--color-primary-50), transparent)' }}
        aria-hidden="true"
      />
    </section>
  );
}
