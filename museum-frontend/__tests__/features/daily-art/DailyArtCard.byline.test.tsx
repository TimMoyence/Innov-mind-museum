import '../../helpers/test-utils';
import type React from 'react';
import { render, screen } from '@testing-library/react-native';

import { makeDailyArtwork } from '../../helpers/factories';
import { speakAppLanguage } from '../../helpers/real-i18n';

jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  return {
    GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    SwipeDirection: { LEFT: 'left', RIGHT: 'right' },
  };
});

import { DailyArtCard } from '@/features/daily-art/ui/DailyArtCard';

const renderCard = () =>
  render(
    <DailyArtCard
      artwork={makeDailyArtwork({ artist: '葛飾北斎' })}
      isSaved={false}
      onSave={jest.fn()}
      onSkip={jest.fn()}
    />,
  );

describe('Œuvre du jour — la ligne d’auteur suit l’ordre de la langue', () => {
  it('AUDIT-2026-11-09 · en japonais : « 葛飾北斎作 (1831) »', () => {
    speakAppLanguage('ja');
    renderCard();

    expect(screen.getByText('葛飾北斎作 (1831)')).toBeTruthy();
  });

  it('AUDIT-2026-11-09 · en français : « par 葛飾北斎 (1831) »', () => {
    speakAppLanguage('fr');
    renderCard();

    expect(screen.getByText('par 葛飾北斎 (1831)')).toBeTruthy();
  });
});
