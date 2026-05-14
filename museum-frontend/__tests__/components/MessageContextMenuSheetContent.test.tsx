import '../helpers/test-utils';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { makeChatUiMessage } from '../helpers/factories';
import { MessageContextMenuSheetContent } from '@/features/chat/ui/MessageContextMenuSheetContent';

/**
 * Sheet-content variant of the legacy `MessageContextMenu` tests (migrated
 * under C4). The router now owns mounting / dismount, so the `null` message
 * branch no longer applies — the router simply does not open this route when
 * no message is targeted. Each remaining behaviour (action visibility per
 * role, preview truncation, cancel callback) is preserved.
 */
describe('MessageContextMenuSheetContent', () => {
  const onCopy = jest.fn();
  const onShare = jest.fn();
  const onReport = jest.fn();
  const close = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders copy and share actions for a user message with text', () => {
    const message = makeChatUiMessage({ role: 'user', text: 'Hello world' });
    render(
      <MessageContextMenuSheetContent
        message={message}
        onCopy={onCopy}
        onShare={onShare}
        onReport={onReport}
        close={close}
      />,
    );
    expect(screen.getByLabelText('messageMenu.copy')).toBeTruthy();
    expect(screen.getByLabelText('conversations.share')).toBeTruthy();
  });

  it('renders report action for assistant messages', () => {
    const message = makeChatUiMessage({ role: 'assistant', text: 'I can help with that.' });
    render(
      <MessageContextMenuSheetContent
        message={message}
        onCopy={onCopy}
        onShare={onShare}
        onReport={onReport}
        close={close}
      />,
    );
    expect(screen.getByLabelText('messageMenu.report')).toBeTruthy();
  });

  it('does not render report action for user messages', () => {
    const message = makeChatUiMessage({ role: 'user', text: 'My question' });
    render(
      <MessageContextMenuSheetContent
        message={message}
        onCopy={onCopy}
        onShare={onShare}
        onReport={onReport}
        close={close}
      />,
    );
    expect(screen.queryByLabelText('messageMenu.report')).toBeNull();
  });

  it('calls close when cancel button is pressed', () => {
    const message = makeChatUiMessage({ role: 'user', text: 'Hello' });
    render(
      <MessageContextMenuSheetContent
        message={message}
        onCopy={onCopy}
        onShare={onShare}
        onReport={onReport}
        close={close}
      />,
    );
    fireEvent.press(screen.getByLabelText('a11y.contextMenu.cancel'));
    expect(close).toHaveBeenCalled();
  });

  it('shows message preview text truncated to 60 chars', () => {
    const longText = 'A'.repeat(80);
    const message = makeChatUiMessage({ role: 'user', text: longText });
    render(
      <MessageContextMenuSheetContent
        message={message}
        onCopy={onCopy}
        onShare={onShare}
        onReport={onReport}
        close={close}
      />,
    );
    expect(screen.getByText(longText.slice(0, 60))).toBeTruthy();
  });
});
