import { type ReactNode } from 'react';
import AnimatedSection from '@/components/marketing/AnimatedSection';

interface ShowcaseSectionProps {
  title: string;
  subtitle: string;
  bullets?: string[];
  theme: 'dark' | 'light';
  reverse?: boolean;
  id?: string;
  children: ReactNode;
}

const checkIcon = (
  <svg
    className="h-5 w-5 shrink-0 text-primary-400"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={2}
    stroke="currentColor"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);

export default function ShowcaseSection({
  title,
  subtitle,
  bullets,
  theme,
  reverse = false,
  id,
  children,
}: ShowcaseSectionProps) {
  const isDark = theme === 'dark';

  return (
    <section
      id={id}
      className="relative overflow-hidden py-24 sm:py-32"
      style={
        isDark
          ? { background: 'linear-gradient(180deg, var(--sem-section-dark-background) 0%, var(--sem-section-dark-background-alt) 50%, var(--sem-section-dark-background) 100%)' }
          : { background: 'var(--color-surface)' }
      }
    >
      {isDark && (
        <>
          <div
            className="pointer-events-none absolute left-1/4 top-10 h-[350px] w-[350px] rounded-full bg-primary-500/10 blur-3xl orb"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute bottom-10 right-1/4 h-[300px] w-[300px] rounded-full bg-accent-400/8 blur-3xl orb orb-delay-1"
            aria-hidden="true"
          />
        </>
      )}

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className={`grid items-center gap-12 lg:grid-cols-2 lg:gap-16${reverse ? '' : ''}`}>
          {/* Text column */}
          <div className={`min-w-0 ${reverse ? 'lg:order-2' : ''}`}>
            <AnimatedSection>
              <h2
                className={`text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl ${isDark ? 'text-white' : 'text-text-primary'}`}
                style={{ letterSpacing: '-0.03em' }}
              >
                {title}
              </h2>
            </AnimatedSection>
            <AnimatedSection delay={0.1}>
              <p
                className={`mt-4 text-lg leading-relaxed ${isDark ? 'text-white/60' : 'text-text-secondary'}`}
              >
                {subtitle}
              </p>
            </AnimatedSection>
            {bullets && bullets.length > 0 && (
              <AnimatedSection delay={0.2} stagger>
                <ul className="mt-6 space-y-3">
                  {bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className={`flex items-start gap-3 text-base ${isDark ? 'text-white/80' : 'text-text-primary'}`}
                    >
                      {checkIcon}
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </AnimatedSection>
            )}
          </div>

          {/* Device column */}
          <AnimatedSection delay={0.2} direction={reverse ? 'left' : 'right'} className="min-w-0">
            {children}
          </AnimatedSection>
        </div>
      </div>
    </section>
  );
}
