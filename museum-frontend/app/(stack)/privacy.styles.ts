import { StyleSheet } from 'react-native';

import {
  fontSize,
  lineHeightPx,
  radius,
  semantic,
  space,
} from '@/shared/ui/tokens';

export const styles = StyleSheet.create({
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
  heroCard: {
    padding: semantic.card.paddingLarge,
    gap: space['2.5'],
  },
  heroHeader: {
    gap: semantic.card.gapSmall,
  },
  title: {
    fontSize: semantic.section.titleSizeLarge,
    fontWeight: '700',
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: space['2.5'],
    paddingVertical: space['1.5'],
    borderWidth: semantic.input.borderWidth,
  },
  statusPillText: {
    fontSize: semantic.badge.fontSizeSmall,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: semantic.form.labelSize,
    lineHeight: lineHeightPx['19'],
  },
  metaList: {
    gap: semantic.card.gapSmall,
  },
  metaRow: {
    gap: semantic.card.gapTiny,
  },
  metaLabel: {
    fontSize: semantic.card.captionSize,
    fontWeight: '700',
  },
  metaValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.card.gapSmall,
    flexWrap: 'wrap',
  },
  metaValue: {
    fontSize: semantic.card.captionSize,
    lineHeight: semantic.card.paddingLarge,
  },
  metaValuePlaceholder: {
    fontWeight: '700',
  },
  pendingBadge: {
    borderWidth: semantic.input.borderWidth,
    borderRadius: radius.full,
    paddingHorizontal: semantic.badge.paddingX,
    paddingVertical: semantic.badge.paddingYTight,
    fontWeight: '700',
    fontSize: space['2.5'],
  },
  card: {
    padding: semantic.card.padding,
    gap: semantic.card.gapSmall,
  },
  warningCard: {
    padding: semantic.card.padding,
    gap: semantic.card.gapSmall,
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: fontSize['base-'],
  },
  warningTitle: {
    fontWeight: '700',
    fontSize: fontSize['base-'],
  },
  warningText: {
    fontSize: semantic.form.labelSize,
    lineHeight: lineHeightPx['19'],
  },
  warningBullet: {
    fontSize: semantic.form.labelSize,
    lineHeight: space['5'],
  },
  quickFactsList: {
    gap: semantic.card.gapSmall,
  },
  quickFactRow: {
    borderRadius: semantic.card.radiusCompact,
    borderWidth: semantic.input.borderWidth,
    padding: space['2.5'],
    gap: semantic.badge.paddingYTight,
  },
  quickFactLabel: {
    fontWeight: '700',
    fontSize: semantic.card.captionSize,
  },
  quickFactValue: {
    fontSize: semantic.card.captionSize,
    lineHeight: semantic.card.paddingLarge,
  },
  bulletGroup: {
    gap: space['2'],
  },
  bulletText: {
    fontSize: semantic.form.labelSize,
    lineHeight: space['5'],
  },
  sectionIndex: {
    gap: semantic.section.gapTight,
  },
  sectionIndexItem: {
    fontSize: semantic.card.captionSize,
    lineHeight: semantic.card.paddingLarge,
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
  ctaRow: {
    gap: space['2.5'],
    marginTop: space['0.5'],
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
});
