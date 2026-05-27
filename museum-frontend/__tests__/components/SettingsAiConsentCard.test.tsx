import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import '../helpers/test-utils';
import { SettingsAiConsentCard } from '@/features/settings/ui/SettingsAiConsentCard';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockListUserConsents = jest.fn<Promise<unknown[]>, []>();
const mockGrantConsentScope = jest.fn<Promise<void>, [string]>();
const mockRevokeConsentScope = jest.fn<Promise<void>, [string]>();
const mockClearConsentAcceptedFlag = jest.fn<Promise<void>, []>();

// C1 hexagonal (2026-05-23) — `thirdPartyAiConsent.ts` was split into a
// pure-data `domain/consentScopes` module + a `infrastructure/consentApi`
// service. The component imports constants from the former and HTTP fns
// from the latter ; we mock the service and let the real domain module load.
jest.mock('@/features/chat/infrastructure/consentApi', () => ({
  consentApi: {
    list: () => mockListUserConsents(),
    grant: (scope: string) => mockGrantConsentScope(scope),
    revoke: (scope: string) => mockRevokeConsentScope(scope),
  },
}));

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
    // 8 provider scopes + 2 geo scopes (location_to_llm full + location_coarse_to_llm
    // coarse — Cycle 1.5-FE REQ-FE-1). The card is data-driven on
    // THIRD_PARTY_AI_SCOPES so the coarse switch appears automatically once the
    // scope is appended to the domain list.
    expect(switches).toHaveLength(10);
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

  // B9 (spec R5 / AC-B9-2) — the location_to_llm row (index 8, after the 8
  // provider scopes) grants/revokes via the same /api/auth/consent round-trip.
  it('grants location_to_llm when its Switch is toggled on', async () => {
    mockListUserConsents.mockResolvedValue([]);
    mockGrantConsentScope.mockResolvedValue(undefined);

    const { getAllByRole } = render(<SettingsAiConsentCard />);
    await waitFor(() => {
      expect(mockListUserConsents).toHaveBeenCalled();
    });

    const switches = getAllByRole('switch');
    const locationSwitch = switches[8];
    if (!locationSwitch) throw new Error('expected location switch at index 8');
    fireEvent(locationSwitch, 'valueChange', true);

    await waitFor(() => {
      expect(mockGrantConsentScope).toHaveBeenCalledWith('location_to_llm');
    });
  });

  it('revokes location_to_llm when its Switch is toggled off (optional scope — flag not cleared)', async () => {
    mockListUserConsents.mockResolvedValue([
      {
        id: 9,
        scope: 'location_to_llm',
        version: '2026-06-01',
        grantedAt: '2026-05-16T10:00:00.000Z',
        revokedAt: null,
        source: 'ui',
      },
    ]);
    mockRevokeConsentScope.mockResolvedValue(undefined);

    const { getAllByRole } = render(<SettingsAiConsentCard />);
    await waitFor(() => {
      expect(getAllByRole('switch')[8]?.props.value).toBe(true);
    });

    const locationSwitch = getAllByRole('switch')[8];
    if (!locationSwitch) throw new Error('expected location_to_llm switch at index 8');
    fireEvent(locationSwitch, 'valueChange', false);

    await waitFor(() => {
      expect(mockRevokeConsentScope).toHaveBeenCalledWith('location_to_llm');
    });
    // location_to_llm is OPTIONAL — revoking it must NOT clear the "already
    // asked" memo (only the REQUIRED scope does — do not regress).
    expect(mockClearConsentAcceptedFlag).not.toHaveBeenCalled();
  });

  // Cycle 1.5-FE (REQ-FE-1/6, T-SET-2) — the coarse scope sits at index 9
  // (appended after location_to_llm at index 8). Toggling it ON grants exactly
  // `location_coarse_to_llm` via the same /api/auth/consent round-trip.
  it('grants location_coarse_to_llm when its Switch (index 9) is toggled on', async () => {
    mockListUserConsents.mockResolvedValue([]);
    mockGrantConsentScope.mockResolvedValue(undefined);

    const { getAllByRole } = render(<SettingsAiConsentCard />);
    await waitFor(() => {
      expect(mockListUserConsents).toHaveBeenCalled();
    });

    const coarseSwitch = getAllByRole('switch')[9];
    if (!coarseSwitch) throw new Error('expected coarse switch at index 9');
    fireEvent(coarseSwitch, 'valueChange', true);

    await waitFor(() => {
      expect(mockGrantConsentScope).toHaveBeenCalledWith('location_coarse_to_llm');
    });
  });

  // Cycle 1.5-FE (REQ-FE-7/11, T-SET-3) — revoking the coarse scope calls
  // revoke with exactly that scope and must NOT clear the "already asked" memo
  // (it is OPTIONAL, like every non-REQUIRED scope).
  it('revokes location_coarse_to_llm when toggled off (optional scope — flag not cleared)', async () => {
    mockListUserConsents.mockResolvedValue([
      {
        id: 10,
        scope: 'location_coarse_to_llm',
        version: '2026-06-01',
        grantedAt: '2026-05-16T10:00:00.000Z',
        revokedAt: null,
        source: 'ui',
      },
    ]);
    mockRevokeConsentScope.mockResolvedValue(undefined);

    const { getAllByRole } = render(<SettingsAiConsentCard />);
    await waitFor(() => {
      expect(getAllByRole('switch')[9]?.props.value).toBe(true);
    });

    const coarseSwitch = getAllByRole('switch')[9];
    if (!coarseSwitch) throw new Error('expected location_coarse_to_llm switch at index 9');
    fireEvent(coarseSwitch, 'valueChange', false);

    await waitFor(() => {
      expect(mockRevokeConsentScope).toHaveBeenCalledWith('location_coarse_to_llm');
    });
    expect(mockClearConsentAcceptedFlag).not.toHaveBeenCalled();
  });

  // Cycle 1.5-FE (D1 = Option C, REQ-FE-8) — the two geo scopes are mutually
  // exclusive: granting coarse while full is already granted must revoke full
  // (grant-one + revoke-the-other), so the BE never receives both geo grants at
  // once (which would let full silently dominate — misleading consent).
  it('granting coarse when full is already granted revokes location_to_llm (exclusivity)', async () => {
    mockListUserConsents.mockResolvedValue([
      {
        id: 8,
        scope: 'location_to_llm',
        version: '2026-06-01',
        grantedAt: '2026-05-16T10:00:00.000Z',
        revokedAt: null,
        source: 'ui',
      },
    ]);
    mockGrantConsentScope.mockResolvedValue(undefined);
    mockRevokeConsentScope.mockResolvedValue(undefined);

    const { getAllByRole } = render(<SettingsAiConsentCard />);
    await waitFor(() => {
      // full (index 8) reflects granted from BE.
      expect(getAllByRole('switch')[8]?.props.value).toBe(true);
    });

    const coarseSwitch = getAllByRole('switch')[9];
    if (!coarseSwitch) throw new Error('expected coarse switch at index 9');
    fireEvent(coarseSwitch, 'valueChange', true);

    await waitFor(() => {
      expect(mockGrantConsentScope).toHaveBeenCalledWith('location_coarse_to_llm');
    });
    // Exclusivity: the previously-granted full geo scope is revoked.
    expect(mockRevokeConsentScope).toHaveBeenCalledWith('location_to_llm');
    // Geo revocation is OPTIONAL — must not clear the accepted-flag memo.
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
