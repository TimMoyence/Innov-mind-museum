import React from 'react';
import { render } from '../helpers/render-chat-screen';

import '../helpers/test-utils';
import '../helpers/chat-screen.setup';
import { defaultChatSession, mockUseChatSession } from '../helpers/chat-screen.setup';

/**
 * Red tests for B4 — chat screen wiring for the cartel scanner.
 *
 * Validates the screen-side glue that A1's `<Composer>` and the C4
 * BottomSheetRouter expect:
 *
 *   - the `attachment-picker` route params object now carries a new
 *     `onOpenScanner: () => void` callback (R18 of B4 spec)
 *   - invoking that callback opens the `cartel-scanner` route with a
 *     captured `onScanned: (code: string) => void` callback (R16)
 *   - invoking the captured `onScanned("ABC-123")` triggers
 *     `sendMessage({ text: <i18n template> })` exactly once (R17)
 *
 * Spec: docs/chat-ux-refonte/specs/B4.md §1.4 (R16-R18), AC23-AC25.
 */

// Capture every router.open(route, params) call so we can introspect the
// attachment-picker params, the cartel-scanner params, and the resulting
// sendMessage call after we manually invoke the captured callbacks.
const mockRouterOpen = jest.fn();
jest.mock('@/features/chat/ui/bottom-sheet-router', () => ({
  BottomSheetRouter: () => null,
  useBottomSheetRouter: () => ({
    activeRoute: null,
    open: mockRouterOpen,
    close: jest.fn(),
  }),
}));

// Replace Composer with a passthrough that captures its last-received props.
let composerLastProps: Record<string, unknown> = {};
jest.mock('@/features/chat/ui/Composer', () => {
  const RN = require('react-native');
  const ReactNS = require('react');
  return {
    Composer: (props: Record<string, unknown>) => {
      composerLastProps = props;
      return ReactNS.createElement(RN.View, { testID: 'mock-Composer' });
    },
  };
});

import ChatSessionScreen from '@/app/(stack)/chat/[sessionId]';

describe('ChatSessionScreen — cartel scanner wiring (B4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    composerLastProps = {};
  });

  it('passes onOpenScanner inside the attachment-picker open() params (R18, AC23)', () => {
    const sendMessage = jest.fn();
    mockUseChatSession.mockReturnValue({ ...defaultChatSession(), sendMessage });
    render(<ChatSessionScreen />);

    // Composer received its props — invoke onOpenAttachments to trigger the
    // attachment-picker route open with the screen-side params object.
    const onOpenAttachments = composerLastProps.onOpenAttachments;
    expect(typeof onOpenAttachments).toBe('function');
    (onOpenAttachments as () => void)();

    const pickerCall = mockRouterOpen.mock.calls.find((c) => c[0] === 'attachment-picker');
    expect(pickerCall).toBeDefined();

    const params = pickerCall?.[1] as { onOpenScanner?: () => void };
    expect(typeof params?.onOpenScanner).toBe('function');
  });

  it('opens the cartel-scanner route with an onScanned callback when onOpenScanner fires (R16, AC24)', () => {
    const sendMessage = jest.fn();
    mockUseChatSession.mockReturnValue({ ...defaultChatSession(), sendMessage });
    render(<ChatSessionScreen />);

    const onOpenAttachments = composerLastProps.onOpenAttachments as () => void;
    onOpenAttachments();

    const pickerParams = mockRouterOpen.mock.calls.find(
      (c) => c[0] === 'attachment-picker',
    )?.[1] as {
      onOpenScanner: () => void;
    };
    pickerParams.onOpenScanner();

    const scannerCall = mockRouterOpen.mock.calls.find((c) => c[0] === 'cartel-scanner');
    expect(scannerCall).toBeDefined();
    const scannerParams = scannerCall?.[1] as { onScanned: (code: string) => void };
    expect(typeof scannerParams?.onScanned).toBe('function');
  });

  it('invokes sendMessage with the i18n lookup template when onScanned fires (R17, AC25)', () => {
    const sendMessage = jest.fn();
    mockUseChatSession.mockReturnValue({ ...defaultChatSession(), sendMessage });
    render(<ChatSessionScreen />);

    const onOpenAttachments = composerLastProps.onOpenAttachments as () => void;
    onOpenAttachments();
    const pickerParams = mockRouterOpen.mock.calls.find(
      (c) => c[0] === 'attachment-picker',
    )?.[1] as {
      onOpenScanner: () => void;
    };
    pickerParams.onOpenScanner();

    const scannerParams = mockRouterOpen.mock.calls.find((c) => c[0] === 'cartel-scanner')?.[1] as {
      onScanned: (code: string) => void;
    };
    scannerParams.onScanned('ABC-123');

    expect(sendMessage).toHaveBeenCalledTimes(1);
    // The test-utils react-i18next mock returns the i18n key unchanged, so
    // the call contains the literal key — that's enough to prove the wiring
    // (the BE accepts any text; the actual interpolation is asserted in the
    // locale-coverage suite, see chat-cartel-scanner-i18n.test.ts).
    const call = sendMessage.mock.calls[0]?.[0] as { text: string };
    expect(call.text).toContain('chat.cartelScanner.lookup_template');
  });

  it('does not call sendMessage if onScanned is never fired (no implicit send)', () => {
    const sendMessage = jest.fn();
    mockUseChatSession.mockReturnValue({ ...defaultChatSession(), sendMessage });
    render(<ChatSessionScreen />);

    const onOpenAttachments = composerLastProps.onOpenAttachments as () => void;
    onOpenAttachments();
    const pickerParams = mockRouterOpen.mock.calls.find(
      (c) => c[0] === 'attachment-picker',
    )?.[1] as {
      onOpenScanner: () => void;
    };
    pickerParams.onOpenScanner();

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
