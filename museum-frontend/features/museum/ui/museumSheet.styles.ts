import { StyleSheet } from 'react-native';

import { fontSize, radius, semantic, space } from '@/shared/ui/tokens';

export const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    borderTopLeftRadius: radius['3xl'],
    borderTopRightRadius: radius['3xl'],
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: semantic.card.padding,
    paddingTop: space['2'],
    paddingBottom: space['6'],
    maxHeight: '85%',
  },
  scrollContent: {
    gap: space['2.5'],
    paddingBottom: space['2'],
  },
  handle: {
    alignSelf: 'center',
    width: space['10'],
    height: space['1'],
    borderRadius: radius.full,
    marginBottom: space['1.5'],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space['2'],
  },
  titleBlock: {
    flex: 1,
    gap: space['1.5'],
  },
  name: {
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: semantic.card.gapTiny,
    paddingHorizontal: semantic.badge.paddingX,
    paddingVertical: semantic.badge.paddingY,
    borderRadius: radius.full,
  },
  categoryDot: {
    width: space['2'],
    height: space['2'],
    borderRadius: radius.full,
  },
  categoryLabel: {
    fontSize: semantic.badge.fontSize,
    fontWeight: '700',
  },
  closeButton: {
    padding: space['1'],
  },
  heroImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.lg,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.section.gapTight,
  },
  addressText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: space['5'],
  },
  distanceText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  description: {
    fontSize: fontSize.sm,
    lineHeight: space['5'],
  },
  sectionBlock: {
    gap: space['1'],
  },
  sectionHeading: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hoursLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  weeklyLine: {
    fontSize: fontSize.sm,
    lineHeight: space['5'],
  },
  summaryText: {
    fontSize: fontSize.sm,
    lineHeight: space['5'],
  },
  placeholderText: {
    fontSize: fontSize.sm,
    fontStyle: 'italic',
  },
  contactRow: {
    flexDirection: 'row',
    gap: space['2'],
    flexWrap: 'wrap',
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.section.gapTight,
    borderWidth: semantic.input.borderWidth,
    borderRadius: radius.DEFAULT,
    paddingHorizontal: space['2.5'],
    paddingVertical: space['2'],
  },
  contactButtonText: {
    fontSize: semantic.form.labelSize,
    fontWeight: '600',
  },
  primaryButton: {
    marginTop: space['1'],
    borderRadius: semantic.button.radius,
    paddingVertical: semantic.button.paddingYCompact,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: semantic.card.gapSmall,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    fontWeight: '700',
    fontSize: fontSize['base-'],
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: space['2'],
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: semantic.section.gapTight,
    borderWidth: semantic.input.borderWidth,
    borderRadius: radius.DEFAULT,
    paddingHorizontal: space['2.5'],
    paddingVertical: space['2'],
  },
  secondaryButtonText: {
    fontSize: semantic.form.labelSize,
    fontWeight: '600',
  },
});
