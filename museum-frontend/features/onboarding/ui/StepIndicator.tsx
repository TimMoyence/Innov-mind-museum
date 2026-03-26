import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/shared/ui/ThemeContext';

interface StepIndicatorProps {
  totalSteps: number;
  currentStep: number;
}

/** Dot indicator showing progress through onboarding steps. */
export const StepIndicator = ({ totalSteps, currentStep }: StepIndicatorProps) => {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      {Array.from({ length: totalSteps }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === currentStep
              ? [styles.activeDot, { backgroundColor: theme.primary }]
              : [styles.inactiveDot, { backgroundColor: theme.cardBorder }],
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  dot: {
    borderRadius: 999,
  },
  activeDot: {
    width: 24,
    height: 8,
  },
  inactiveDot: {
    width: 8,
    height: 8,
  },
});
