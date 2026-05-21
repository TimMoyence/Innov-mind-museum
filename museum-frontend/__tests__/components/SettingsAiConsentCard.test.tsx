import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import '../helpers/test-utils';
import { SettingsAiConsentCard } from '@/features/settings/ui/SettingsAiConsentCard';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockListUserConsents = jest.fn<Promise<unknown[]>, []>();
const mockGrantConsentScope = jest.fn<Promise<void>, [string]>();
const mockRevokeConsentScope = jest.fn<Promise<void>, [string]>();
const mockClearConsentAcceptedFlag = jest.fn<Promise<void>, []>();

jest.mock('@/features/chat/application/thirdPartyAiConsent', () => {
  const SCOPES = [
    'third_party_ai_text_openai',
    'third_party_ai_image_openai',
    'third_party_ai_audio_openai',
    'third_party_ai_profile_openai',
    'third_party_ai_text_google',
    'third_party_ai_image_google',
    'third_party_ai_audio_google',
    'third_party_ai_profile_google',
  ] as const;
  return {
    THIRD_PARTY_AI_SCOPES: SCOPES,
    REQUIRED_CONSENT_SCOPE: 'third_party_ai_text_openai',
    CONSENT_POLICY_VERSION: '2026-06-01',
    listUserConsents: () => mockListUserConsents(),
    grantConsentScope: (scope: string) => mockGrantConsentScope(scope),
    revokeConsentScope: (scope: string) => mockRevokeConsentScope(scope),
  };
});

jest.mock('@/features/chat/application/useAiConsent', () => ({
  clearConsentAcceptedFlag: () => mockClearConsentAcceptedFlag(),
}));

