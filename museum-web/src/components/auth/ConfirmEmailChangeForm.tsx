import EmailTokenFlow from '@/components/auth/EmailTokenFlow';
import type { Dictionary } from '@/lib/i18n';

interface ConfirmEmailChangeFormProps {
  locale: string;
  dict: Dictionary['confirmEmailChange'];
}

export default function ConfirmEmailChangeForm({ locale, dict }: ConfirmEmailChangeFormProps) {
  return <EmailTokenFlow endpoint="/api/auth/confirm-email-change" locale={locale} dict={dict} />;
}
