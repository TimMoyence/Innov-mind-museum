import '../helpers/test-utils';
import { render, screen, fireEvent } from '@testing-library/react-native';

import type { VisitSummary } from '@/features/chat/application/chatSessionLogic.pure';
import { VisitSummarySheetContent } from '@/features/chat/ui/VisitSummarySheetContent';

const makeSummary = (overrides?: Partial<VisitSummary>): VisitSummary => ({
  museumName: 'Louvre Museum',
  artworks: [],
  roomsVisited: [],
  duration: { startedAt: '2026-01-01T10:00:00Z', endedAt: '2026-01-01T10:30:00Z', minutes: 30 },
  messageCount: 12,
  expertiseLevel: null,
  ...overrides,
});

/**
 * Sheet-content variant of the legacy `VisitSummaryModal` tests (migrated
 * under C4). The `<Modal>` wrapper is now owned by the bottom-sheet router;
 * this component receives the summary + a `close` handle and renders the
 * card body.
 */
describe('VisitSummarySheetContent', () => {
  const close = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders museum name as title when provided', () => {
    render(<VisitSummarySheetContent summary={makeSummary()} close={close} />);
    expect(screen.getByText('Louvre Museum')).toBeTruthy();
  });

  it('renders fallback title when museumName is null', () => {
    render(<VisitSummarySheetContent summary={makeSummary({ museumName: null })} close={close} />);
    expect(screen.getByText('visitSummary.visitSummary')).toBeTruthy();
  });

  it('renders artworks section with artwork details', () => {
    const summary = makeSummary({
      artworks: [{ title: 'Mona Lisa', artist: 'Leonardo da Vinci', room: 'Room 711' }],
    });
    render(<VisitSummarySheetContent summary={summary} close={close} />);
    expect(screen.getByText('Mona Lisa')).toBeTruthy();
    expect(screen.getByText('Leonardo da Vinci')).toBeTruthy();
    expect(screen.getByText('Room 711')).toBeTruthy();
  });

  it('renders empty artworks message when no artworks', () => {
    render(<VisitSummarySheetContent summary={makeSummary({ artworks: [] })} close={close} />);
    expect(screen.getByText('visitSummary.noArtworks')).toBeTruthy();
  });

  it('renders rooms visited as chips', () => {
    const summary = makeSummary({ roomsVisited: ['Room A', 'Room B'] });
    render(<VisitSummarySheetContent summary={summary} close={close} />);
    expect(screen.getByText('Room A')).toBeTruthy();
    expect(screen.getByText('Room B')).toBeTruthy();
  });

  it('renders duration and message count stats', () => {
    render(<VisitSummarySheetContent summary={makeSummary()} close={close} />);
    expect(screen.getByText('30 min')).toBeTruthy();
    expect(screen.getByText('12 visitSummary.messages')).toBeTruthy();
  });

  it('renders expertise level when provided', () => {
    const summary = makeSummary({ expertiseLevel: 'expert' });
    render(<VisitSummarySheetContent summary={summary} close={close} />);
    expect(screen.getByText('visitSummary.expertiseLevel: expert')).toBeTruthy();
  });

  it('fires close when close button is pressed', () => {
    render(<VisitSummarySheetContent summary={makeSummary()} close={close} />);
    fireEvent.press(screen.getByLabelText('common.close'));
    expect(close).toHaveBeenCalled();
  });
});
