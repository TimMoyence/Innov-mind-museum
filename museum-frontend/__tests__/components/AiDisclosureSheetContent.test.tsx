import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import '../helpers/test-utils';
import { AiDisclosureSheetContent } from '@/features/chat/ui/AiDisclosureSheetContent';

/**
 * Coverage for the on-demand AI disclosure recap sheet (C4 refactor —
 * Modal stripped, layout now lives inside `<BottomSheetRouter>` fullscreen
 * surface). The `onLearnMore` slot is optional and only rendered when the
 * parent passes a handler; we cover both branches.
 */
describe('AiDisclosureSheetContent', () => {
  it('renders the disclosure title and AI notice copy', () => {
    const close = jest.fn();
    const { getByText, getByLabelText } = render(<AiDisclosureSheetContent close={close} />);

    expect(getByText('voice.disclosure.modalTitle')).toBeTruthy();
    expect(getByText('voice.disclosure.aiNotice')).toBeTruthy();
    // Close button has accessibility label even without visible text.
    expect(getByLabelText('voice.disclosure.modalClose')).toBeTruthy();
  });

  it('invokes close when the close button is pressed', () => {
    const close = jest.fn();
    const { getByLabelText } = render(<AiDisclosureSheetContent close={close} />);

    fireEvent.press(getByLabelText('voice.disclosure.modalClose'));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('renders the "learn more" link only when onLearnMore is provided', () => {
    const close = jest.fn();
    const { queryByLabelText, rerender } = render(<AiDisclosureSheetContent close={close} />);
    // Without handler → link absent.
    expect(queryByLabelText('voice.disclosure.modalLearnMore')).toBeNull();

    const onLearnMore = jest.fn();
    rerender(<AiDisclosureSheetContent close={close} onLearnMore={onLearnMore} />);
    expect(queryByLabelText('voice.disclosure.modalLearnMore')).toBeTruthy();
  });

  it('invokes onLearnMore when the link is pressed', () => {
    const close = jest.fn();
    const onLearnMore = jest.fn();
    const { getByLabelText } = render(
      <AiDisclosureSheetContent close={close} onLearnMore={onLearnMore} />,
    );

    fireEvent.press(getByLabelText('voice.disclosure.modalLearnMore'));
    expect(onLearnMore).toHaveBeenCalledTimes(1);
    // The sheet does NOT auto-close on learn-more (parent owns navigation).
    expect(close).not.toHaveBeenCalled();
  });
});
