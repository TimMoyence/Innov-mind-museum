import '../helpers/test-utils';
import { mockUseChatSession, defaultChatSession } from '../helpers/chat-screen.setup';
import { render } from '@testing-library/react-native';
import { I18nManager } from 'react-native';
import { findPhysicalSideLeaks } from './_rtl-style-audit';

import ChatSessionScreen from '@/app/(stack)/chat/[sessionId]';

describe('ChatSessionScreen RTL audit', () => {
  let originalIsRTL: boolean;

  beforeAll(() => {
    originalIsRTL = (I18nManager as unknown as { isRTL: boolean }).isRTL;
    (I18nManager as unknown as { isRTL: boolean }).isRTL = true;
  });

  afterAll(() => {
    (I18nManager as unknown as { isRTL: boolean }).isRTL = originalIsRTL;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseChatSession.mockReturnValue({
      ...defaultChatSession(),
      messages: [
        { id: 'msg-1', role: 'user', text: 'مرحبا', metadata: {} },
        { id: 'msg-2', role: 'assistant', text: 'أهلا بك', metadata: {} },
      ],
    });
  });

  it('renders without physical-side style leakage under I18nManager.isRTL=true', () => {
    const { toJSON } = render(<ChatSessionScreen />);
    const leaks = findPhysicalSideLeaks(toJSON());
    expect(leaks).toEqual([]);
  });
});
