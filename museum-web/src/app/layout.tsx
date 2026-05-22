import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
import PlausibleProvider from 'next-plausible';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    template: '%s | Musaium',
    default: 'Musaium',
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://musaium.com'),
  icons: {
    icon: [
      { url: '/images/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/images/favicon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/images/apple-touch-icon.png',
  },
};

// Wave C5 / T-C56 — Plausible site domain. Read from build-time env so the
// component tree never carries a hardcoded value (PATTERNS.md §5 anti-pattern
// #2). `enabled` gates script injection : prod + non-empty domain ⇒ inject ;
// any other case ⇒ no-op (fail-closed for staging / preview / local dev).
const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
const PLAUSIBLE_ENABLED = process.env.NODE_ENV === 'production' && Boolean(PLAUSIBLE_DOMAIN);

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const locale = headersList.get('x-locale') ?? 'fr';
  // Nonce generated in src/middleware.ts and threaded through the request
  // headers so any <Script> tag rendered in this tree (including Sentry's
  // auto-injected client bundle) can opt into the nonce-based CSP.
  const nonce = headersList.get('x-nonce') ?? undefined;

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>{nonce ? <meta property="csp-nonce" content={nonce} /> : null}</head>
      <body className={`${inter.variable} font-sans antialiased`}>
        {/* Wave C5 / T-C56 — Plausible funnel script. `domain` MUST be non-empty
            when the provider renders ; the `enabled` gate above prevents the
            script from being injected in dev / when env is unset. Cookieless +
            same-origin via `withPlausibleProxy` in `next.config.ts`. */}
        <PlausibleProvider
          domain={PLAUSIBLE_DOMAIN ?? 'musaium.local'}
          enabled={PLAUSIBLE_ENABLED}
          trackOutboundLinks
        >
          {children}
        </PlausibleProvider>
      </body>
    </html>
  );
}
