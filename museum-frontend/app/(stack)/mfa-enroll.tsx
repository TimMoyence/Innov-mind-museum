import { router } from 'expo-router';

import { MfaEnrollScreen } from '@/features/auth/screens/MfaEnrollScreen';

/**
 * TD-SEC-02 (R8) — minimal Expo route mounting `MfaEnrollScreen` so the
 * (previously orphaned) TOTP enrollment screen is reachable by users and by the
 * UFR-021 Maestro happy-path flow. Inherits the authenticated stack context
 * (no new auth gating — design D7); navigates back on success, matching the
 * change-password back-on-success idiom (design D6).
 */
export default function MfaEnrollRoute() {
  return (
    <MfaEnrollScreen
      onEnrolled={() => {
        router.back();
      }}
    />
  );
}
