import '../helpers/test-utils';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { ChatHeader } from '@/features/chat/ui/ChatHeader';

describe('ChatHeader', () => {
  const baseProps = {
    sessionTitle: 'Art Session',
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

  it('fires onClose when close button is pressed', () => {
    render(<ChatHeader {...baseProps} />);
    const closeButton = screen.getByLabelText('a11y.chat.close');
    fireEvent.press(closeButton);
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('renders close icon when not closing', () => {
    render(<ChatHeader {...baseProps} />);
    expect(screen.getByText('close')).toBeTruthy();
  });

  it('renders activity indicator when isClosing is true', () => {
    render(<ChatHeader {...baseProps} isClosing />);
    expect(screen.queryByText('close')).toBeNull();
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
