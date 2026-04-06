'use client';

import dynamic from 'next/dynamic';

const DemoMap = dynamic(() => import('@/components/marketing/DemoMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-2xl bg-gray-100">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-500" />
    </div>
  ),
});

export default function DemoMapLoader() {
  return <DemoMap />;
}
