import { authService } from '@/features/auth/infrastructure/authApi';
import { MagicLinkFlow } from '@/features/auth/ui/MagicLinkFlow';

const confirmEmailChange = (token: string) => authService.confirmEmailChange(token);

export default function ConfirmEmailChangeScreen() {
  return (
    <MagicLinkFlow
      submit={confirmEmailChange}
      copy="confirm_email_change"
      testIDPrefix="confirm-email-change"
    />
  );
}
