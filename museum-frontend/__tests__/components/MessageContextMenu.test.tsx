import '../helpers/test-utils';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { makeChatUiMessage } from '../helpers/factories';
import { MessageContextMenu } from '@/features/chat/ui/MessageContextMenu';

describe('MessageContextMenu', () => {
  const onCopy = jest.fn();
  const onShare = jest.fn();
  const onReport = jest.fn();
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when message is null', () => {
    const { toJSON } = render(
      <MessageContextMenu
        message={null}
        onCopy={onCopy}
        onShare={onShare}
        onReport={onReport}
        onClose={onClose}
      />,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders copy and share actions for a user message with text', () => {
    const message = makeChatUiMessage({ role: 'user', text: 'Hello world' });
    render(
      <MessageContextMenu
        message={message}
        onCopy={onCopy}
        onShare={onShare}
        onReport={onReport}
        onClose={onClose}
      />,
    );
    expect(screen.getByLabelText('messageMenu.copy')).toBeTruthy();
    expect(screen.getByLabelText('conversations.share')).toBeTruthy();
  });

  it('renders report action for assistant messages', () => {
    const message = makeChatUiMessage({ role: 'assistant', text: 'I can help with that.' });
    render(
      <MessageContextMenu
        message={message}
        onCopy={onCopy}
        onShare={onShare}
        onReport={onReport}
        onClose={onClose}
      />,
    );
    expect(screen.getByLabelText('messageMenu.report')).toBeTruthy();
  });

  it('does not render report action for user messages', () => {
    const message = makeChatUiMessage({ role: 'user', text: 'My question' });
    render(
      <MessageContextMenu
        message={message}
        onCopy={onCopy}
        onShare={onShare}
        onReport={onReport}
        onClose={onClose}
      />,
    );
    expect(screen.queryByLabelText('messageMenu.report')).toBeNull();
  });

  it('calls onClose when cancel button is pressed', () => {
    const message = makeChatUiMessage({ role: 'user', text: 'Hello' });
    render(
      <MessageContextMenu
        message={message}
        onCopy={onCopy}
        onShare={onShare}
        onReport={onReport}
        onClose={onClose}
      />,
    );
    fireEvent.press(screen.getByLabelText('a11y.contextMenu.cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows message preview text truncated to 60 chars', () => {
    const longText = 'A'.repeat(80);
    const message = makeChatUiMessage({ role: 'user', text: longText });
    render(
      <MessageContextMenu
        message={message}
        onCopy={onCopy}
        onShare={onShare}
        onReport={onReport}
        onClose={onClose}
      />,
    );
    expect(screen.getByText(longText.slice(0, 60))).toBeTruthy();
  });
});
