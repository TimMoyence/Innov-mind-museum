import '@/__tests__/helpers/test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import type { ComponentType } from 'react';

const CONSENT_STORAGE_KEY = 'musaium.analytics.consent';
const VALUE_GRANTED = 'granted';

interface BannerSut {
  ConsentBanner: ComponentType<Record<string, never>>;
}

function loadConsentBannerSut(): BannerSut {
  const mod = require('@/shared/analytics/ConsentBanner') as Partial<BannerSut>;
  if (typeof mod.ConsentBanner !== 'function') {
    throw new Error(
      'Green contract violation: `@/shared/analytics/ConsentBanner` must export a `ConsentBanner` React component (TD-C5-MOBILE-CONSENT-01).',
    );
  }
  return mod as BannerSut;
}

describe('TD-C5-MOBILE-CONSENT-01 — ConsentBanner UI flow', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(async () => {
    await AsyncStorage.clear();
  });

  it('default (no decision yet) → banner is VISIBLE with both CTAs', async () => {
    const { ConsentBanner } = loadConsentBannerSut();

    render(<ConsentBanner />);

    await waitFor(() => {
      expect(screen.getByText('paywall.analyticsConsent.title')).toBeTruthy();
    });
    expect(screen.getByText('paywall.analyticsConsent.description')).toBeTruthy();
    expect(screen.getByText('paywall.analyticsConsent.optIn')).toBeTruthy();
    expect(screen.getByText('paywall.analyticsConsent.optOut')).toBeTruthy();
  });

  it('tap Accept → grant() persists "granted" in AsyncStorage + banner dismissed', async () => {
    const { ConsentBanner } = loadConsentBannerSut();
    render(<ConsentBanner />);

    fireEvent.press(screen.getByText('paywall.analyticsConsent.optIn'));

    await waitFor(async () => {
      const stored = await AsyncStorage.getItem(CONSENT_STORAGE_KEY);
      expect(stored).toBe(VALUE_GRANTED);
    });

    await waitFor(() => {
      expect(screen.queryByText('paywall.analyticsConsent.title')).toBeNull();
    });
  });

  it('tap Decline → consent NOT persisted as granted + banner dismissed + does not re-appear on remount', async () => {
    const { ConsentBanner } = loadConsentBannerSut();
    const first = render(<ConsentBanner />);

    fireEvent.press(screen.getByText('paywall.analyticsConsent.optOut'));

    await waitFor(async () => {
      const storedAfterDecline = await AsyncStorage.getItem(CONSENT_STORAGE_KEY);
      expect(storedAfterDecline).not.toBe(VALUE_GRANTED);
    });

    await waitFor(() => {
      expect(screen.queryByText('paywall.analyticsConsent.title')).toBeNull();
    });

    first.unmount();

    render(<ConsentBanner />);

    await waitFor(() => {
      expect(screen.queryByText('paywall.analyticsConsent.title')).toBeNull();
    });
  });

  void act;
});
