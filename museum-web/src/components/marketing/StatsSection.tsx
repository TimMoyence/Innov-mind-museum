'use client';

import AnimatedSection from '@/components/marketing/AnimatedSection';
import AnimatedCounter from '@/components/marketing/AnimatedCounter';

interface StatsSectionProps {
  title: string;
  items: { value: number; suffix: string; label: string }[];
}

export default function StatsSection({ title, items }: StatsSectionProps) {
  return (
    <section className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <AnimatedSection variant="scale">
          <h2 className="text-section text-center text-text-primary">{title}</h2>
        </AnimatedSection>

        <div className="grid grid-cols-2 gap-8 sm:gap-12 lg:grid-cols-4 mt-16">
          {items.map((item) => (
            <div key={item.label} className="text-center">
              <span
                className="text-5xl sm:text-6xl font-bold text-primary-500"
                style={{ letterSpacing: '-0.04em' }}
              >
                <AnimatedCounter target={item.value} suffix={item.suffix} />
              </span>
              <p className="mt-2 text-base sm:text-lg text-text-secondary">{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
