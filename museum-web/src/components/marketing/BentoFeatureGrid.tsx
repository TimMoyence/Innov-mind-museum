'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface BentoFeatureGridProps {
  features: { title: string; description: string }[];
  icons: ReactNode[];
}

const cardVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.08,
      duration: 0.5,
      ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
    },
  }),
};

export default function BentoFeatureGrid({ features, icons }: BentoFeatureGridProps) {
  return (
    <div className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-3 md:grid-rows-[auto_auto_auto]">
      {features.map((feature, i) => {
        const isLarge = i === 0;
        const isWide = i === 5;

        return (
          <motion.div
            key={i}
            className={`liquid-glass-card group flex flex-col p-6 sm:p-8 ${
              isLarge ? 'md:row-span-2' : ''
            }${isWide ? ' md:col-span-2' : ''}`}
            variants={cardVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-40px' }}
            custom={i}
          >
            {/* Icon */}
            <div
              className="relative flex h-12 w-12 items-center justify-center rounded-xl text-primary-500 shadow-sm transition-all duration-300 group-hover:shadow-md"
              style={{
                background: 'var(--fn-web-glass-inset)',
                backdropFilter: 'blur(12px) saturate(1.4)',
                WebkitBackdropFilter: 'blur(12px) saturate(1.4)',
                border: '1px solid var(--fn-web-glass-border)',
              }}
            >
              {icons[i]}
            </div>

            {/* Text */}
            <h3 className="mt-4 text-lg font-semibold text-text-primary">{feature.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              {feature.description}
            </p>

            {/* Large card: scan animation visual */}
            {isLarge && (
              <div
                className="mt-4 flex flex-1 items-center justify-center overflow-hidden rounded-2xl"
                style={{
                  minHeight: 120,
                  background:
                    'linear-gradient(135deg, rgba(37,99,235,0.06), rgba(56,189,248,0.06))',
                }}
              >
                <div className="relative h-20 w-20 rounded-xl border-2 border-primary-400/40">
                  <div className="animate-scan-line absolute left-0 h-0.5 w-full bg-primary-400/60" />
                </div>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
