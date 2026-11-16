import '../../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

import { SettingsThemeCard } from '@/features/settings/ui/SettingsThemeCard';

import { speakAppLanguage } from '../../helpers/real-i18n';

describe('THEME-A11Y', () => {
  it('THEME-A11Y · VoiceOver annonce le nom traduit de chaque thème, jamais sa clé', () => {
    speakAppLanguage('fr');

    render(<SettingsThemeCard mode="system" onSetMode={jest.fn()} />);

    expect(
      screen.getAllByRole('button').map((button) => button.props.accessibilityLabel as string),
    ).toEqual([
      'Sélectionner le thème Système',
      'Sélectionner le thème Clair',
      'Sélectionner le thème Sombre',
    ]);
  });
});
