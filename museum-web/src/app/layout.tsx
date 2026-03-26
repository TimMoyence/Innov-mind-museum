import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    template: '%s | Musaium',
    default: 'Musaium — L\'assistant muséal intelligent',
  },
  description:
    'Photographiez une œuvre, posez une question, et laissez l\'IA vous guider.',
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://musaium.com',
  ),
  icons: {
    icon: '/images/favicon.png',
    apple: '/images/logo.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'Musaium',
    locale: 'fr_FR',
    images: [{ url: '/images/logo.png', width: 1024, height: 1024, alt: 'Musaium' }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
