import { getDictionary, type Locale } from '@/lib/i18n';
import ResetPasswordForm from '@/components/auth/ResetPasswordForm';

interface ResetPasswordPageProps {
  params: Promise<{ locale: string }>;
}

export default async function ResetPasswordPage({ params }: ResetPasswordPageProps) {
  const { locale } = await params;
  const dict = await getDictionary(locale as Locale);

  return <ResetPasswordForm dict={dict.resetPassword} />;
}
