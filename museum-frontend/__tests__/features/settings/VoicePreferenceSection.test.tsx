/**
 * Tests for {@link VoicePreferenceSection} (Spec C T2.9).
 *
 * The section renders 7 rows: a "Default" row at the top (which posts
 * `null` to reset to the env-level default) followed by the 6 catalog
 * voices (Alloy, Echo, Fable, Onyx, Nova, Shimmer). Tapping a row fires
 * the {@link useUpdateTtsVoice} mutation; the current voice is reflected
 * via `accessibilityState.selected`.
 */
import { fireEvent, waitFor } from '@testing-library/react-native';

import '../../helpers/test-utils';
import { renderWithQueryClient } from '@/__tests__/helpers/data/renderWithQueryClient';
import { VoicePreferenceSection } from '@/features/settings/ui/VoicePreferenceSection';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUpdateTtsVoice = jest.fn();

jest.mock('@/features/auth/infrastructure/authApi', () => ({
  authService: {
    updateTtsVoice: (...args: unknown[]) => mockUpdateTtsVoice(...args),
  },
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('VoicePreferenceSection (Spec C T2.9)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateTtsVoice.mockResolvedValue({ ttsVoice: null });
  });

  it('renders 7 rows (default + 6 voices)', () => {
    const { getAllByRole } = renderWithQueryClient(<VoicePreferenceSection currentVoice={null} />);
    // Section header is accessibilityRole="header", not "button".
    const rows = getAllByRole('button');
    expect(rows).toHaveLength(7);
  });

  it('marks the Default row as selected when currentVoice is null', () => {
    const { getByTestId } = renderWithQueryClient(<VoicePreferenceSection currentVoice={null} />);
    const defaultRow = getByTestId('voice-row-default');
    expect(defaultRow.props.accessibilityState.selected).toBe(true);
  });

  it('marks the matching voice row as selected when currentVoice is set', () => {
    const { getByTestId } = renderWithQueryClient(<VoicePreferenceSection currentVoice="echo" />);
    expect(getByTestId('voice-row-echo').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('voice-row-default').props.accessibilityState.selected).toBe(false);
    expect(getByTestId('voice-row-alloy').props.accessibilityState.selected).toBe(false);
  });

  it('selecting a voice fires the mutation with that voice', async () => {
    mockUpdateTtsVoice.mockResolvedValueOnce({ ttsVoice: 'echo' });
    const { getByTestId } = renderWithQueryClient(<VoicePreferenceSection currentVoice={null} />);
    fireEvent.press(getByTestId('voice-row-echo'));
    await waitFor(() => {
      expect(mockUpdateTtsVoice).toHaveBeenCalledWith('echo');
    });
  });

  it('selecting Default fires the mutation with null', async () => {
    mockUpdateTtsVoice.mockResolvedValueOnce({ ttsVoice: null });
    const { getByTestId } = renderWithQueryClient(<VoicePreferenceSection currentVoice="echo" />);
    fireEvent.press(getByTestId('voice-row-default'));
    await waitFor(() => {
      expect(mockUpdateTtsVoice).toHaveBeenCalledWith(null);
    });
  });

  it('renders the section title and description i18n keys', () => {
    const { getByText } = renderWithQueryClient(<VoicePreferenceSection currentVoice={null} />);
    expect(getByText('settings.voice.sectionTitle')).toBeTruthy();
    expect(getByText('settings.voice.description')).toBeTruthy();
  });
});
