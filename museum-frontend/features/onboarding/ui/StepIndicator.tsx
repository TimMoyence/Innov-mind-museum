import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, radius } from '@/shared/ui/tokens';

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
    gap: space['2'],
    paddingVertical: semantic.screen.padding,
  },
  dot: {
    borderRadius: radius.full,
  },
  activeDot: {
    width: space['6'],
    height: space['2'],
  },
  inactiveDot: {
    width: space['2'],
    height: space['2'],
  },
});
