/**
 * Red tests for B3 — "Ask more" inline integration in `<MessageActions>`.
 *
 * Asserts the FE integration contract documented in
 * `docs/chat-ux-refonte/specs/B3.md` §1.5 (R21-R24) and §4 (AC17-AC21) :
 *
 *   1. Assistant message with `metadata.suggestedFollowUp` populated →
 *      `<AskMoreChip>` is rendered inside `<MessageActions>` (R21).
 *   2. The chip appears BEFORE `<FollowUpButtons>` legacy in source order
 *      when both are present (cohabitation V1, R24, AC17).
 *   3. The chip does NOT render when `suggestedFollowUp` is undefined OR
 *      empty (R22, AC19).
 *   4. Tap on the chip invokes the `onFollowUpPress` callback with the
 *      verbatim follow-up text (R21 wiring, AC20).
 *   5. ONLY ONE chip is ever rendered per `<MessageActions>` — singularity
 *      invariant (R23, NFR13).
 *
 * At baseline (B3 not yet implemented) :
 *   - `@/features/chat/ui/AskMoreChip` does not exist
 *     (verified : `ls museum-frontend/features/chat/ui/AskMoreChip*` → 0).
 *   - `<MessageActions>` never imports nor renders `<AskMoreChip>` —
 *     the mock spy below never fires → assertions fail.
 *   - `ChatUiMessageMetadata.suggestedFollowUp` does not exist in
 *     `chatSessionLogic.pure.ts` → metadata object literal triggers TS2353
 *     at compile time.
 *
 * Why a dedicated file (not merged into chat-session-deep) :
 *   - chat-session-deep is 1k+ lines with global mocks tuned to its
 *     own assertions ; mixing B3 mocks risks side-effects.
 *   - Independent green/red lifecycle (B3 is a leaf feature on MessageActions).
 *
 * Spec : `docs/chat-ux-refonte/specs/B3.md` §1.5 R21-R24 ; §4 AC17-AC21.
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import '../helpers/test-utils';

// ── Mock AskMoreChip so we can spy on its render contract ──────────────────
// RED ASSERTION : the module @/features/chat/ui/AskMoreChip does NOT exist
// at baseline — `jest.mock(..., { virtual: true })` lets us register a fake
// module even when the underlying file is absent. Once T3.2 lands the real
// AskMoreChip, the mock takes precedence (jest.mock hoists before any
// import). The spy will fire only when `<MessageActions>` imports + renders
// the chip — at baseline `<MessageActions>` does NOT import AskMoreChip,
// so the spy never fires → assertions fail.
const mockAskMoreChip = jest.fn();
jest.mock(
  '@/features/chat/ui/AskMoreChip',
  () => {
    const RN = require('react-native');
    const ReactNS = require('react');
    return {
      AskMoreChip: (props: { text: string; onPress?: (t: string) => void; disabled?: boolean }) => {
        mockAskMoreChip(props);
        return ReactNS.createElement(
          RN.Pressable,
          {
            testID: 'mock-AskMoreChip',
            onPress: () => props.onPress?.(props.text),
          },
          ReactNS.createElement(RN.Text, null, props.text),
        );
      },
    };
  },
  { virtual: true },
);

// B3 dispatcher override Q4 (doctrine `feedback_bury_dead_code`) — the legacy
// `<FollowUpButtons>` component has been DELETED in the same commit that
// introduces `<AskMoreChip>`. The cohabitation path described in the spec
// (R24/AC17) is therefore vacuous : there is no legacy component to render
// alongside the chip. The "chip-before-buttons" cohabitation test is
// rewritten below as a negative assertion (no buttons exist at all).
//
// Import AFTER mock declarations. MessageActions is the SUT.
import { MessageActions } from '@/features/chat/ui/MessageActions';

describe('MessageActions — B3 AskMoreChip integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering — suggestedFollowUp populated (R21, AC18)', () => {
    it('renders <AskMoreChip> when metadata.suggestedFollowUp is a non-empty string', () => {
      // RED ASSERTION : `suggestedFollowUp` is not a known property of
      // `ChatUiMessageMetadata` at baseline → TS2353 fires here.
      const metadata = {
        suggestedFollowUp: 'Why did Monet repaint the lilies series?',
      };

      const { getByTestId } = render(
        <MessageActions
          metadata={metadata}
          onFollowUpPress={jest.fn()}
          onRecommendationPress={jest.fn()}
          isSendingDisabled={false}
        />,
      );

      expect(mockAskMoreChip).toHaveBeenCalled();
      expect(getByTestId('mock-AskMoreChip')).toBeTruthy();
      const lastCall = mockAskMoreChip.mock.calls.at(-1)?.[0] as { text?: string };
      expect(lastCall?.text).toBe('Why did Monet repaint the lilies series?');
    });

    it('renders the chip and no legacy follow-up buttons (Q4 legacy killed same commit)', () => {
      const metadata = {
        suggestedFollowUp: 'Why is the smile mysterious?',
      };

      const { queryByTestId } = render(
        <MessageActions
          metadata={metadata}
          onFollowUpPress={jest.fn()}
          onRecommendationPress={jest.fn()}
          isSendingDisabled={false}
        />,
      );

      expect(mockAskMoreChip).toHaveBeenCalled();
      // Legacy <FollowUpButtons> deleted same commit (B3 override Q4) —
      // its mock testID can never appear.
      expect(queryByTestId('mock-FollowUpButtons')).toBeNull();
    });
  });

  describe('rendering — suggestedFollowUp absent or empty (R22, AC19)', () => {
    it('does NOT render <AskMoreChip> when suggestedFollowUp is undefined', () => {
      const metadata = {
        suggestedFollowUp: undefined,
      };

      const { queryByTestId } = render(
        <MessageActions
          metadata={metadata}
          onFollowUpPress={jest.fn()}
          onRecommendationPress={jest.fn()}
          isSendingDisabled={false}
        />,
      );

      expect(queryByTestId('mock-AskMoreChip')).toBeNull();
      expect(mockAskMoreChip).not.toHaveBeenCalled();
    });

    it('does NOT render <AskMoreChip> when suggestedFollowUp is empty string', () => {
      const metadata = {
        suggestedFollowUp: '',
      };

      const { queryByTestId } = render(
        <MessageActions
          metadata={metadata}
          onFollowUpPress={jest.fn()}
          onRecommendationPress={jest.fn()}
          isSendingDisabled={false}
        />,
      );

      expect(queryByTestId('mock-AskMoreChip')).toBeNull();
      expect(mockAskMoreChip).not.toHaveBeenCalled();
    });

    it('does NOT render <AskMoreChip> when metadata is null (legacy path)', () => {
      const { queryByTestId } = render(
        <MessageActions
          metadata={null}
          onFollowUpPress={jest.fn()}
          onRecommendationPress={jest.fn()}
          isSendingDisabled={false}
        />,
      );

      expect(queryByTestId('mock-AskMoreChip')).toBeNull();
    });
  });

  describe('singularity invariant — never more than ONE chip (R23, NFR13)', () => {
    it('renders AskMoreChip exactly once per MessageActions render', () => {
      const metadata = {
        suggestedFollowUp: 'Just one follow-up?',
      };

      render(
        <MessageActions
          metadata={metadata}
          onFollowUpPress={jest.fn()}
          onRecommendationPress={jest.fn()}
          isSendingDisabled={false}
        />,
      );

      // R23 / AC17 second clause : at most one chip per actions block.
      expect(mockAskMoreChip).toHaveBeenCalledTimes(1);
    });
  });

  describe('no cohabitation — legacy <FollowUpButtons> deleted same commit (Q4 override)', () => {
    it('renders only the chip — legacy buttons cannot render even via the new singular field', () => {
      // Defence in depth : the legacy `<FollowUpButtons>` component has been
      // physically deleted (B3 dispatcher override Q4, doctrine
      // `feedback_bury_dead_code`). There is no module to render, no legacy
      // testID. We assert the chip path remains singular and nothing else
      // appears.
      const metadata = {
        suggestedFollowUp: 'Why did Monet repaint the lilies?',
      };

      const { queryByTestId } = render(
        <MessageActions
          metadata={metadata}
          onFollowUpPress={jest.fn()}
          onRecommendationPress={jest.fn()}
          isSendingDisabled={false}
        />,
      );

      expect(mockAskMoreChip).toHaveBeenCalledTimes(1);
      // Legacy mock testID is set by no rendered component — it never appears.
      expect(queryByTestId('mock-FollowUpButtons')).toBeNull();
    });
  });

  describe('tap → onFollowUpPress wiring (R21, AC20)', () => {
    it('invokes onFollowUpPress with the suggestedFollowUp text on chip tap', () => {
      const onFollowUpPress = jest.fn();
      const metadata = {
        suggestedFollowUp: 'Tell me about the Louvre history?',
      };

      const { getByTestId } = render(
        <MessageActions
          metadata={metadata}
          onFollowUpPress={onFollowUpPress}
          onRecommendationPress={jest.fn()}
          isSendingDisabled={false}
        />,
      );

      fireEvent.press(getByTestId('mock-AskMoreChip'));
      expect(onFollowUpPress).toHaveBeenCalledTimes(1);
      expect(onFollowUpPress).toHaveBeenCalledWith('Tell me about the Louvre history?');
    });
  });

  describe('disappearance is implicit — driven by parent re-mount (AC21)', () => {
    it('unmounts AskMoreChip when a re-render passes an empty suggestedFollowUp', () => {
      const onFollowUpPress = jest.fn();
      // First render — chip mounted.
      const { rerender, queryByTestId } = render(
        <MessageActions
          metadata={{ suggestedFollowUp: 'Question A?' }}
          onFollowUpPress={onFollowUpPress}
          onRecommendationPress={jest.fn()}
          isSendingDisabled={false}
        />,
      );
      expect(queryByTestId('mock-AskMoreChip')).toBeTruthy();

      // Simulate "next message arrives" → MessageActions is re-rendered for
      // the NEW lastAssistantMessage which has no suggestedFollowUp (the
      // parent unmounts the previous MessageActions in production ; here we
      // emulate via rerender with empty metadata as a render-tree proxy).
      rerender(
        <MessageActions
          metadata={{ suggestedFollowUp: undefined }}
          onFollowUpPress={onFollowUpPress}
          onRecommendationPress={jest.fn()}
          isSendingDisabled={false}
        />,
      );
      expect(queryByTestId('mock-AskMoreChip')).toBeNull();
    });
  });
});
