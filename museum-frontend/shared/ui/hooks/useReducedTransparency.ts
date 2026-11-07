import { AccessibilityInfo } from 'react-native';

import { useAccessibilityPreference } from './useAccessibilityPreference';

const readReduceTransparency = (): Promise<boolean> =>
  AccessibilityInfo.isReduceTransparencyEnabled();

export function useReducedTransparency(): boolean {
  return useAccessibilityPreference(readReduceTransparency, 'reduceTransparencyChanged');
}
