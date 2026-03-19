import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_COMPLETE_KEY = 'onboarding.complete';

/** Hook that manages onboarding step progression and first-launch detection. */
export const useOnboarding = (totalSteps: number) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY)
      .then((value) => setIsFirstLaunch(value !== 'true'))
      .catch(() => setIsFirstLaunch(true));
  }, []);

  const goToStep = useCallback(
    (step: number) => {
      if (step >= 0 && step < totalSteps) {
        setCurrentStep(step);
      }
    },
    [totalSteps],
  );

  const next = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, totalSteps - 1));
  }, [totalSteps]);

  const prev = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  const isLast = currentStep === totalSteps - 1;

  const completeOnboarding = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
    setIsFirstLaunch(false);
  }, []);

  return { currentStep, goToStep, next, prev, isLast, isFirstLaunch, completeOnboarding };
};
