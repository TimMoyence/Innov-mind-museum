import { useCallback } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

import { authService } from '@/features/auth/infrastructure/authApi';
import { useAuth } from '@/features/auth/application/AuthContext';
import { AUTH_ROUTE, HOME_ROUTE } from '@/features/auth/routes';
import { TokenExchangeFlow } from '@/features/auth/ui/TokenExchangeFlow';

/**
 * Magic-link target for confirming an email-address change (TD-RNAV-01 cycle 2).
 *
 * Reached via a Universal/App Link rewritten by `app/+native-intent.tsx`.
 * Auto-submits the one-time token to `authService.confirmEmailChange` on mount
 * and shows the four-state outcome. The token is opaque and never logged (R13).
 */
export default function ConfirmEmailChangeScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { isAuthenticated } = useAuth();

  const submit = useCallback((value: string) => authService.confirmEmailChange(value), []);

  const onContinue = useCallback(() => {
    router.replace(isAuthenticated ? HOME_ROUTE : AUTH_ROUTE);
  }, [isAuthenticated]);

  return (
    <TokenExchangeFlow
      token={token}
      submit={submit}
      testIDPrefix="confirm-email-change"
      onContinue={onContinue}
      copy={{
        title: 'confirm_email_change.title',
        loading: 'confirm_email_change.loading',
        success: 'confirm_email_change.success',
        invalidToken: 'confirm_email_change.invalidToken',
        error: 'confirm_email_change.error',
        ctaLogin: 'confirm_email_change.cta_login',
      }}
    />
  );
}
