import '../helpers/test-utils';
import { mockUseConversationsData, defaultDataHook } from '../helpers/conversations-screen.setup';
import { render, screen } from '@testing-library/react-native';

import ConversationsScreen from '@/app/(tabs)/conversations';

describe('ConversationsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseConversationsData.mockReturnValue(defaultDataHook());
  });

  it('renders loading state with skeleton cards', () => {
    mockUseConversationsData.mockReturnValue({ ...defaultDataHook(), isLoading: true });
    render(<ConversationsScreen />);
    expect(screen.getAllByTestId('skeleton-card').length).toBeGreaterThan(0);
  });

  it('renders header', () => {
    render(<ConversationsScreen />);
    expect(screen.getByTestId('conversations-header')).toBeTruthy();
  });

  it('renders search bar', () => {
    render(<ConversationsScreen />);
    expect(screen.getByTestId('conversation-search-bar')).toBeTruthy();
  });

  it('renders start new conversation button', () => {
    render(<ConversationsScreen />);
    expect(screen.getAllByLabelText('a11y.conversations.start_new').length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it('renders empty state when no conversations', () => {
    render(<ConversationsScreen />);
    expect(screen.getByTestId('empty-state-start-button')).toBeTruthy();
  });

  it('renders empty state i18n title', () => {
    render(<ConversationsScreen />);
    expect(screen.getByText('empty.conversations.title')).toBeTruthy();
  });
});
