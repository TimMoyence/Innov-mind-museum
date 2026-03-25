import { getDictionary, type Locale } from '@/lib/i18n';
import type { Metadata } from 'next';
import Button from '@/components/ui/Button';

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

const stepIcons = [
  // Camera icon
  <svg key="camera" className="h-10 w-10 text-primary-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
  </svg>,
  // Chat bubble icon
  <svg key="chat" className="h-10 w-10 text-primary-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
  </svg>,
  // Sparkles / AI icon
  <svg key="sparkles" className="h-10 w-10 text-primary-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
  </svg>,
];

export default async function LandingPage({ params }: LandingPageProps) {
  const { locale } = await params;
  const dict = await getDictionary(locale as Locale);

  return (
    <>
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary-50 via-primary-100 to-[#D5F0FF]">
        <div className="mx-auto max-w-7xl px-4 py-24 text-center sm:px-6 sm:py-32 lg:px-8">
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-text-primary sm:text-5xl lg:text-6xl">
            {dict.hero.title}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-text-secondary sm:text-xl">
            {dict.hero.subtitle}
          </p>
          <div className="mt-10">
            <Button size="lg">{dict.hero.cta}</Button>
          </div>
        </div>
        {/* Decorative gradient blur */}
        <div className="absolute -bottom-24 left-1/2 h-48 w-[600px] -translate-x-1/2 rounded-full bg-primary-300/30 blur-3xl" aria-hidden="true" />
      </section>

      {/* ── How It Works ────────────────────────────────────────────────── */}
      <section className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            {dict.features.title}
          </h2>
          <div className="mt-16 grid gap-12 sm:grid-cols-3">
            {dict.features.items.map((item, i) => (
              <div key={i} className="flex flex-col items-center text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary-50">
                  {stepIcons[i]}
                </div>
                <h3 className="mt-6 text-xl font-semibold text-text-primary">
                  {item.title}
                </h3>
                <p className="mt-2 text-text-secondary">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── App Showcase ───────────────────────────────────────────────── */}
      <section className="bg-surface-elevated py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center">
            <div className="flex h-[480px] w-[280px] items-center justify-center rounded-[2.5rem] border-2 border-dashed border-primary-200 bg-white text-text-muted">
              <span className="text-sm">App screenshot</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────── */}
      <section
        id="download"
        className="bg-gradient-to-b from-[#D5F0FF] via-primary-100 to-primary-50 py-20 sm:py-28"
      >
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            {dict.hero.cta}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-text-secondary">
            {dict.hero.subtitle}
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            {/* Placeholder store badges */}
            <div className="flex h-14 w-48 items-center justify-center rounded-xl border-2 border-dashed border-primary-200 bg-white text-sm text-text-muted">
              App Store
            </div>
            <div className="flex h-14 w-48 items-center justify-center rounded-xl border-2 border-dashed border-primary-200 bg-white text-sm text-text-muted">
              Google Play
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
