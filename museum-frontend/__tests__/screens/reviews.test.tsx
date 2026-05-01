import '../helpers/test-utils';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { makeReview } from '../helpers/factories/review.factories';

// ── Screen-specific mocks ────────────────────────────────────────────────────

const mockUseReviews = jest.fn();
jest.mock('@/features/review/application/useReviews', () => ({
  useReviews: () => mockUseReviews(),
}));

jest.mock('@/features/review/ui/ReviewCard', () => {
  const { Text } = require('react-native');
  return {
    ReviewCard: ({ review }: { review: { userName: string } }) => (
      <Text testID="review-card">{review.userName}</Text>
    ),
  };
});

jest.mock('@/features/review/ui/StarRating', () => {
  const { View } = require('react-native');
  return {
    StarRating: (props: Record<string, unknown>) => <View testID="star-rating" {...props} />,
  };
});

import ReviewsScreen from '@/app/(stack)/reviews';

const defaultHookReturn = {
  reviews: [],
  stats: { average: 4.2, count: 15 },
  loading: false,
  error: null,
  hasMore: false,
  submitLoading: false,
  submitError: null,
  loadMore: jest.fn(),
  submitReview: jest.fn().mockResolvedValue(true),
  clearSubmitError: jest.fn(),
};

describe('ReviewsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseReviews.mockReturnValue({ ...defaultHookReturn });
  });

  it('renders screen title', () => {
    render(<ReviewsScreen />);
    expect(screen.getByText('reviews.title')).toBeTruthy();
  });

  it('renders stats header with average rating and review count', () => {
    render(<ReviewsScreen />);
    expect(screen.getByText('4.2')).toBeTruthy();
    expect(screen.getByText('reviews.reviewCount')).toBeTruthy();
  });

  it('renders review cards in list', () => {
    mockUseReviews.mockReturnValue({
      ...defaultHookReturn,
      reviews: [
        makeReview({
          id: '1',
          userName: 'Alice',
          rating: 5,
          comment: 'Great!',
          createdAt: '2026-01-01',
        }),
        makeReview({
          id: '2',
          userId: 2,
          userName: 'Bob',
          rating: 4,
          comment: 'Good',
          createdAt: '2026-01-02',
        }),
      ],
    });
    render(<ReviewsScreen />);
    const cards = screen.getAllByTestId('review-card');
    expect(cards).toHaveLength(2);
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
  });

  it('renders empty state when no reviews', () => {
    mockUseReviews.mockReturnValue({
      ...defaultHookReturn,
      reviews: [],
      stats: { average: 0, count: 0 },
    });
    render(<ReviewsScreen />);
    expect(screen.getByTestId('reviews-empty-state')).toBeTruthy();
  });

  it('renders write review button', () => {
    render(<ReviewsScreen />);
    expect(screen.getByLabelText('reviews.writeReview')).toBeTruthy();
  });

  it('opens review form on write review button press', () => {
    render(<ReviewsScreen />);
    fireEvent.press(screen.getByLabelText('reviews.writeReview'));
    expect(screen.getByText('reviews.ratingLabel')).toBeTruthy();
    expect(screen.getByLabelText('a11y.reviews.name_input')).toBeTruthy();
    expect(screen.getByLabelText('a11y.reviews.comment_input')).toBeTruthy();
    expect(screen.getByLabelText('reviews.submit')).toBeTruthy();
  });

  it('renders error state when loading fails', () => {
    mockUseReviews.mockReturnValue({
      ...defaultHookReturn,
      error: 'Failed to load reviews',
      reviews: [],
    });
    render(<ReviewsScreen />);
    expect(screen.getByText('Failed to load reviews')).toBeTruthy();
  });
});
