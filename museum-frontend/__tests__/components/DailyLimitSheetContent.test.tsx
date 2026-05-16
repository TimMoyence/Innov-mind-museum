import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import '../helpers/test-utils';
import { DailyLimitSheetContent } from '@/features/chat/ui/DailyLimitSheetContent';

/**
 * Coverage for the quota-exhausted sheet (C4 refactor — previously
 * `DailyLimitModal`). Verifies the copy renders and that the dismiss CTA
 * fires both `onDismiss` (optional) and `close` (always).
 *
 * The dismiss button is a LiquidButton; its `onPress` chain awaits a haptic
 * call, so we use `waitFor` to drain the microtask queue.
 */
describe('DailyLimitSheetContent', () => {
  it('renders the limit title, body, and reset hint', () => {
    const close = jest.fn();
    const { getByText } = render(<DailyLimitSheetContent close={close} />);

    expect(getByText('dailyLimit.title')).toBeTruthy();
    expect(getByText('dailyLimit.body')).toBeTruthy();
    expect(getByText('dailyLimit.reset_hint')).toBeTruthy();
  });

  it('invokes close (and onDismiss when provided) on dismiss press', async () => {
    const close = jest.fn();
    const onDismiss = jest.fn();
    const { getByText } = render(<DailyLimitSheetContent close={close} onDismiss={onDismiss} />);

    fireEvent.press(getByText('common.dismiss'));
    await waitFor(() => {
      expect(close).toHaveBeenCalledTimes(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('still closes when onDismiss is omitted', async () => {
    const close = jest.fn();
    const { getByText } = render(<DailyLimitSheetContent close={close} />);

    fireEvent.press(getByText('common.dismiss'));
    await waitFor(() => {
      expect(close).toHaveBeenCalledTimes(1);
    });
  });
});
