'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import type { Dictionary, Locale } from '@/lib/i18n';

interface FooterProps {
  dict: Dictionary;
  locale: Locale;
}

export default function Footer({ dict, locale }: FooterProps) {
  const pathname = usePathname();
  const year = new Date().getFullYear();
  const copyright = dict.footer.copyright.replace('{year}', String(year));

  // Mirror Header: admin shell ships its own chrome; the marketing footer
  // is wrong context on /<locale>/admin/*.
  if (/\/[a-z]{2}\/admin(\/|$)/.test(pathname)) return null;

  return (
    <footer className="border-t border-primary-100/50 bg-white/50 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
          {/* Branding */}
          <div className="flex items-center gap-3">
            <Image
              src="/images/logo.png"
              alt="Musaium"
              width={28}
              height={28}
              className="rounded-md"
            />
            <div className="space-y-0.5">
              <p className="text-sm text-text-secondary">{copyright}</p>
              <p className="text-xs text-text-tertiary">{dict.footer.madeBy}</p>
            </div>
          </div>

          {/* Links */}
          <nav className="flex gap-6" aria-label="Footer">
            <Link
              href={`/${locale}/privacy`}
              className="text-sm text-text-secondary transition-colors hover:text-primary-600"
            >
              {dict.footer.links.privacy}
            </Link>
            <Link
              href={`/${locale}/support`}
              className="text-sm text-text-secondary transition-colors hover:text-primary-600"
            >
              {dict.footer.links.support}
            </Link>
            <Link
              href={`/${locale}/accessibility`}
              className="text-sm text-text-secondary transition-colors hover:text-primary-600"
            >
              {dict.footer.links.accessibility}
            </Link>
            <Link
              href={`/${locale}/security`}
              className="text-sm text-text-secondary transition-colors hover:text-primary-600"
            >
              {dict.footer.links.security}
            </Link>
            <Link
              href={`/${locale}/b2b`}
              className="text-sm text-text-secondary transition-colors hover:text-primary-600"
            >
              {dict.footer.links.b2b}
            </Link>
            <Link
              href={`/${locale}/terms`}
              className="text-sm text-text-secondary transition-colors hover:text-primary-600"
            >
              {dict.footer.links.terms}
            </Link>
            <Link
              href={`/${locale}/subprocessors`}
              className="text-sm text-text-secondary transition-colors hover:text-primary-600"
            >
              {dict.footer.links.subprocessors}
            </Link>
            <Link
              href={`/${locale}/cookies`}
              className="text-sm text-text-secondary transition-colors hover:text-primary-600"
            >
              {dict.footer.links.cookies}
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
