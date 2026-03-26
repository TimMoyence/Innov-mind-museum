import type { ReactNode } from 'react';

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
}

export default function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="glass-card group rounded-2xl p-6 sm:p-8">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/70 text-primary-500 shadow-sm ring-1 ring-white/40 transition-colors group-hover:bg-white/90">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-semibold text-text-primary">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-text-secondary">{description}</p>
    </div>
  );
}
