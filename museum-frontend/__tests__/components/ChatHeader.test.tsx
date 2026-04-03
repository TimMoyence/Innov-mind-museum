import '../helpers/test-utils';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { ChatHeader } from '@/features/chat/ui/ChatHeader';

jest.mock('@/features/chat/ui/ExpertiseBadge', () => {
  const { Text } = require('react-native');
  return {
    ExpertiseBadge: ({ level }: { level: string }) => <Text testID="expertise-badge">{level}</Text>,
  };
});

describe('ChatHeader', () => {
  const baseProps = {
    sessionTitle: 'Art Session',
    museumName: 'Louvre Museum',
    sessionId: 'abc123def456ghi',
    isClosing: false,
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders session title', () => {
    render(<ChatHeader {...baseProps} />);
    expect(screen.getByText('Art Session')).toBeTruthy();
  });

  it('renders fallback title when sessionTitle is null', () => {
    render(<ChatHeader {...baseProps} sessionTitle={null} />);
    expect(screen.getByText('chat.fallback_title')).toBeTruthy();
  });

  it('renders museum name', () => {
    render(<ChatHeader {...baseProps} />);
    expect(screen.getByText('Louvre Museum')).toBeTruthy();
  });

  it('renders truncated sessionId when museumName is null', () => {
    render(<ChatHeader {...baseProps} museumName={null} />);
    expect(screen.getByText('abc123def456...')).toBeTruthy();
  });

  it('fires onClose when close button is pressed', () => {
    render(<ChatHeader {...baseProps} />);
    const closeButton = screen.getByLabelText('common.close');
    fireEvent.press(closeButton);
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('renders close icon when not closing', () => {
    render(<ChatHeader {...baseProps} />);
    expect(screen.getByText('close')).toBeTruthy();
  });

  it('renders activity indicator when isClosing is true', () => {
    render(<ChatHeader {...baseProps} isClosing />);
    // ActivityIndicator is rendered instead of close icon
    expect(screen.queryByText('close')).toBeNull();
  });

  it('renders expertise badge when expertiseLevel is provided', () => {
    render(<ChatHeader {...baseProps} expertiseLevel="expert" />);
    expect(screen.getByTestId('expertise-badge')).toBeTruthy();
    expect(screen.getByText('expert')).toBeTruthy();
  });

  it('does not render expertise badge when expertiseLevel is absent', () => {
    render(<ChatHeader {...baseProps} />);
    expect(screen.queryByTestId('expertise-badge')).toBeNull();
  });

  it('renders summary button when onSummary is provided', () => {
    const onSummary = jest.fn();
    render(<ChatHeader {...baseProps} onSummary={onSummary} />);
    const summaryButton = screen.getByLabelText('visitSummary.visitSummary');
    fireEvent.press(summaryButton);
    expect(onSummary).toHaveBeenCalledTimes(1);
  });

  it('does not render summary button when onSummary is absent', () => {
    render(<ChatHeader {...baseProps} />);
    expect(screen.queryByLabelText('visitSummary.visitSummary')).toBeNull();
  });
});
