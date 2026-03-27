import { getDictionary, type Locale } from '@/lib/i18n';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import AnimatedSection from '@/components/marketing/AnimatedSection';
import FeatureCard from '@/components/marketing/FeatureCard';
import StoreButton from '@/components/marketing/StoreButton';
import DeviceShowcase from '@/components/marketing/DeviceShowcase';

const HeroPlayer = dynamic(() => import('@/components/marketing/HeroPlayer'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
    </div>
  ),
});

interface LandingPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: LandingPageProps): Promise<Metadata> {
  const { locale } = await params;
  const dict = await getDictionary(locale as Locale);
  return {
    title: dict.metadata.title,
    description: dict.metadata.description,
  };
}

/* ── SVG Icons for "How it works" ──────────────────────────────────── */

const stepIcons = [
  <svg key="camera" className="h-8 w-8 text-primary-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
  </svg>,
  <svg key="chat" className="h-8 w-8 text-primary-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
  </svg>,
  <svg key="sparkles" className="h-8 w-8 text-primary-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
  </svg>,
];

/* ── SVG Icons for feature grid ────────────────────────────────────── */

const featureIcons = [
  <svg key="eye" className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>,
  <svg key="chat-ai" className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
  </svg>,
  <svg key="globe" className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
  </svg>,
  <svg key="history" className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>,
  <svg key="offline" className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>,
  <svg key="shield" className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>,
];

