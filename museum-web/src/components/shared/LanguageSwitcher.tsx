'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import type { Locale } from '@/lib/i18n';

interface LanguageSwitcherProps {
  locale: Locale;
  label: string;
  onDark?: boolean;
}

export default function LanguageSwitcher({ locale, label, onDark = false }: LanguageSwitcherProps) {
  const pathname = usePathname();

  const targetLocale: Locale = locale === 'fr' ? 'en' : 'fr';
  const segments = pathname.split('/');
  segments[1] = targetLocale;
  const targetPath = segments.join('/');

  const colorClass = onDark
    ? 'text-white hover:bg-white/10'
    : 'text-primary-600 hover:bg-primary-50';

  return (
    <Link
      href={targetPath}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${colorClass}`}
      aria-label={`Switch to ${targetLocale === 'fr' ? 'French' : 'English'}`}
    >
      {label}
    </Link>
  );
}
