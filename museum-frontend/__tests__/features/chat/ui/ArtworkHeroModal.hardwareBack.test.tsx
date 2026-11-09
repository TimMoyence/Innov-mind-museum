import '../../../helpers/test-utils';
import type React from 'react';
import { BackHandler } from 'react-native';
import { render } from '@testing-library/react-native';

import { makeArtworkHeroModel, makeDailyArtwork } from '../../../helpers/factories';

const mockReduceMotion = jest.fn(() => false);
jest.mock('@/shared/ui/hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockReduceMotion(),
}));

jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  return {
    Gesture: { Pinch: () => ({ onUpdate: () => ({ onEnd: () => ({}) }) }) },
    GestureDetector: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
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

import { ArtworkHeroModal } from '@/features/chat/ui/ArtworkHeroModal';
import { DailyArtCard } from '@/features/daily-art/ui/DailyArtCard';

type BackCallback = () => boolean | null | undefined;

describe('Retour matériel et fondu d’entrée', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('REFACTOR-2026-11-09 · la vue agrandie se ferme au retour Android et consomme l’événement', () => {
    const callbacks: BackCallback[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((event, callback) => {
      if (event === 'hardwareBackPress') callbacks.push(callback as BackCallback);
      return { remove: jest.fn() };
    });
    const onClose = jest.fn();

    render(<ArtworkHeroModal visible model={makeArtworkHeroModel()} onClose={onClose} />);

    expect(callbacks).toHaveLength(1);
    expect(callbacks[0]?.()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('REFACTOR-2026-11-09 · fermée, la vue agrandie n’écoute pas le retour Android', () => {
    const addListener = jest.spyOn(BackHandler, 'addEventListener');

    render(<ArtworkHeroModal visible={false} model={makeArtworkHeroModel()} onClose={jest.fn()} />);

    expect(addListener).not.toHaveBeenCalled();
  });

  it('REFACTOR-2026-11-09 · avec « réduire les animations », la carte du jour apparaît sans fondu', () => {
    mockReduceMotion.mockReturnValue(true);
    const timing = jest.spyOn(require('react-native').Animated, 'timing');

    render(
      <DailyArtCard
        artwork={makeDailyArtwork()}
        isSaved={false}
        onSave={jest.fn()}
        onSkip={jest.fn()}
      />,
    );

    expect(timing).not.toHaveBeenCalled();
    mockReduceMotion.mockReturnValue(false);
  });
});
