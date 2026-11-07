import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

type PreferenceChangeEvent = 'reduceMotionChanged' | 'reduceTransparencyChanged';

export function useAccessibilityPreference(
  read: () => Promise<boolean>,
  changeEvent: PreferenceChangeEvent,
): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;

    read()
      .then((value) => {
        if (mounted) setEnabled(value);
      })
      .catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener(changeEvent, (value: boolean) => {
      if (mounted) setEnabled(value);
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [read, changeEvent]);

  return enabled;
}
