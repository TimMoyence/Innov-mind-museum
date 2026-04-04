'use client';

import dynamic from 'next/dynamic';

const HeroAnimation = dynamic(
  () => import('@/components/marketing/HeroAnimation'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
      </div>
    ),
  },
);

export default function HeroPlayerLoader() {
  return <HeroAnimation />;
}
