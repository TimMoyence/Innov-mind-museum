import EmailTokenFlow from '@/components/auth/EmailTokenFlow';
import type { Dictionary } from '@/lib/i18n';

interface VerifyEmailFormProps {
  locale: string;
  dict: Dictionary['verifyEmail'];
}

/**
 * Thin wrapper: binds the shared {@link EmailTokenFlow} to the email-verification endpoint.
 * Kept as a standalone component so the server page can consume it without reaching into
 * the shared module's prop shape (and to keep a single place to tweak verify-specific copy).
 */
export default function VerifyEmailForm({ locale, dict }: VerifyEmailFormProps) {
  return <EmailTokenFlow endpoint="/api/auth/verify-email" locale={locale} dict={dict} />;
}
