'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { motion, useMotionValueEvent, useScroll, useTransform } from 'framer-motion';
import type { Dictionary, Locale } from '@/lib/i18n';
import LanguageSwitcher from '@/components/shared/LanguageSwitcher';

interface HeaderProps {
  dict: Dictionary;
  locale: Locale;
}

export default function Header({ dict, locale }: HeaderProps) {
  // All hooks first — admin-route bail-out happens after hook ordering is
  // locked in, to satisfy `react-hooks/rules-of-hooks`.
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { scrollY } = useScroll();
  // At scrollY=0 the header sits over different page contexts:
  //   /<locale>            — dark hero gradient (#0a0a0b)
  //   /<locale>/support    — light bg
  //   /<locale>/privacy    — light bg
  // axe-core composites whatever's actually rendered, so a translucent
  // backdrop turns into mid-gray on light routes and fails 4.5:1 against
  // text-white. A 90%-opaque deep-slate keeps the "soft glass" feel
  // (composite still hints at the page below) but is solid-enough that
  // axe sees a near-solid dark backdrop on every public route.
  // Composite math vs white: 0.9*#0F172A + 0.1*#FFFFFF ≈ #272A3E
  // (12.6:1 vs white text). Vs hero #0a0a0b: ≈ #0e1024 (16:1). Both pass.
  const headerBg = useTransform(
    scrollY,
    [0, 100],
    ['rgba(15,23,42,0.9)', 'var(--fn-web-glass-heavy)'],
  );
  const headerBorder = useTransform(
    scrollY,
    [0, 100],
    ['rgba(255,255,255,0)', 'var(--fn-web-liquid-glass-border)'],
  );
  const headerBlur = useTransform(scrollY, [0, 100], ['blur(0px)', 'blur(16px)']);

  const [isDarkHeader, setIsDarkHeader] = useState(true);
  useMotionValueEvent(scrollY, 'change', (latest) => {
    setIsDarkHeader(latest < 80);
  });

  const navLinks = [
    { href: `/${locale}`, label: dict.nav.home },
    { href: `/${locale}/support`, label: dict.nav.support },
    { href: `/${locale}/privacy`, label: dict.nav.privacy },
  ];

  // Marketing nav must not render on the admin shell — admin routes mount
  // their own AdminShell chrome (sidebar + auth) and the marketing header
  // both clashes visually and trips axe color-contrast on the white admin
  // background. Locale-prefix-tolerant: matches `/<locale>/admin` and
  // `/<locale>/admin/...`.
  if (/\/[a-z]{2}\/admin(\/|$)/.test(pathname)) return null;

  return (
    <motion.header
      className="sticky top-0 z-50"
      style={{
        backgroundColor: headerBg,
        borderBottom: headerBorder,
        backdropFilter: headerBlur,
        WebkitBackdropFilter: headerBlur,
      }}
    >
      <div className="relative mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link
          href={`/${locale}`}
          className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <Image
            src="/images/logo.png"
            alt="Musaium"
            width={36}
            height={36}
            className="rounded-lg"
          />
          <span
            className={`text-lg font-semibold tracking-tight transition-colors duration-300 ${isDarkHeader ? 'text-white' : 'text-text-primary'}`}
          >
            Musaium
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 md:flex" aria-label="Main">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors duration-300 ${isDarkHeader ? 'text-white/65 hover:text-white' : 'text-text-secondary hover:text-primary-600'}`}
            >
              {link.label}
            </Link>
          ))}
          <LanguageSwitcher locale={locale} label={dict.nav.language} />
          <Link
            href={`/${locale}#download`}
            className="rounded-xl bg-primary-500 px-5 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-600 hover:shadow-md active:scale-[0.98]"
          >
            {dict.nav.download}
          </Link>
        </nav>

        {/* Mobile hamburger */}
        <button
          type="button"
          className={`inline-flex items-center justify-center rounded-lg p-2 transition-colors duration-300 md:hidden ${isDarkHeader ? 'text-white/70 hover:bg-white/10' : 'text-text-secondary hover:bg-white/50'}`}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
          onClick={() => {
            setMenuOpen((prev) => !prev);
          }}
        >
          {menuOpen ? (
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
              />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <nav
          className="border-t border-white/15 bg-white/60 px-4 pb-4 pt-2 backdrop-blur-xl md:hidden"
          aria-label="Mobile"
        >
          <ul className="flex flex-col gap-2">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-300 ${isDarkHeader ? 'text-white/65 hover:bg-white/10 hover:text-white' : 'text-text-secondary hover:bg-white/50 hover:text-primary-600'}`}
                  onClick={() => {
                    setMenuOpen(false);
                  }}
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li className="flex items-center gap-3 px-3 py-2">
              <LanguageSwitcher locale={locale} label={dict.nav.language} />
            </li>
            <li>
              <Link
                href={`/${locale}#download`}
                className="block rounded-xl bg-primary-500 px-4 py-2 text-center text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-600"
                onClick={() => {
                  setMenuOpen(false);
                }}
              >
                {dict.nav.download}
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </motion.header>
  );
}
