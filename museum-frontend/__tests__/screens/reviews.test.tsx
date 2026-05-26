import '../helpers/test-utils';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { makeReview } from '../helpers/factories/review.factories';
import { useChatSessionStore } from '@/features/chat/infrastructure/chatSessionStore';

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

// C2-FE / UFR-022 RED. The input form now uses `NpsScale` (testID "nps-scale"),
// NOT `StarRating`. We mock `NpsScale` as a tappable surface that emits a fixed
// value via onChange so the submit path is exercised. StarRating is no longer
// imported by reviews.tsx after green; mocking both is harmless until then.
jest.mock('@/features/review/ui/NpsScale', () => {
  const { Pressable, Text } = require('react-native');
  return {
    NpsScale: ({ onChange }: { onChange: (v: number) => void }) => (
      <Pressable
        testID="nps-scale"
        accessibilityRole="button"
        onPress={() => {
          onChange(9);
        }}
      >
        <Text>nps-scale-mock</Text>
      </Pressable>
    ),
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
    // Reset the in-memory chat-session store between tests (sessionId source).
    useChatSessionStore.setState({ sessions: {} });
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

  // C2-FE / UFR-022 RED (R20/R23). The form opens onto an NpsScale 0-10 input
  // (testID "nps-scale") instead of the 5-star StarRating, and the free-text
  // name field (a11y.reviews.name_input) is removed — userName is derived
  // server-side. FAILS at baseline (reviews.tsx still renders StarRating + the
  // name TextInput).
  it('opens the NPS form (NpsScale, comment, submit) on write review press — no name field', () => {
    render(<ReviewsScreen />);
    fireEvent.press(screen.getByLabelText('reviews.writeReview'));
    expect(screen.getByTestId('nps-scale')).toBeTruthy();
    expect(screen.getByLabelText('a11y.reviews.comment_input')).toBeTruthy();
    expect(screen.getByLabelText('reviews.submit')).toBeTruthy();
    // The name input must be gone (userName is server-derived, R18/R23).
    expect(screen.queryByLabelText('a11y.reviews.name_input')).toBeNull();
  });

  it('uses NpsScale (not the 5-star StarRating) as the rating input', () => {
    render(<ReviewsScreen />);
    fireEvent.press(screen.getByLabelText('reviews.writeReview'));
    expect(screen.getByTestId('nps-scale')).toBeTruthy();
    expect(screen.queryByTestId('star-rating')).toBeNull();
  });

  it('submits with (rating, comment, sessionId) and NO userName arg when a recent session exists', () => {
    const submitReview = jest.fn().mockResolvedValue(true);
    mockUseReviews.mockReturnValue({ ...defaultHookReturn, submitReview });

    const recentId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const olderId = '00000000-1111-2222-3333-444444444444';
    useChatSessionStore.setState({
      sessions: {
        [olderId]: { messages: [], title: null, museumName: null, updatedAt: 1000 },
        [recentId]: { messages: [], title: null, museumName: null, updatedAt: 9999 },
      },
    });

    render(<ReviewsScreen />);
    fireEvent.press(screen.getByLabelText('reviews.writeReview'));
    fireEvent.press(screen.getByTestId('nps-scale')); // NpsScale mock emits onChange(9)
    fireEvent.changeText(screen.getByLabelText('a11y.reviews.comment_input'), 'Loved the visit');
    fireEvent.press(screen.getByLabelText('reviews.submit'));

    expect(submitReview).toHaveBeenCalledTimes(1);
    const args = submitReview.mock.calls[0] as unknown[];
    expect(args[0]).toBe(9);
    expect(args[1]).toBe('Loved the visit');
    // Most-recent session is attributed (R1 best-effort, design D-C2-5).
    expect(args[2]).toBe(recentId);
    // No legacy userName argument anywhere in the call.
    expect(args).not.toContain('');
  });

  it('submits without a sessionId arg when the chat-session store is empty (→ global, Q1)', () => {
    const submitReview = jest.fn().mockResolvedValue(true);
    mockUseReviews.mockReturnValue({ ...defaultHookReturn, submitReview });
    useChatSessionStore.setState({ sessions: {} });

    render(<ReviewsScreen />);
    fireEvent.press(screen.getByLabelText('reviews.writeReview'));
    fireEvent.press(screen.getByTestId('nps-scale'));
    fireEvent.changeText(screen.getByLabelText('a11y.reviews.comment_input'), 'No session here');
    fireEvent.press(screen.getByLabelText('reviews.submit'));

    expect(submitReview).toHaveBeenCalledTimes(1);
    const args = submitReview.mock.calls[0] as unknown[];
    expect(args[0]).toBe(9);
    expect(args[1]).toBe('No session here');
    expect(args[2]).toBeUndefined();
  });

  it('displays the average rating un-capped on a /10 scale (8.4 → 8.4 / 10, no 5-star clamp in the stats header)', () => {
    mockUseReviews.mockReturnValue({
      ...defaultHookReturn,
      stats: { average: 8.4, count: 12 },
    });
    render(<ReviewsScreen />);
    // The un-capped numerator is shown verbatim.
    expect(screen.getByText('8.4')).toBeTruthy();
    // A "/10" indicator is present (inline "8.4 / 10" or via the dict key),
    // and the StarRating clamp is gone from the stats header.
    const out10 =
      screen.queryByText(/8\.4\s*\/\s*10/) ?? screen.queryByText('reviews.averageOutOf10');
    expect(out10).toBeTruthy();
    expect(screen.queryByTestId('star-rating')).toBeNull();
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
