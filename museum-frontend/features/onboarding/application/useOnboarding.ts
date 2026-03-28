import { useCallback, useState } from 'react';

/** Hook that manages onboarding step progression. */
export const useOnboarding = (totalSteps: number) => {
  const [currentStep, setCurrentStep] = useState(0);

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

  return { currentStep, goToStep, next, prev, isLast };
};
