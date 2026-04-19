import { defaultLocale, getDictionary, locales, type Locale } from '@/lib/i18n';
import VerifyEmailForm from '@/components/auth/VerifyEmailForm';

interface VerifyEmailPageProps {
  params: Promise<{ locale: string }>;
}

/** Resolve an untrusted URL segment to a supported {@link Locale}, defaulting safely. */
function resolveLocale(input: string): Locale {
  return (locales as readonly string[]).includes(input) ? (input as Locale) : defaultLocale;
}

export default async function VerifyEmailPage({ params }: VerifyEmailPageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const dict = await getDictionary(locale);

  return <VerifyEmailForm locale={locale} dict={dict.verifyEmail} />;
}
