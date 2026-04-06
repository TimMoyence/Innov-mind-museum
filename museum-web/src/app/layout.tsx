import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
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
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://musaium.com',
  ),
  icons: {
    icon: '/images/favicon.png',
    apple: '/images/logo.png',
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const locale = headersList.get('x-locale') ?? 'fr';

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
