'use client';

import { motion } from 'framer-motion';

interface StoryStep {
  title: string;
  description: string;
}

interface StorySectionProps {
  title: string;
  subtitle: string;
  steps: StoryStep[];
}

// Inline SVG icons — lucide-react not installed in this project
function BuildingIcon() {
  return (
    <svg
      className="h-12 w-12 text-primary-500"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
      />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg
      className="h-12 w-12 text-primary-500"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
      />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg
      className="h-12 w-12 text-primary-500"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
      />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg
      className="h-12 w-12 text-primary-500"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
      />
    </svg>
  );
}

const STEP_ICONS = [BuildingIcon, CameraIcon, SparklesIcon, ListIcon] as const;

export function StorySection({ title, subtitle, steps }: StorySectionProps) {
  return (
    <section className="py-24 px-6 max-w-5xl mx-auto" aria-labelledby="story-section-title">
      <motion.h2
        id="story-section-title"
        className="text-3xl md:text-4xl font-semibold text-center mb-3 text-text-primary"
        style={{ letterSpacing: '-0.03em' }}
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        {title}
      </motion.h2>
      <motion.p
        className="text-center text-base text-text-secondary mb-12"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 }}
      >
        {subtitle}
      </motion.p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
        {/* Connecting line — animates left to right */}
        <motion.div
          aria-hidden="true"
          className="hidden md:block absolute top-12 left-12 right-12 h-px bg-gradient-to-r from-primary-500/30 via-primary-500/60 to-primary-500/30"
          initial={{ scaleX: 0, originX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.4 }}
        />

        {steps.map((step, index) => {
          const Icon = STEP_ICONS[index] ?? SparklesIcon;
          return (
            <motion.article
              key={step.title}
              className="flex flex-col items-center text-center gap-3"
              initial={{ opacity: 0, y: 16, scale: 0.92 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.4, ease: 'easeOut', delay: 0.15 * index }}
            >
              <div className="w-24 h-24 rounded-full bg-primary-50 flex items-center justify-center">
                <Icon />
              </div>
              <h3 className="text-lg font-semibold text-text-primary">{step.title}</h3>
              <p className="text-sm text-text-secondary">{step.description}</p>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}
