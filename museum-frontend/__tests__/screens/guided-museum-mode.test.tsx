import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

jest.mock('@/features/settings/runtimeSettings', () => ({
  loadRuntimeSettings: jest.fn().mockResolvedValue({
    defaultMuseumMode: true,
    guideLevel: 'beginner',
    defaultLocale: 'en',
  }),
}));

import GuidedMuseumModeScreen from '@/app/(stack)/guided-museum-mode';

describe('GuidedMuseumModeScreen', () => {
  it('renders without crashing', () => {
    render(<GuidedMuseumModeScreen />);
    expect(screen.getByText('guidedMode.title')).toBeTruthy();
  });

  it('renders the title and subtitle', () => {
    render(<GuidedMuseumModeScreen />);
    expect(screen.getByText('guidedMode.title')).toBeTruthy();
    expect(screen.getByText('guidedMode.subtitle')).toBeTruthy();
  });

  it('renders info cards', () => {
    render(<GuidedMuseumModeScreen />);
    expect(screen.getByText('guidedMode.card1_title')).toBeTruthy();
    expect(screen.getByText('guidedMode.card2_title')).toBeTruthy();
    expect(screen.getByText('guidedMode.card3_title')).toBeTruthy();
    expect(screen.getByText('guidedMode.card4_title')).toBeTruthy();
  });

  it('renders card descriptions', () => {
    render(<GuidedMuseumModeScreen />);
    expect(screen.getByText('guidedMode.card1_text')).toBeTruthy();
    expect(screen.getByText('guidedMode.card2_text')).toBeTruthy();
  });

  it('renders the toggle button', () => {
    render(<GuidedMuseumModeScreen />);
    expect(screen.getByText('guidedMode.turn_off')).toBeTruthy();
  });

  it('renders the start exploring button', () => {
    render(<GuidedMuseumModeScreen />);
    expect(screen.getByText('guidedMode.start_exploring')).toBeTruthy();
  });
});