export default async function LandingPage({ params }: LandingPageProps) {
  const { locale } = await params;
  const dict = await getDictionary(locale as Locale);

  return (
    <>
      {/* SVG filter definitions for liquid glass effects */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
        <defs>
          <filter id="liquid-glass-filter" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.01 0.01" numOctaves={2} seed={42} result="noise" />
            <feGaussianBlur in="noise" stdDeviation={3} result="blurred" />
            <feSpecularLighting in="blurred" surfaceScale={3} specularConstant={0.8} specularExponent={80} lightingColor="white" result="specLight">
              <fePointLight x={-100} y={-100} z={200} />
            </feSpecularLighting>
            <feComposite in="specLight" operator="arithmetic" k1={0} k2={1} k3={1} k4={0} result="litImage" />
            <feDisplacementMap in="SourceGraphic" in2="blurred" scale={8} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      {/* ================================================================ */}
      {/* SECTION 1: HERO (dark, full viewport)                           */}
      {/* ================================================================ */}
      <section className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#000] via-[#050510] to-[#0a0a1a]">
        {/* Animated orbs on dark bg */}
        <div className="pointer-events-none absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-primary-500/15 blur-3xl orb" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-32 top-1/4 h-[400px] w-[400px] rounded-full bg-accent-400/10 blur-3xl orb orb-delay-1" aria-hidden="true" />
        <div className="pointer-events-none absolute bottom-20 left-1/3 h-[350px] w-[500px] rounded-full bg-gold-400/8 blur-3xl orb orb-delay-2" aria-hidden="true" />
        <div className="pointer-events-none absolute right-1/4 top-1/2 h-[300px] w-[300px] rounded-full bg-purple-500/8 blur-3xl orb orb-delay-3" aria-hidden="true" />

        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            {/* Left: hero text */}
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
                <h1 className="text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl"
                  style={{ letterSpacing: '-0.04em', lineHeight: 1.05 }}
                >
                  {dict.hero.title}
                </h1>
              </AnimatedSection>
              <AnimatedSection delay={0.2}>
                <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/60 sm:text-xl lg:max-w-none">
                  {dict.hero.subtitle}
                </p>
              </AnimatedSection>
              <AnimatedSection delay={0.3}>
                <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:justify-center lg:justify-start">
                  <a
                    href="#download"
                    className="inline-flex items-center justify-center rounded-2xl bg-primary-500 px-8 py-3.5 text-lg font-semibold text-white shadow-lg shadow-primary-500/30 transition-all hover:bg-primary-400 hover:shadow-xl hover:shadow-primary-500/40 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400"
                  >
                    {dict.hero.cta}
                  </a>
                  <a
                    href="#how-it-works"
                    className="liquid-glass inline-flex items-center justify-center !rounded-2xl px-8 py-3.5 text-lg font-semibold text-white/90 transition-all hover:bg-white/20 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
                  >
                    {dict.hero.ctaSecondary}
                  </a>
                </div>
              </AnimatedSection>
            </div>

            {/* Right: Remotion hero animation */}
            <AnimatedSection delay={0.2} direction="right" className="flex justify-center">
              <HeroPlayer />
            </AnimatedSection>
          </div>
        </div>

        {/* Bottom gradient fade to light */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent" aria-hidden="true" />
      </section>

      {/* ================================================================ */}
      {/* SECTION 2: HOW IT WORKS (light)                                 */}
      {/* ================================================================ */}
      <section id="how-it-works" className="relative overflow-hidden bg-white py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimatedSection variant="scale">
            <h2 className="text-center text-3xl font-bold tracking-tight text-text-primary sm:text-4xl lg:text-5xl"
              style={{ letterSpacing: '-0.03em' }}
            >
              {dict.features.title}
            </h2>
          </AnimatedSection>

          <div className="relative mt-20">
            {/* Gradient connecting line */}
            <div
              className="absolute left-0 right-0 top-10 hidden h-px sm:block"
              style={{
                background: 'linear-gradient(90deg, transparent 5%, rgba(37, 99, 235, 0.2) 20%, rgba(37, 99, 235, 0.4) 50%, rgba(37, 99, 235, 0.2) 80%, transparent 95%)',
              }}
              aria-hidden="true"
            />

            <div className="grid gap-12 sm:grid-cols-3">
              {dict.features.items.map((item, i) => (
                <AnimatedSection key={i} delay={i * 0.15} variant="scale">
                  <div className="relative flex flex-col items-center text-center">
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold text-primary-400">
                      {String(i + 1).padStart(2, '0')}
                    </div>
                    <div
                      className="liquid-glass relative z-10 flex h-20 w-20 items-center justify-center !rounded-3xl"
                      style={{
                        background: 'rgba(255, 255, 255, 0.7)',
                        backdropFilter: 'blur(20px) saturate(1.5)',
                        WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
                      }}
                    >
                      {stepIcons[i]}
                    </div>
                    <h3 className="mt-6 text-xl font-semibold text-text-primary">
                      {item.title}
                    </h3>
                    <p className="mt-2 max-w-xs text-text-secondary">{item.description}</p>
                  </div>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 3: APP SHOWCASE (dark gradient)                         */}
      {/* ================================================================ */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#0a0a1a] via-[#080820] to-[#0a0a1a] py-24 sm:py-32">
        {/* Ambient orbs */}
        <div className="pointer-events-none absolute left-1/4 top-10 h-[350px] w-[350px] rounded-full bg-primary-500/10 blur-3xl orb" aria-hidden="true" />
        <div className="pointer-events-none absolute bottom-10 right-1/4 h-[300px] w-[300px] rounded-full bg-accent-400/8 blur-3xl orb orb-delay-1" aria-hidden="true" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimatedSection variant="fade">
            <div className="mx-auto max-w-2xl text-center">
              <h2
                className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl"
                style={{ letterSpacing: '-0.03em' }}
              >
                {dict.showcase.sectionTitle}
              </h2>
              <p className="mt-4 text-lg text-white/60">
                {dict.showcase.sectionSubtitle}
              </p>
            </div>
          </AnimatedSection>

          <div className="mt-16">
            <DeviceShowcase />
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 4: FEATURE GRID (light, mesh gradient)                  */}
      {/* ================================================================ */}
      <section className="relative overflow-hidden mesh-gradient py-24 sm:py-32">
        {/* Subtle orbs */}
        <div className="pointer-events-none absolute -right-20 top-20 h-72 w-72 rounded-full bg-primary-200/20 blur-3xl orb" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-20 bottom-20 h-56 w-56 rounded-full bg-accent-400/15 blur-3xl orb orb-delay-1" aria-hidden="true" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimatedSection variant="scale">
            <div className="mx-auto max-w-2xl text-center">
              <h2
                className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl lg:text-5xl"
                style={{ letterSpacing: '-0.03em' }}
              >
                {dict.features.gridTitle}
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-text-secondary">
                {dict.features.gridSubtitle}
              </p>
            </div>
          </AnimatedSection>

          <AnimatedSection delay={0.1} stagger className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {dict.features.grid.map((feature, i) => (
              <FeatureCard
                key={i}
                icon={featureIcons[i]}
                title={feature.title}
                description={feature.description}
              />
            ))}
          </AnimatedSection>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 5: REVIEWS (dark gradient with gold)                    */}
      {/* ================================================================ */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#0a0a1a] via-[#0d0d20] to-[#0a0a1a] py-24 sm:py-32">
        {/* Gold-tinted orbs */}
        <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-[500px] -translate-x-1/2 rounded-full bg-gold-400/8 blur-3xl orb" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-48 w-48 rounded-full bg-gold-500/6 blur-3xl orb orb-delay-1" aria-hidden="true" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimatedSection variant="fade">
            <div className="mx-auto max-w-2xl text-center">
              <h2
                className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl"
                style={{ letterSpacing: '-0.03em' }}
              >
                {dict.reviews.title}
              </h2>
              <p className="mt-4 text-lg text-white/60">
                {dict.reviews.subtitle}
              </p>
            </div>
          </AnimatedSection>

          <AnimatedSection delay={0.2}>
            <div className="mx-auto mt-12 max-w-lg">
              <div className="liquid-glass !rounded-3xl p-8 text-center sm:p-10">
                {/* Stars decoration — gold */}
                <div className="flex justify-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <svg key={i} className="h-8 w-8 text-gold-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="mt-6 text-lg font-medium text-white/90">
                  {dict.reviews.ctaSubtitle}
                </p>
                <Link
                  href={`/${locale}/support`}
                  className="mt-6 inline-flex items-center justify-center rounded-2xl bg-primary-500 px-8 py-3 text-base font-semibold text-white shadow-lg shadow-primary-500/30 transition-all hover:bg-primary-400 hover:shadow-xl active:scale-[0.98]"
                >
                  {dict.reviews.cta}
                </Link>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 6: DOWNLOAD CTA (light gradient)                        */}
      {/* ================================================================ */}
      <section
        id="download"
        className="relative overflow-hidden bg-gradient-to-b from-white via-primary-50/40 to-primary-100/20 py-24 sm:py-32"
      >
        <div className="pointer-events-none absolute -right-20 top-0 h-64 w-64 rounded-full bg-accent-400/10 blur-3xl orb" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-64 w-64 rounded-full bg-primary-300/15 blur-3xl orb orb-delay-1" aria-hidden="true" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimatedSection variant="scale">
            <div className="mx-auto max-w-2xl text-center">
              <Image
                src="/images/logo.png"
                alt="Musaium"
                width={72}
                height={72}
                className="mx-auto mb-6 rounded-2xl shadow-lg"
              />
              <h2
                className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl lg:text-5xl"
                style={{ letterSpacing: '-0.03em' }}
              >
                {dict.download.title}
              </h2>
              <p className="mt-4 text-lg text-text-secondary">
                {dict.download.subtitle}
              </p>
            </div>
          </AnimatedSection>

          <AnimatedSection delay={0.2}>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <StoreButton
                store="apple"
                label={dict.download.appStore}
                subLabel={dict.download.appStorePrefix}
              />
              <StoreButton
                store="google"
                label={dict.download.googlePlay}
                subLabel={dict.download.googlePlayPrefix}
              />
            </div>
          </AnimatedSection>
        </div>
      </section>
    </>
  );
}
