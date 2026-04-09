import { StyleSheet } from 'react-native';

/**
 * Shared styles for the authentication screen and its sub-components
 * (login form, register form, social login buttons). Extracted so the
 * visual design stays consistent across the split components.
 */
export const authStyles = StyleSheet.create({
  screen: {
    paddingHorizontal: 16,
    paddingBottom: 18,
    gap: 12,
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
    marginBottom: 8,
  },
  panel: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 14,
  },
  header: {
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },
  form: {
    gap: 10,
  },
  infoText: {
    fontWeight: '600',
    fontSize: 13,
    marginBottom: 6,
  },
  forgotPasswordButton: {
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  forgotPasswordText: {
    fontSize: 13,
    fontWeight: '600',
  },
  submitButton: {
    marginTop: 8,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  submitButtonDisabled: {
    opacity: 0.72,
  },
  submitButtonText: {
    fontWeight: '700',
    fontSize: 15,
  },
  switchButton: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  switchButtonText: {
    fontWeight: '600',
    fontSize: 14,
  },
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 4,
  },
  separatorLine: {
    flex: 1,
    height: 1,
  },
  separatorText: {
    fontSize: 13,
    fontWeight: '500',
  },
  appleButton: {
    height: 50,
    width: '100%',
  },
  googleButton: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  googleButtonText: {
    fontWeight: '700',
    fontSize: 15,
  },
  gdprRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  gdprText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  gdprLink: {
    fontWeight: '600',
  },
  legalText: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 4,
  },
});
