import { useCallback } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

import { useAuth } from '@/features/auth/application/AuthContext';
import { AUTH_ROUTE, HOME_ROUTE } from '@/features/auth/routes';
import { TokenExchangeFlow } from '@/features/auth/ui/TokenExchangeFlow';

type MagicLinkCopy = 'verify_email' | 'confirm_email_change';

interface MagicLinkFlowProps {
  submit: (token: string) => Promise<unknown>;
  copy: MagicLinkCopy;
  testIDPrefix: string;
}

export function MagicLinkFlow({ submit, copy, testIDPrefix }: MagicLinkFlowProps) {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { isAuthenticated } = useAuth();

  const onContinue = useCallback(() => {
    router.replace(isAuthenticated ? HOME_ROUTE : AUTH_ROUTE);
  }, [isAuthenticated]);

  return (
    <TokenExchangeFlow
      token={token}
      submit={submit}
      testIDPrefix={testIDPrefix}
      onContinue={onContinue}
      copy={{
        title: `${copy}.title`,
        loading: `${copy}.loading`,
        success: `${copy}.success`,
        invalidToken: `${copy}.invalidToken`,
        error: `${copy}.error`,
        ctaLogin: `${copy}.cta_login`,
      }}
    />
  );
}
