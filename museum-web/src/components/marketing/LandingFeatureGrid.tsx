import AnimatedSection from '@/components/marketing/AnimatedSection';
import BentoFeatureGrid from '@/components/marketing/BentoFeatureGrid';

const featureIcons = [
  <svg
    key="eye"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
    />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>,
  <svg
    key="chat-ai"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
    />
  </svg>,
  <svg
    key="globe"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802"
    />
  </svg>,
  <svg
    key="history"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>,
  <svg
    key="offline"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
    />
  </svg>,
  <svg
    key="shield"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
    />
  </svg>,
];

interface LandingFeatureGridProps {
  dict: {
    gridTitle: string;
    gridSubtitle: string;
    grid: { title: string; description: string }[];
  };
}

export default function LandingFeatureGrid({ dict }: LandingFeatureGridProps) {
  return (
    <section className="relative overflow-hidden mesh-gradient py-24 sm:py-32">
      <div
        className="pointer-events-none absolute -right-20 top-20 h-72 w-72 rounded-full bg-primary-200/20 blur-3xl orb"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -left-20 bottom-20 h-56 w-56 rounded-full bg-accent-400/15 blur-3xl orb orb-delay-1"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <AnimatedSection variant="scale">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl lg:text-5xl"
              style={{ letterSpacing: '-0.03em' }}
            >
              {dict.gridTitle}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-text-secondary">{dict.gridSubtitle}</p>
          </div>
        </AnimatedSection>

        <AnimatedSection delay={0.1}>
          <BentoFeatureGrid features={dict.grid} icons={featureIcons} />
        </AnimatedSection>
      </div>
    </section>
  );
}
