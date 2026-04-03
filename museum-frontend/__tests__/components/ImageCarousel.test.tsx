import '../helpers/test-utils';
import { render, screen, fireEvent } from '@testing-library/react-native';

import type { ChatUiEnrichedImage } from '@/features/chat/application/chatSessionLogic.pure';
import { ImageCarousel } from '@/features/chat/ui/ImageCarousel';

const makeImage = (overrides?: Partial<ChatUiEnrichedImage>): ChatUiEnrichedImage => ({
  url: 'https://example.com/full.jpg',
  thumbnailUrl: 'https://example.com/thumb.jpg',
  caption: 'A painting',
  source: 'wikidata',
  score: 0.9,
  ...overrides,
});

describe('ImageCarousel', () => {
  const onImagePress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders thumbnail images for each item', () => {
    const images = [
      makeImage({
        url: 'https://a.com/1.jpg',
        thumbnailUrl: 'https://a.com/t1.jpg',
        caption: 'Painting A',
      }),
      makeImage({
        url: 'https://a.com/2.jpg',
        thumbnailUrl: 'https://a.com/t2.jpg',
        caption: 'Painting B',
      }),
    ];

    render(<ImageCarousel images={images} onImagePress={onImagePress} />);
    expect(screen.getByLabelText('Painting A')).toBeTruthy();
    expect(screen.getByLabelText('Painting B')).toBeTruthy();
  });

  it('fires onImagePress with correct index when a thumbnail is pressed', () => {
    const images = [
      makeImage({ url: 'https://a.com/1.jpg', caption: 'First' }),
      makeImage({ url: 'https://a.com/2.jpg', caption: 'Second' }),
    ];

    render(<ImageCarousel images={images} onImagePress={onImagePress} />);
    fireEvent.press(screen.getByLabelText('Second'));
    expect(onImagePress).toHaveBeenCalledWith(1);
  });

  it('renders attribution overlay for unsplash images', () => {
    const images = [
      makeImage({
        url: 'https://unsplash.com/photo.jpg',
        source: 'unsplash',
        attribution: 'Photo by John Doe',
      }),
    ];

    render(<ImageCarousel images={images} onImagePress={onImagePress} />);
    expect(screen.getByText('Photo by John Doe')).toBeTruthy();
  });

  it('does not render attribution for wikidata images', () => {
    const images = [
      makeImage({
        url: 'https://wiki.org/img.jpg',
        source: 'wikidata',
        attribution: 'Should not show',
      }),
    ];

    render(<ImageCarousel images={images} onImagePress={onImagePress} />);
    expect(screen.queryByText('Should not show')).toBeNull();
  });
});
