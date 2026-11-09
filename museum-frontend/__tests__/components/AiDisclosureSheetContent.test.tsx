import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import '../helpers/test-utils';
import { AiDisclosureSheetContent } from '@/features/chat/ui/AiDisclosureSheetContent';

describe('AiDisclosureSheetContent', () => {
  it('renders the disclosure title and AI notice copy', () => {
    const close = jest.fn();
    const { getByText, getByLabelText } = render(<AiDisclosureSheetContent close={close} />);

    expect(getByText('voice.disclosure.modalTitle')).toBeTruthy();
    expect(getByText('voice.disclosure.aiNotice')).toBeTruthy();
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
    expect(close).not.toHaveBeenCalled();
  });
});