// `@sentry/react-native` is mocked globally in `__tests__/helpers/test-utils.tsx`
// — reuse that mock instead of redeclaring (the global mock wins last-wins).
const mockSentryCapture: jest.Mock = require('@sentry/react-native').captureException;

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SettingsAiConsentCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders one Switch per third-party-AI scope after listing consents', async () => {
    mockListUserConsents.mockResolvedValue([]);

    const { getAllByRole, getByText } = render(<SettingsAiConsentCard />);

    await waitFor(() => {
      expect(mockListUserConsents).toHaveBeenCalledTimes(1);
    });

    expect(getByText('settings.ai_consent_title')).toBeTruthy();
    const switches = getAllByRole('switch');
    expect(switches).toHaveLength(8);
    for (const sw of switches) {
      expect(sw.props.value).toBe(false);
    }
  });

  it('reflects granted state from BE on initial load', async () => {
    mockListUserConsents.mockResolvedValue([
      {
        id: 1,
        scope: 'third_party_ai_text_openai',
        version: '2026-06-01',
        grantedAt: '2026-05-16T10:00:00.000Z',
        revokedAt: null,
        source: 'ui',
      },
      {
        id: 2,
        scope: 'third_party_ai_image_openai',
        version: '2026-06-01',
        grantedAt: '2026-05-16T10:01:00.000Z',
        revokedAt: '2026-05-16T11:00:00.000Z', // revoked → off
        source: 'ui',
      },
    ]);

    const { getAllByRole } = render(<SettingsAiConsentCard />);

    await waitFor(() => {
      const switches = getAllByRole('switch');
      expect(switches[0]?.props.value).toBe(true);
    });
    const switches = getAllByRole('switch');
    expect(switches[1]?.props.value).toBe(false);
  });

  it('calls revokeConsentScope when an active Switch is toggled off', async () => {
    mockListUserConsents.mockResolvedValue([
      {
        id: 1,
        scope: 'third_party_ai_text_openai',
        version: '2026-06-01',
        grantedAt: '2026-05-16T10:00:00.000Z',
        revokedAt: null,
        source: 'ui',
      },
    ]);
    mockRevokeConsentScope.mockResolvedValue(undefined);

    const { getAllByRole } = render(<SettingsAiConsentCard />);
    await waitFor(() => {
      expect(getAllByRole('switch')[0]?.props.value).toBe(true);
    });

    const switches = getAllByRole('switch');
    const firstSwitch = switches[0];
    if (!firstSwitch) throw new Error('expected first switch');
    fireEvent(firstSwitch, 'valueChange', false);

    await waitFor(() => {
      expect(mockRevokeConsentScope).toHaveBeenCalledWith('third_party_ai_text_openai');
    });
  });

  it('clears the local accepted-flag when the user revokes the REQUIRED scope', async () => {
    // BE says the required scope is currently granted ; user is about to revoke it.
    mockListUserConsents.mockResolvedValue([
      {
        id: 1,
        scope: 'third_party_ai_text_openai',
        version: '2026-06-01',
        grantedAt: '2026-05-16T10:00:00.000Z',
        revokedAt: null,
        source: 'ui',
      },
    ]);
    mockRevokeConsentScope.mockResolvedValue(undefined);
    mockClearConsentAcceptedFlag.mockResolvedValue(undefined);

    const { getAllByRole } = render(<SettingsAiConsentCard />);
    await waitFor(() => {
      expect(getAllByRole('switch')[0]?.props.value).toBe(true);
    });

    const firstSwitch = getAllByRole('switch')[0];
    if (!firstSwitch) throw new Error('expected consent switches to be rendered');
    fireEvent(firstSwitch, 'valueChange', false);

    await waitFor(() => {
      expect(mockRevokeConsentScope).toHaveBeenCalledWith('third_party_ai_text_openai');
    });
    // Without this, the consent sheet would NOT re-prompt on next chat mount
    // (the stale "we already asked" memo would still be 'true').
    expect(mockClearConsentAcceptedFlag).toHaveBeenCalledTimes(1);
  });

  it('keeps the local accepted-flag when the user revokes an OPTIONAL scope', async () => {
    // BE says an optional scope (audio_google) is currently granted.
    mockListUserConsents.mockResolvedValue([
      {
        id: 7,
        scope: 'third_party_ai_audio_google',
        version: '2026-06-01',
        grantedAt: '2026-05-16T10:00:00.000Z',
        revokedAt: null,
        source: 'ui',
      },
    ]);
    mockRevokeConsentScope.mockResolvedValue(undefined);

    const { getAllByRole } = render(<SettingsAiConsentCard />);
    await waitFor(() => {
      // 7th switch (index 6) = audio_google.
      expect(getAllByRole('switch')[6]?.props.value).toBe(true);
    });

    const audioGoogleSwitch = getAllByRole('switch')[6];
    if (!audioGoogleSwitch)
      throw new Error('expected the audio_google consent switch to be rendered');
    fireEvent(audioGoogleSwitch, 'valueChange', false);

    await waitFor(() => {
      expect(mockRevokeConsentScope).toHaveBeenCalledWith('third_party_ai_audio_google');
    });
    // Optional revocation = the user is informed-managing, not withdrawing —
    // sheet should NOT re-prompt next session.
    expect(mockClearConsentAcceptedFlag).not.toHaveBeenCalled();
  });

  it('reports BE failures to Sentry and rolls back the optimistic UI update', async () => {
    mockListUserConsents.mockResolvedValue([]);
    mockGrantConsentScope.mockRejectedValue(new Error('Network down'));

    const { getAllByRole } = render(<SettingsAiConsentCard />);
    await waitFor(() => {
      expect(mockListUserConsents).toHaveBeenCalled();
    });

    const switches = getAllByRole('switch');
    const firstSwitch = switches[0];
    if (!firstSwitch) throw new Error('expected first switch');
    fireEvent(firstSwitch, 'valueChange', true);

    await waitFor(() => {
      expect(mockSentryCapture).toHaveBeenCalled();
    });
    expect(mockSentryCapture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({
          flow: 'consent.grant.settings',
          scope: 'third_party_ai_text_openai',
        }),
      }),
    );
    // Optimistic update rolled back — switch back to false.
    expect(getAllByRole('switch')[0]?.props.value).toBe(false);
  });
});
