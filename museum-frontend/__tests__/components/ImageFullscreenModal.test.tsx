import '../helpers/test-utils';
import { render, screen, fireEvent } from '@testing-library/react-native';

import type { ChatUiEnrichedImage } from '@/features/chat/application/chatSessionLogic.pure';
import { ImageFullscreenModal } from '@/features/chat/ui/ImageFullscreenModal';

const makeEnrichedImage = (overrides?: Partial<ChatUiEnrichedImage>): ChatUiEnrichedImage => ({
  url: 'https://example.com/full.jpg',
  thumbnailUrl: 'https://example.com/thumb.jpg',
  caption: 'A painting',
  source: 'wikidata',
  score: 0.9,
  ...overrides,
});

describe('ImageFullscreenModal', () => {
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the image when visible', () => {
    const images = [makeEnrichedImage({ caption: 'Starry Night' })];
    render(<ImageFullscreenModal images={images} initialIndex={0} visible onClose={onClose} />);
    expect(screen.getByLabelText('Starry Night')).toBeTruthy();
  });

  it('renders image counter showing current position', () => {
    const images = [
      makeEnrichedImage({ caption: 'Image A' }),
      makeEnrichedImage({ caption: 'Image B' }),
    ];
    render(<ImageFullscreenModal images={images} initialIndex={0} visible onClose={onClose} />);
    expect(screen.getByText('1 / 2')).toBeTruthy();
  });

  it('renders caption text', () => {
    const images = [makeEnrichedImage({ caption: 'The Water Lilies' })];
    render(<ImageFullscreenModal images={images} initialIndex={0} visible onClose={onClose} />);
    expect(screen.getByText('The Water Lilies')).toBeTruthy();
  });

  it('renders attribution when available', () => {
    const images = [makeEnrichedImage({ attribution: 'Photo by Artist' })];
    render(<ImageFullscreenModal images={images} initialIndex={0} visible onClose={onClose} />);
    expect(screen.getByText('Photo by Artist')).toBeTruthy();
  });

  it('does not render attribution when null', () => {
    const images = [makeEnrichedImage({ attribution: null })];
    render(<ImageFullscreenModal images={images} initialIndex={0} visible onClose={onClose} />);
    expect(screen.queryByText('Photo by Artist')).toBeNull();
  });

  it('fires onClose when close button is pressed', () => {
    const images = [makeEnrichedImage()];
    render(<ImageFullscreenModal images={images} initialIndex={0} visible onClose={onClose} />);
    fireEvent.press(screen.getByLabelText('a11y.chat.fullscreen_close'));
    expect(onClose).toHaveBeenCalled();
  });
});
