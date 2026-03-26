import Link from 'next/link';
import Image from 'next/image';
import type { Dictionary, Locale } from '@/lib/i18n';

interface FooterProps {
  dict: Dictionary;
  locale: Locale;
}

export default function Footer({ dict, locale }: FooterProps) {
  const year = new Date().getFullYear();
  const copyright = dict.footer.copyright.replace('{year}', String(year));

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
              <p className="text-xs text-text-muted">{dict.footer.madeBy}</p>
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
          </nav>
        </div>
      </div>
    </footer>
  );
}
