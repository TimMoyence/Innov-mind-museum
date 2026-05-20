import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import '../helpers/test-utils';
import { AiConsentSheetContent } from '@/features/chat/ui/AiConsentSheetContent';

/**
 * Sheet-content variant of the legacy `AiConsentModal` tests, retargeted for
 * the cookie-banner UX (S4-P0-02 amendment 2026-05-20) :
 *  - default `summary` view : reassurance copy + "Accept all" primary CTA +
 *    "Manage" secondary CTA. No switches visible.
 *  - `manage` view (after pressing Manage) : 4 categories × 2 providers = 8
 *    Switches, all default OFF (Apple 5.1.2(i) + GDPR Art. 4(11) "unambiguous
 *    affirmative action"). Save stays disabled with an explicit hint until
 *    the user actively toggles the mandatory `third_party_ai_text_openai`
 *    scope ON.
 */
describe('AiConsentSheetContent — summary view (default)', () => {
  let defaultProps: {
    close: jest.Mock;
    onAccept: jest.Mock;
    onPrivacy: jest.Mock;
  };

  beforeEach(() => {
    defaultProps = {
      close: jest.fn(),
      onAccept: jest.fn(),
      onPrivacy: jest.fn(),
    };
  });

  it('renders the consent title and the reassurance bullets', () => {
    const { getByText } = render(<AiConsentSheetContent {...defaultProps} />);
    expect(getByText('consent.title')).toBeTruthy();
    expect(getByText('consent.summary_only_content')).toBeTruthy();
    expect(getByText('consent.summary_no_personal_data')).toBeTruthy();
    expect(getByText('consent.summary_processing')).toBeTruthy();
    expect(getByText('consent.summary_revoke_anytime')).toBeTruthy();
  });

  it('shows Accept all + Manage CTAs without any switches', () => {
    const { getByText, queryAllByRole } = render(<AiConsentSheetContent {...defaultProps} />);
    expect(getByText('consent.accept_all')).toBeTruthy();
    expect(getByText('consent.manage_choices')).toBeTruthy();
    // Summary view must not expose the granular switches — they live behind Manage.
    expect(queryAllByRole('switch').length).toBe(0);
  });

  it('Accept all forwards every scope and closes', async () => {
    const { getByText } = render(<AiConsentSheetContent {...defaultProps} />);
    fireEvent.press(getByText('consent.accept_all'));
    await waitFor(() => {
      expect(defaultProps.onAccept).toHaveBeenCalledTimes(1);
    });
    // 4 categories × 2 providers = 8 scopes — every one granted in one click.
    const grantedScopes = (defaultProps.onAccept.mock.calls[0] ?? [[]])[0] as string[];
    expect(grantedScopes).toEqual(
      expect.arrayContaining([
        'third_party_ai_text_openai',
        'third_party_ai_image_openai',
        'third_party_ai_audio_openai',
        'third_party_ai_profile_openai',
        'third_party_ai_text_google',
        'third_party_ai_image_google',
        'third_party_ai_audio_google',
        'third_party_ai_profile_google',
      ]),
    );
    expect(grantedScopes.length).toBe(8);
    expect(defaultProps.close).toHaveBeenCalledTimes(1);
  });

  it('calls onPrivacy when the privacy link is pressed from summary', () => {
    const { getByText } = render(<AiConsentSheetContent {...defaultProps} />);
    fireEvent.press(getByText('consent.read_privacy'));
    expect(defaultProps.onPrivacy).toHaveBeenCalledTimes(1);
  });
});

