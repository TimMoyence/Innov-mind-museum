import { authService } from '@/features/auth/infrastructure/authApi';
import { MagicLinkFlow } from '@/features/auth/ui/MagicLinkFlow';

const verifyEmail = (token: string) => authService.verifyEmail(token);

export default function VerifyEmailScreen() {
  return <MagicLinkFlow submit={verifyEmail} copy="verify_email" testIDPrefix="verify-email" />;
}
