/**
 * Red tests for blocking-route non-regression (R7).
 *
 * UFR-022 run `2026-05-23-chat-composer-buttons-modal-dismiss`.
 *
 * For every blocking C4 route (`consent`, `voice-intro`, `daily-limit`):
 * - backdrop tap MUST be a no-op (sheet stays open) ;
 * - CTA-driven close MUST still dismiss the sheet (`CTA_CLOSE` path).
 *
 * This is a regression-guard — it PASSES on current code. If the green phase
 * accidentally makes blocking routes backdrop-dismissable, this fails.
 */

import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

import '../../../helpers/test-utils';

const mockReduceMotion = jest.fn(() => false);
jest.mock('@/shared/ui/hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockReduceMotion(),
}));

import {
  DismissRouterTestHost,
  installAllMockRoutes,
  type DismissRouterHandle,
} from './dismiss-test-harness';

describe('<BottomSheetContainer /> — blocking-route non-regression (R7)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReduceMotion.mockReturnValue(false);
    installAllMockRoutes();
  });

  const blockingCases: readonly {
    id: 'consent' | 'voice-intro' | 'daily-limit';
    params: unknown;
    contentTestID: string;
    ctaTestID: string;
  }[] = [
    {
      id: 'consent',
      params: {},
      contentTestID: 'mock-consent-content',
      ctaTestID: 'mock-consent-accept',
    },
    {
      id: 'voice-intro',
      params: { locale: 'fr' },
      contentTestID: 'mock-voice-intro-content',
      ctaTestID: 'mock-voice-intro-acknowledge',
    },
    {
      id: 'daily-limit',
      params: {},
      contentTestID: 'mock-daily-limit-content',
      ctaTestID: 'mock-daily-limit-acknowledge',
    },
  ];

  it.each(blockingCases)(
    'route=%s: backdrop tap is a no-op, CTA dismiss still works',
    ({ id, params, contentTestID, ctaTestID }) => {
      jest.useFakeTimers();
      const ref = React.createRef<DismissRouterHandle>();
      const view = render(<DismissRouterTestHost ref={ref} />);

      act(() => {
        ref.current?.open(id, params);
      });
      act(() => {
        jest.runAllTimers();
      });
      expect(view.queryByTestId(contentTestID)).not.toBeNull();

      // Tap backdrop — blocking route MUST ignore this.
      const backdrop = view.getByTestId('bottom-sheet-backdrop');
      const onPress = (backdrop.props as { onPress?: () => void }).onPress;
      act(() => {
        onPress?.();
      });
      act(() => {
        jest.runAllTimers();
      });
      expect(view.queryByTestId(contentTestID)).not.toBeNull();

      // CTA path closes — the in-content button calls the `close` prop the
      // router passes through, which dispatches CTA_CLOSE (bypasses the
      // blocking gate, per `BottomSheetRouter.tsx:128-134`). Drain the exit
      // `Animated.timing` so the container fires CLOSE_DONE and the reducer
      // settles back to `idle` (spec R12 sequencing).
      act(() => {
        fireEvent.press(view.getByTestId(ctaTestID));
      });
      act(() => {
        jest.runAllTimers();
      });
      expect(view.queryByTestId(contentTestID)).toBeNull();

      jest.useRealTimers();
    },
  );
});
