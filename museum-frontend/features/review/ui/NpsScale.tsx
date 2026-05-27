import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, radius, fontSize } from '@/shared/ui/tokens';

interface NpsScaleProps {
  /** Currently selected value (0..10), or null when nothing is selected yet. */
  value: number | null;
  /** Emits the tapped value verbatim (0 is a valid lowest detractor — never floored). */
  onChange: (value: number) => void;
}

/** 0..10 NPS recommendation scale (11 tappable digit buttons). */
const NPS_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/**
 * NPS input: 11 buttons labelled 0..10. Text digits only (no stars, no emoji);
 * RTL logical props; each button is an a11y `button` with the selected value
 * flagged via `accessibilityState.selected`. No fixed `accessibilityValue` cap.
 */
export const NpsScale = ({ value, onChange }: NpsScaleProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <View style={styles.row} testID="nps-scale">
      {NPS_VALUES.map((v) => {
        const selected = value === v;
        return (
          <Pressable
            key={v}
            testID={`nps-value-${String(v)}`}
            onPress={() => {
              void Haptics.selectionAsync();
              onChange(v);
            }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.reviews.nps_value', { value: v })}
            accessibilityState={{ selected }}
            style={[
              styles.cell,
              {
                borderColor: selected ? theme.primary : theme.inputBorder,
                backgroundColor: selected ? theme.primary : theme.inputBackground,
              },
            ]}
          >
            <Text
              style={[
                styles.cellText,
                { color: selected ? theme.primaryContrast : theme.textPrimary },
              ]}
            >
              {String(v)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space['1.5'],
  },
  cell: {
    minWidth: space['8'],
    paddingVertical: space['2'],
    paddingHorizontal: space['2'],
    borderRadius: radius.DEFAULT,
    borderWidth: semantic.input.borderWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: {
    fontWeight: '700',
    fontSize: fontSize.sm,
  },
});
