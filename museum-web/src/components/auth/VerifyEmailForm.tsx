import EmailTokenFlow from '@/components/auth/EmailTokenFlow';
import type { Dictionary } from '@/lib/i18n';

interface VerifyEmailFormProps {
  locale: string;
  dict: Dictionary['verifyEmail'];
}

export default function VerifyEmailForm({ locale, dict }: VerifyEmailFormProps) {
  return <EmailTokenFlow endpoint="/api/auth/verify-email" locale={locale} dict={dict} />;
}
