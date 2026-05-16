import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import type { CitationChipModel } from '@/features/chat/application/citations';
import { useTheme } from '@/shared/ui/ThemeContext';
import { fontSize, semantic, space } from '@/shared/ui/tokens';

interface CitationChipProps {
  readonly model: CitationChipModel;
  readonly onPress?: (model: CitationChipModel) => void;
}

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const PROVENANCE_ICON: Record<
  Extract<CitationChipModel, { kind: 'provenance' }>['family'],
  IoniconsName
> = {
  'museum-catalog': 'business-outline',
  'reference-db': 'library-outline',
  web: 'globe-outline',
  'ai-knowledge': 'sparkles-outline',
};

const CONFIDENCE_ICON: Record<
  Extract<CitationChipModel, { kind: 'confidence' }>['level'],
  IoniconsName
> = {
  high: 'shield-checkmark-outline',
  medium: 'alert-circle-outline',
  low: 'help-circle-outline',
};

/**
 * A6 — Atomic citation chip. Renders a single Pressable with an Ionicons
 * glyph + i18n label. Used by `<CitationChips>` to compose the bubble-bottom
 * cluster. Spec: `docs/chat-ux-refonte/specs/A6.md` §1.2 (R8-R15).
 *
 * a11y :
 *   - `accessibilityRole="button"` regardless of `onPress` (R14) — the chip
 *     is always semantically a button so VoiceOver announces it consistently.
 *   - `accessibilityHint` is set only when `onPress` is provided (R15).
 *   - label is the resolved i18n string (e.g. "Museum catalogue") so VoiceOver
 *     reads the human label instead of the icon glyph.
 */
export const CitationChip = React.memo(({ model, onPress }: CitationChipProps) => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const { label, iconName, containerStyle, textStyle } = useMemo(() => {
    if (model.kind === 'confidence') {
      const palette = {
        high: { border: theme.success, bg: theme.successBackground, text: theme.success },
        medium: { border: theme.warningText, bg: theme.warningBackground, text: theme.warningText },
        low: { border: theme.danger, bg: theme.errorBackground, text: theme.danger },
      } as const;
      const p = palette[model.level];
      return {
        label: t(`chat.citation.confidence.${model.level}`),
        iconName: CONFIDENCE_ICON[model.level],
        containerStyle: { borderColor: p.border, backgroundColor: p.bg },
        textStyle: { color: p.text },
      };
    }
    return {
      label: t(`chat.citation.family.${model.family}`),
      iconName: PROVENANCE_ICON[model.family],
      containerStyle: { borderColor: theme.cardBorder, backgroundColor: theme.surface },
      textStyle: { color: theme.textSecondary },
    };
  }, [model, theme, t]);

  const isPressable = typeof onPress === 'function';
  const a11yHint = isPressable ? t('chat.citation.chip.a11y_hint') : undefined;
  const handlePress = isPressable
    ? () => {
        onPress(model);
      }
    : undefined;

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={a11yHint}
      hitSlop={6}
      style={[styles.chip, containerStyle]}
    >
      <View style={styles.row}>
        <Ionicons name={iconName} size={14} color={textStyle.color} />
        <Text style={[styles.label, textStyle]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
});
CitationChip.displayName = 'CitationChip';

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: space['1.5'],
    paddingVertical: space['0.5'],
    borderRadius: semantic.input.radiusSmall,
    borderWidth: semantic.input.borderWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: space['1'],
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
});
