import { useEffect } from 'react';
import { BackHandler } from 'react-native';

export const useHardwareBack = (onBack: () => void, enabled = true): void => {
  useEffect(() => {
    if (!enabled) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => {
      subscription.remove();
    };
  }, [enabled, onBack]);
};
