import { useCallback } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

import { authService } from '@/features/auth/infrastructure/authApi';
import { useAuth } from '@/features/auth/application/AuthContext';
import { AUTH_ROUTE, HOME_ROUTE } from '@/features/auth/routes';
import { TokenExchangeFlow } from '@/features/auth/ui/TokenExchangeFlow';

/**
 * Magic-link target for email verification (TD-RNAV-01 cycle 2).
 *
 * Reached via a Universal/App Link rewritten by `app/+native-intent.tsx`
 * (`/(locale)/verify-email?token=…` → `/verify-email?token=…`). Auto-submits
 * the one-time token to `authService.verifyEmail` on mount and shows the
 * four-state outcome. The token is opaque and never logged (R13).
 */
export default function VerifyEmailScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { isAuthenticated } = useAuth();

  const submit = useCallback((value: string) => authService.verifyEmail(value), []);

  const onContinue = useCallback(() => {
    router.replace(isAuthenticated ? HOME_ROUTE : AUTH_ROUTE);
  }, [isAuthenticated]);

  return (
    <TokenExchangeFlow
      token={token}
      submit={submit}
      testIDPrefix="verify-email"
      onContinue={onContinue}
      copy={{
        title: 'verify_email.title',
        loading: 'verify_email.loading',
        success: 'verify_email.success',
        invalidToken: 'verify_email.invalidToken',
        error: 'verify_email.error',
        ctaLogin: 'verify_email.cta_login',
      }}
    />
  );
}