describe('AiConsentSheetContent — manage view', () => {
  const REQUIRED_TEXT_LABEL = 'consent.scope_text';

  let defaultProps: {
    close: jest.Mock;
    onAccept: jest.Mock;
    onPrivacy: jest.Mock;
  };

  beforeEach(() => {
    defaultProps = {
      close: jest.fn(),
      onAccept: jest.fn(),
      onPrivacy: jest.fn(),
    };
  });

  /**
   * Render summary then press Manage. The press goes through `LiquidButton`
   * which awaits `Haptics.selectionAsync()` before invoking onPress — so the
   * state flip is queued on a microtask. `waitFor` lets it settle before
   * test code touches the manage-view nodes.
   */
  const renderManage = async () => {
    const api = render(<AiConsentSheetContent {...defaultProps} />);
    fireEvent.press(api.getByText('consent.manage_choices'));
    await waitFor(() => {
      expect(api.getByText('consent.manage_title')).toBeTruthy();
    });
    return api;
  };

  it('Manage CTA reveals 8 switches all defaulting OFF (no pre-check — GDPR Art. 4(11))', async () => {
    const { getAllByRole } = await renderManage();
    const switches = getAllByRole('switch');
    expect(switches.length).toBe(8);
    for (const sw of switches) {
      expect(sw.props.value).toBe(false);
    }
  });

  it('Manage view shows the subtitle explaining the required scope', async () => {
    const { getByText } = await renderManage();
    expect(getByText('consent.manage_title')).toBeTruthy();
    expect(getByText('consent.manage_subtitle')).toBeTruthy();
  });

  it('Save is disabled with an explicit hint until the required scope is toggled ON', async () => {
    const { getByText } = await renderManage();
    // Disabled-state hint must be discoverable (the bug user reported: button
    // looked tappable but did nothing because the required scope was OFF).
    expect(getByText('consent.save_required_hint')).toBeTruthy();
    fireEvent.press(getByText('consent.save_and_continue'));
    expect(defaultProps.onAccept).not.toHaveBeenCalled();
    expect(defaultProps.close).not.toHaveBeenCalled();
  });

  it('enables Save (hint hidden) after toggling the required text→OpenAI scope ON', async () => {
    const { getAllByRole, getByText, queryByText } = await renderManage();
    const switches = getAllByRole('switch');
    const requiredSwitch = switches[0];
    if (!requiredSwitch) throw new Error('expected required switch');
    expect(requiredSwitch.props.accessibilityLabel).toBe(REQUIRED_TEXT_LABEL);

    fireEvent(requiredSwitch, 'valueChange', true);

    // Hint disappears once the required scope is granted.
    expect(queryByText('consent.save_required_hint')).toBeNull();

    fireEvent.press(getByText('consent.save_and_continue'));
    await waitFor(() => {
      expect(defaultProps.onAccept).toHaveBeenCalledTimes(1);
    });
    expect(defaultProps.onAccept).toHaveBeenCalledWith(['third_party_ai_text_openai']);
    expect(defaultProps.close).toHaveBeenCalledTimes(1);
  });

  it('forwards only the toggled-on scopes on Save', async () => {
    const { getAllByRole, getByText } = await renderManage();
    const switches = getAllByRole('switch');
    const [textOpenai, imageOpenai, , , , , audioGoogle] = switches;
    if (!textOpenai || !imageOpenai || !audioGoogle) throw new Error('expected 8 switches');
    fireEvent(textOpenai, 'valueChange', true);
    fireEvent(imageOpenai, 'valueChange', true);
    fireEvent(audioGoogle, 'valueChange', true);

    fireEvent.press(getByText('consent.save_and_continue'));
    await waitFor(() => {
      expect(defaultProps.onAccept).toHaveBeenCalledTimes(1);
    });
    expect(defaultProps.onAccept).toHaveBeenCalledWith([
      'third_party_ai_text_openai',
      'third_party_ai_image_openai',
      'third_party_ai_audio_google',
    ]);
  });

  it('Back returns to summary, surfacing the Accept all + Manage CTAs again', async () => {
    const api = await renderManage();
    fireEvent.press(api.getByText('consent.back_to_summary'));
    await waitFor(() => {
      expect(api.getByText('consent.accept_all')).toBeTruthy();
    });
    expect(api.getByText('consent.manage_choices')).toBeTruthy();
    expect(api.queryAllByRole('switch').length).toBe(0);
  });

  it('toggling a scope in manage then back-and-forth preserves the user choices', async () => {
    const api = await renderManage();
    const switches = api.getAllByRole('switch');
    const requiredSwitch = switches[0];
    if (!requiredSwitch) throw new Error('expected required switch');
    fireEvent(requiredSwitch, 'valueChange', true);

    fireEvent.press(api.getByText('consent.back_to_summary'));
    await waitFor(() => {
      expect(api.getByText('consent.accept_all')).toBeTruthy();
    });
    fireEvent.press(api.getByText('consent.manage_choices'));
    await waitFor(() => {
      expect(api.getByText('consent.manage_title')).toBeTruthy();
    });

    // After round-tripping, the required scope choice survives.
    const switchesAfter = api.getAllByRole('switch');
    expect(switchesAfter[0]?.props.value).toBe(true);
  });
});
