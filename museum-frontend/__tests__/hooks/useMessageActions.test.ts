import { renderHook, act } from '@testing-library/react-native';
import { Alert, Share } from 'react-native';

import { useMessageActions } from '@/features/chat/application/useMessageActions';
import { makeChatUiMessage } from '@/__tests__/helpers/factories';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

const mockSetStringAsync = jest.fn<Promise<boolean>, [string]>().mockResolvedValue(true);

jest.mock('expo-clipboard', () => ({
  setStringAsync: (...args: unknown[]) => mockSetStringAsync(args[0] as string),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
}));

// Spy on Alert.alert and Share.share
const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useMessageActions', () => {
  const mockOnReport = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderActions = () => renderHook(() => useMessageActions({ onReport: mockOnReport }));

  it('copyText copies message text to clipboard', async () => {
    const { result } = renderActions();
    const msg = makeChatUiMessage({ text: 'Copy this text' });

    await act(async () => {
      await result.current.copyText(msg);
    });

    expect(mockSetStringAsync).toHaveBeenCalledWith('Copy this text');
  });

  it('copyText shows success alert after copying', async () => {
    const { result } = renderActions();
    const msg = makeChatUiMessage({ text: 'Some text' });

    await act(async () => {
      await result.current.copyText(msg);
    });

    expect(alertSpy).toHaveBeenCalledWith('chat.copied_title', 'chat.copied_body');
  });

  it('copyText does nothing for empty text', async () => {
    const { result } = renderActions();
    const msg = makeChatUiMessage({ text: '' });

    await act(async () => {
      await result.current.copyText(msg);
    });

    expect(mockSetStringAsync).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('shareText invokes Share.share with message and footer', async () => {
    const { result } = renderActions();
    const msg = makeChatUiMessage({ text: 'Share this' });

    await act(async () => {
      await result.current.shareText(msg);
    });

    expect(shareSpy).toHaveBeenCalledWith({
      message: 'Share this\n\nchat.share_footer',
    });
  });

  it('shareText does nothing for empty text', async () => {
    const { result } = renderActions();
    const msg = makeChatUiMessage({ text: '' });

    await act(async () => {
      await result.current.shareText(msg);
    });

    expect(shareSpy).not.toHaveBeenCalled();
  });

  it('reportMessage delegates to onReport callback', () => {
    const { result } = renderActions();

    act(() => {
      result.current.reportMessage('msg-123');
    });

    expect(mockOnReport).toHaveBeenCalledWith('msg-123');
  });

  it('reportMessage passes different message IDs correctly', () => {
    const { result } = renderActions();

    act(() => {
      result.current.reportMessage('msg-aaa');
    });

    act(() => {
      result.current.reportMessage('msg-bbb');
    });

    expect(mockOnReport).toHaveBeenCalledTimes(2);
    expect(mockOnReport).toHaveBeenNthCalledWith(1, 'msg-aaa');
    expect(mockOnReport).toHaveBeenNthCalledWith(2, 'msg-bbb');
  });

  it('copyText triggers haptic feedback', async () => {
    const Haptics = require('expo-haptics') as { notificationAsync: jest.Mock };
    const { result } = renderActions();
    const msg = makeChatUiMessage({ text: 'Haptic text' });

    await act(async () => {
      await result.current.copyText(msg);
    });

    expect(Haptics.notificationAsync).toHaveBeenCalled();
  });
});
