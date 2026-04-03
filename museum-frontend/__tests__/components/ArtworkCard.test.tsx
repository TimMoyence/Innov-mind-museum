import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

import { ArtworkCard } from '@/features/chat/ui/ArtworkCard';

describe('ArtworkCard', () => {
  it('renders artwork title', () => {
    render(<ArtworkCard title="Mona Lisa" />);
    expect(screen.getByText('Mona Lisa')).toBeTruthy();
  });

  it('renders artist when provided', () => {
    render(<ArtworkCard title="Starry Night" artist="Vincent van Gogh" />);
    expect(screen.getByText('Vincent van Gogh')).toBeTruthy();
  });

  it('does not render artist when not provided', () => {
    render(<ArtworkCard title="Unknown Piece" />);
    expect(screen.queryByText('Vincent van Gogh')).toBeNull();
  });

  it('renders museum and room location', () => {
    render(<ArtworkCard title="Mona Lisa" museum="Louvre" room="Room 711" />);
    expect(screen.getByText('Louvre \u2014 Room 711')).toBeTruthy();
  });

  it('renders museum alone without separator', () => {
    render(<ArtworkCard title="Mona Lisa" museum="Louvre" />);
    expect(screen.getByText('Louvre')).toBeTruthy();
  });

  it('renders high confidence badge', () => {
    render(<ArtworkCard title="Mona Lisa" confidence={0.95} />);
    expect(screen.getByText('artworkCard.confidence.high')).toBeTruthy();
  });

  it('renders medium confidence badge', () => {
    render(<ArtworkCard title="Mona Lisa" confidence={0.65} />);
    expect(screen.getByText('artworkCard.confidence.medium')).toBeTruthy();
  });

  it('renders low confidence badge', () => {
    render(<ArtworkCard title="Mona Lisa" confidence={0.3} />);
    expect(screen.getByText('artworkCard.confidence.low')).toBeTruthy();
  });

  it('does not render confidence badge when not provided', () => {
    render(<ArtworkCard title="Mona Lisa" />);
    expect(screen.queryByText('artworkCard.confidence.high')).toBeNull();
    expect(screen.queryByText('artworkCard.confidence.medium')).toBeNull();
    expect(screen.queryByText('artworkCard.confidence.low')).toBeNull();
  });
});
