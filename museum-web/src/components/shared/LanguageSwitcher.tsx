'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import type { Locale } from '@/lib/i18n';

interface LanguageSwitcherProps {
  locale: Locale;
  label: string;
  /**
   * `true` when the surrounding chrome has a dark backdrop (e.g. marketing
   * Header at scrollY=0). Switches the link to a white text color so axe
   * color-contrast clears 4.5:1 against the dark composite — the default
   * `text-primary-600` (#1d4ed8) only works on light surfaces.
   */
  onDark?: boolean;
}

export default function LanguageSwitcher({ locale, label, onDark = false }: LanguageSwitcherProps) {
  const pathname = usePathname();

  // Replace the current locale segment with the target locale
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
