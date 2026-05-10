import '../helpers/test-utils';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { makeEnrichedImage } from '../helpers/factories/chat.factories';
import { ImageCarousel } from '@/features/chat/ui/ImageCarousel';

describe('ImageCarousel', () => {
  const onImagePress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders thumbnail images for each item with caption + rationale a11y label (R14)', () => {
    const images = [
      makeEnrichedImage({
        url: 'https://a.com/1.jpg',
        thumbnailUrl: 'https://a.com/t1.jpg',
        caption: 'Painting A',
        rationale: 'Reference work A',
      }),
      makeEnrichedImage({
        url: 'https://a.com/2.jpg',
        thumbnailUrl: 'https://a.com/t2.jpg',
        caption: 'Painting B',
        rationale: 'Reference work B',
      }),
    ];

    render(<ImageCarousel images={images} onImagePress={onImagePress} />);
    expect(screen.getByLabelText('Painting A - Reference work A')).toBeTruthy();
    expect(screen.getByLabelText('Painting B - Reference work B')).toBeTruthy();
  });

  it('fires onImagePress with correct index when a thumbnail is pressed', () => {
    const images = [
      makeEnrichedImage({
        url: 'https://a.com/1.jpg',
        caption: 'First',
        rationale: 'R1',
      }),
      makeEnrichedImage({
        url: 'https://a.com/2.jpg',
        caption: 'Second',
        rationale: 'R2',
      }),
    ];

    render(<ImageCarousel images={images} onImagePress={onImagePress} />);
    fireEvent.press(screen.getByLabelText('Second - R2'));
    expect(onImagePress).toHaveBeenCalledWith(1);
  });

  it('renders attribution overlay for unsplash images', () => {
    const images = [
      makeEnrichedImage({
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
      makeEnrichedImage({
        url: 'https://wiki.org/img.jpg',
        source: 'wikidata',
        attribution: 'Should not show',
      }),
    ];

    render(<ImageCarousel images={images} onImagePress={onImagePress} />);
    expect(screen.queryByText('Should not show')).toBeNull();
  });

  it('R14 — renders rationale text under each thumb', () => {
    const images = [
      makeEnrichedImage({
        url: 'https://a.com/x.jpg',
        rationale: 'Adds visual context to the answer.',
      }),
    ];
    render(<ImageCarousel images={images} onImagePress={onImagePress} />);
    expect(screen.getByText('Adds visual context to the answer.')).toBeTruthy();
  });

  it('R7 — falls back to i18n string when rationale is empty', () => {
    const images = [
      makeEnrichedImage({
        url: 'https://a.com/y.jpg',
        rationale: '',
      }),
    ];
    render(<ImageCarousel images={images} onImagePress={onImagePress} />);
    expect(screen.getByText('chat.enrichment.rationale_fallback')).toBeTruthy();
  });

  it('R7 — falls back when rationale is null (legacy cached responses)', () => {
    const images = [
      makeEnrichedImage({
        url: 'https://a.com/z.jpg',
        rationale: null,
      }),
    ];
    render(<ImageCarousel images={images} onImagePress={onImagePress} />);
    expect(screen.getByText('chat.enrichment.rationale_fallback')).toBeTruthy();
  });

  it('renders thumbnails for new v2 sources (commons, musaium)', () => {
    const images = [
      makeEnrichedImage({
        url: 'https://commons.example/x.jpg',
        source: 'commons',
        rationale: 'Public domain reference',
      }),
      makeEnrichedImage({
        url: 'https://museum.example/y.jpg',
        source: 'musaium',
        rationale: 'Curated catalogue entry',
      }),
    ];
    render(<ImageCarousel images={images} onImagePress={onImagePress} />);
    expect(screen.getByText('Public domain reference')).toBeTruthy();
    expect(screen.getByText('Curated catalogue entry')).toBeTruthy();
  });
});
