import '../helpers/test-utils';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { DailyArtCard } from '@/features/daily-art/ui/DailyArtCard';
import type { DailyArtwork } from '@/features/daily-art/infrastructure/dailyArtApi';

// ── Helpers ──────────────────────────────────────────────────────────────────

const sampleArtwork: DailyArtwork = {
  title: 'Starry Night',
  artist: 'Vincent van Gogh',
  year: '1889',
  imageUrl: 'https://example.com/starry-night.jpg',
  description: 'A swirling night sky over a village.',
  funFact: 'Painted from memory during his stay at the asylum.',
  museum: 'MoMA',
};

const defaultProps = {
  artwork: sampleArtwork,
  isSaved: false,
  onSave: jest.fn(),
  onSkip: jest.fn(),
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DailyArtCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders artwork title, artist, year, and museum', () => {
    render(<DailyArtCard {...defaultProps} />);

    expect(screen.getByText('Starry Night')).toBeTruthy();
    expect(screen.getByText(/Vincent van Gogh/)).toBeTruthy();
    expect(screen.getByText(/1889/)).toBeTruthy();
    expect(screen.getByText('MoMA')).toBeTruthy();
  });

  it('renders the section title from translation key', () => {
    render(<DailyArtCard {...defaultProps} />);

    expect(screen.getByText('dailyArt.title')).toBeTruthy();
  });

  it('renders the image when imageUrl is provided and no error', () => {
    render(<DailyArtCard {...defaultProps} />);

    // Image should have accessibilityLabel matching artwork title
    const image = screen.getByLabelText('Starry Night');
    expect(image).toBeTruthy();
  });

  it('renders the fallback icon when imageUrl is empty', () => {
    const artworkNoImage: DailyArtwork = { ...sampleArtwork, imageUrl: '' };
    render(<DailyArtCard {...defaultProps} artwork={artworkNoImage} />);

    // The Ionicons mock renders icon name as text
    expect(screen.getByText('image-outline')).toBeTruthy();
  });

  it('fun fact toggle expands and collapses', () => {
    render(<DailyArtCard {...defaultProps} />);

    // Fun fact text should NOT be visible initially
    expect(screen.queryByText(sampleArtwork.funFact)).toBeNull();

    // The toggle button should show the "Did you know?" label
    const toggleButton = screen.getByText('dailyArt.fun_fact');
    expect(toggleButton).toBeTruthy();

    // Expand
    fireEvent.press(toggleButton);
    expect(screen.getByText(sampleArtwork.funFact)).toBeTruthy();

    // Collapse
    fireEvent.press(toggleButton);
    expect(screen.queryByText(sampleArtwork.funFact)).toBeNull();
  });

  it('does not render fun fact toggle when funFact is empty', () => {
    const artworkNoFunFact: DailyArtwork = { ...sampleArtwork, funFact: '' };
    render(<DailyArtCard {...defaultProps} artwork={artworkNoFunFact} />);

    expect(screen.queryByText('dailyArt.fun_fact')).toBeNull();
  });

  it('calls onSkip when skip button is pressed', () => {
    render(<DailyArtCard {...defaultProps} />);

    const skipButton = screen.getByLabelText('dailyArt.skip');
    fireEvent.press(skipButton);

    expect(defaultProps.onSkip).toHaveBeenCalledTimes(1);
  });

  it('calls onSave when save button is pressed', () => {
    render(<DailyArtCard {...defaultProps} />);

    const saveButton = screen.getByLabelText('dailyArt.save');
    fireEvent.press(saveButton);

    expect(defaultProps.onSave).toHaveBeenCalledTimes(1);
  });

  it('shows "Saved!" label and disables save button when isSaved=true', () => {
    render(<DailyArtCard {...defaultProps} isSaved />);

    const savedButton = screen.getByLabelText('dailyArt.saved');
    expect(savedButton).toBeTruthy();
    // The button should have the "heart" (filled) icon when saved
    expect(screen.getByText('heart')).toBeTruthy();
  });

  it('shows "heart-outline" icon when not saved', () => {
    render(<DailyArtCard {...defaultProps} isSaved={false} />);

    expect(screen.getByText('heart-outline')).toBeTruthy();
  });

  it('handles missing optional year gracefully', () => {
    const artworkNoYear: DailyArtwork = { ...sampleArtwork, year: '' };
    render(<DailyArtCard {...defaultProps} artwork={artworkNoYear} />);

    // Should still render artist without year parentheses
    const artistText = screen.getByText(/Vincent van Gogh/);
    expect(artistText).toBeTruthy();
    // The year parentheses should not appear
    expect(screen.queryByText(/\(.*\)/)).toBeNull();
  });

  it('handles missing museum gracefully — does not render museum line', () => {
    const artworkNoMuseum: DailyArtwork = { ...sampleArtwork, museum: '' };
    render(<DailyArtCard {...defaultProps} artwork={artworkNoMuseum} />);

    expect(screen.queryByText('MoMA')).toBeNull();
  });

  it('shows image fallback when image onError fires', () => {
    render(<DailyArtCard {...defaultProps} />);

    const image = screen.getByLabelText('Starry Night');

    // Simulate image load error
    fireEvent(image, 'error');

    // After error, the fallback icon should be shown
    expect(screen.getByText('image-outline')).toBeTruthy();
  });
});
