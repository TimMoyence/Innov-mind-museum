import { StyleSheet } from 'react-native';

import { fontSize, radius, semantic, space } from '@/shared/ui/tokens';

export const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: space['4.5'],
    paddingBottom: semantic.screen.padding,
  },
  backButton: {
    marginBottom: semantic.card.gapSmall,
    alignSelf: 'flex-start',
    padding: space['1'],
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: semantic.screen.gapSmall,
    paddingBottom: space['5.5'],
  },
  heroCard: {
    padding: semantic.modal.padding,
    alignItems: 'center',
    gap: space['2.5'],
  },
  heroIcon: {
    marginBottom: space['1'],
  },
  title: {
    fontSize: fontSize['2xl+'],
    fontWeight: '700',
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.section.gapTight,
  },
  infoText: {
    fontSize: fontSize.sm,
    lineHeight: space['5'],
    flex: 1,
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.card.gapTiny,
    paddingHorizontal: space['2.5'],
    paddingVertical: space['1'],
    borderRadius: radius.DEFAULT,
  },
  distanceText: {
    fontSize: semantic.form.labelSize,
    fontWeight: '700',
  },
  descCard: {
    padding: semantic.card.padding,
    gap: semantic.card.gapSmall,
  },
  sectionTitle: {
    fontSize: fontSize['lg-'],
    fontWeight: '700',
  },
  description: {
    fontSize: fontSize.sm,
    lineHeight: space['5.5'],
  },
  heroImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.lg,
  },
  hoursLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  weeklyLine: {
    fontSize: fontSize.sm,
    lineHeight: space['5'],
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
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.section.gapTight,
  },
  placeholderText: {
    fontSize: fontSize.sm,
    fontStyle: 'italic',
  },
  mapsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: semantic.section.gapTight,
    borderWidth: semantic.input.borderWidth,
    borderRadius: radius.DEFAULT,
    paddingHorizontal: space['3.5'],
    paddingVertical: space['2'],
  },
  mapsButtonText: {
    fontSize: semantic.form.labelSize,
    fontWeight: '600',
  },
  primaryButton: {
    marginTop: space['1'],
    borderRadius: semantic.button.radius,
    paddingVertical: semantic.button.paddingYCompact,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: semantic.card.gapSmall,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
  },
  primaryButtonText: {
    fontWeight: '700',
    fontSize: fontSize['base-'],
  },
});
