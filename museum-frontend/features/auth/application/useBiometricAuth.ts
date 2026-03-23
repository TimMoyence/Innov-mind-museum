import { useCallback, useEffect, useState } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import { useTranslation } from 'react-i18next';

import { getBiometricEnabled, setBiometricEnabled } from '../infrastructure/biometricStore';

interface UseBiometricAuthResult {
  isAvailable: boolean;
  isEnabled: boolean;
  biometricLabel: string;
  isChecking: boolean;
  authenticate: () => Promise<boolean>;
  enable: () => Promise<boolean>;
  disable: () => Promise<void>;
}

export function useBiometricAuth(): UseBiometricAuthResult {
  const { t } = useTranslation();
  const [isAvailable, setIsAvailable] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('');
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const check = async () => {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        const available = hasHardware && isEnrolled;
        setIsAvailable(available);

        if (available) {
          const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
          if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
            setBiometricLabel('Face ID');
          } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
            setBiometricLabel('Touch ID');
          } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
            setBiometricLabel('Iris');
          } else {
            setBiometricLabel('Biometric');
          }

          const stored = await getBiometricEnabled();
          setIsEnabled(stored);
        }
      } catch {
        setIsAvailable(false);
      } finally {
        setIsChecking(false);
      }
    };

    void check();
  }, []);

  const authenticate = useCallback(async (): Promise<boolean> => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('biometric.prompt'),
        fallbackLabel: t('common.cancel'),
        disableDeviceFallback: false,
      });
      return result.success;
    } catch {
      return false;
    }
  }, [t]);

  const enable = useCallback(async (): Promise<boolean> => {
    const success = await authenticate();
    if (success) {
      await setBiometricEnabled(true);
      setIsEnabled(true);
    }
    return success;
  }, [authenticate]);

  const disable = useCallback(async (): Promise<void> => {
    await setBiometricEnabled(false);
    setIsEnabled(false);
  }, []);

  return {
    isAvailable,
    isEnabled,
    biometricLabel,
    isChecking,
    authenticate,
    enable,
    disable,
  };
}
