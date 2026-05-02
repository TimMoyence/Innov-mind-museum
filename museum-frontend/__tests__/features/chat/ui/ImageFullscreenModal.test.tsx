import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';

import '../../../helpers/test-utils';
import { makeEnrichedImage } from '../../../helpers/factories';

// Mock useReducedMotion so the goTo() branch can be driven deterministically
// without relying on AccessibilityInfo platform behaviour. Default = false
// (decorative animation enabled); individual tests override per test.
const mockReduceMotion = jest.fn(() => false);
jest.mock('@/shared/ui/hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockReduceMotion(),
}));

import { ImageFullscreenModal } from '@/features/chat/ui/ImageFullscreenModal';

describe('ImageFullscreenModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReduceMotion.mockReturnValue(false);
  });

  it('returns null when images[currentIndex] is missing (defensive bounds check)', () => {
    const { toJSON } = render(
      <ImageFullscreenModal images={[]} initialIndex={0} visible onClose={jest.fn()} />,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders the close button with localized accessibility label', () => {
    const images = [makeEnrichedImage()];
    render(<ImageFullscreenModal images={images} initialIndex={0} visible onClose={jest.fn()} />);
    expect(screen.getByLabelText('a11y.chat.fullscreen_close')).toBeTruthy();
  });

  it('renders previous-image and next-image tap zones with localized labels', () => {
    const images = [makeEnrichedImage(), makeEnrichedImage()];
    render(<ImageFullscreenModal images={images} initialIndex={0} visible onClose={jest.fn()} />);
    expect(screen.getByLabelText('a11y.chat.previous_image')).toBeTruthy();
    expect(screen.getByLabelText('a11y.chat.next_image')).toBeTruthy();
  });

  it('renders the image with the current image caption as accessibilityLabel', () => {
    const images = [
      makeEnrichedImage({ caption: 'First' }),
      makeEnrichedImage({ caption: 'Second' }),
    ];
    render(<ImageFullscreenModal images={images} initialIndex={1} visible onClose={jest.fn()} />);
    expect(screen.getByLabelText('Second')).toBeTruthy();
  });

  it('renders the counter as "currentIndex+1 / total"', () => {
    const images = [makeEnrichedImage(), makeEnrichedImage(), makeEnrichedImage()];
    render(<ImageFullscreenModal images={images} initialIndex={1} visible onClose={jest.fn()} />);
    expect(screen.getByText('2 / 3')).toBeTruthy();
  });

  it('omits attribution when null/undefined', () => {
    const images = [makeEnrichedImage({ attribution: null })];
    render(<ImageFullscreenModal images={images} initialIndex={0} visible onClose={jest.fn()} />);
    expect(screen.queryByText('Photo by Artist')).toBeNull();
  });

  it('renders attribution text when provided', () => {
    const images = [makeEnrichedImage({ attribution: 'Photo by Artist' })];
    render(<ImageFullscreenModal images={images} initialIndex={0} visible onClose={jest.fn()} />);
    expect(screen.getByText('Photo by Artist')).toBeTruthy();
  });

  it('fires onClose when the close button is pressed', () => {
    const onClose = jest.fn();
    const images = [makeEnrichedImage()];
    render(<ImageFullscreenModal images={images} initialIndex={0} visible onClose={onClose} />);
    fireEvent.press(screen.getByLabelText('a11y.chat.fullscreen_close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reduceMotion=true: tapping next-zone instantly switches to next image (no scale animation)', () => {
    mockReduceMotion.mockReturnValue(true);
    const images = [
      makeEnrichedImage({ caption: 'First' }),
      makeEnrichedImage({ caption: 'Second' }),
    ];
    render(<ImageFullscreenModal images={images} initialIndex={0} visible onClose={jest.fn()} />);
    expect(screen.getByText('1 / 2')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('a11y.chat.next_image'));
    expect(screen.getByText('2 / 2')).toBeTruthy();
  });

  it('reduceMotion=true: tapping previous-zone at index 0 stays at index 0 (no underflow)', () => {
    mockReduceMotion.mockReturnValue(true);
    const images = [makeEnrichedImage(), makeEnrichedImage()];
    render(<ImageFullscreenModal images={images} initialIndex={0} visible onClose={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('a11y.chat.previous_image'));
    expect(screen.getByText('1 / 2')).toBeTruthy();
  });

  it('reduceMotion=true: tapping next-zone at last index stays at last (no overflow)', () => {
    mockReduceMotion.mockReturnValue(true);
    const images = [makeEnrichedImage(), makeEnrichedImage()];
    render(<ImageFullscreenModal images={images} initialIndex={1} visible onClose={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('a11y.chat.next_image'));
    expect(screen.getByText('2 / 2')).toBeTruthy();
  });

  it('reduceMotion=true: previous-zone at index>0 goes back to previous image', () => {
    mockReduceMotion.mockReturnValue(true);
    const images = [
      makeEnrichedImage({ caption: 'First' }),
      makeEnrichedImage({ caption: 'Second' }),
    ];
    render(<ImageFullscreenModal images={images} initialIndex={1} visible onClose={jest.fn()} />);
    expect(screen.getByText('2 / 2')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('a11y.chat.previous_image'));
    expect(screen.getByText('1 / 2')).toBeTruthy();
  });

  it('resets currentIndex when visible toggles from false to true with a different initialIndex', () => {
    const images = [
      makeEnrichedImage({ caption: 'A' }),
      makeEnrichedImage({ caption: 'B' }),
      makeEnrichedImage({ caption: 'C' }),
    ];
    const { rerender } = render(
      <ImageFullscreenModal images={images} initialIndex={0} visible={false} onClose={jest.fn()} />,
    );
    rerender(<ImageFullscreenModal images={images} initialIndex={2} visible onClose={jest.fn()} />);
    expect(screen.getByText('3 / 3')).toBeTruthy();
  });

  it('truncates caption to 2 lines (numberOfLines=2 contract)', () => {
    const images = [makeEnrichedImage({ caption: 'Caption text' })];
    render(<ImageFullscreenModal images={images} initialIndex={0} visible onClose={jest.fn()} />);
    const caption = screen.getByText('Caption text');
    expect(caption.props.numberOfLines).toBe(2);
  });

  it('truncates attribution to 1 line (numberOfLines=1 contract)', () => {
    const images = [makeEnrichedImage({ attribution: 'Long attribution' })];
    render(<ImageFullscreenModal images={images} initialIndex={0} visible onClose={jest.fn()} />);
    const attribution = screen.getByText('Long attribution');
    expect(attribution.props.numberOfLines).toBe(1);
  });

  it('reduceMotion=false: tapping next-zone schedules animation; index updates after timer fires', () => {
    jest.useFakeTimers();
    const images = [
      makeEnrichedImage({ caption: 'First' }),
      makeEnrichedImage({ caption: 'Second' }),
    ];
    render(<ImageFullscreenModal images={images} initialIndex={0} visible onClose={jest.fn()} />);
    expect(screen.getByText('1 / 2')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('a11y.chat.next_image'));
    // Drain Animated.timing(scale, 100ms) and the follow-up 150ms ramp-back.
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(screen.getByText('2 / 2')).toBeTruthy();
    jest.useRealTimers();
  });
});
