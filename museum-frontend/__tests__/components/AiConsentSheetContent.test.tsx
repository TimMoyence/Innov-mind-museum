import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import '../helpers/test-utils';
import { AiConsentSheetContent } from '@/features/chat/ui/AiConsentSheetContent';

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
    expect(queryAllByRole('switch').length).toBe(0);
  });

  it('Accept all forwards every scope and closes', async () => {
    const { getByText } = render(<AiConsentSheetContent {...defaultProps} />);
    fireEvent.press(getByText('consent.accept_all'));
    await waitFor(() => {
      expect(defaultProps.onAccept).toHaveBeenCalledTimes(1);
    });
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
        'location_to_llm',
      ]),
    );
    expect(grantedScopes.length).toBe(9);
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

  const renderManage = async () => {
    const api = render(<AiConsentSheetContent {...defaultProps} />);
    fireEvent.press(api.getByText('consent.manage_choices'));
    await waitFor(() => {
      expect(api.getByText('consent.manage_title')).toBeTruthy();
    });
    return api;
  };

  it('Manage CTA reveals 10 switches all defaulting OFF (8 provider + 2 geo — GDPR Art. 4(11))', async () => {
    const { getAllByRole } = await renderManage();
    const switches = getAllByRole('switch');
    expect(switches.length).toBe(10);
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

    const switchesAfter = api.getAllByRole('switch');
    expect(switchesAfter[0]?.props.value).toBe(true);
  });
});

describe('AiConsentSheetContent — Location group (location_to_llm, B9)', () => {
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

  const renderManage = async () => {
    const api = render(<AiConsentSheetContent {...defaultProps} />);
    fireEvent.press(api.getByText('consent.manage_choices'));
    await waitFor(() => {
      expect(api.getByText('consent.manage_title')).toBeTruthy();
    });
    return api;
  };

  const findLocationSwitch = <T extends { props: { accessibilityLabel?: string } }>(
    switches: readonly T[],
  ): T | undefined =>
    switches.find((sw) => sw.props.accessibilityLabel === 'consent.scope_location');

  it('renders the Location label + hint copy in manage view', async () => {
    const { getByText } = await renderManage();
    expect(getByText('consent.scope_location')).toBeTruthy();
    expect(getByText('consent.scope_location_hint')).toBeTruthy();
  });

  it('renders a Location switch defaulting OFF with switch a11y role', async () => {
    const { getAllByRole } = await renderManage();
    const switches = getAllByRole('switch');
    const locationSwitch = findLocationSwitch(switches);
    expect(locationSwitch).toBeDefined();
    expect(locationSwitch?.props.value).toBe(false);
    expect(locationSwitch?.props.accessibilityRole).toBe('switch');
  });

  it('forwards location_to_llm in the granted set when both the required scope and Location are ON', async () => {
    const { getAllByRole, getByText } = await renderManage();
    const switches = getAllByRole('switch');
    const requiredSwitch = switches[0];
    const locationSwitch = findLocationSwitch(switches);
    if (!requiredSwitch || !locationSwitch)
      throw new Error('expected required + location switches');

    fireEvent(requiredSwitch, 'valueChange', true);
    fireEvent(locationSwitch, 'valueChange', true);

    fireEvent.press(getByText('consent.save_and_continue'));
    await waitFor(() => {
      expect(defaultProps.onAccept).toHaveBeenCalledTimes(1);
    });
    const grantedScopes = (defaultProps.onAccept.mock.calls[0] ?? [[]])[0] as string[];
    expect(grantedScopes).toContain('location_to_llm');
    expect(grantedScopes).toContain('third_party_ai_text_openai');
  });

  it('does NOT forward location_to_llm when the Location toggle stays OFF', async () => {
    const { getAllByRole, getByText } = await renderManage();
    const switches = getAllByRole('switch');
    const requiredSwitch = switches[0];
    if (!requiredSwitch) throw new Error('expected required switch');

    fireEvent(requiredSwitch, 'valueChange', true);

    fireEvent.press(getByText('consent.save_and_continue'));
    await waitFor(() => {
      expect(defaultProps.onAccept).toHaveBeenCalledTimes(1);
    });
    const grantedScopes = (defaultProps.onAccept.mock.calls[0] ?? [[]])[0] as string[];
    expect(grantedScopes).not.toContain('location_to_llm');
  });
});

