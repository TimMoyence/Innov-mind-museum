'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import type { Locale } from '@/lib/i18n';

interface LanguageSwitcherProps {
  locale: Locale;
  label: string;
}

export default function LanguageSwitcher({ locale, label }: LanguageSwitcherProps) {
  const pathname = usePathname();

  // Replace the current locale segment with the target locale
  const targetLocale: Locale = locale === 'fr' ? 'en' : 'fr';
  const segments = pathname.split('/');
  segments[1] = targetLocale;
  const targetPath = segments.join('/');

  return (
    <Link
      href={targetPath}
      className="rounded-md px-3 py-1.5 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-50"
      aria-label={`Switch to ${targetLocale === 'fr' ? 'French' : 'English'}`}
    >
      {label}
    </Link>
  );
}
