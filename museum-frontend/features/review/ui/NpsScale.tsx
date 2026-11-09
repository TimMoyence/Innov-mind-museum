import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, radius, fontSize } from '@/shared/ui/tokens';

interface NpsScaleProps {
  value: number | null;
  onChange: (value: number) => void;
}

const NPS_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

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
