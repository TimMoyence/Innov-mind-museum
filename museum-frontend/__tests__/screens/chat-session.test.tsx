import '../helpers/test-utils';
import { mockUseChatSession, defaultChatSession } from '../helpers/chat-screen.setup';
import { render, screen } from '@testing-library/react-native';

import ChatSessionScreen from '@/app/(stack)/chat/[sessionId]';

describe('ChatSessionScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseChatSession.mockReturnValue(defaultChatSession());
  });

  it('renders loading skeleton when isLoading', () => {
    mockUseChatSession.mockReturnValue({ ...defaultChatSession(), isLoading: true });
    render(<ChatSessionScreen />);
    expect(screen.getAllByTestId('skeleton-chat-bubble').length).toBeGreaterThan(0);
  });

  it('renders message list when messages exist', () => {
    mockUseChatSession.mockReturnValue({
      ...defaultChatSession(),
      messages: [{ id: 'msg-1', role: 'user', text: 'Hello', metadata: {} }],
    });
    render(<ChatSessionScreen />);
    expect(screen.getByTestId('chat-message-list')).toBeTruthy();
  });

  it('renders error notice on error', () => {
    mockUseChatSession.mockReturnValue({ ...defaultChatSession(), error: 'Something went wrong' });
    render(<ChatSessionScreen />);
    expect(screen.getByTestId('error-notice')).toBeTruthy();
  });

  it('passes sessionId to useChatSession', () => {
    render(<ChatSessionScreen />);
    expect(mockUseChatSession).toHaveBeenCalledWith('test-session-123');
  });
});
