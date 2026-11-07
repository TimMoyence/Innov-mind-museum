import { AccessibilityInfo } from 'react-native';

import { useAccessibilityPreference } from './useAccessibilityPreference';

const readReduceMotion = (): Promise<boolean> => AccessibilityInfo.isReduceMotionEnabled();

export function useReducedMotion(): boolean {
  return useAccessibilityPreference(readReduceMotion, 'reduceMotionChanged');
}
