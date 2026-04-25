import { StyleSheet } from 'react-native';

import { semantic, space, radius, fontSize, lineHeightPx } from '@/shared/ui/tokens';

/**
 * Shared styles for the authentication screen and its sub-components
 * (login form, register form, social login buttons). Extracted so the
 * visual design stays consistent across the split components.
 */
export const authStyles = StyleSheet.create({
  screen: {
    paddingHorizontal: semantic.screen.padding,
    paddingBottom: semantic.card.paddingLarge,
    gap: semantic.screen.gapSmall,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
  menuWrap: {
    alignItems: 'center',
    marginBottom: space['2'],
  },
  panel: {
    paddingHorizontal: semantic.card.paddingLarge,
    paddingVertical: semantic.card.paddingLarge,
    gap: semantic.form.gapLarge,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space['4'],
  },
  headerText: {
    flex: 1,
    alignItems: 'flex-start',
    gap: space['1'],
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    textAlign: 'left',
  },
  subtitle: {
    fontSize: fontSize.sm,
    textAlign: 'left',
    lineHeight: lineHeightPx['21'],
  },
  form: {
    gap: semantic.form.gap,
  },
  infoText: {
    fontWeight: '600',
    fontSize: semantic.form.labelSize,
    marginBottom: space['1.5'],
  },
  forgotPasswordButton: {
    alignSelf: 'flex-end',
    marginTop: space['1'],
  },
  forgotPasswordText: {
    fontSize: semantic.form.labelSize,
    fontWeight: '600',
  },
  submitButton: {
    marginTop: space['2'],
    borderRadius: semantic.button.radius,
    paddingVertical: semantic.button.paddingYCompact,
    alignItems: 'center',
    shadowOpacity: 0.2,
    shadowRadius: radius.lg,
    shadowOffset: { width: 0, height: space['2'] },
  },
  submitButtonDisabled: {
    opacity: 0.72,
  },
  submitButtonText: {
    fontWeight: '700',
    fontSize: fontSize['base-'],
  },
  switchButton: {
    borderRadius: semantic.button.radiusSmall,
    borderWidth: semantic.input.borderWidth,
    paddingVertical: semantic.button.paddingY,
    alignItems: 'center',
  },
  switchButtonText: {
    fontWeight: '600',
    fontSize: semantic.button.fontSize,
  },
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2.5'],
    marginVertical: space['1'],
  },
  separatorLine: {
    flex: 1,
    height: semantic.list.separatorWidth,
  },
  separatorText: {
    fontSize: semantic.form.labelSize,
    fontWeight: '500',
  },
  appleButton: {
    height: semantic.button.heightApple,
    width: '100%',
  },
  googleButton: {
    borderRadius: semantic.button.radius,
    borderWidth: semantic.input.borderWidth,
    paddingVertical: semantic.button.paddingYCompact,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space['2.5'],
  },
  googleButtonText: {
    fontWeight: '700',
    fontSize: fontSize['base-'],
  },
  gdprRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space['2.5'],
    marginTop: space['1'],
  },
  checkbox: {
    width: semantic.chat.iconSize,
    height: semantic.chat.iconSize,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  gdprText: {
    flex: 1,
    fontSize: semantic.badge.fontSize,
    lineHeight: lineHeightPx['18'],
  },
  gdprLink: {
    fontWeight: '600',
  },
  legalText: {
    fontSize: semantic.section.labelSize,
    textAlign: 'center',
    lineHeight: lineHeightPx['18'],
    marginTop: space['1'],
  },
});
