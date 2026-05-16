import React from 'react';
import { render } from '@testing-library/react-native';

import '../helpers/test-utils';

// Stub the inner module so the lazy require doesn't pull in
// `react-native-webview` (whose `RNCWebView` native module isn't linked
// under jest's stripped-down RN runtime). The lazy-require pattern is the
// reason this wrapper exists; we just want to verify the indirection works.
jest.mock('@/shared/ui/InAppBrowserSheetContent', () => {
  const { Text } = require('react-native');
  return {
    InAppBrowserSheetContent: ({ url, close: _close }: { url: string; close: () => void }) => (
      <Text testID="iab-stub">{`stub:${url}`}</Text>
    ),
  };
});

// Mock declared above must precede this SUT import (jest hoists jest.mock so
// the import order is what actually matters at runtime).
import { InAppBrowserSheetContent } from '@/features/chat/ui/bottom-sheet-router/LazyInAppBrowserSheetContent';

describe('LazyInAppBrowserSheetContent', () => {
  it('renders the inner browser sheet content with the passed url', () => {
    const close = jest.fn();
    const { getByTestId } = render(
      <InAppBrowserSheetContent url="https://musaium.com/security" close={close} />,
    );

    expect(getByTestId('iab-stub').props.children).toBe('stub:https://musaium.com/security');
  });

  it('forwards a different url on re-render (require result is memoized but props pass through)', () => {
    const close = jest.fn();
    const { getByTestId, rerender } = render(
      <InAppBrowserSheetContent url="https://musaium.com/fr/security" close={close} />,
    );
    expect(getByTestId('iab-stub').props.children).toBe('stub:https://musaium.com/fr/security');

    rerender(<InAppBrowserSheetContent url="https://musaium.com/en/security" close={close} />);
    expect(getByTestId('iab-stub').props.children).toBe('stub:https://musaium.com/en/security');
  });
});
