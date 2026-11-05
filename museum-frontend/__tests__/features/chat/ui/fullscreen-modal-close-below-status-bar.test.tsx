import '../../../helpers/test-utils';
import type React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

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

import { ArtworkHeroModal } from '@/features/chat/ui/ArtworkHeroModal';
import { ImageFullscreenModal } from '@/features/chat/ui/ImageFullscreenModal';
import { space } from '@/shared/ui/tokens';

const STATUS_BAR_HEIGHT = 44;

const safeArea = jest.requireMock<{ useSafeAreaInsets: () => unknown }>(
  'react-native-safe-area-context',
);

const closeButtonTop = (element: { props: { style?: unknown } }): unknown =>
  (StyleSheet.flatten(element.props.style as never) as { top?: unknown }).top;

describe('fullscreen modals keep their close button below the status bar', () => {
  beforeEach(() => {
    jest
      .spyOn(safeArea, 'useSafeAreaInsets')
      .mockReturnValue({ top: STATUS_BAR_HEIGHT, bottom: 0, left: 0, right: 0 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('artwork preview', () => {
    const view = render(
      <ArtworkHeroModal
        visible
        model={{
          imageUrl: 'https://example.test/a.jpg',
          messageId: 'm1',
          title: 'La Joconde',
          artist: 'Leonardo da Vinci',
          museum: 'Louvre',
          room: null,
          confidence: 0.9,
        }}
        onClose={jest.fn()}
      />,
    );

    expect(closeButtonTop(view.getByTestId('artwork-hero-modal-close'))).toBe(
      STATUS_BAR_HEIGHT + space['4'],
    );
  });

  it('image gallery', () => {
    const view = render(
      <ImageFullscreenModal
        images={[
          {
            url: 'https://example.test/b.jpg',
            thumbnailUrl: 'https://example.test/b-t.jpg',
            caption: 'B',
            source: 'wikidata',
            score: 1,
          },
        ]}
        initialIndex={0}
        visible
        onClose={jest.fn()}
      />,
    );

    expect(closeButtonTop(view.getByTestId('image-fullscreen-modal-close'))).toBe(
      STATUS_BAR_HEIGHT + space['4'],
    );
  });
});
