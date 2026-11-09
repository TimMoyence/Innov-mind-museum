import { defaultLocale, getDictionary, locales, type Locale } from '@/lib/i18n';
import ConfirmEmailChangeForm from '@/components/auth/ConfirmEmailChangeForm';

interface ConfirmEmailChangePageProps {
  params: Promise<{ locale: string }>;
}

function resolveLocale(input: string): Locale {
  return (locales as readonly string[]).includes(input) ? (input as Locale) : defaultLocale;
}

export default async function ConfirmEmailChangePage({ params }: ConfirmEmailChangePageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const dict = await getDictionary(locale);

  return <ConfirmEmailChangeForm locale={locale} dict={dict.confirmEmailChange} />;
}
