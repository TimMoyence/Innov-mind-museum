import '../helpers/test-utils';
import { render, screen, fireEvent } from '@testing-library/react-native';

import type { VisitSummary } from '@/features/chat/application/chatSessionLogic.pure';
import { VisitSummaryModal } from '@/features/chat/ui/VisitSummaryModal';

const makeSummary = (overrides?: Partial<VisitSummary>): VisitSummary => ({
  museumName: 'Louvre Museum',
  artworks: [],
  roomsVisited: [],
  duration: { startedAt: '2026-01-01T10:00:00Z', endedAt: '2026-01-01T10:30:00Z', minutes: 30 },
  messageCount: 12,
  expertiseLevel: null,
  ...overrides,
});

describe('VisitSummaryModal', () => {
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders museum name as title when provided', () => {
    render(<VisitSummaryModal visible summary={makeSummary()} onClose={onClose} />);
    expect(screen.getByText('Louvre Museum')).toBeTruthy();
  });

  it('renders fallback title when museumName is null', () => {
    render(
      <VisitSummaryModal visible summary={makeSummary({ museumName: null })} onClose={onClose} />,
    );
    expect(screen.getByText('visitSummary.visitSummary')).toBeTruthy();
  });

  it('renders artworks section with artwork details', () => {
    const summary = makeSummary({
      artworks: [{ title: 'Mona Lisa', artist: 'Leonardo da Vinci', room: 'Room 711' }],
    });
    render(<VisitSummaryModal visible summary={summary} onClose={onClose} />);
    expect(screen.getByText('Mona Lisa')).toBeTruthy();
    expect(screen.getByText('Leonardo da Vinci')).toBeTruthy();
    expect(screen.getByText('Room 711')).toBeTruthy();
  });

  it('renders empty artworks message when no artworks', () => {
    render(<VisitSummaryModal visible summary={makeSummary({ artworks: [] })} onClose={onClose} />);
    expect(screen.getByText('visitSummary.noArtworks')).toBeTruthy();
  });

  it('renders rooms visited as chips', () => {
    const summary = makeSummary({ roomsVisited: ['Room A', 'Room B'] });
    render(<VisitSummaryModal visible summary={summary} onClose={onClose} />);
    expect(screen.getByText('Room A')).toBeTruthy();
    expect(screen.getByText('Room B')).toBeTruthy();
  });

  it('renders duration and message count stats', () => {
    render(<VisitSummaryModal visible summary={makeSummary()} onClose={onClose} />);
    expect(screen.getByText('30 min')).toBeTruthy();
    expect(screen.getByText('12 visitSummary.messages')).toBeTruthy();
  });

  it('renders expertise level when provided', () => {
    const summary = makeSummary({ expertiseLevel: 'expert' });
    render(<VisitSummaryModal visible summary={summary} onClose={onClose} />);
    expect(screen.getByText('visitSummary.expertiseLevel: expert')).toBeTruthy();
  });

  it('fires onClose when close button is pressed', () => {
    render(<VisitSummaryModal visible summary={makeSummary()} onClose={onClose} />);
    fireEvent.press(screen.getByLabelText('common.close'));
    expect(onClose).toHaveBeenCalled();
  });
});
