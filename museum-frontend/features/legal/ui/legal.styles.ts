import type { TextStyle, ViewStyle } from 'react-native';

import { fontSize, lineHeightPx, semantic, space } from '@/shared/ui/tokens';

export const legalScreenStyles = {
  screen: {
    paddingTop: semantic.screen.paddingXL,
    paddingHorizontal: semantic.card.paddingLarge,
    paddingBottom: space['3.5'],
  },
  menuWrap: {
    alignItems: 'center',
    marginBottom: space['2.5'],
  },
  scrollContent: {
    gap: semantic.screen.gapSmall,
    paddingBottom: space['5.5'],
  },
  title: {
    fontSize: semantic.section.titleSizeLarge,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: semantic.form.labelSize,
    lineHeight: lineHeightPx['19'],
  },
  sectionCard: {
    padding: semantic.card.padding,
    gap: semantic.card.gapSmall,
  },
  sectionTitle: {
    fontWeight: '700',
    fontSize: fontSize['base-'],
  },
  paragraphGroup: {
    gap: semantic.card.gapSmall,
  },
  paragraph: {
    fontSize: semantic.form.labelSize,
    lineHeight: space['5'],
  },
  ctaCard: {
    padding: semantic.card.padding,
    gap: semantic.card.gapSmall,
  },
  primaryButton: {
    borderRadius: semantic.button.radiusSmall,
    alignItems: 'center',
    paddingVertical: semantic.button.paddingY,
  },
  primaryButtonText: {
    fontWeight: '700',
    fontSize: semantic.form.labelSize,
  },
  secondaryButton: {
    borderRadius: semantic.button.radiusSmall,
    borderWidth: semantic.input.borderWidth,
    alignItems: 'center',
    paddingVertical: semantic.button.paddingY,
  },
  secondaryButtonText: {
    fontWeight: '700',
    fontSize: semantic.form.labelSize,
  },
} satisfies Record<string, ViewStyle | TextStyle>;
