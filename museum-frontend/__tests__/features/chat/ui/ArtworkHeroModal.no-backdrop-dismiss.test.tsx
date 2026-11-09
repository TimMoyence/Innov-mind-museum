import '../../../helpers/test-utils';
import type React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  return {
    Gesture: {
      Pinch: () => ({
        onUpdate: () => ({
          onEnd: () => ({}),
        }),
      }),
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});

import { ArtworkHeroModal } from '@/features/chat/ui/ArtworkHeroModal';
import type { ArtworkHeroModel } from '@/features/chat/application/useArtworkHero';

const makeArtworkHeroModel = (overrides?: Partial<ArtworkHeroModel>): ArtworkHeroModel => ({
  imageUrl: 'https://example.test/artwork.jpg',
  messageId: 'msg-hero-modal',
  title: 'La Joconde',
  artist: 'Leonardo da Vinci',
  museum: 'Louvre',
  room: 'Salle des États',
  confidence: 0.95,
  ...overrides,
});

describe('ArtworkHeroModal — no backdrop / tap-on-image dismiss (audit #15, R11)', () => {
  it('tapping the artwork image does NOT call onClose', () => {
    const onClose = jest.fn();
    const view = render(
      <ArtworkHeroModal visible model={makeArtworkHeroModel()} onClose={onClose} />,
    );
    const image = view.getByTestId('artwork-hero-modal-image');
    expect((image.props as { onPress?: () => void }).onPress).toBeUndefined();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('the close button DOES call onClose', () => {
    const onClose = jest.fn();
    const view = render(
      <ArtworkHeroModal visible model={makeArtworkHeroModel()} onClose={onClose} />,
    );
    fireEvent.press(view.getByLabelText('chat.artworkHero.modal.close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
