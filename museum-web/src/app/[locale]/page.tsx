import { getDictionary, type Locale } from '@/lib/i18n';
import type { Metadata } from 'next';
import AnimatedSection from '@/components/marketing/AnimatedSection';
import PhoneMockup from '@/components/marketing/PhoneMockup';
import FeatureCard from '@/components/marketing/FeatureCard';
import TestimonialCard from '@/components/marketing/TestimonialCard';
import StoreButton from '@/components/marketing/StoreButton';

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
  <svg key="camera" className="h-10 w-10 text-primary-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
  </svg>,
  <svg key="chat" className="h-10 w-10 text-primary-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
  </svg>,
  <svg key="sparkles" className="h-10 w-10 text-primary-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
  </svg>,
];

/* ── SVG Icons for feature grid ────────────────────────────────────── */

const featureIcons = [
  // Eye / Vision
  <svg key="eye" className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>,
  // Chat bubble
  <svg key="chat-ai" className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
  </svg>,
  // Globe / Multilingual
  <svg key="globe" className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
  </svg>,
  // Clock / History
  <svg key="history" className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>,
  // Signal / Offline
  <svg key="offline" className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>,
  // Shield / Verified sources
  <svg key="shield" className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>,
];

export default async function LandingPage({ params }: LandingPageProps) {
  const { locale } = await params;
  const dict = await getDictionary(locale as Locale);

  return (
    <>
      {/* ── Hero Section ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary-50 via-primary-100 to-[#D5F0FF]">
        {/* Decorative blur circles */}
        <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary-200/40 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-24 top-1/3 h-72 w-72 rounded-full bg-accent-400/20 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute bottom-0 left-1/2 h-48 w-[600px] -translate-x-1/2 rounded-full bg-primary-300/30 blur-3xl" aria-hidden="true" />

        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-32">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            {/* Left: Text content */}
            <div className="text-center lg:text-left">
              <AnimatedSection>
                <h1 className="text-4xl font-extrabold tracking-tight text-text-primary sm:text-5xl lg:text-6xl">
                  {dict.hero.title}
                </h1>
              </AnimatedSection>
              <AnimatedSection delay={0.15}>
                <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-secondary sm:text-xl lg:max-w-none">
                  {dict.hero.subtitle}
                </p>
              </AnimatedSection>
              <AnimatedSection delay={0.3}>
                <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:justify-center lg:justify-start">
                  <a
                    href="#download"
                    className="inline-flex items-center justify-center rounded-xl bg-primary-500 px-7 py-3 text-lg font-medium text-white shadow-sm transition-colors hover:bg-primary-600 active:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
                  >
                    {dict.hero.cta}
                  </a>
                  <a
                    href="#how-it-works"
                    className="inline-flex items-center justify-center rounded-xl border border-primary-300 px-7 py-3 text-lg font-medium text-primary-600 transition-colors hover:bg-primary-50 active:bg-primary-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
                  >
                    {dict.hero.ctaSecondary}
                  </a>
                </div>
              </AnimatedSection>
            </div>

            {/* Right: Phone mockup */}
            <AnimatedSection delay={0.2} direction="right" className="flex justify-center">
              <PhoneMockup>
                {/* Simulated app screen */}
                <div className="flex h-[520px] flex-col bg-gradient-to-b from-primary-50 to-white">
                  {/* App header */}
                  <div className="flex items-center gap-3 bg-white/80 px-4 pb-3 pt-10 backdrop-blur-sm">
                    <div className="h-8 w-8 rounded-full bg-primary-500" />
                    <div>
                      <div className="h-3 w-20 rounded bg-text-primary/80" />
                      <div className="mt-1 h-2 w-14 rounded bg-text-muted/50" />
                    </div>
                  </div>
                  {/* Chat area */}
                  <div className="flex flex-1 flex-col gap-3 px-4 py-4">
                    {/* User message */}
                    <div className="ml-auto max-w-[75%] rounded-2xl rounded-br-md bg-primary-500 px-4 py-2.5">
                      <div className="h-2 w-24 rounded bg-white/70" />
                      <div className="mt-1.5 h-2 w-16 rounded bg-white/50" />
                    </div>
                    {/* AI response */}
                    <div className="mr-auto max-w-[80%] rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm">
                      <div className="h-2 w-full rounded bg-text-primary/20" />
                      <div className="mt-1.5 h-2 w-[90%] rounded bg-text-primary/15" />
                      <div className="mt-1.5 h-2 w-[70%] rounded bg-text-primary/10" />
                      <div className="mt-3 h-2 w-full rounded bg-text-primary/20" />
                      <div className="mt-1.5 h-2 w-[85%] rounded bg-text-primary/15" />
                    </div>
                    {/* Second user message */}
                    <div className="ml-auto max-w-[65%] rounded-2xl rounded-br-md bg-primary-500 px-4 py-2.5">
                      <div className="h-2 w-20 rounded bg-white/70" />
                    </div>
                    {/* AI typing indicator */}
                    <div className="mr-auto flex gap-1 rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm">
                      <div className="h-2 w-2 animate-pulse rounded-full bg-primary-400" />
                      <div className="h-2 w-2 animate-pulse rounded-full bg-primary-300 [animation-delay:150ms]" />
                      <div className="h-2 w-2 animate-pulse rounded-full bg-primary-200 [animation-delay:300ms]" />
                    </div>
                  </div>
                  {/* Input bar */}
                  <div className="border-t border-primary-100 bg-white px-4 py-3">
                    <div className="flex items-center gap-2 rounded-full bg-surface-muted px-4 py-2">
                      <div className="h-3 flex-1 rounded bg-text-muted/30" />
                      <div className="h-6 w-6 rounded-full bg-primary-500" />
                    </div>
                  </div>
                </div>
              </PhoneMockup>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* ── How It Works (3 steps) ─────────────────────────────────────── */}
      <section id="how-it-works" className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <h2 className="text-center text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
              {dict.features.title}
            </h2>
          </AnimatedSection>

          <div className="relative mt-16">
            {/* Connective line (desktop only) */}
            <div className="absolute left-0 right-0 top-10 hidden h-0.5 bg-gradient-to-r from-transparent via-primary-200 to-transparent sm:block" aria-hidden="true" />

            <div className="grid gap-12 sm:grid-cols-3">
              {dict.features.items.map((item, i) => (
                <AnimatedSection key={i} delay={i * 0.15}>
                  <div className="relative flex flex-col items-center text-center">
                    {/* Step number */}
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold text-primary-400">
                      {String(i + 1).padStart(2, '0')}
                    </div>
                    <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary-50 shadow-sm ring-4 ring-white">
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

      {/* ── Feature Grid ───────────────────────────────────────────────── */}
      <section className="bg-surface-elevated py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
                {dict.features.gridTitle}
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-text-secondary">
                {dict.features.gridSubtitle}
              </p>
            </div>
          </AnimatedSection>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {dict.features.grid.map((feature, i) => (
              <AnimatedSection key={i} delay={i * 0.1}>
                <FeatureCard
                  icon={featureIcons[i]}
                  title={feature.title}
                  description={feature.description}
                />
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── App Showcase ───────────────────────────────────────────────── */}
      <section className="overflow-hidden bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
            {/* Text */}
            <AnimatedSection direction="left" className="order-2 text-center lg:order-1 lg:text-left">
              <h2 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
                {dict.showcase.title}
              </h2>
              <p className="mt-6 text-lg leading-relaxed text-text-secondary">
                {dict.showcase.description}
              </p>
              <p className="mt-4 text-sm font-medium text-primary-500">
                {dict.showcase.caption}
              </p>
            </AnimatedSection>

            {/* Phone */}
            <div className="order-1 flex justify-center lg:order-2">
              <PhoneMockup parallax>
                {/* Showcase screen — artwork detail view */}
                <div className="flex h-[520px] flex-col bg-white">
                  {/* Image placeholder */}
                  <div className="relative h-56 bg-gradient-to-br from-primary-200 via-accent-400/30 to-primary-100">
                    <div className="absolute bottom-3 left-3 rounded-lg bg-white/90 px-3 py-1.5 backdrop-blur-sm">
                      <div className="h-2.5 w-28 rounded bg-text-primary/70" />
                      <div className="mt-1 h-2 w-20 rounded bg-text-muted/50" />
                    </div>
                  </div>
                  {/* Info section */}
                  <div className="flex-1 px-4 py-4">
                    <div className="h-3 w-3/4 rounded bg-text-primary/70" />
                    <div className="mt-2 h-2 w-1/2 rounded bg-text-muted/40" />
                    <div className="mt-4 space-y-2">
                      <div className="h-2 w-full rounded bg-text-primary/15" />
                      <div className="h-2 w-[95%] rounded bg-text-primary/12" />
                      <div className="h-2 w-[80%] rounded bg-text-primary/10" />
                    </div>
                    <div className="mt-4 flex gap-2">
                      <div className="rounded-full bg-primary-50 px-3 py-1">
                        <div className="h-2 w-12 rounded bg-primary-400/60" />
                      </div>
                      <div className="rounded-full bg-primary-50 px-3 py-1">
                        <div className="h-2 w-16 rounded bg-primary-400/60" />
                      </div>
                      <div className="rounded-full bg-primary-50 px-3 py-1">
                        <div className="h-2 w-10 rounded bg-primary-400/60" />
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <div className="h-2 w-full rounded bg-text-primary/12" />
                      <div className="h-2 w-[90%] rounded bg-text-primary/10" />
                      <div className="h-2 w-[75%] rounded bg-text-primary/8" />
                    </div>
                  </div>
                  {/* Bottom action */}
                  <div className="border-t border-primary-100 px-4 py-3">
                    <div className="flex items-center justify-center rounded-xl bg-primary-500 py-2.5">
                      <div className="h-3 w-24 rounded bg-white/70" />
                    </div>
                  </div>
                </div>
              </PhoneMockup>
            </div>
          </div>
        </div>
      </section>

      {/* ── Testimonials ───────────────────────────────────────────────── */}
      <section className="bg-surface-elevated py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <h2 className="text-center text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
              {dict.testimonials.title}
            </h2>
          </AnimatedSection>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {dict.testimonials.items.map((testimonial, i) => (
              <AnimatedSection key={i} delay={i * 0.15}>
                <TestimonialCard
                  name={testimonial.name}
                  role={testimonial.role}
                  quote={testimonial.quote}
                />
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── Download CTA ───────────────────────────────────────────────── */}
      <section
        id="download"
        className="relative overflow-hidden bg-gradient-to-b from-[#D5F0FF] via-primary-100 to-primary-50 py-20 sm:py-28"
      >
        {/* Decorative blurs */}
        <div className="pointer-events-none absolute -right-20 top-0 h-64 w-64 rounded-full bg-accent-400/15 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-64 w-64 rounded-full bg-primary-300/25 blur-3xl" aria-hidden="true" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
                {dict.download.title}
              </h2>
              <p className="mt-4 text-lg text-text-secondary">
                {dict.download.subtitle}
              </p>
            </div>
          </AnimatedSection>

          <AnimatedSection delay={0.2}>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <StoreButton store="apple" label={dict.download.appStore} />
              <StoreButton store="google" label={dict.download.googlePlay} />
            </div>
          </AnimatedSection>

          {/* QR Code placeholder */}
          <AnimatedSection delay={0.35}>
            <div className="mt-10 flex flex-col items-center gap-3">
              <div className="flex h-28 w-28 items-center justify-center rounded-2xl border-2 border-dashed border-primary-200 bg-white">
                <svg className="h-10 w-10 text-primary-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
                </svg>
              </div>
              <p className="text-sm text-text-muted">{dict.download.qrLabel}</p>
            </div>
          </AnimatedSection>
        </div>
      </section>
    </>
  );
}