describe('AiConsentSheetContent — Location coarse group (location_coarse_to_llm, Cycle 1.5-FE)', () => {
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

  const renderManage = async () => {
    const api = render(<AiConsentSheetContent {...defaultProps} />);
    fireEvent.press(api.getByText('consent.manage_choices'));
    await waitFor(() => {
      expect(api.getByText('consent.manage_title')).toBeTruthy();
    });
    return api;
  };

  const findSwitchByLabel = <T extends { props: { accessibilityLabel?: string } }>(
    switches: readonly T[],
    label: string,
  ): T | undefined => switches.find((sw) => sw.props.accessibilityLabel === label);

  it('renders the coarse label + hint copy in manage view', async () => {
    const { getByText } = await renderManage();
    expect(getByText('consent.scope_location_coarse')).toBeTruthy();
    expect(getByText('consent.scope_location_coarse_hint')).toBeTruthy();
  });

  it('renders a coarse Location switch defaulting OFF with switch a11y role', async () => {
    const { getAllByRole } = await renderManage();
    const coarseSwitch = findSwitchByLabel(getAllByRole('switch'), 'consent.scope_location_coarse');
    expect(coarseSwitch).toBeDefined();
    expect(coarseSwitch?.props.value).toBe(false);
    expect(coarseSwitch?.props.accessibilityRole).toBe('switch');
  });

  it('forwards location_coarse_to_llm in the granted set when required + coarse are ON', async () => {
    const { getAllByRole, getByText } = await renderManage();
    const switches = getAllByRole('switch');
    const requiredSwitch = switches[0];
    const coarseSwitch = findSwitchByLabel(switches, 'consent.scope_location_coarse');
    if (!requiredSwitch || !coarseSwitch) throw new Error('expected required + coarse switches');

    fireEvent(requiredSwitch, 'valueChange', true);
    fireEvent(coarseSwitch, 'valueChange', true);

    fireEvent.press(getByText('consent.save_and_continue'));
    await waitFor(() => {
      expect(defaultProps.onAccept).toHaveBeenCalledTimes(1);
    });
    const grantedScopes = (defaultProps.onAccept.mock.calls[0] ?? [[]])[0] as string[];
    expect(grantedScopes).toContain('location_coarse_to_llm');
    expect(grantedScopes).toContain('third_party_ai_text_openai');
  });

  it('does NOT forward location_coarse_to_llm when the coarse toggle stays OFF', async () => {
    const { getAllByRole, getByText } = await renderManage();
    const switches = getAllByRole('switch');
    const requiredSwitch = switches[0];
    if (!requiredSwitch) throw new Error('expected required switch');

    fireEvent(requiredSwitch, 'valueChange', true);

    fireEvent.press(getByText('consent.save_and_continue'));
    await waitFor(() => {
      expect(defaultProps.onAccept).toHaveBeenCalledTimes(1);
    });
    const grantedScopes = (defaultProps.onAccept.mock.calls[0] ?? [[]])[0] as string[];
    expect(grantedScopes).not.toContain('location_coarse_to_llm');
  });
});

describe('AiConsentSheetContent — geo exclusivity (D1 Option C, Cycle 1.5-FE)', () => {
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

  const renderManage = async () => {
    const api = render(<AiConsentSheetContent {...defaultProps} />);
    fireEvent.press(api.getByText('consent.manage_choices'));
    await waitFor(() => {
      expect(api.getByText('consent.manage_title')).toBeTruthy();
    });
    return api;
  };

  const findSwitchByLabel = <T extends { props: { accessibilityLabel?: string } }>(
    switches: readonly T[],
    label: string,
  ): T | undefined => switches.find((sw) => sw.props.accessibilityLabel === label);

  it('enabling full geo after coarse turns coarse OFF (only full forwarded)', async () => {
    const { getAllByRole, getByText } = await renderManage();
    const switches = getAllByRole('switch');
    const requiredSwitch = switches[0];
    const fullSwitch = findSwitchByLabel(switches, 'consent.scope_location');
    const coarseSwitch = findSwitchByLabel(switches, 'consent.scope_location_coarse');
    if (!requiredSwitch || !fullSwitch || !coarseSwitch)
      throw new Error('expected required + full + coarse switches');

    fireEvent(requiredSwitch, 'valueChange', true);
    fireEvent(coarseSwitch, 'valueChange', true);
    fireEvent(fullSwitch, 'valueChange', true);

    fireEvent.press(getByText('consent.save_and_continue'));
    await waitFor(() => {
      expect(defaultProps.onAccept).toHaveBeenCalledTimes(1);
    });
    const grantedScopes = (defaultProps.onAccept.mock.calls[0] ?? [[]])[0] as string[];
    expect(grantedScopes).toContain('location_to_llm');
    expect(grantedScopes).not.toContain('location_coarse_to_llm');
  });

  it('enabling coarse geo after full turns full OFF (only coarse forwarded)', async () => {
    const { getAllByRole, getByText } = await renderManage();
    const switches = getAllByRole('switch');
    const requiredSwitch = switches[0];
    const fullSwitch = findSwitchByLabel(switches, 'consent.scope_location');
    const coarseSwitch = findSwitchByLabel(switches, 'consent.scope_location_coarse');
    if (!requiredSwitch || !fullSwitch || !coarseSwitch)
      throw new Error('expected required + full + coarse switches');

    fireEvent(requiredSwitch, 'valueChange', true);
    fireEvent(fullSwitch, 'valueChange', true);
    fireEvent(coarseSwitch, 'valueChange', true);

    fireEvent.press(getByText('consent.save_and_continue'));
    await waitFor(() => {
      expect(defaultProps.onAccept).toHaveBeenCalledTimes(1);
    });
    const grantedScopes = (defaultProps.onAccept.mock.calls[0] ?? [[]])[0] as string[];
    expect(grantedScopes).toContain('location_coarse_to_llm');
    expect(grantedScopes).not.toContain('location_to_llm');
  });

  it('reflects exclusivity in the switch values: enabling full flips coarse switch OFF', async () => {
    const { getAllByRole } = await renderManage();
    const switches = getAllByRole('switch');
    const fullSwitch = findSwitchByLabel(switches, 'consent.scope_location');
    const coarseSwitch = findSwitchByLabel(switches, 'consent.scope_location_coarse');
    if (!fullSwitch || !coarseSwitch) throw new Error('expected full + coarse switches');

    fireEvent(coarseSwitch, 'valueChange', true);
    fireEvent(fullSwitch, 'valueChange', true);

    const after = getAllByRole('switch');
    const coarseAfter = findSwitchByLabel(after, 'consent.scope_location_coarse');
    const fullAfter = findSwitchByLabel(after, 'consent.scope_location');
    expect(fullAfter?.props.value).toBe(true);
    expect(coarseAfter?.props.value).toBe(false);
  });
});
